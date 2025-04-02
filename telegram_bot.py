import os
import logging
import asyncio
import json
import yaml
import edge_tts
import speech_recognition as sr
from pydub import AudioSegment
import io
import tempfile
import datetime
import pytz
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup, WebAppInfo
from telegram.ext import Application, CommandHandler, MessageHandler, filters, ContextTypes
import uvicorn
from fastapi import FastAPI, Request
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
import aiohttp
import aiofiles
import base64
import re
from urllib.parse import quote_plus
import httpx
import scipy.io.wavfile
import torch
import torchvision.transforms as transforms
from torchvision.models import resnet50, ResNet50_Weights
from PIL import Image
import numpy as np
from chatbot_core import Chatbot
from fact_search import FactSearch
from thought_generator import ThoughtGenerator
from auto_chat import AutoChat
from typing import Optional

# Load configuration
with open('config.yaml', 'r') as f:
    config = yaml.safe_load(f)

# Initialize FastAPI app
app = FastAPI()

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount static files
app.mount("/mini-app", StaticFiles(directory="telegram-mini-app", html=True), name="mini-app")

# Enable logging
logging.basicConfig(
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s', level=logging.INFO
)
logger = logging.getLogger(__name__)

# Global variables for features
tts_enabled = False
auto_chat_enabled = False
thoughts_enabled = False
chat_history = {}
user_states = {}
last_message_time = {}
thought_generator = ThoughtGenerator()

# Initialize chatbot
chatbot = Chatbot()

# Global variables for state
active_chats = set()

# Global variables for caching models
_tts_enabled = None

def move_to_device(obj, device):
    """Рекурсивно перемещает все тензоры на указанное устройство"""
    if isinstance(obj, torch.Tensor):
        return obj.to(device)
    elif isinstance(obj, dict):
        return {key: move_to_device(value, device) for key, value in obj.items()}
    elif isinstance(obj, list):
        return [move_to_device(item, device) for item in obj]
    elif hasattr(obj, 'to_dict'):
        return move_to_device(obj.to_dict(), device)
    elif isinstance(obj, torch.nn.Module):
        return obj.to(device)
    elif isinstance(obj, torch.nn.Parameter):
        return obj.to(device)
    return obj

async def initialize_tts():
    """Инициализация TTS модели"""
    global _tts_enabled
    try:
        _tts_enabled = True
        logging.info("TTS модель успешно инициализирована")
        return True
    except Exception as e:
        logging.error(f"Ошибка инициализации TTS: {str(e)}")
        logging.error(f"Traceback: {traceback.format_exc()}")
        return False

async def _try_generate_speech(text: str, voice: str = "ru-RU-DmitryNeural", max_retries: int = 3, retry_delay: float = 1.0) -> Optional[str]:
    """Пытается сгенерировать речь с повторными попытками"""
    for attempt in range(max_retries):
        try:
            communicate = edge_tts.Communicate(text, voice)
            temp_file = tempfile.NamedTemporaryFile(delete=False, suffix='.mp3')
            await communicate.save(temp_file.name)
            return temp_file.name
        except aiohttp.ClientError as e:
            logging.warning(f"Попытка {attempt + 1}/{max_retries} не удалась из-за ошибки сети: {str(e)}")
            if attempt < max_retries - 1:
                await asyncio.sleep(retry_delay * (attempt + 1))
            else:
                raise
        except Exception as e:
            logging.error(f"Неожиданная ошибка при генерации речи: {str(e)}")
            raise

async def generate_speech(text: str) -> Optional[str]:
    """Генерация речи из текста с обработкой ошибок"""
    try:
        if not _tts_enabled:
            if not await initialize_tts():
                return None

        # Разбиваем длинный текст на части, если нужно
        max_chars = 1000  # Максимальная длина для одного запроса
        if len(text) > max_chars:
            parts = []
            start = 0
            while start < len(text):
                # Ищем конец предложения или конец слова
                end = start + max_chars
                if end < len(text):
                    # Ищем ближайший конец предложения
                    sentence_end = text.rfind('. ', start, end)
                    if sentence_end != -1:
                        end = sentence_end + 1
                    else:
                        # Если нет конца предложения, ищем конец слова
                        word_end = text.rfind(' ', start, end)
                        if word_end != -1:
                            end = word_end
                parts.append(text[start:end].strip())
                start = end

            # Генерируем речь для каждой части
            temp_files = []
            for part in parts:
                if not part:
                    continue
                temp_file = await _try_generate_speech(part)
                if temp_file:
                    temp_files.append(temp_file)

            if not temp_files:
                return None

            # Если есть только один файл, возвращаем его
            if len(temp_files) == 1:
                return temp_files[0]

            # Объединяем файлы, если их несколько
            from pydub import AudioSegment
            combined = AudioSegment.empty()
            for temp_file in temp_files:
                try:
                    segment = AudioSegment.from_mp3(temp_file)
                    combined += segment
                except Exception as e:
                    logging.error(f"Ошибка при объединении аудио файлов: {str(e)}")
                    continue

            # Сохраняем объединенный файл
            final_temp_file = tempfile.NamedTemporaryFile(delete=False, suffix='.mp3')
            combined.export(final_temp_file.name, format="mp3")
            
            # Удаляем временные файлы
            for temp_file in temp_files:
                try:
                    os.remove(temp_file)
                except:
                    pass

            return final_temp_file.name

        # Для короткого текста просто генерируем речь
        logging.info("Начинаем генерацию речи...")
        return await _try_generate_speech(text)

    except Exception as e:
        logging.error(f"Ошибка генерации речи: {str(e)}")
        logging.error(f"Traceback: {traceback.format_exc()}")
        return None

async def send_response_with_voice(update: Update, response: str) -> None:
    """Отправляем текстовый ответ и, при необходимости, голосовое сообщение"""
    try:
        # Отправляем текстовое сообщение
        await update.message.reply_text(response)
        
        # Если включена озвучка, отправляем и голосовое сообщение
        logging.info(f"TTS enabled: {tts_enabled}")
        if tts_enabled:
            logging.info("Генерируем голосовое сообщение...")
            voice_file = await generate_speech(response)
            
            if voice_file and os.path.exists(voice_file):
                logging.info("Отправляем голосовое сообщение...")
                try:
                    # Открываем файл в бинарном режиме и отправляем
                    with open(voice_file, 'rb') as audio:
                        await update.message.reply_voice(voice=audio)
                    logging.info("Голосовое сообщение отправлено успешно")
                except Exception as e:
                    logging.error(f"Ошибка отправки голосового сообщения: {e}", exc_info=True)
                finally:
                    # Удаляем временный файл
                    try:
                        if os.path.exists(voice_file):
                            os.remove(voice_file)
                            logging.info("Временный файл удален")
                    except Exception as e:
                        logging.error(f"Ошибка удаления временного файла: {e}", exc_info=True)
    except Exception as e:
        logging.error(f"Ошибка отправки ответа: {e}", exc_info=True)

async def process_thoughts(update: Update) -> None:
    """Обрабатываем и, при необходимости, отправляем мысль"""
    if not thoughts_enabled:
        return
        
    if thought_generator.should_generate_thought():
        thought = thought_generator.generate_thought()
        if thought:
            await update.message.reply_text(thought)
            if tts_enabled:
                voice_file = await generate_speech(thought)
                if voice_file:
                    await update.message.reply_voice(voice=open(voice_file, 'rb'))
                    os.remove(voice_file)

async def handle_photo(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Обрабатываем фотографии, отправленные боту"""
    try:
        # Добавляем чат в активные
        active_chats.add(update.effective_chat.id)
        
        # Отправляем сообщение о начале обработки
        processing_msg = await update.message.reply_text("🔍 Анализируем изображение...")
        
        # Получаем информацию о фото
        photo = update.message.photo[-1]  # Берем самую большую версию фото
        photo_file = await context.bot.get_file(photo.file_id)
        photo_url = photo_file.file_path
        
        # Ищем информацию об изображении
        search_results = await search_image_info(photo_url)
        
        if search_results and search_results['description']:
            # Добавляем тему
            object_name = search_results['description'].split('(')[0].strip()
            thought_generator.add_topic(object_name)
            auto_chat.add_to_history(object_name)
            
            # Ищем релевантный факт только если поиск фактов включен
            fact = None
            if facts_enabled:
                fact = fact_searcher.get_fact_for_prompt(object_name)
            
            # Формируем промпт для чатбота
            prompt = f"На изображении {search_results['description']}. "
            if fact:
                prompt += f"{fact} "
            prompt += "Опиши подробнее, что это такое и расскажи об этом интересные факты."
            
            # Получаем ответ от чатбота
            response = chatbot.generate_response(prompt)
            
            # Удаляем сообщение о обработке
            await processing_msg.delete()
            
            # Отправляем ответ с озвучкой
            await send_response_with_voice(update, response)
            
            # Проверяем, нужно ли отправить мысль
            await process_thoughts(update)
            
        else:
            await processing_msg.edit_text("😔 К сожалению, я не смог определить, что на изображении.")
            
    except Exception as e:
        logging.error(f"Ошибка обработки фото: {e}")
        await update.message.reply_text("😅 Упс... Что-то пошло не так при анализе фото. Может, попробуем другое?")

async def handle_voice(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Обрабатываем голосовые сообщения"""
    try:
        # Download voice message
        voice = await context.bot.get_file(update.message.voice.file_id)
        
        # Create temp files for voice processing
        with tempfile.NamedTemporaryFile(suffix='.ogg', delete=False) as voice_ogg, \
             tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as voice_wav:
            
            # Download voice message
            await voice.download_to_drive(voice_ogg.name)
            
            # Convert ogg to wav
            audio = AudioSegment.from_ogg(voice_ogg.name)
            audio.export(voice_wav.name, format="wav")
            
            # Initialize recognizer
            recognizer = sr.Recognizer()
            
            # Read the WAV file
            with sr.AudioFile(voice_wav.name) as source:
                audio = recognizer.record(source)
            
            # Recognize speech
            text = recognizer.recognize_google(audio, language='ru-RU')
            
            # Generate response
            response = chatbot.generate_response(text)
            
            # Send text response
            await update.message.reply_text(response)
            
            # Generate and send voice response
            voice_file = await generate_speech(response)
            if voice_file:
                async with aiofiles.open(voice_file, 'rb') as audio:
                    await context.bot.send_voice(
                        chat_id=update.effective_chat.id,
                        voice=await audio.read()
                    )
                os.unlink(voice_file)
            
            # Clean up temp files
            os.unlink(voice_ogg.name)
            os.unlink(voice_wav.name)
            
    except sr.UnknownValueError:
        await update.message.reply_text("😕 Извини, я не смог разобрать, что ты сказал. Можешь повторить?")
    except sr.RequestError as e:
        logging.error(f"Ошибка с сервисом распознавания речи: {e}")
        await update.message.reply_text("😔 Произошла ошибка при распознавании речи. Попробуй позже.")
    except Exception as e:
        logging.error(f"Ошибка обработки голосового сообщения: {e}")
        await update.message.reply_text("😔 Произошла ошибка при обработке голосового сообщения.")

async def handle_message(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Handle user messages."""
    try:
        # Get user message
        message = update.message.text
        chat_id = update.effective_chat.id
        
        # Generate thoughts if enabled
        if thoughts_enabled:
            thoughts = thought_generator.generate_thoughts(message)
            if thoughts:
                await update.message.reply_text(f"💭 {thoughts}")
        
        # Get response from chatbot
        response = chatbot.generate_response(message)
        
        # Send response
        if tts_enabled:
            # Generate TTS
            voice = await text_to_speech(response)
            if voice:
                await context.bot.send_voice(chat_id=chat_id, voice=voice)
            else:
                await update.message.reply_text(response)
        else:
            await update.message.reply_text(response)
            
    except Exception as e:
        logger.error(f"Error in handle_message: {e}")
        await update.message.reply_text("Произошла ошибка при обработке сообщения")

async def time_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle the /time command"""
    try:
        args = context.args
        if len(args) < 3:
            await update.message.reply_text("Использование: /time ЧЧ ММ 'Текст напоминания'")
            return

        hours = int(args[0])
        minutes = int(args[1])
        reminder_text = ' '.join(args[2:])

        if not (0 <= hours <= 23 and 0 <= minutes <= 59):
            await update.message.reply_text("Пожалуйста, укажите корректное время (ЧЧ: 0-23, ММ: 0-59)")
            return

        now = datetime.now()
        reminder_time = now.replace(hour=hours, minute=minutes)
        
        if reminder_time < now:
            reminder_time += timedelta(days=1)

        chat_id = update.effective_chat.id
        job = context.job_queue.run_once(
            lambda ctx: send_reminder(ctx, chat_id, reminder_text),
            reminder_time,
            data=(chat_id, reminder_text),
            name=f"reminder_{chat_id}_{reminder_time.timestamp()}"
        )

        await update.message.reply_text(f"Напоминание установлено на {hours:02d}:{minutes:02d}")
        
        # Save reminder to file
        save_reminder(chat_id, reminder_time, reminder_text)

    except (ValueError, IndexError):
        await update.message.reply_text("Ошибка! Используйте формат: /time ЧЧ ММ 'Текст напоминания'")

async def schedule_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle the /schedule command"""
    try:
        message = update.message.text.replace('/schedule', '').strip()
        if not message:
            await update.message.reply_text(
                "Пожалуйста, укажите расписание в формате:\n"
                "/schedule\n"
                "9:00 Встреча\n"
                "13:30 Обед\n"
                "15:00 Созвон"
            )
            return

        schedule = {}
        for line in message.split('\n'):
            if not line.strip():
                continue
            try:
                time_str, task = line.strip().split(' ', 1)
                hours, minutes = map(int, time_str.split(':'))
                if not (0 <= hours <= 23 and 0 <= minutes <= 59):
                    await update.message.reply_text(f"Некорректное время: {time_str}")
                    continue
                schedule[f"{hours:02d}:{minutes:02d}"] = task
            except ValueError:
                await update.message.reply_text(f"Ошибка в строке: {line}")
                continue

        if not schedule:
            await update.message.reply_text("Не удалось создать расписание. Проверьте формат.")
            return

        # Sort schedule by time
        sorted_schedule = dict(sorted(schedule.items()))
        
        # Set up reminders for each task
        chat_id = update.effective_chat.id
        for time_str, task in sorted_schedule.items():
            hours, minutes = map(int, time_str.split(':'))
            await schedule_reminder(context, chat_id, time_str, task)

        # Format and send schedule
        schedule_text = "Ваше расписание на сегодня:\n\n"
        for time_str, task in sorted_schedule.items():
            schedule_text += f"{time_str} - {task}\n"
        
        await update.message.reply_text(schedule_text)

    except Exception as e:
        await update.message.reply_text(f"Произошла ошибка: {str(e)}")

async def send_reminder(context: ContextTypes.DEFAULT_TYPE, chat_id: int, text: str):
    """Send a reminder message"""
    await context.bot.send_message(
        chat_id=chat_id,
        text=f"🔔 Напоминание: {text}"
    )

def save_reminder(chat_id: int, time: datetime, text: str):
    """Save reminder to file"""
    try:
        with open('reminders.json', 'r') as f:
            reminders = json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        reminders = {}

    if str(chat_id) not in reminders:
        reminders[str(chat_id)] = []

    reminders[str(chat_id)].append({
        'time': time.strftime('%Y-%m-%d %H:%M'),
        'text': text
    })

    with open('reminders.json', 'w') as f:
        json.dump(reminders, f)

async def restart(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Restart the bot"""
    await update.message.reply_text("Перезапуск бота...")
    os._exit(0)

async def toggle_tts(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Toggle text-to-speech"""
    global tts_enabled
    tts_enabled = not tts_enabled
    status = "включено" if tts_enabled else "выключено"
    await update.message.reply_text(f"Озвучивание сообщений {status}")

async def toggle_auto_chat(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Toggle auto chat mode"""
    global auto_chat_enabled
    auto_chat_enabled = not auto_chat_enabled
    status = "включен" if auto_chat_enabled else "выключен"
    await update.message.reply_text(f"Режим автоматического общения {status}")

async def toggle_thoughts(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Toggle thoughts generation."""
    global thoughts_enabled
    thoughts_enabled = not thoughts_enabled
    await update.message.reply_text(
        f"Thoughts generation {'enabled' if thoughts_enabled else 'disabled'}"
    )

async def shutdown(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Shutdown the bot server"""
    await update.message.reply_text("Выключение сервера...")
    os._exit(0)

async def help_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Отправляет сообщение со списком команд при вызове /help."""
    help_text = """
🤖 *Доступные команды:*

📝 *Основные команды:*
/start - Начать общение с ботом
/help - Показать это сообщение помощи
/restart - Перезапустить бота
/shutdown - Выключить бота

🎙 *Голос и общение:*
/tts - Включить/выключить голосовые ответы
/autochat - Включить/выключить режим автоматического общения
/thoughts - Включить/выключить генерацию мыслей

⏰ *Напоминания и расписание:*
/time ЧЧ ММ "Текст" - Установить напоминание
Пример: `/time 16 30 "Сходить в магазин"`

/schedule - Управление расписанием дня
Пример:
/schedule
9:00 Утренняя встреча
13:00 Обед
15:30 Созвон с командой

💡 *Дополнительно:*
• Вы можете отправлять голосовые сообщения
• Бот поддерживает обработку изображений
• В режиме автоматического общения бот может сам инициировать диалог

Для использования любой команды просто нажмите на неё или введите вручную.
"""
    await update.message.reply_text(help_text, parse_mode='Markdown')

async def status_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Show bot status and settings"""
    global facts_enabled, tts_enabled, thoughts_enabled, auto_chat_enabled, aris_mode, active_chats
    
    # Получаем информацию о боте
    bot_info = await context.bot.get_me()
    
    # Форматируем статус каждой функции
    facts_status = "✅ включен" if facts_enabled else "❌ отключен"
    tts_status = "✅ включен" if tts_enabled else "❌ отключен"
    thoughts_status = "✅ включены" if thoughts_enabled else "❌ отключены"
    autochat_status = "✅ включен" if auto_chat_enabled else "❌ отключен"
    
    # Получаем текущий режим
    current_mode = "🎭 Арис" if aris_mode else "⚡ Базовый"
    
    # Собираем статистику
    active_chats_count = len(active_chats)
    thought_topics = len(thought_generator.topics) if hasattr(thought_generator, 'topics') else 0
    chat_history = len(auto_chat.chat_history) if hasattr(auto_chat, 'chat_history') else 0
    
    # Экранируем специальные символы в названиях моделей
    model_name = "saiga\\_gemma2\\_9b"
    search_model = "inkoziev/sbert\\_pq"
    voice_name = "ru\\-RU\\-DmitryNeural"
    
    status_text = f"""
🤖 *Статус бота*
Имя: {bot_info.first_name}
Режим: {current_mode}

*Активные функции:*
📚 База фактов: {facts_status}
🎤 Озвучка текста: {tts_status}
💭 Автоматические мысли: {thoughts_status}
🗨️ Автоматический чат: {autochat_status}

*Статистика:*
👥 Активных чатов: {active_chats_count}
🧠 Запомненных тем: {thought_topics}
💬 История диалога: {chat_history} сообщений

*Системная информация:*
⚙️ Модель ИИ: {model_name}
🔍 Модель поиска: {search_model}
🎙️ Голос TTS: {voice_name}
"""
    
    try:
        await update.message.reply_text(status_text, parse_mode='MarkdownV2')
    except Exception as e:
        logging.error(f"Ошибка отправки статуса: {e}")
        # Если не удалось отправить с форматированием, отправляем без него
        await update.message.reply_text(status_text.replace('*', ''))

async def check_auto_chat(application: Application) -> None:
    """Проверить и инициировать автоматический разговор"""
    global aris_mode, auto_chat_enabled, tts_enabled, active_chats
    
    try:
        if auto_chat_enabled and auto_chat.should_initiate_chat():
            # Получаем промпт и базовое сообщение
            ai_prompt, base_message = auto_chat.generate_prompt()
            
            # Генерируем ответ с учетом контекста
            response = chatbot.generate_response(ai_prompt)
            
            # Если включен режим Ариса, убираем эмодзи из ответа
            if aris_mode:
                emoji_pattern = re.compile("["
                    u"\U0001F600-\U0001F64F"  # эмотиконы
                    u"\U0001F300-\U0001F5FF"  # символы и пиктограммы
                    u"\U0001F680-\U0001F6FF"  # транспорт и символы
                    u"\U0001F1E0-\U0001F1FF"  # флаги
                    u"\U00002702-\U000027B0"
                    u"\U000024C2-\U0001F251"
                    "]+", flags=re.UNICODE)
                response = emoji_pattern.sub(r'', response)
            
            # Отправляем сообщение во все активные чаты
            for chat_id in active_chats:
                try:
                    # Отправляем текстовое сообщение
                    await application.bot.send_message(chat_id=chat_id, text=response)
                    
                    # Если включена озвучка, отправляем и голосовое сообщение
                    if tts_enabled:
                        voice_file = await generate_speech(response)
                        if voice_file:
                            await application.bot.send_voice(chat_id=chat_id, voice=open(voice_file, 'rb'))
                            os.remove(voice_file)
                except Exception as e:
                    logging.error(f"Ошибка отправки сообщения в чат {chat_id}: {e}")
                    
    except Exception as e:
        logging.error(f"Ошибка в auto_chat: {e}")

async def error_handler(update: object, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Log Errors caused by Updates."""
    logging.error(f"Update {update} caused error {context.error}", exc_info=context.error)

async def start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Send a message when the command /start is issued."""
    user = update.effective_user
    # Добавляем чат в активные
    active_chats.add(update.effective_chat.id)
    await update.message.reply_html(
        f"Привет, {user.mention_html()}! 👋\n\n"
        "Я Арис - твой персональный ассистент! 🤖\n"
        "Я могу общаться на разные темы, анализировать изображения\n"
        "и преобразовывать голосовые сообщения в текст.\n\n"
        "Используйте /help чтобы узнать больше о моих возможностях."
    )

async def webapp(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Отправляет ссылку на веб-приложение."""
    domain = config.get('domain', 'hghdgfire-source.github.io/hghDGfire-source')
    webapp_button = InlineKeyboardButton(
        text="Открыть веб-приложение",
        web_app=WebAppInfo(url=f"https://{domain}")
    )
    reply_markup = InlineKeyboardMarkup([[webapp_button]])
    await update.message.reply_text(
        "Нажмите кнопку ниже, чтобы открыть веб-приложение:",
        reply_markup=reply_markup
    )

@app.post("/api/message")
async def handle_message_api(request: Request):
    data = await request.json()
    message = data.get("message")
    chat_id = data.get("chat_id")
    tts_enabled = data.get("tts_enabled", False)
    
    try:
        # Получаем ответ от бота
        response = chatbot.get_response(message)
        
        result = {"response": response}
        
        # Если включен TTS, генерируем аудио
        if tts_enabled:
            try:
                voice_file = await generate_speech(response)
                if voice_file:
                    # Здесь нужно реализовать логику загрузки файла и получения URL
                    result["audio_url"] = f"/audio/{os.path.basename(voice_file)}"
            except Exception as e:
                logging.error(f"Ошибка при генерации голосового сообщения: {e}")
        
        return JSONResponse(result)
    except Exception as e:
        logging.error(f"Ошибка при обработке API запроса: {e}")
        return JSONResponse({"error": "Произошла ошибка при обработке сообщения"}, status_code=500)

@app.post("/api/toggle_tts")
async def toggle_tts_api(request: Request):
    data = await request.json()
    enabled = data.get("enabled", False)
    chat_id = data.get("chat_id")
    
    global tts_enabled
    tts_enabled = enabled
    
    return JSONResponse({"status": "success", "tts_enabled": tts_enabled})

@app.post("/api/toggle_autochat")
async def toggle_autochat_api(request: Request):
    data = await request.json()
    enabled = data.get("enabled", False)
    chat_id = data.get("chat_id")
    
    global auto_chat_enabled
    auto_chat_enabled = enabled
    
    return JSONResponse({"status": "success", "autochat_enabled": auto_chat_enabled})

@app.post("/api/schedule")
async def schedule_api(request: Request):
    data = await request.json()
    schedule_text = data.get("schedule")
    chat_id = data.get("chat_id")
    
    try:
        # Разбираем расписание
        schedule = {}
        for line in schedule_text.split('\n'):
            if not line.strip():
                continue
            try:
                time_str, task = line.strip().split(' ', 1)
                hours, minutes = map(int, time_str.split(':'))
                if not (0 <= hours <= 23 and 0 <= minutes <= 59):
                    continue
                schedule[f"{hours:02d}:{minutes:02d}"] = task
            except ValueError:
                continue
        
        if not schedule:
            return JSONResponse({"error": "Неверный формат расписания"}, status_code=400)
        
        # Сохраняем расписание
        save_schedule(chat_id, schedule)
        
        return JSONResponse({"status": "success", "schedule": schedule})
    except Exception as e:
        logging.error(f"Ошибка при сохранении расписания: {e}")
        return JSONResponse({"error": "Произошла ошибка при сохранении расписания"}, status_code=500)

@app.get("/api/user_settings")
async def get_user_settings(request: Request):
    # Здесь можно добавить логику загрузки настроек пользователя из базы данных
    return JSONResponse({
        "tts_enabled": tts_enabled,
        "autochat_enabled": auto_chat_enabled
    })

@app.post("/api/set_chat_mode")
async def set_chat_mode(request: Request):
    """Set chat mode endpoint"""
    try:
        data = await request.json()
        mode = data.get("mode")
        chat_id = data.get("chat_id")
        
        if not mode or not chat_id:
            return JSONResponse({"error": "Missing mode or chat_id"}, status_code=400)
            
        success = chatbot.set_chat_mode(mode)
        if success:
            return JSONResponse({"status": "success", "mode": mode})
        else:
            return JSONResponse({"error": "Invalid mode"}, status_code=400)
            
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)

def run_fastapi():
    """Run FastAPI server"""
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

def run_telegram():
    """Run Telegram bot"""
    # Настраиваем логирование
    logging.basicConfig(
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
        level=logging.INFO
    )
    logger = logging.getLogger(__name__)

    # Create the Application and pass it your bot's token
    application = Application.builder().token(config['telegram_token']).build()

    # Command handlers
    application.add_handler(CommandHandler("start", start))
    application.add_handler(CommandHandler("help", help_command))
    application.add_handler(CommandHandler("restart", restart))
    application.add_handler(CommandHandler("tts", toggle_tts))
    application.add_handler(CommandHandler("thoughts", toggle_thoughts))
    application.add_handler(CommandHandler("autochat", toggle_auto_chat))
    application.add_handler(CommandHandler("time", time_command))
    application.add_handler(CommandHandler("schedule", schedule_command))
    application.add_handler(CommandHandler("shutdown", shutdown))
    application.add_handler(CommandHandler("webapp", webapp))
    
    # Message handlers
    application.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_message))
    application.add_handler(MessageHandler(filters.VOICE, handle_voice))
    application.add_handler(MessageHandler(filters.PHOTO, handle_photo))

    # Error handler
    application.add_error_handler(error_handler)

    # Start auto-chat checker
    if auto_chat_enabled:
        application.job_queue.run_repeating(check_auto_chat, interval=300, first=10)

    # Start the bot
    application.run_polling()

if __name__ == '__main__':
    import multiprocessing
    multiprocessing.freeze_support()  # Для поддержки Windows
    
    # Запускаем FastAPI сервер в отдельном процессе
    fastapi_process = multiprocessing.Process(target=run_fastapi)
    fastapi_process.daemon = True  # Процесс завершится вместе с основным
    fastapi_process.start()
    
    try:
        # Запускаем Telegram бота в основном процессе
        run_telegram()
    except KeyboardInterrupt:
        print("\nShutting down...")
    except Exception as e:
        print(f"Error: {e}")
        raise
    finally:
        # Останавливаем FastAPI сервер
        fastapi_process.terminate()
        fastapi_process.join()
