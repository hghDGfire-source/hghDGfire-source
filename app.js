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
    },
    schedule: [],
    textMode: 'search'
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
async function clearChatHistory() {
    const confirmed = await webApp.showConfirm("Вы уверены, что хотите очистить историю чата?");
    if (confirmed) {
        const transaction = db.transaction(["chatHistory"], "readwrite");
        const store = transaction.objectStore("chatHistory");
        await store.clear();

        // Очищаем UI
        const chatContainer = document.querySelector('.chat-messages');
        chatContainer.innerHTML = '';
        state.chatHistory = [];

        // Показываем уведомление
        webApp.showPopup({
            title: "Готово",
            message: "История чата очищена",
            buttons: [{type: "ok"}]
        });
    }
};

// Обработка команд
function handleCommand(command) {
    const commands = {
        '/help': () => navigateToPage('docs'),
        '/clear': clearChatHistory,
        '/settings': () => navigateToPage('settings'),
        '/facts': () => toggleFeature('facts_enabled'),
        '/thoughts': () => toggleFeature('thoughts_enabled'),
        '/tts': () => toggleFeature('tts_enabled'),
        '/autochat': () => toggleFeature('auto_chat_enabled'),
        '/time': () => {
            const now = new Date();
            addMessageToUI(`Текущее время: ${now.toLocaleTimeString()}`, 'bot');
        }
    };

    const cmd = command.split(' ')[0].toLowerCase();
    if (commands[cmd]) {
        commands[cmd]();
        return true;
    }
    return false;
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
async function streamMessage(text, type = 'bot') {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${type} streaming`;

    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';

    // Добавляем индикатор набора текста
    const typingIndicator = document.createElement('div');
    typingIndicator.className = 'typing-indicator';
    for (let i = 0; i < 3; i++) {
        const dot = document.createElement('div');
        dot.className = 'typing-dot';
        typingIndicator.appendChild(dot);
    }
    contentDiv.appendChild(typingIndicator);

    messageDiv.appendChild(contentDiv);
    addMessageMeta(messageDiv, type);

    const chatContainer = document.querySelector('.chat-messages');
    chatContainer.appendChild(messageDiv);
    chatContainer.scrollTop = chatContainer.scrollHeight;

    // Имитация потокового вывода
    let currentText = '';
    const words = text.split(' ');

    for (const word of words) {
        currentText += word + ' ';
        contentDiv.textContent = currentText;
        await new Promise(resolve => setTimeout(resolve, 50));
    }

    messageDiv.classList.remove('streaming');

    // Сохраняем в историю
    const messageData = {
        text,
        type,
        timestamp: new Date().toISOString()
    };

    const transaction = db.transaction(["chatHistory"], "readwrite");
    const store = transaction.objectStore("chatHistory");
    await store.add(messageData);

    state.chatHistory.push(messageData);
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
};

// Функция переключения функций
function toggleFeature(feature) {
    state.userSettings[feature] = !state.userSettings[feature];
    saveSettings();

    const status = state.userSettings[feature] ? 'включена' : 'выключена';
    const features = {
        'facts_enabled': 'Поиск фактов',
        'thoughts_enabled': 'Генерация мыслей',
        'tts_enabled': 'Озвучка',
        'auto_chat_enabled': 'Автоматический чат'
    };

    addMessageToUI(`${features[feature]} ${status}`, 'bot');
};

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

    try {
        // Отправляем сообщение на бэкенд
        const response = await fetch('/api/message', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                message: message,
                chat_id: webApp.initDataUnsafe.user.id,
                tts_enabled: state.userSettings.tts_enabled
            })
        });

        const data = await response.json();

        // Обрабатываем ответ от бэкенда
        if (data.error) {
            throw new Error(data.error);
        }

        // Добавляем ответ бота в чат
        if (data.response) {
            addMessageToUI(data.response, 'bot');

            // Если есть аудио и включен TTS
            if (data.audio_url && state.userSettings.tts_enabled) {
                await speak(data.audio_url);
            }
        }

        // Синхронизируем с Telegram WebApp
        webApp.sendData(JSON.stringify({
            type: 'message',
            text: message,
            response: data.response,
            topic: state.currentTopic
        }));
    } catch (error) {
        console.error('Error:', error);
        addMessageToUI('Извините, произошла ошибка при отправке сообщения', 'error');
    }
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
    // Скрываем все страницы
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    
    // Убираем активный класс у всех пунктов навигации
    document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
    
    // Активируем нужную страницу и пункт навигации
    document.getElementById(`${page}Page`).classList.add('active');
    document.querySelector(`.nav-item[data-page="${page}"]`).classList.add('active');
    
    // Дополнительные действия для разных страниц
    switch (page) {
        case 'chat':
            // Прокручиваем чат к последнему сообщению
            const chatContainer = document.querySelector('.chat-messages');
            if (chatContainer) {
                chatContainer.scrollTop = chatContainer.scrollHeight;
            }
            break;
            
        case 'schedule':
            // Обновляем расписание
            loadSchedule();
            break;
            
        case 'text':
            // Очищаем результаты при переходе на страницу текста
            showEmptyState();
            break;
            
        case 'settings':
            // Загружаем настройки
            loadSettings();
            break;
    }
    
    // Закрываем сайдбар при навигации на мобильных устройствах
    const sidebar = document.querySelector('.chat-sidebar');
    if (sidebar && sidebar.classList.contains('open')) {
        sidebar.classList.remove('open');
    }
}

// Функции для работы с расписанием
let scheduleState = {
    items: [],
    currentFilter: 'all'
};

function initSchedulePage() {
    const addButton = document.getElementById('addScheduleButton');
    const modal = document.getElementById('scheduleModal');
    const closeButton = modal.querySelector('.close-button');
    const cancelButton = modal.querySelector('.cancel-button');
    const form = document.getElementById('scheduleForm');
    const dayFilter = document.getElementById('dayFilter');

    // Обработчики событий
    addButton.addEventListener('click', () => {
        modal.classList.add('active');
    });

    closeButton.addEventListener('click', () => {
        modal.classList.remove('active');
    });

    cancelButton.addEventListener('click', () => {
        modal.classList.remove('active');
    });

    dayFilter.addEventListener('change', (e) => {
        scheduleState.currentFilter = e.target.value;
        renderScheduleTable();
    });

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(form);
        const timeArr = formData.get('time').split(':');
        
        const scheduleData = {
            day_of_week: parseInt(formData.get('dayOfWeek')),
            hour: parseInt(timeArr[0]),
            minute: parseInt(timeArr[1]),
            task: formData.get('task')
        };

        try {
            const response = await fetch('/api/schedule/add', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(scheduleData)
            });

            const result = await response.json();
            if (result.success) {
                await loadSchedule();
                modal.classList.remove('active');
                form.reset();
                webApp.showPopup({
                    title: 'Успех',
                    message: 'Задача добавлена в расписание',
                    buttons: [{type: 'ok'}]
                });
            } else {
                throw new Error(result.message);
            }
        } catch (error) {
            webApp.showPopup({
                title: 'Ошибка',
                message: error.message,
                buttons: [{type: 'ok'}]
            });
        }
    });

    // Загружаем расписание при инициализации
    loadSchedule();
}

async function loadSchedule() {
    try {
        const response = await fetch('/api/schedule/get');
        const data = await response.json();
        if (data.success) {
            scheduleState.items = data.schedule;
            renderScheduleTable();
        }
    } catch (error) {
        console.error('Ошибка загрузки расписания:', error);
    }
}

function renderScheduleTable() {
    const tbody = document.getElementById('scheduleTableBody');
    const days = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье'];
    
    // Фильтруем элементы
    let items = scheduleState.items;
    if (scheduleState.currentFilter !== 'all') {
        items = items.filter(item => item.day_of_week.toString() === scheduleState.currentFilter);
    }

    // Сортируем по дню недели и времени
    items.sort((a, b) => {
        if (a.day_of_week !== b.day_of_week) {
            return a.day_of_week - b.day_of_week;
        }
        if (a.hour !== b.hour) {
            return a.hour - b.hour;
        }
        return a.minute - b.minute;
    });

    // Очищаем таблицу
    tbody.innerHTML = '';

    // Добавляем строки
    items.forEach(item => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${days[item.day_of_week - 1]}</td>
            <td>${String(item.hour).padStart(2, '0')}:${String(item.minute).padStart(2, '0')}</td>
            <td>${item.task}</td>
            <td class="schedule-actions">
                <button onclick="deleteScheduleItem(${item.id})" title="Удалить">
                    <i class="material-icons">delete</i>
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });

    // Показываем сообщение, если нет элементов
    if (items.length === 0) {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td colspan="4" style="text-align: center; padding: 2rem;">
                Нет запланированных задач
            </td>
        `;
        tbody.appendChild(tr);
    }
}

async function deleteScheduleItem(id) {
    const confirmed = await webApp.showConfirm('Вы уверены, что хотите удалить эту задачу?');
    if (confirmed) {
        try {
            const response = await fetch(`/api/schedule/delete/${id}`, {
                method: 'DELETE'
            });
            const result = await response.json();
            if (result.success) {
                await loadSchedule();
                webApp.showPopup({
                    title: 'Успех',
                    message: 'Задача удалена из расписания',
                    buttons: [{type: 'ok'}]
                });
            } else {
                throw new Error(result.message);
            }
        } catch (error) {
            webApp.showPopup({
                title: 'Ошибка',
                message: error.message,
                buttons: [{type: 'ok'}]
            });
        }
    }
}

// Функции для работы с текстом
function initTextPage() {
    const modeSwitcher = document.querySelector('.mode-switcher');
    const modeButtons = document.querySelectorAll('.mode-button');
    const searchSection = document.getElementById('searchSection');
    const summarySection = document.getElementById('summarySection');
    const searchButton = document.getElementById('searchButton');
    const summarizeButton = document.getElementById('summarizeButton');
    const copyButton = document.getElementById('copyResults');
    const resultsContainer = document.getElementById('resultsContainer');

    // Переключение режимов
    modeButtons.forEach(button => {
        button.addEventListener('click', () => {
            const mode = button.dataset.mode;
            modeButtons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
            
            if (mode === 'search') {
                searchSection.classList.remove('hidden');
                summarySection.classList.add('hidden');
            } else {
                searchSection.classList.add('hidden');
                summarySection.classList.remove('hidden');
            }
            
            // Очищаем результаты при смене режима
            showEmptyState();
        });
    });

    // Поиск в тексте
    searchButton.addEventListener('click', async () => {
        const text = document.getElementById('textInput').value.trim();
        const query = document.getElementById('searchQuery').value.trim();
        
        if (!text || !query) {
            webApp.showPopup({
                title: 'Ошибка',
                message: 'Введите текст и поисковый запрос',
                buttons: [{type: 'ok'}]
            });
            return;
        }
        
        try {
            showLoading();
            const response = await fetch('/api/text/search', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ text, query })
            });
            
            const data = await response.json();
            if (data.success) {
                showSearchResults(data.results, query);
            } else {
                throw new Error(data.error);
            }
        } catch (error) {
            webApp.showPopup({
                title: 'Ошибка',
                message: error.message,
                buttons: [{type: 'ok'}]
            });
            showEmptyState();
        }
    });

    // Суммаризация текста
    summarizeButton.addEventListener('click', async () => {
        const text = document.getElementById('textInput').value.trim();
        
        if (!text) {
            webApp.showPopup({
                title: 'Ошибка',
                message: 'Введите текст для суммаризации',
                buttons: [{type: 'ok'}]
            });
            return;
        }
        
        try {
            showLoading();
            const response = await fetch('/api/text/summarize', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ text })
            });
            
            const data = await response.json();
            if (data.success) {
                showSummary(data.summary);
            } else {
                throw new Error(data.error);
            }
        } catch (error) {
            webApp.showPopup({
                title: 'Ошибка',
                message: error.message,
                buttons: [{type: 'ok'}]
            });
            showEmptyState();
        }
    });

    // Копирование результатов
    copyButton.addEventListener('click', () => {
        const textToCopy = resultsContainer.innerText;
        navigator.clipboard.writeText(textToCopy).then(() => {
            webApp.showPopup({
                title: 'Успех',
                message: 'Результаты скопированы в буфер обмена',
                buttons: [{type: 'ok'}]
            });
        }).catch(error => {
            webApp.showPopup({
                title: 'Ошибка',
                message: 'Не удалось скопировать текст',
                buttons: [{type: 'ok'}]
            });
        });
    });
}

function showSearchResults(results, query) {
    const resultsContainer = document.getElementById('resultsContainer');
    
    if (results.length === 0) {
        resultsContainer.innerHTML = `
            <div class="empty-state">
                <i class="material-icons">search_off</i>
                <p>По вашему запросу ничего не найдено</p>
            </div>
        `;
        return;
    }
    
    resultsContainer.innerHTML = results.map(result => `
        <div class="search-result">
            <div class="search-result-text">
                ${highlightText(result.paragraph, query)}
            </div>
            ${result.context ? `
                <div class="search-result-context">
                    <strong>Контекст:</strong><br>
                    ${result.context}
                </div>
            ` : ''}
        </div>
    `).join('');
}

function showSummary(summary) {
    const resultsContainer = document.getElementById('resultsContainer');
    resultsContainer.innerHTML = `
        <div class="summary-result">
            ${summary}
        </div>
    `;
}

function highlightText(text, query) {
    const regex = new RegExp(query, 'gi');
    return text.replace(regex, match => `<span class="highlight">${match}</span>`);
}

function showLoading() {
    const resultsContainer = document.getElementById('resultsContainer');
    resultsContainer.innerHTML = `
        <div class="empty-state">
            <div class="typing-indicator">
                <div class="typing-dot"></div>
                <div class="typing-dot"></div>
                <div class="typing-dot"></div>
            </div>
            <p>Обработка текста...</p>
        </div>
    `;
}

function showEmptyState() {
    const resultsContainer = document.getElementById('resultsContainer');
    resultsContainer.innerHTML = `
        <div class="empty-state">
            <i class="material-icons">description</i>
            <p>Введите текст и выберите режим работы</p>
        </div>
    `;
}

// Добавляем инициализацию страницы текста
document.addEventListener('DOMContentLoaded', () => {
    initTextPage();
});

// Обработчики событий
document.addEventListener('DOMContentLoaded', () => {
    // Инициализация страниц
    initSchedulePage();
    
    // Обработка навигации
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const page = item.dataset.page;
            navigateToPage(page);
        });
    });
    
    // Инициализация базы данных
    initDB();
    
    // Загрузка настроек
    loadSettings();
    
    // Применяем настройки
    applySettings();
    
    // Показываем приветственное сообщение
    setTimeout(() => {
        streamMessage("👋 Привет! Я Aris AI, ваш умный ассистент. Чем могу помочь?", 'bot');
    }, 500);
});