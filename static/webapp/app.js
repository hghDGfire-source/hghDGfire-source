// Состояние приложения
let state = {
    isRecording: false,
    mediaRecorder: null,
    audioChunks: [],
    currentTheme: 'dark',
    currentTopic: 'general',
    isSidebarOpen: false,
    isStreaming: false,
    chatHistory: [],
    userSettings: {
        notifications: true,
        sound: true,
        voice: false,
        auto_start: false,
        theme: 'dark',
        facts_enabled: false,
        thoughts_enabled: false,
        auto_chat_enabled: false,
        tts_enabled: true,
        voice_gender: 'male',
        voice_rate: 1,
        voice_pitch: 1
    }
};

// Инициализация IndexedDB
let db;
const dbName = "arisAIDB";
const dbVersion = 1;

const initDB = () => {
    const request = indexedDB.open(dbName, dbVersion);
    
    request.onerror = (event) => {
        console.error("Error opening DB", event);
    };
    
    request.onupgradeneeded = (event) => {
        db = event.target.result;
        if (!db.objectStoreNames.contains("chatHistory")) {
            db.createObjectStore("chatHistory", { keyPath: "id", autoIncrement: true });
        }
    };
    
    request.onsuccess = (event) => {
        db = event.target.result;
        loadChatHistory();
    };
};

// Сохранение сообщения в историю
const saveToChatHistory = (message) => {
    const transaction = db.transaction(["chatHistory"], "readwrite");
    const store = transaction.objectStore("chatHistory");
    store.add(message);
};

// Загрузка истории чата
const loadChatHistory = () => {
    const transaction = db.transaction(["chatHistory"], "readonly");
    const store = transaction.objectStore("chatHistory");
    const request = store.getAll();
    
    request.onsuccess = () => {
        state.chatHistory = request.result;
        state.chatHistory.forEach(msg => {
            addMessageToUI(msg.text, msg.type, msg.options);
        });
    };
};

// Очистка истории чата
const clearChatHistory = () => {
    const transaction = db.transaction(["chatHistory"], "readwrite");
    const store = transaction.objectStore("chatHistory");
    store.clear();
    
    chatContainer.innerHTML = '';
    state.chatHistory = [];
};

// Обработка команд
const handleCommand = (command) => {
    switch(command) {
        case '/clear':
            clearChatHistory();
            addMessageToUI('История чата очищена', 'bot');
            break;
            
        case '/theme':
            toggleTheme();
            break;
            
        case '/voice':
            toggleVoice();
            break;
            
        case '/help':
            showHelp();
            break;
            
        // Добавьте другие команды здесь
        
        default:
            if (command.startsWith('/')) {
                addMessageToUI('Неизвестная команда. Используйте /help для списка команд', 'bot');
            }
    }
};

// TTS с мужским голосом
const speak = (text) => {
    if (!state.userSettings.tts_enabled) return;
    
    const utterance = new SpeechSynthesisUtterance(text);
    
    // Найти мужской голос
    const voices = speechSynthesis.getVoices();
    const maleVoice = voices.find(voice => 
        voice.lang.startsWith('ru') && voice.name.toLowerCase().includes('male')
    ) || voices.find(voice => 
        voice.lang.startsWith('ru')
    );
    
    if (maleVoice) {
        utterance.voice = maleVoice;
    }
    
    utterance.rate = state.userSettings.voice_rate;
    utterance.pitch = state.userSettings.voice_pitch;
    
    speechSynthesis.speak(utterance);
};

// Потоковый вывод сообщения
const streamMessage = (text, type = 'bot') => {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${type} streaming`;
    
    const content = document.createElement('div');
    content.className = 'message-content';
    messageDiv.appendChild(content);
    
    chatContainer.appendChild(messageDiv);
    chatContainer.scrollTop = chatContainer.scrollHeight;
    
    let index = 0;
    state.isStreaming = true;
    
    const stream = () => {
        if (index < text.length && state.isStreaming) {
            content.textContent += text[index];
            index++;
            chatContainer.scrollTop = chatContainer.scrollHeight;
            setTimeout(stream, 30);
        } else {
            messageDiv.classList.remove('streaming');
            state.isStreaming = false;
            
            // Добавляем метаданные сообщения
            addMessageMeta(messageDiv, type);
            
            // Сохраняем в историю
            saveToChatHistory({
                text,
                type,
                options: { timestamp: new Date() }
            });
            
            // Озвучиваем сообщение бота
            if (type === 'bot') {
                speak(text);
            }
        }
    };
    
    stream();
};

// Добавление метаданных к сообщению
const addMessageMeta = (messageDiv, type) => {
    const meta = document.createElement('div');
    meta.className = 'message-meta';
    
    const time = document.createElement('span');
    time.className = 'message-time';
    time.textContent = new Date().toLocaleTimeString();
    meta.appendChild(time);
    
    if (type === 'user') {
        const status = document.createElement('span');
        status.className = 'message-status';
        const icon = document.createElement('i');
        icon.className = 'material-icons';
        icon.textContent = 'done';
        status.appendChild(icon);
        meta.appendChild(status);
    }
    
    messageDiv.appendChild(meta);
};

// Добавление сообщения в чат
function addMessageToUI(text, type = 'bot', options = {}) {
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
    if (state.userSettings.sound && type === 'bot') {
        playNotificationSound();
    }
}

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
        if (state.isSidebarOpen && 
            !chatSidebar.contains(e.target) && 
            !menuButton.contains(e.target)) {
            toggleSidebar();
        }
    });
}

// Управление сайдбаром
function toggleSidebar() {
    state.isSidebarOpen = !state.isSidebarOpen;
    chatSidebar.classList.toggle('open', state.isSidebarOpen);
}

// Переключение темы чата
function switchTopic(topicElement) {
    const prevTopic = document.querySelector('.topic-item.active');
    if (prevTopic) {
        prevTopic.classList.remove('active');
    }
    
    topicElement.classList.add('active');
    state.currentTopic = topicElement.dataset.topic;
    
    // Сохраняем выбранную тему в настройках
    state.userSettings.currentTopic = state.currentTopic;
    saveSettings();
    
    // Уведомляем бота о смене темы
    webApp.sendData(JSON.stringify({
        type: 'topic_change',
        topic: state.currentTopic
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
    addMessageToUI(message, 'user');
    messageInput.value = '';
    messageInput.style.height = 'auto';
    
    // Отправляем в Telegram WebApp
    webApp.sendData(JSON.stringify({
        type: 'message',
        text: message,
        topic: state.currentTopic
    }));
}

// Сохранение настроек
function saveSettings() {
    localStorage.setItem('userSettings', JSON.stringify(state.userSettings));
}

// Загрузка настроек
function loadSettings() {
    const savedSettings = localStorage.getItem('userSettings');
    if (savedSettings) {
        state.userSettings = { ...state.userSettings, ...JSON.parse(savedSettings) };
        applySettings();
    }
}

// Применение настроек
function applySettings() {
    // Применяем тему
    document.documentElement.setAttribute('data-theme', state.userSettings.theme);
    
    // Применяем другие настройки
    Object.entries(state.userSettings).forEach(([key, value]) => {
        const toggle = document.querySelector(`input[data-setting="${key}"]`);
        if (toggle) toggle.checked = value;
    });
    
    // Восстанавливаем выбранную тему чата
    if (state.userSettings.currentTopic) {
        const topicElement = document.querySelector(`[data-topic="${state.userSettings.currentTopic}"]`);
        if (topicElement) {
            switchTopic(topicElement);
        }
    }
}

// Обработка изменения настроек
function handleSettingChange(e) {
    const setting = e.target.dataset.setting;
    const value = e.target.checked;
    
    state.userSettings[setting] = value;
    saveSettings();
    
    // Отправляем настройки в Telegram WebApp
    webApp.sendData(JSON.stringify({
        type: 'settings',
        settings: state.userSettings
    }));
    
    // Применяем изменения
    if (setting === 'theme') {
        document.documentElement.setAttribute('data-theme', value ? 'light' : 'dark');
    }
}

// Запись голосового сообщения
async function toggleVoiceRecording() {
    if (!state.isRecording) {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            state.mediaRecorder = new MediaRecorder(stream);
            state.audioChunks = [];
            
            state.mediaRecorder.addEventListener('dataavailable', e => {
                state.audioChunks.push(e.data);
            });
            
            state.mediaRecorder.addEventListener('stop', () => {
                const audioBlob = new Blob(state.audioChunks, { type: 'audio/ogg' });
                sendVoiceMessage(audioBlob);
            });
            
            state.mediaRecorder.start();
            state.isRecording = true;
            micButton.classList.add('recording');
            
        } catch (error) {
            console.error('Error accessing microphone:', error);
            showError('Не удалось получить доступ к микрофону');
        }
    } else {
        state.mediaRecorder.stop();
        state.isRecording = false;
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
                topic: state.currentTopic
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
    if (state.userSettings.voice) {
        try {
            await navigator.mediaDevices.getUserMedia({ audio: true });
        } catch (error) {
            state.userSettings.voice = false;
            saveSettings();
            const toggle = document.querySelector('input[data-setting="voice"]');
            if (toggle) toggle.checked = false;
        }
    }
}

// Воспроизведение звука уведомления
function playNotificationSound() {
    if (!state.userSettings.sound) return;
    
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
        if (element) {
            if (key === page) {
                element.classList.add('active');
            } else {
                element.classList.remove('active');
            }
        }
    });
    
    // Показываем/скрываем поле ввода
    if (inputContainer) {
        inputContainer.style.display = page === 'chat' ? 'flex' : 'none';
    }
    
    // Обновляем активную кнопку
    navItems.forEach(item => {
        if (item.dataset.page === page) {
            item.classList.add('active');
        } else {
            item.classList.remove('active');
        }
    });
    
    // Прокручиваем чат вниз при переходе
    if (page === 'chat' && chatContainer) {
        chatContainer.scrollTop = chatContainer.scrollHeight;
    }
}

// Инициализация
document.addEventListener('DOMContentLoaded', () => {
    initDB();
    loadSettings();
    setupEventListeners();
    setupTheme();
    checkPermissions();
    
    // Инициализация TTS
    speechSynthesis.onvoiceschanged = () => {
        const voices = speechSynthesis.getVoices();
        console.log('Available voices:', voices);
    };
    
    // Показываем приветственное сообщение
    streamMessage("👋 Привет! Я Aris AI, ваш умный ассистент. Чем могу помочь?", 'bot');
});
