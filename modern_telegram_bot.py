import logging
import asyncio
import json
import os
import traceback
from datetime import datetime, timedelta
from telegram import Update, InputMediaPhoto, WebAppInfo, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import Application, CommandHandler, MessageHandler, filters, ContextTypes, JobQueue, CallbackQueryHandler
from chatbot_core import Chatbot
import aiohttp
from PIL import Image
import torch
import torchvision.transforms as transforms
from torchvision.models import resnet50, ResNet50_Weights
import pytz
from fact_search import FactSearch
from thought_generator import ThoughtGenerator
from auto_chat import AutoChat
from typing import Optional
import edge_tts
import numpy as np
import speech_recognition as sr
from pydub import AudioSegment
import tempfile
import aiofiles
import yaml
import base64
import re
from pathlib import Path
import httpx
import scipy.io.wavfile
import pyttsx3
from model_optimizer import get_optimizer
import torch
from contextlib import nullcontext

# Настройка логирования
logging.basicConfig(
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    level=logging.INFO
)
logger = logging.getLogger(__name__)

class ModernBot:
    def __init__(self):
        # Загрузка конфигурации
        self.config = self.load_config()
        self.token = self.config['telegram_token']
        
        # Инициализация оптимизатора
        self.optimizer = get_optimizer()
        self.optimizer.print_device_info()
        
        # Загрузка и оптимизация моделей
        self.chatbot = Chatbot()
        self.chatbot.model = self.optimizer.optimize_for_inference(
            self.chatbot.model,
            batch_size=1
        )
        
        # Настройка кэширования
        self.response_cache = {}
        self.cache_ttl = timedelta(hours=1)
        
        # URL веб-приложения
        self.webapp_url = "https://hghDGfire-source.github.io/hghDGfire-source/"
        
        # Инициализация компонентов
        self.fact_searcher = FactSearch(threshold=0.7)
        self.thought_generator = ThoughtGenerator()
        self.auto_chat = AutoChat()
        
        # Загрузка ResNet модели
        self.weights = ResNet50_Weights.DEFAULT
        self.model = resnet50(weights=self.weights)
        self.model.eval()
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        self.model = self.model.to(self.device)
        self.categories = self.weights.meta["categories"]
        
        # Настройки пользователей
        self.user_settings = {}
        
        # Глобальные состояния
        self.tts_enabled = True
        self.facts_enabled = False
        self.thoughts_enabled = False
        self.auto_chat_enabled = False
        self.aris_mode = False
        self.active_chats = set()
        
        # Инициализация TTS
        self._tts_enabled = None
        
    def load_config(self):
        """Загрузка конфигурации"""
        config_path = 'config.yaml'
        if os.path.exists(config_path):
            with open(config_path, 'r', encoding='utf-8') as file:
                return yaml.safe_load(file)
        return {"telegram_token": "YOUR_TOKEN_HERE"}

    def load_user_settings(self, user_id):
        """Загрузка настроек пользователя"""
        settings_dir = Path("user_settings")
        settings_file = settings_dir / f"{user_id}.json"
        
        default_settings = {
            'auto_start': False,
            'notifications': True,
            'sound': True,
            'voice': False,
            'chat_history': [],
            'facts_enabled': False,
            'thoughts_enabled': False,
            'auto_chat_enabled': False,
            'aris_mode': False,
            'tts_enabled': True
        }
        
        try:
            if settings_file.exists():
                with open(settings_file, 'r', encoding='utf-8') as f:
                    settings = json.load(f)
                    default_settings.update(settings)
        except Exception as e:
            logger.error(f"Error loading user settings: {e}")
            
        self.user_settings[user_id] = default_settings

    def save_user_settings(self, user_id):
        """Сохранение настроек пользователя"""
        try:
            settings_dir = Path("user_settings")
            settings_dir.mkdir(exist_ok=True)
            
            settings_file = settings_dir / f"{user_id}.json"
            with open(settings_file, 'w', encoding='utf-8') as f:
                json.dump(self.user_settings.get(user_id, {}), f)
                
        except Exception as e:
            logger.error(f"Error saving user settings: {e}")

    async def initialize_tts(self):
        """Инициализация TTS модели"""
        try:
            self._tts_enabled = True
            logging.info("TTS модель успешно инициализирована")
            return True
        except Exception as e:
            logging.error(f"Ошибка инициализации TTS: {str(e)}")
            logging.error(f"Traceback: {traceback.format_exc()}")
            return False

    def move_to_device(self, obj, device):
        """Рекурсивно перемещает все тензоры на указанное устройство"""
        if isinstance(obj, torch.Tensor):
            return obj.to(device)
        elif isinstance(obj, dict):
            return {key: self.move_to_device(value, device) for key, value in obj.items()}
        elif isinstance(obj, list):
            return [self.move_to_device(item, device) for item in obj]
        elif hasattr(obj, 'to_dict'):
            return self.move_to_device(obj.to_dict(), device)
        elif isinstance(obj, torch.nn.Module):
            return obj.to(device)
        elif isinstance(obj, torch.nn.Parameter):
            return obj.to(device)
        return obj

    async def start(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Обработчик команды /start"""
        user_id = update.effective_user.id
        if user_id not in self.user_settings:
            self.load_user_settings(user_id)
            
        keyboard = [
            [InlineKeyboardButton(
                "🚀 Открыть веб-приложение",
                web_app=WebAppInfo(url=self.webapp_url)
            )]
        ]
        reply_markup = InlineKeyboardMarkup(keyboard)
        
        await update.message.reply_text(
            "👋 Привет! Я Arisa, ваш умный AI-ассистент.\n"
            "🌟 У меня есть много интересных возможностей:\n"
            "🤖 - Общение с искусственным интеллектом\n"
            "🎯 - Поиск по базе знаний\n"
            "💭 - Генерация мыслей\n"
            "🗣 - Голосовые сообщения\n"
            "📅 - Управление расписанием\n\n"
            "Используйте /help для получения списка команд",
            reply_markup=reply_markup
        )

    async def help_command(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Отправляет список доступных команд"""
        help_text = (
            "🤖 Доступные команды:\n\n"
            "/start - Начать общение\n"
            "/help - Показать это сообщение\n"
            "/status - Показать статус бота\n"
            "/web - Открыть веб-интерфейс\n"
            "/settings - Настройки бота\n"
            "/clear - Очистить историю чата\n\n"
            "🎯 Управление функциями:\n"
            "/facts - Включить/выключить поиск фактов\n"
            "/thoughts - Включить/выключить мысли\n"
            "/tts - Включить/выключить озвучку\n"
            "/autochat - Включить/выключить автоматический чат\n\n"
            "🎭 Режимы работы:\n"
            "/aris - Включить режим Aris\n"
            "/base - Вернуться к базовому режиму\n\n"
            "⏰ Управление временем:\n"
            "/time - Показать текущее время\n"
            "/schedule - Управление расписанием"
        )
        await update.message.reply_text(help_text)

    async def status_command(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Показывает текущий статус бота"""
        user_id = update.effective_user.id
        if user_id not in self.user_settings:
            self.load_user_settings(user_id)
            
        settings = self.user_settings[user_id]
        
        status_text = (
            "📊 Статус бота:\n\n"
            f"🤖 Режим Aris: {'Включен' if settings['aris_mode'] else 'Выключен'}\n"
            f"🎯 Поиск фактов: {'Включен' if settings['facts_enabled'] else 'Выключен'}\n"
            f"💭 Генерация мыслей: {'Включена' if settings['thoughts_enabled'] else 'Выключена'}\n"
            f"🗣 Озвучка: {'Включена' if settings['tts_enabled'] else 'Выключена'}\n"
            f"🤝 Автоматический чат: {'Включен' if settings['auto_chat_enabled'] else 'Выключен'}\n\n"
            "⚙️ Настройки:\n"
            f"🔄 Автозапуск: {'Включен' if settings['auto_start'] else 'Выключен'}\n"
            f"🔔 Уведомления: {'Включены' if settings['notifications'] else 'Выключены'}\n"
            f"🔊 Звуки: {'Включены' if settings['sound'] else 'Выключены'}\n"
            f"🎤 Голосовые: {'Включены' if settings['voice'] else 'Выключены'}\n\n"
            "💻 Система:\n"
            f"GPU: {'Доступен' if torch.cuda.is_available() else 'Недоступен'}\n"
            f"Активные чаты: {len(self.active_chats)}"
        )
        
        await update.message.reply_text(status_text)

    async def toggle_facts(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Включает/выключает поиск фактов"""
        user_id = update.effective_user.id
        if user_id not in self.user_settings:
            self.load_user_settings(user_id)
            
        settings = self.user_settings[user_id]
        settings['facts_enabled'] = not settings['facts_enabled']
        self.save_user_settings(user_id)
        
        status = "включен" if settings['facts_enabled'] else "выключен"
        await update.message.reply_text(f"🎯 Поиск фактов {status}")

    async def toggle_thoughts(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Включает/выключает генерацию мыслей"""
        user_id = update.effective_user.id
        if user_id not in self.user_settings:
            self.load_user_settings(user_id)
            
        settings = self.user_settings[user_id]
        settings['thoughts_enabled'] = not settings['thoughts_enabled']
        self.save_user_settings(user_id)
        
        status = "включена" if settings['thoughts_enabled'] else "выключена"
        await update.message.reply_text(f"💭 Генерация мыслей {status}")

    async def toggle_tts(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Включает/выключает озвучку сообщений"""
        user_id = update.effective_user.id
        if user_id not in self.user_settings:
            self.load_user_settings(user_id)
            
        settings = self.user_settings[user_id]
        settings['tts_enabled'] = not settings['tts_enabled']
        self.save_user_settings(user_id)
        
        status = "включена" if settings['tts_enabled'] else "выключена"
        await update.message.reply_text(f"🗣 Озвучка {status}")

    async def toggle_auto_chat(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Включает/выключает автоматический чат"""
        user_id = update.effective_user.id
        if user_id not in self.user_settings:
            self.load_user_settings(user_id)
            
        settings = self.user_settings[user_id]
        settings['auto_chat_enabled'] = not settings['auto_chat_enabled']
        self.save_user_settings(user_id)
        
        if settings['auto_chat_enabled']:
            self.active_chats.add(update.effective_chat.id)
        else:
            self.active_chats.discard(update.effective_chat.id)
        
        status = "включен" if settings['auto_chat_enabled'] else "выключен"
        await update.message.reply_text(f"🤝 Автоматический чат {status}")

    async def aris_command(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Включает режим Aris"""
        user_id = update.effective_user.id
        if user_id not in self.user_settings:
            self.load_user_settings(user_id)
            
        settings = self.user_settings[user_id]
        settings['aris_mode'] = True
        self.save_user_settings(user_id)
        
        await update.message.reply_text("🎭 Режим Aris включен")

    async def base_command(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Возвращает к базовому режиму"""
        user_id = update.effective_user.id
        if user_id not in self.user_settings:
            self.load_user_settings(user_id)
            
        settings = self.user_settings[user_id]
        settings['aris_mode'] = False
        self.save_user_settings(user_id)
        
        await update.message.reply_text("🎭 Возврат к базовому режиму")

    async def time_command(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Показывает текущее время"""
        now = datetime.now(pytz.timezone('Asia/Irkutsk'))
        await update.message.reply_text(
            f"⏰ Текущее время: {now.strftime('%H:%M:%S')}\n"
            f"📅 Дата: {now.strftime('%d.%m.%Y')}\n"
            "🌍 Часовой пояс: Asia/Irkutsk (UTC+8)"
        )

    async def schedule_command(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Управление расписанием"""
        if not context.args:
            await update.message.reply_text(
                "📅 Использование команды /schedule:\n\n"
                "Добавить задачу:\n"
                "/schedule add ЧЧ:ММ Задача\n\n"
                "Посмотреть расписание:\n"
                "/schedule list\n\n"
                "Очистить расписание:\n"
                "/schedule clear"
            )
            return

        user_id = update.effective_user.id
        if user_id not in self.user_settings:
            self.load_user_settings(user_id)

        settings = self.user_settings[user_id]
        if 'schedule' not in settings:
            settings['schedule'] = []

        command = context.args[0].lower()

        if command == 'add':
            if len(context.args) < 3:
                await update.message.reply_text("❌ Укажите время и задачу")
                return

            time = context.args[1]
            task = ' '.join(context.args[2:])
            
            try:
                # Проверяем формат времени
                datetime.strptime(time, '%H:%M')
                settings['schedule'].append({'time': time, 'task': task})
                self.save_user_settings(user_id)
                
                # Добавляем напоминание
                await self.schedule_reminder(context, update.effective_chat.id, time, task)
                
                await update.message.reply_text(f"✅ Задача добавлена на {time}")
            except ValueError:
                await update.message.reply_text("❌ Неверный формат времени. Используйте ЧЧ:ММ")

        elif command == 'list':
            if not settings['schedule']:
                await update.message.reply_text("📅 Расписание пусто")
                return

            schedule_text = "📅 Ваше расписание:\n\n"
            for item in sorted(settings['schedule'], key=lambda x: x['time']):
                schedule_text += f"⏰ {item['time']} - {item['task']}\n"
            
            await update.message.reply_text(schedule_text)

        elif command == 'clear':
            settings['schedule'] = []
            self.save_user_settings(user_id)
            await update.message.reply_text("🧹 Расписание очищено")

    async def schedule_reminder(self, context: ContextTypes.DEFAULT_TYPE, chat_id: int, time_str: str, task: str):
        """Планирует напоминание"""
        try:
            # Парсим время
            hour, minute = map(int, time_str.split(':'))
            now = datetime.now(pytz.timezone('Asia/Irkutsk'))
            
            # Создаем время напоминания
            reminder_time = now.replace(hour=hour, minute=minute, second=0, microsecond=0)
            
            # Если время уже прошло, переносим на следующий день
            if reminder_time <= now:
                reminder_time += timedelta(days=1)
            
            # Планируем напоминание
            context.job_queue.run_once(
                self.send_reminder,
                reminder_time,
                data={'chat_id': chat_id, 'task': task}
            )
            
        except Exception as e:
            logger.error(f"Error scheduling reminder: {e}")

    async def send_reminder(self, context: ContextTypes.DEFAULT_TYPE):
        """Отправляет напоминание"""
        job = context.job
        await context.bot.send_message(
            job.data['chat_id'],
            f"⏰ Напоминание!\n\n{job.data['task']}"
        )

    async def handle_callback(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Обработчик callback запросов"""
        query = update.callback_query
        await query.answer()
        
        if query.data == "theme":
            await query.message.edit_text("🎨 Настройки темы пока недоступны")
        elif query.data == "notifications":
            await query.message.edit_text("🔔 Настройки уведомлений пока недоступны")
        elif query.data == "language":
            await query.message.edit_text("🗣 Настройки языка пока недоступны")
        elif query.data == "other":
            await query.message.edit_text("⚙️ Дополнительные настройки пока недоступны")

    async def handle_webapp_data(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Обработка данных от веб-приложения"""
        try:
            data = json.loads(update.effective_message.web_app_data.data)
            user_id = update.effective_user.id
            
            if data.get('type') == 'settings':
                # Обновляем настройки пользователя
                settings = data.get('settings', {})
                if user_id not in self.user_settings:
                    self.load_user_settings(user_id)
                
                self.user_settings[user_id].update(settings)
                self.save_user_settings(user_id)
                
                await update.message.reply_text("✅ Настройки успешно сохранены!")
                
                if settings.get('auto_start', False):
                    await self.start(update, context)
                    
            elif data.get('type') == 'voice':
                # Обработка голосового сообщения
                audio_data = base64.b64decode(data['audio'])
                with tempfile.NamedTemporaryFile(suffix='.ogg', delete=False) as temp_file:
                    temp_file.write(audio_data)
                    temp_file.flush()
                    
                    # Преобразуем голос в текст
                    text = await self.speech_to_text(temp_file.name)
                    os.remove(temp_file.name)
                    
                    if text:
                        await self.handle_text_message(update, context, text)
                    else:
                        await update.message.reply_text("❌ Не удалось распознать голосовое сообщение")
                        
            elif data.get('type') == 'tts':
                # Преобразование ответа бота в голосовое сообщение
                text = data.get('text')
                voice_file = self.text_to_speech(text)
                
                # Отправляем голосовое сообщение
                with open(voice_file, 'rb') as audio:
                    await update.message.reply_voice(audio)
                os.remove(voice_file)
                
            elif data.get('type') == 'command':
                command = data.get('command')
                if command == '/start':
                    await self.start(update, context)
                elif command == '/help':
                    await self.help_command(update, context)
                elif command == '/clear':
                    # Очистка истории чата
                    if user_id in self.user_settings:
                        self.user_settings[user_id]['chat_history'] = []
                        self.save_user_settings(user_id)
                        await update.message.reply_text("🧹 История чата очищена")
        
        except Exception as e:
            logger.error(f"Error handling webapp data: {e}")
            await update.message.reply_text("❌ Произошла ошибка при обработке данных")

    async def handle_message(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Обработка входящих сообщений"""
        if not update.message or not update.message.text:
            return
            
        text = update.message.text
        
        # Проверяем команды
        if text.startswith('/'):
            await self.handle_command(update, context)
            return
            
        # Отправляем индикатор набора текста
        await context.bot.send_chat_action(
            chat_id=update.effective_chat.id,
            action="typing"
        )
        
        # Потоковая генерация ответа
        message = await context.bot.send_message(
            chat_id=update.effective_chat.id,
            text="⌛ Генерирую ответ..."
        )
        
        full_response = ""
        async for token in self.stream_response(text):
            full_response += token
            if len(full_response) % 20 == 0:  # Обновляем каждые 20 символов
                try:
                    await context.bot.edit_message_text(
                        chat_id=update.effective_chat.id,
                        message_id=message.message_id,
                        text=full_response + "▌"
                    )
                except Exception:
                    pass
                    
        # Финальное обновление сообщения
        await context.bot.edit_message_text(
            chat_id=update.effective_chat.id,
            message_id=message.message_id,
            text=full_response
        )
        
        # Очищаем кэш CUDA если нужно
        if len(self.response_cache) > 1000:
            self.optimizer.clear_cache()
            
    async def handle_command(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Обработка команд"""
        command = update.message.text.split()[0].lower()
        
        if command == '/start':
            await self.cmd_start(update, context)
        elif command == '/help':
            await self.cmd_help(update, context)
        elif command == '/clear':
            await self.cmd_clear(update, context)
        elif command == '/voice':
            await self.cmd_voice(update, context)
        elif command == '/settings':
            await self.cmd_settings(update, context)
        else:
            await context.bot.send_message(
                chat_id=update.effective_chat.id,
                text="Неизвестная команда. Используйте /help для списка команд."
            )

    async def generate_response(self, prompt: str) -> str:
        """Генерация ответа с кэшированием"""
        cache_key = prompt.strip().lower()
        
        # Проверяем кэш
        if cache_key in self.response_cache:
            cached_response, timestamp = self.response_cache[cache_key]
            if datetime.now() - timestamp < self.cache_ttl:
                return cached_response
        
        # Генерируем новый ответ
        try:
            with torch.cuda.amp.autocast() if self.optimizer.is_gpu_available else nullcontext():
                response = await self.chatbot.generate(prompt)
            
            # Кэшируем ответ
            self.response_cache[cache_key] = (response, datetime.now())
            
            # Очищаем старые записи кэша
            self._cleanup_cache()
            
            return response
        except Exception as e:
            logger.error(f"Error generating response: {e}")
            return "Извините, произошла ошибка при генерации ответа."
    
    def _cleanup_cache(self):
        """Очистка устаревших записей кэша"""
        current_time = datetime.now()
        self.response_cache = {
            k: (v, t) for k, (v, t) in self.response_cache.items()
            if current_time - t < self.cache_ttl
        }
        
    async def stream_response(self, prompt: str):
        """Потоковая генерация ответа"""
        try:
            with torch.cuda.amp.autocast() if self.optimizer.is_gpu_available else nullcontext():
                async for token in self.chatbot.stream_generate(prompt):
                    yield token
        except Exception as e:
            logger.error(f"Error in stream generation: {e}")
            yield "Извините, произошла ошибка при генерации ответа."
    
    async def handle_text_message(self, update: Update, context: ContextTypes.DEFAULT_TYPE, text=None):
        """Обработка текстовых сообщений"""
        try:
            if text is None:
                message = update.message.text
            else:
                message = text
            user_id = update.effective_user.id

            # Здесь ваша логика обработки сообщений
            response = f"Получено сообщение: {message}"
            
            # Отправляем ответ
            await update.message.reply_text(response)

        except Exception as e:
            logger.error(f"Error in text message handler: {e}")
            await update.message.reply_text("❌ Произошла ошибка при обработке текстового сообщения")

    async def handle_voice(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Обработка голосовых сообщений"""
        try:
            # Получаем файл голосового сообщения
            voice_file = await update.message.voice.get_file()
            with tempfile.NamedTemporaryFile(suffix='.ogg', delete=False) as temp_file:
                await voice_file.download_to_drive(temp_file.name)
                
                # Преобразуем голос в текст
                text = await self.speech_to_text(temp_file.name)
                os.remove(temp_file.name)
                
                if text:
                    await self.handle_text_message(update, context, text)
                else:
                    await update.message.reply_text("❌ Не удалось распознать голосовое сообщение")
                    
        except Exception as e:
            logger.error(f"Error handling voice message: {e}")
            await update.message.reply_text("❌ Произошла ошибка при обработке голосового сообщения")

    async def clear_chat(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Очистка истории чата"""
        try:
            user_id = update.effective_user.id
            if user_id in self.user_settings:
                self.user_settings[user_id]['chat_history'] = []
                self.save_user_settings(user_id)
                await update.message.reply_text("🧹 История чата очищена")
            else:
                await update.message.reply_text("❌ Не удалось найти настройки пользователя")
        except Exception as e:
            logger.error(f"Error in clear chat: {e}")
            await update.message.reply_text("❌ Произошла ошибка при очистке чата")

    async def error_handler(self, update: object, context: ContextTypes.DEFAULT_TYPE):
        """Обработчик ошибок"""
        logger.error(f"При обработке обновления произошла ошибка: {context.error}")

    async def speech_to_text(self, voice_file):
        """Преобразование голоса в текст"""
        try:
            with sr.AudioFile(voice_file) as source:
                audio = sr.Recognizer().record(source)
                text = sr.Recognizer().recognize_google(audio, language='ru-RU')
                return text
        except Exception as e:
            logger.error(f"Error in speech recognition: {e}")
            return None

    def text_to_speech(self, text):
        """Преобразование текста в голос"""
        with tempfile.NamedTemporaryFile(suffix='.ogg', delete=False) as temp_file:
            # Сначала сохраняем как mp3
            mp3_path = temp_file.name.replace('.ogg', '.mp3')
            pyttsx3.init().save_to_file(text, mp3_path)
            pyttsx3.init().runAndWait()
            
            # Конвертируем в ogg
            audio = AudioSegment.from_mp3(mp3_path)
            audio.export(temp_file.name, format='ogg')
            
            # Удаляем временный mp3 файл
            os.remove(mp3_path)
            
            return temp_file.name
            
    def run(self):
        """Запуск бота"""
        application = Application.builder().token(self.token).build()
        
        # Обработчики команд
        application.add_handler(CommandHandler("start", self.start))
        application.add_handler(CommandHandler("help", self.help_command))
        application.add_handler(CommandHandler("status", self.status_command))
        application.add_handler(CommandHandler("settings", self.settings))
        application.add_handler(CommandHandler("clear", self.clear_chat))
        application.add_handler(CommandHandler("facts", self.toggle_facts))
        application.add_handler(CommandHandler("thoughts", self.toggle_thoughts))
        application.add_handler(CommandHandler("tts", self.toggle_tts))
        application.add_handler(CommandHandler("autochat", self.toggle_auto_chat))
        application.add_handler(CommandHandler("aris", self.aris_command))
        application.add_handler(CommandHandler("base", self.base_command))
        application.add_handler(CommandHandler("time", self.time_command))
        application.add_handler(CommandHandler("schedule", self.schedule_command))
        
        # Обработчик всех сообщений
        application.add_handler(MessageHandler(
            filters.ALL & ~filters.COMMAND,
            self.handle_message
        ))
        
        # Обработчик callback кнопок
        application.add_handler(CallbackQueryHandler(self.handle_callback))
        
        # Запускаем проверку автоматического чата
        application.job_queue.run_repeating(
            self.check_auto_chat,
            interval=300,  # каждые 5 минут
            first=10  # через 10 секунд после запуска
        )
        
        # Запуск бота
        print("🤖 Бот запущен и готов к работе...")
        application.run_polling()

if __name__ == '__main__':
    bot = ModernBot()
    bot.run()
