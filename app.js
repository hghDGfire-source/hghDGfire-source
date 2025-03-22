// Инициализация Telegram WebApp
const webApp = window.Telegram.WebApp;
webApp.expand();
webApp.enableClosingConfirmation();

// DOM элементы
const messageInput = document.getElementById('messageInput');
const sendButton = document.getElementById('sendButton');
const micButton = document.getElementById('micButton');
const chatContainer = document.getElementById('chatContainer');
const inputContainer = document.getElementById('inputContainer');
const navItems = document.querySelectorAll('.nav-item');
const themeToggle = document.getElementById('themeToggle');
const chatSidebar = document.getElementById('chatSidebar');
const menuButton = document.getElementById('menuButton');
const searchButton = document.getElementById('searchButton');
const topicItems = document.querySelectorAll('.topic-item');

// Состояние приложения
let isRecording = false;
let mediaRecorder = null;
let audioChunks = [];
let currentTheme = 'dark';
let currentTopic = 'general';
let isSidebarOpen = false;
let userSettings = {
    notifications: true,
    sound: true,
    voice: false,
    auto_start: false,
    theme: 'dark',
    facts_enabled: false,
    thoughts_enabled: false,
    auto_chat_enabled: false,
    tts_enabled: true
};

// Инициализация
document.addEventListener('DOMContentLoaded', () => {
    loadSettings();
    setupEventListeners();
    setupTheme();
    checkPermissions();
    
    // Показываем приветственное сообщение
    addMessage("👋 Привет! Я Aris AI, ваш умный ассистент. Чем могу помочь?", 'bot');
});

// Настройка обработчиков событий
function setupEventListeners() {
    // Навигация
    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            navigateToPage(item.dataset.page);
        });
    });

    // Отправка сообщения
    messageInput.addEventListener('keydown', handleMessageInput);
    sendButton.addEventListener('click', sendMessage);
    
    // Голосовые сообщения
    if (micButton) {
        micButton.addEventListener('click', toggleVoiceRecording);
    }
    
    // Настройки
    document.querySelectorAll('.toggle-switch input').forEach(toggle => {
        toggle.addEventListener('change', handleSettingChange);
    });
    
    // Оглавление чата
    menuButton.addEventListener('click', toggleSidebar);
    searchButton.addEventListener('click', handleSearch);
    
    topicItems.forEach(item => {
        item.addEventListener('click', () => {
            switchTopic(item);
        });
    });
    
    // Закрытие сайдбара при клике вне него на мобильных
    document.addEventListener('click', (e) => {
        if (isSidebarOpen && 
            !chatSidebar.contains(e.target) && 
            !menuButton.contains(e.target)) {
            toggleSidebar();
        }
    });
}

// Управление сайдбаром
function toggleSidebar() {
    isSidebarOpen = !isSidebarOpen;
    chatSidebar.classList.toggle('open', isSidebarOpen);
}

// Переключение темы чата
function switchTopic(topicElement) {
    const prevTopic = document.querySelector('.topic-item.active');
    if (prevTopic) {
        prevTopic.classList.remove('active');
    }
    
    topicElement.classList.add('active');
    currentTopic = topicElement.dataset.topic;
    
    // Сохраняем выбранную тему в настройках
    userSettings.currentTopic = currentTopic;
    saveSettings();
    
    // Уведомляем бота о смене темы
    webApp.sendData(JSON.stringify({
        type: 'topic_change',
        topic: currentTopic
    }));
}

// Поиск по чату
function handleSearch() {
    const searchTerm = prompt('Введите текст для поиска:');
    if (searchTerm) {
        webApp.sendData(JSON.stringify({
            type: 'search',
            query: searchTerm
        }));
    }
}

// Обработка ввода сообщения
async function handleMessageInput(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        await sendMessage();
    }
    
    // Автоматическое изменение высоты
    this.style.height = 'auto';
    this.style.height = this.scrollHeight + 'px';
}

// Отправка сообщения
async function sendMessage() {
    const message = messageInput.value.trim();
    if (!message) return;
    
    // Добавляем сообщение в чат
    addMessage(message, 'user');
    messageInput.value = '';
    messageInput.style.height = 'auto';
    
    // Отправляем в Telegram WebApp
    webApp.sendData(JSON.stringify({
        type: 'message',
        text: message,
        topic: currentTopic
    }));
}

// Добавление сообщения в чат
function addMessage(text, type = 'bot', options = {}) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${type}`;
    
    const content = document.createElement('div');
    content.className = 'message-content';
    content.textContent = text;
    
    const time = document.createElement('div');
    time.className = 'message-time';
    time.textContent = new Date().toLocaleTimeString();
    
    const status = document.createElement('div');
    status.className = 'message-status';
    if (type === 'user') {
        const icon = document.createElement('i');
        icon.className = 'material-icons';
        icon.textContent = options.sent ? 'done_all' : 'done';
        status.appendChild(icon);
    }
    
    messageDiv.appendChild(content);
    messageDiv.appendChild(time);
    if (type === 'user') messageDiv.appendChild(status);
    
    chatContainer.appendChild(messageDiv);
    chatContainer.scrollTop = chatContainer.scrollHeight;
    
    // Звуковое уведомление
    if (userSettings.sound && type === 'bot') {
        playNotificationSound();
    }
}

// Сохранение настроек
function saveSettings() {
    localStorage.setItem('userSettings', JSON.stringify(userSettings));
}

// Загрузка настроек
function loadSettings() {
    const savedSettings = localStorage.getItem('userSettings');
    if (savedSettings) {
        userSettings = { ...userSettings, ...JSON.parse(savedSettings) };
        applySettings();
    }
}

// Применение настроек
function applySettings() {
    // Применяем тему
    document.documentElement.setAttribute('data-theme', userSettings.theme);
    
    // Применяем другие настройки
    Object.entries(userSettings).forEach(([key, value]) => {
        const toggle = document.querySelector(`input[data-setting="${key}"]`);
        if (toggle) toggle.checked = value;
    });
    
    // Восстанавливаем выбранную тему чата
    if (userSettings.currentTopic) {
        const topicElement = document.querySelector(`[data-topic="${userSettings.currentTopic}"]`);
        if (topicElement) {
            switchTopic(topicElement);
        }
    }
}

// Обработка изменения настроек
function handleSettingChange(e) {
    const setting = e.target.dataset.setting;
    const value = e.target.checked;
    
    userSettings[setting] = value;
    saveSettings();
    
    // Отправляем настройки в Telegram WebApp
    webApp.sendData(JSON.stringify({
        type: 'settings',
        settings: userSettings
    }));
    
    // Применяем изменения
    if (setting === 'theme') {
        document.documentElement.setAttribute('data-theme', value ? 'light' : 'dark');
    }
}

// Запись голосового сообщения
async function toggleVoiceRecording() {
    if (!isRecording) {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaRecorder = new MediaRecorder(stream);
            audioChunks = [];
            
            mediaRecorder.addEventListener('dataavailable', e => {
                audioChunks.push(e.data);
            });
            
            mediaRecorder.addEventListener('stop', () => {
                const audioBlob = new Blob(audioChunks, { type: 'audio/ogg' });
                sendVoiceMessage(audioBlob);
            });
            
            mediaRecorder.start();
            isRecording = true;
            micButton.classList.add('recording');
            
        } catch (error) {
            console.error('Error accessing microphone:', error);
            showError('Не удалось получить доступ к микрофону');
        }
    } else {
        mediaRecorder.stop();
        isRecording = false;
        micButton.classList.remove('recording');
    }
}

// Отправка голосового сообщения
async function sendVoiceMessage(blob) {
    try {
        const reader = new FileReader();
        reader.onloadend = () => {
            const base64Audio = reader.result.split(',')[1];
            webApp.sendData(JSON.stringify({
                type: 'voice',
                audio: base64Audio,
                topic: currentTopic
            }));
        };
        reader.readAsDataURL(blob);
    } catch (error) {
        console.error('Error sending voice message:', error);
        showError('Не удалось отправить голосовое сообщение');
    }
}

// Проверка разрешений
async function checkPermissions() {
    if (userSettings.voice) {
        try {
            await navigator.mediaDevices.getUserMedia({ audio: true });
        } catch (error) {
            userSettings.voice = false;
            saveSettings();
            const toggle = document.querySelector('input[data-setting="voice"]');
            if (toggle) toggle.checked = false;
        }
    }
}

// Воспроизведение звука уведомления
function playNotificationSound() {
    if (!userSettings.sound) return;
    
    const audio = new Audio('static/webapp/sounds/notification.mp3');
    audio.volume = 0.5;
    audio.play().catch(() => {});
}

// Показ ошибки
function showError(message) {
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-message';
    errorDiv.textContent = message;
    
    document.body.appendChild(errorDiv);
    setTimeout(() => errorDiv.remove(), 3000);
}

// Навигация между страницами
function navigateToPage(page) {
    const pages = {
        chat: document.getElementById('chatPage'),
        settings: document.getElementById('settingsPage')
    };
    
    // Показываем нужную страницу
    Object.entries(pages).forEach(([key, element]) => {
        if (key === page) {
            element.style.display = 'block';
        } else {
            element.style.display = 'none';
        }
    });
    
    // Показываем/скрываем поле ввода
    inputContainer.style.display = page === 'chat' ? 'flex' : 'none';
    
    // Обновляем активную кнопку
    navItems.forEach(item => {
        if (item.dataset.page === page) {
            item.classList.add('active');
        } else {
            item.classList.remove('active');
        }
    });
    
    // Прокручиваем чат вниз при переходе
    if (page === 'chat') {
        chatContainer.scrollTop = chatContainer.scrollHeight;
    }
}
