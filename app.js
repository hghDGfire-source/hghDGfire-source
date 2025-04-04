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

// Состояние для страницы работы с текстом
const textState = {
    initialized: false,
    mode: 'search',
    currentText: '',
    searchQuery: '',
    results: [],
    isProcessing: false
};

// Состояние для страницы расписания
const scheduleState = {
    initialized: false,
    items: [],
    currentFilter: 'all'
};

// Инициализация IndexedDB
let db;
const dbName = "arisAIDB";
const dbVersion = 1;

const initDB = () => {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(dbName, dbVersion);

        request.onerror = (event) => {
            console.error("Error opening DB", event);
            reject(event);
        };

        request.onupgradeneeded = (event) => {
            console.log("Upgrading database...");
            db = event.target.result;

            // Создаем хранилища, если их нет
            if (!db.objectStoreNames.contains("chatHistory")) {
                db.createObjectStore("chatHistory", { keyPath: "id", autoIncrement: true });
                console.log("Created chatHistory store");
            }
            if (!db.objectStoreNames.contains("schedule")) {
                db.createObjectStore("schedule", { keyPath: "id" });
                console.log("Created schedule store");
            }
        };

        request.onsuccess = (event) => {
            console.log("Database opened successfully");
            db = event.target.result;
            resolve(db);
        };
    });
};

// Функция навигации между страницами
function navigateToPage(page) {
    console.log('Navigating to:', page);
    
    // Получаем все страницы и кнопки навигации
    const pages = document.querySelectorAll('.page');
    const navButtons = document.querySelectorAll('.nav-item');
    
    // Скрываем все страницы и деактивируем все кнопки
    pages.forEach(p => p.classList.remove('active'));
    navButtons.forEach(btn => btn.classList.remove('active'));
    
    // Показываем выбранную страницу
    const selectedPage = document.getElementById(`${page}Page`);
    if (selectedPage) {
        selectedPage.classList.add('active');
        console.log('Activated page:', page);
    } else {
        console.error('Page not found:', page);
    }
    
    // Активируем соответствующую кнопку навигации
    const activeButton = document.querySelector(`.nav-item[data-page="${page}"]`);
    if (activeButton) {
        activeButton.classList.add('active');
        console.log('Activated button:', page);
    } else {
        console.error('Navigation button not found:', page);
    }

    // Инициализация страниц при первом открытии
    if (page === 'schedule' && !scheduleState.initialized) {
        console.log('Initializing schedule page');
        initSchedulePage();
    } else if (page === 'text' && !textState.initialized) {
        console.log('Initializing text page');
        initTextPage();
    }
}

// Инициализация страницы работы с текстом
function initTextPage() {
    if (textState.initialized) return;
    
    const textInput = document.getElementById('textInput');
    const searchQuery = document.getElementById('searchQuery');
    const searchButton = document.getElementById('searchButton');
    const summarizeButton = document.getElementById('summarizeButton');
    const modeButtons = document.querySelectorAll('.mode-button');
    const copyButton = document.getElementById('copyResults');
    
    // Переключение режимов
    modeButtons.forEach(button => {
        button.addEventListener('click', () => {
            const mode = button.dataset.mode;
            textState.mode = mode;
            
            modeButtons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
            
            document.getElementById('searchSection').classList.toggle('hidden', mode !== 'search');
            document.getElementById('summarySection').classList.toggle('hidden', mode !== 'summary');
            
            showEmptyState();
        });
    });
    
    // Обработка ввода текста
    textInput.addEventListener('input', (e) => {
        textState.currentText = e.target.value;
        const charCount = e.target.value.length;
        const charCounter = document.querySelector('.char-counter');
        charCounter.textContent = `${charCount}/10000`;
        
        if (charCount > 10000) {
            e.target.value = e.target.value.slice(0, 10000);
            textState.currentText = e.target.value;
            showError('Превышен лимит в 10000 символов');
        }
    });
    
    // Поиск в тексте
    searchButton.addEventListener('click', async () => {
        if (!textState.currentText) {
            showError('Введите текст для поиска');
            return;
        }
        
        if (!searchQuery.value) {
            showError('Введите поисковый запрос');
            return;
        }
        
        textState.searchQuery = searchQuery.value;
        textState.isProcessing = true;
        showLoading();
        
        try {
            const results = await searchInText(textState.currentText, textState.searchQuery);
            showSearchResults(results);
        } catch (error) {
            showError('Ошибка при поиске: ' + error.message);
        } finally {
            textState.isProcessing = false;
        }
    });
    
    // Суммаризация текста
    summarizeButton.addEventListener('click', async () => {
        if (!textState.currentText) {
            showError('Введите текст для суммаризации');
            return;
        }
        
        textState.isProcessing = true;
        showLoading();
        
        try {
            const summary = await summarizeText(textState.currentText);
            showSummary(summary);
        } catch (error) {
            showError('Ошибка при суммаризации: ' + error.message);
        } finally {
            textState.isProcessing = false;
        }
    });
    
    // Копирование результатов
    copyButton.addEventListener('click', () => {
        const resultsContainer = document.getElementById('resultsContainer');
        const textToCopy = resultsContainer.innerText;
        
        navigator.clipboard.writeText(textToCopy).then(() => {
            copyButton.innerHTML = '<i class="material-icons">check</i> Скопировано';
            setTimeout(() => {
                copyButton.innerHTML = '<i class="material-icons">content_copy</i> Копировать';
            }, 2000);
        }).catch(err => {
            showError('Ошибка при копировании: ' + err.message);
        });
    });
    
    textState.initialized = true;
}

// Функции для работы с текстом
async function searchInText(text, query) {
    const sentences = text.split(/[.!?]+/).filter(s => s.trim());
    const results = [];
    
    for (let i = 0; i < sentences.length; i++) {
        const sentence = sentences[i].trim();
        if (sentence.toLowerCase().includes(query.toLowerCase())) {
            results.push({
                context: i > 0 ? sentences[i-1] : '',
                sentence: sentence,
                nextContext: i < sentences.length - 1 ? sentences[i+1] : ''
            });
        }
    }
    
    return results;
}

async function summarizeText(text) {
    // Здесь должен быть вызов API для суммаризации
    // Пока возвращаем первое и последнее предложение
    const sentences = text.split(/[.!?]+/).filter(s => s.trim());
    if (sentences.length <= 2) return text;
    
    return `${sentences[0]}. ... ${sentences[sentences.length-1]}.`;
}

// Инициализация страницы расписания
function initSchedulePage() {
    if (scheduleState.initialized) return;
    
    const addButton = document.getElementById('addScheduleButton');
    const modal = document.getElementById('scheduleModal');
    const closeButton = modal.querySelector('.close-button');
    const cancelButton = document.getElementById('cancelSchedule');
    const saveButton = document.getElementById('saveSchedule');
    const filterButtons = document.querySelectorAll('.filter-button');
    
    // Загрузка расписания
    loadSchedule();
    
    // Открытие модального окна
    addButton.addEventListener('click', () => {
        modal.style.display = 'block';
    });
    
    // Закрытие модального окна
    [closeButton, cancelButton].forEach(button => {
        button.addEventListener('click', () => {
            modal.style.display = 'none';
        });
    });
    
    // Сохранение задачи
    saveButton.addEventListener('click', async () => {
        const daySelect = document.getElementById('daySelect');
        const timeInput = document.getElementById('timeInput');
        const taskInput = document.getElementById('taskInput');
        
        if (!daySelect.value || !timeInput.value || !taskInput.value) {
            showError('Заполните все поля');
            return;
        }
        
        const newTask = {
            id: Date.now(),
            day: parseInt(daySelect.value),
            time: timeInput.value,
            task: taskInput.value
        };
        
        try {
            await saveScheduleItem(newTask);
            scheduleState.items.push(newTask);
            renderScheduleTable();
            modal.style.display = 'none';
            
            // Очищаем форму
            daySelect.value = '1';
            timeInput.value = '';
            taskInput.value = '';
        } catch (error) {
            showError('Ошибка при сохранении задачи: ' + error.message);
        }
    });
    
    // Фильтрация задач
    filterButtons.forEach(button => {
        button.addEventListener('click', () => {
            const filter = button.dataset.filter;
            scheduleState.currentFilter = filter;
            
            filterButtons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
            
            renderScheduleTable();
        });
    });
    
    scheduleState.initialized = true;
}

// Загрузка расписания
async function loadSchedule() {
    const transaction = db.transaction(["schedule"], "readonly");
    const store = transaction.objectStore("schedule");
    const request = store.getAll();
    
    request.onsuccess = () => {
        scheduleState.items = request.result;
        renderScheduleTable();
    };
}

// Сохранение задачи
async function saveScheduleItem(task) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(["schedule"], "readwrite");
        const store = transaction.objectStore("schedule");
        const request = store.add(task);
        
        request.onsuccess = () => resolve();
        request.onerror = () => reject(new Error('Ошибка при сохранении в БД'));
    });
}

// Удаление задачи
async function deleteScheduleItem(id) {
    try {
        const transaction = db.transaction(["schedule"], "readwrite");
        const store = transaction.objectStore("schedule");
        await store.delete(id);
        
        scheduleState.items = scheduleState.items.filter(item => item.id !== id);
        renderScheduleTable();
    } catch (error) {
        showError('Ошибка при удалении задачи: ' + error.message);
    }
}

// Отображение расписания
function renderScheduleTable() {
    const scheduleList = document.getElementById('scheduleList');
    const days = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье'];
    let filteredItems = scheduleState.items;
    
    // Применяем фильтр
    if (scheduleState.currentFilter === 'today') {
        const today = new Date().getDay() || 7;
        filteredItems = scheduleState.items.filter(item => item.day === today);
    } else if (scheduleState.currentFilter === 'week') {
        filteredItems = [...scheduleState.items];
        filteredItems.sort((a, b) => {
            if (a.day !== b.day) return a.day - b.day;
            return a.time.localeCompare(b.time);
        });
    }
    
    // Формируем HTML
    if (filteredItems.length === 0) {
        scheduleList.innerHTML = `
            <div class="empty-state">
                <i class="material-icons">event_busy</i>
                <p>Нет запланированных задач</p>
            </div>
        `;
        return;
    }
    
    scheduleList.innerHTML = filteredItems.map(item => `
        <div class="schedule-item">
            <div class="schedule-cell">${days[item.day - 1]}</div>
            <div class="schedule-cell">${item.time}</div>
            <div class="schedule-cell">${item.task}</div>
            <div class="schedule-cell">
                <button class="button secondary" onclick="deleteScheduleItem(${item.id})">
                    <i class="material-icons">delete</i>
                </button>
            </div>
        </div>
    `).join('');
}

// Вспомогательные функции
function showLoading() {
    const container = document.getElementById('resultsContainer');
    container.innerHTML = `
        <div class="loading-container">
            <div class="loading-spinner"></div>
            <div class="loading-text">Обработка...</div>
        </div>
    `;
}

function showEmptyState() {
    const container = document.getElementById('resultsContainer');
    const copyButton = document.getElementById('copyResults');
    
    container.innerHTML = `
        <div class="empty-state">
            <i class="material-icons">text_fields</i>
            <p>Введите текст и нажмите кнопку для начала обработки</p>
        </div>
    `;
    
    copyButton.style.display = 'none';
}

function showError(message) {
    const webApp = window.Telegram.WebApp;
    webApp.showPopup({
        title: "Ошибка",
        message: message,
        buttons: [{type: "ok"}]
    });
}

// Отображение результатов поиска
function showSearchResults(results) {
    const container = document.getElementById('resultsContainer');
    const copyButton = document.getElementById('copyResults');
    
    if (results.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="material-icons">search_off</i>
                <p>Ничего не найдено</p>
            </div>
        `;
        copyButton.style.display = 'none';
        return;
    }
    
    container.innerHTML = results.map(result => `
        <div class="search-result">
            ${result.context ? `<div class="context">${result.context}</div>` : ''}
            <div class="result-paragraph">${highlightText(result.sentence, textState.searchQuery)}</div>
            ${result.nextContext ? `<div class="context">${result.nextContext}</div>` : ''}
        </div>
    `).join('');
    
    copyButton.style.display = 'block';
}

// Отображение результатов суммаризации
function showSummary(summary) {
    const container = document.getElementById('resultsContainer');
    const copyButton = document.getElementById('copyResults');
    
    container.innerHTML = `
        <div class="summary-result">${summary}</div>
    `;
    
    copyButton.style.display = 'block';
}

// Подсветка найденного текста
function highlightText(text, query) {
    const regex = new RegExp(`(${query})`, 'gi');
    return text.replace(regex, '<mark>$1</mark>');
}

// Функции для работы с чатом
async function sendMessage() {
    const messageInput = document.getElementById('messageInput');
    const text = messageInput.value.trim();
    
    if (!text) return;
    
    try {
        // Добавляем сообщение пользователя в чат
        addMessageToUI(text, 'user');
        
        // Очищаем поле ввода
        messageInput.value = '';
        
        // Показываем индикатор набора текста
        showTypingIndicator();
        
        // Отправляем запрос к боту
        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Telegram-User-Id': window.Telegram.WebApp.initDataUnsafe.user.id
            },
            body: JSON.stringify({
                message: text,
                chat_id: window.Telegram.WebApp.initDataUnsafe.user.id
            })
        });
        
        // Убираем индикатор набора текста
        hideTypingIndicator();
        
        if (!response.ok) {
            throw new Error('Network response was not ok');
        }
        
        const data = await response.json();
        
        // Добавляем ответ бота в чат
        addMessageToUI(data.response, 'bot');
        
        // Если включена озвучка, озвучиваем ответ
        if (state.userSettings.tts_enabled) {
            speak(data.response);
        }
        
    } catch (error) {
        console.error('Error sending message:', error);
        hideTypingIndicator();
        showError('Ошибка при отправке сообщения: ' + error.message);
    }
}

// Добавление сообщения в UI
function addMessageToUI(text, type = 'bot', options = {}) {
    const messagesContainer = document.getElementById('messages');
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${type}`;
    
    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';
    
    // Форматируем текст, если это сообщение бота
    if (type === 'bot') {
        contentDiv.innerHTML = formatBotMessage(text);
    } else {
        contentDiv.textContent = text;
    }
    
    messageDiv.appendChild(contentDiv);
    
    // Добавляем метаданные
    const metaDiv = document.createElement('div');
    metaDiv.className = 'message-meta';
    
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    metaDiv.innerHTML = `<span class="time">${time}</span>`;
    
    if (type === 'bot') {
        metaDiv.innerHTML += `
            <button class="copy-button" onclick="copyMessage(this)">
                <i class="material-icons">content_copy</i>
            </button>
        `;
    }
    
    messageDiv.appendChild(metaDiv);
    messagesContainer.appendChild(messageDiv);
    
    // Прокручиваем к последнему сообщению
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
    
    // Сохраняем в историю
    saveToChatHistory({
        text,
        type,
        timestamp: new Date().toISOString(),
        options
    });
}

// Форматирование сообщения бота
function formatBotMessage(text) {
    // Заменяем URL на кликабельные ссылки
    text = text.replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank">$1</a>');
    
    // Заменяем переносы строк на <br>
    text = text.replace(/\n/g, '<br>');
    
    return text;
}

// Показ индикатора набора текста
function showTypingIndicator() {
    const messagesContainer = document.getElementById('messages');
    const typingDiv = document.createElement('div');
    typingDiv.className = 'message bot typing';
    typingDiv.innerHTML = `
        <div class="typing-indicator">
            <span></span>
            <span></span>
            <span></span>
        </div>
    `;
    messagesContainer.appendChild(typingDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Скрытие индикатора набора текста
function hideTypingIndicator() {
    const typingIndicator = document.querySelector('.typing');
    if (typingIndicator) {
        typingIndicator.remove();
    }
}

// Копирование сообщения
function copyMessage(button) {
    const messageContent = button.closest('.message').querySelector('.message-content');
    const text = messageContent.textContent;
    
    navigator.clipboard.writeText(text).then(() => {
        // Показываем уведомление о копировании
        const icon = button.querySelector('i');
        icon.textContent = 'check';
        setTimeout(() => {
            icon.textContent = 'content_copy';
        }, 2000);
    }).catch(err => {
        showError('Ошибка при копировании: ' + err.message);
    });
}

// Загрузка истории чата
async function loadChatHistory() {
    try {
        const transaction = db.transaction(["chatHistory"], "readonly");
        const store = transaction.objectStore("chatHistory");
        const request = store.getAll();
        
        request.onsuccess = () => {
            const messages = request.result;
            messages.forEach(msg => {
                addMessageToUI(msg.text, msg.type, msg.options);
            });
        };
    } catch (error) {
        console.error('Error loading chat history:', error);
    }
}

// Инициализация чата
function initChat() {
    const messageInput = document.getElementById('messageInput');
    const sendButton = document.getElementById('sendButton');
    const voiceButton = document.getElementById('voiceButton');
    
    // Отправка по кнопке
    sendButton.addEventListener('click', sendMessage);
    
    // Отправка по Enter (но Shift+Enter для новой строки)
    messageInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });
    
    // Голосовой ввод
    voiceButton.addEventListener('click', toggleVoiceRecording);
}

// Инициализация приложения
document.addEventListener('DOMContentLoaded', async () => {
    console.log('DOM loaded, initializing app');
    
    try {
        // Инициализация базы данных
        await initDB();
        console.log('Database initialized');
        
        // Загрузка данных
        await Promise.all([
            loadChatHistory(),
            loadSchedule()
        ]);
        console.log('Data loaded');
        
        // Инициализация чата
        initChat();
        console.log('Chat initialized');
        
        // Настройка навигации
        const navButtons = document.querySelectorAll('.nav-item');
        console.log('Found nav buttons:', navButtons.length);
        
        navButtons.forEach(button => {
            button.addEventListener('click', (e) => {
                e.preventDefault();
                const page = button.getAttribute('data-page');
                console.log('Nav button clicked:', page);
                navigateToPage(page);
            });
        });
        
        // Показываем начальную страницу (чат)
        navigateToPage('chat');
    } catch (error) {
        console.error('Initialization error:', error);
        showError('Ошибка при инициализации приложения: ' + error.message);
    }
});