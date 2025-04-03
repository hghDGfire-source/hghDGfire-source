// Конфигурация API
const API_CONFIG = {
    // Используем разные URL для разработки и продакшена
    BASE_URL: window.location.hostname === 'localhost' 
        ? 'http://localhost:8000'
        : 'https://hghdgfire-source.github.io/hghDGfire-source',
    
    // Endpoints
    ENDPOINTS: {
        MESSAGE: '/api/message',
        SCHEDULE: '/api/schedule',
        TOGGLE_TTS: '/api/toggle_tts',
        TOGGLE_AUTOCHAT: '/api/toggle_autochat',
        SET_CHAT_MODE: '/api/set_chat_mode',
        USER_SETTINGS: '/api/user_settings'
    }
};

// Функция для проверки окружения
function isLocalhost() {
    return window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
}

// Функция для создания полного URL
function getApiUrl(endpoint) {
    // В продакшене используем относительные пути
    if (!isLocalhost()) {
        return endpoint;
    }
    return `${API_CONFIG.BASE_URL}${endpoint}`;
}

// Функция для проверки Telegram WebApp
function initTelegramWebApp() {
    if (!window.Telegram || !window.Telegram.WebApp) {
        console.error('Telegram WebApp is not available');
        document.body.innerHTML = '<div class="error">Это приложение можно открыть только в Telegram.</div>';
        return false;
    }
    return true;
}

// Функция для добавления заголовков безопасности
function getHeaders() {
    const headers = {
        'Content-Type': 'application/json',
    };
    
    // Добавляем данные инициализации Telegram только если они доступны
    if (tg.initData) {
        headers['X-Telegram-Init-Data'] = tg.initData;
    }
    
    return headers;
}

// Инициализация приложения
let tg = window.Telegram.WebApp;
if (!initTelegramWebApp()) {
    throw new Error('Telegram WebApp initialization failed');
}
tg.expand();

// Инициализация переменных состояния
let ttsEnabled = false;
let autoChatEnabled = false;
let isOnline = false;
let currentMode = 'default';

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
const statusIndicator = document.querySelector('.status-indicator');

// Функция для отображения сообщений
function addMessage(text, type = 'bot') {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${type}`;
    
    const messageContent = document.createElement('div');
    messageContent.className = 'message-content';
    messageContent.textContent = text;
    messageDiv.appendChild(messageContent);
    
    const timestamp = document.createElement('div');
    timestamp.className = 'message-time';
    timestamp.textContent = new Date().toLocaleTimeString();
    messageDiv.appendChild(timestamp);
    
    messages.appendChild(messageDiv);
    messages.scrollTop = messages.scrollHeight;
}

// Функция для отправки сообщения через Telegram WebApp
async function sendMessage() {
    const text = messageInput.value.trim();
    if (!text) return;

    // Добавляем сообщение пользователя в чат
    addMessage(text, 'user');
    messageInput.value = '';

    try {
        // Используем Telegram WebApp для отправки данных в бот
        tg.sendData(JSON.stringify({
            action: 'message',
            data: {
                text: text,
                tts_enabled: ttsEnabled
            }
        }));

        // В режиме разработки можно тестировать локально
        if (window.location.hostname === 'localhost') {
            addMessage('Тестовый ответ от бота');
        }
    } catch (error) {
        console.error('Error:', error);
        addMessage('Ошибка при отправке сообщения', 'system');
    }
}

// Функция для сохранения расписания
async function saveSchedule() {
    const scheduleText = scheduleInput.value.trim();
    
    if (!scheduleText) {
        addMessage('Пожалуйста, введите расписание', 'system');
        return;
    }

    try {
        // Отправляем расписание через Telegram WebApp
        tg.sendData(JSON.stringify({
            action: 'schedule',
            data: {
                schedule: scheduleText
            }
        }));

        addMessage('Расписание отправлено', 'system');
        scheduleModal.style.display = 'none';
    } catch (error) {
        console.error('Error:', error);
        addMessage('Ошибка при сохранении расписания', 'system');
    }
}

// Функция для переключения TTS
function toggleTTS() {
    ttsEnabled = ttsToggle.checked;
    
    try {
        // Отправляем настройку через Telegram WebApp
        tg.sendData(JSON.stringify({
            action: 'settings',
            data: {
                type: 'tts',
                enabled: ttsEnabled
            }
        }));
    } catch (error) {
        console.error('Error:', error);
        ttsToggle.checked = !ttsToggle.checked; // Возвращаем переключатель в предыдущее состояние
        addMessage('Ошибка при изменении настроек', 'system');
    }
}

// Функция для переключения автоматического чата
function toggleAutoChat() {
    autoChatEnabled = autoChatToggle.checked;
    
    try {
        // Отправляем настройку через Telegram WebApp
        tg.sendData(JSON.stringify({
            action: 'settings',
            data: {
                type: 'autochat',
                enabled: autoChatEnabled
            }
        }));
    } catch (error) {
        console.error('Error:', error);
        autoChatToggle.checked = !autoChatToggle.checked;
        addMessage('Ошибка при изменении настроек', 'system');
    }
}

// Обработчики событий для кнопок
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

ttsToggle.addEventListener('change', toggleTTS);
autoChatToggle.addEventListener('change', toggleAutoChat);

// Закрытие модальных окон при клике вне их
window.addEventListener('click', (e) => {
    if (e.target === scheduleModal) {
        scheduleModal.style.display = 'none';
    }
    if (e.target === settingsModal) {
        settingsModal.style.display = 'none';
    }
});

// Обработка событий от основного приложения Telegram
tg.onEvent('mainButtonClicked', function(){
    tg.sendData('main_button_clicked');
});

// Настройка главной кнопки
if (tg.MainButton) {
    tg.MainButton.setText('Отправить сообщение');
    tg.MainButton.show();
}

// Инициализация при загрузке страницы
document.addEventListener('DOMContentLoaded', async () => {
    tg.ready();
    
    // Загружаем настройки пользователя
    try {
        const response = await fetch(getApiUrl(API_CONFIG.ENDPOINTS.USER_SETTINGS), {
            headers: getHeaders(),
        });
        
        const settings = await response.json();
        ttsEnabled = settings.tts_enabled;
        autoChatEnabled = settings.autochat_enabled;
        
        ttsToggle.checked = ttsEnabled;
        autoChatToggle.checked = autoChatEnabled;
        
        // Устанавливаем статус подключения
        isOnline = true;
        statusIndicator.classList.add('online');
        
        addMessage('Соединение установлено', 'system');
    } catch (error) {
        console.error('Error loading settings:', error);
        addMessage('Ошибка при загрузке настроек', 'system');
    }
});
