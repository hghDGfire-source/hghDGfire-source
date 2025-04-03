// Отладка
const DEBUG = true;

function debug(...args) {
    if (DEBUG) {
        console.log('[DEBUG]', ...args);
    }
}

// Инициализация Telegram WebApp
let tg = window.Telegram?.WebApp;
if (!tg) {
    document.body.innerHTML = '<div class="error">Ошибка: Приложение должно быть открыто в Telegram</div>';
    throw new Error('Telegram WebApp not initialized');
}

// Расширяем окно на весь экран
tg.expand();

// Состояние приложения
const AppState = {
    ttsEnabled: false,
    autoChatEnabled: false,
    isOnline: true,
    currentMode: 'default',
    messageQueue: [],
    isProcessing: false,
    retryCount: 0
};

// Конфигурация
const CONFIG = {
    MAX_RETRIES: 3,
    RETRY_DELAY: 1000,
    MESSAGE_QUEUE_TIMEOUT: 30000
};

// Получение элементов DOM
const messages = document.getElementById('messages');
const messageInput = document.getElementById('messageInput');
const sendButton = document.getElementById('sendButton');
const voiceButton = document.getElementById('voiceButton');
const scheduleButton = document.getElementById('scheduleButton');
const settingsButton = document.getElementById('settingsButton');
const scheduleModal = document.getElementById('scheduleModal');
const settingsModal = document.getElementById('settingsModal');
const scheduleInput = document.getElementById('scheduleInput');
const ttsToggle = document.getElementById('ttsToggle');
const autoChatToggle = document.getElementById('autoChatToggle');

// Функция для отображения сообщений
function addMessage(text, type = 'bot') {
    if (!text || typeof text !== 'string') {
        debug('Invalid message:', text);
        return;
    }

    try {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${type}`;
        messageDiv.textContent = text;
        
        messages.appendChild(messageDiv);
        messages.scrollTop = messages.scrollHeight;
    } catch (error) {
        debug('Error adding message:', error);
    }
}

// Отправка сообщения
async function sendMessage() {
    const text = messageInput.value.trim();
    if (!text) return;

    try {
        // Добавляем сообщение в очередь
        AppState.messageQueue.push({
            text,
            timestamp: Date.now()
        });

        // Очищаем поле ввода
        messageInput.value = '';
        
        // Показываем сообщение пользователя
        addMessage(text, 'user');

        // Если уже обрабатываем сообщение, выходим
        if (AppState.isProcessing) return;

        // Обрабатываем очередь сообщений
        await processMessageQueue();
    } catch (error) {
        debug('Error sending message:', error);
        addMessage('Ошибка при отправке сообщения', 'system');
    }
}

// Обработка очереди сообщений
async function processMessageQueue() {
    if (AppState.isProcessing || AppState.messageQueue.length === 0) return;

    AppState.isProcessing = true;
    
    try {
        while (AppState.messageQueue.length > 0) {
            const { text, timestamp } = AppState.messageQueue[0];
            
            // Проверяем, не устарело ли сообщение
            if (Date.now() - timestamp > CONFIG.MESSAGE_QUEUE_TIMEOUT) {
                AppState.messageQueue.shift();
                continue;
            }

            // Отправляем сообщение через Telegram WebApp
            await sendMessageToBot(text);

            // Удаляем обработанное сообщение
            AppState.messageQueue.shift();
            AppState.retryCount = 0;

            // Небольшая задержка между сообщениями
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    } catch (error) {
        debug('Error processing message queue:', error);
        
        if (AppState.retryCount < CONFIG.MAX_RETRIES) {
            AppState.retryCount++;
            setTimeout(processMessageQueue, CONFIG.RETRY_DELAY);
        } else {
            addMessage('Ошибка при обработке сообщений', 'system');
        }
    } finally {
        AppState.isProcessing = false;
    }
}

// Отправка сообщения боту
async function sendMessageToBot(text) {
    try {
        tg.sendData(JSON.stringify({
            action: 'message',
            data: {
                text: text,
                tts_enabled: AppState.ttsEnabled
            }
        }));
    } catch (error) {
        debug('Error sending message to bot:', error);
        throw error;
    }
}

// Сохранение расписания
async function saveSchedule() {
    const scheduleText = scheduleInput.value.trim();
    
    if (!scheduleText) {
        addMessage('Пожалуйста, введите расписание', 'system');
        return;
    }

    try {
        // Валидация расписания
        if (!validateSchedule(scheduleText)) {
            return;
        }

        // Отправляем расписание через Telegram WebApp
        tg.sendData(JSON.stringify({
            action: 'schedule',
            data: {
                schedule: scheduleText
            }
        }));

        addMessage('Расписание отправлено', 'system');
        scheduleModal.style.display = 'none';
        scheduleInput.value = '';
    } catch (error) {
        debug('Error saving schedule:', error);
        addMessage('Ошибка при сохранении расписания', 'system');
    }
}

// Валидация расписания
function validateSchedule(text) {
    const lines = text.split('\n').filter(line => line.trim());
    const invalidLines = lines.filter(line => {
        const parts = line.trim().split(' ');
        if (parts.length < 2) return true;
        
        const timeStr = parts[0];
        if (!timeStr.includes(':')) return true;
        
        const [hours, minutes] = timeStr.split(':').map(Number);
        if (isNaN(hours) || isNaN(minutes)) return true;
        if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return true;
        
        return false;
    });

    if (invalidLines.length > 0) {
        addMessage('Ошибка в формате расписания. Используйте формат:\n9:00 Встреча\n13:30 Обед', 'system');
        return false;
    }

    return true;
}

// Переключение TTS
function toggleTTS() {
    try {
        AppState.ttsEnabled = ttsToggle.checked;
        
        tg.sendData(JSON.stringify({
            action: 'settings',
            data: {
                type: 'tts',
                enabled: AppState.ttsEnabled
            }
        }));
        
        addMessage(`Озвучка ${AppState.ttsEnabled ? 'включена' : 'выключена'}`, 'system');
    } catch (error) {
        debug('Error toggling TTS:', error);
        ttsToggle.checked = !ttsToggle.checked;
        addMessage('Ошибка при изменении настроек', 'system');
    }
}

// Переключение автоматического чата
function toggleAutoChat() {
    try {
        AppState.autoChatEnabled = autoChatToggle.checked;
        
        tg.sendData(JSON.stringify({
            action: 'settings',
            data: {
                type: 'autochat',
                enabled: AppState.autoChatEnabled
            }
        }));
        
        addMessage(`Автоматический чат ${AppState.autoChatEnabled ? 'включен' : 'выключен'}`, 'system');
    } catch (error) {
        debug('Error toggling auto chat:', error);
        autoChatToggle.checked = !autoChatToggle.checked;
        addMessage('Ошибка при изменении настроек', 'system');
    }
}

// Обработчики событий
sendButton.addEventListener('click', sendMessage);

messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
});

scheduleButton.addEventListener('click', () => {
    scheduleModal.style.display = 'block';
});

settingsButton.addEventListener('click', () => {
    settingsModal.style.display = 'block';
});

ttsToggle?.addEventListener('change', toggleTTS);
autoChatToggle?.addEventListener('change', toggleAutoChat);

// Закрытие модальных окон при клике вне их
window.addEventListener('click', (e) => {
    if (e.target === scheduleModal) {
        scheduleModal.style.display = 'none';
    }
    if (e.target === settingsModal) {
        settingsModal.style.display = 'none';
    }
});

// Обработка событий от Telegram
tg.onEvent('mainButtonClicked', () => {
    tg.sendData('main_button_clicked');
});

// Проверка соединения
function updateConnectionStatus() {
    const wasOnline = AppState.isOnline;
    AppState.isOnline = navigator.onLine;
    
    if (wasOnline !== AppState.isOnline) {
        if (!AppState.isOnline) {
            debug('Connection lost');
            addMessage('Соединение потеряно', 'system');
        } else {
            debug('Connection restored');
            addMessage('Соединение восстановлено', 'system');
            // Пробуем обработать накопившиеся сообщения
            processMessageQueue();
        }
    }
}

window.addEventListener('online', updateConnectionStatus);
window.addEventListener('offline', updateConnectionStatus);

// Инициализация
document.addEventListener('DOMContentLoaded', () => {
    debug('DOM loaded');
    updateConnectionStatus();
    tg.ready();
});
