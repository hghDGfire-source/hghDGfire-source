// Глобальные состояния и переменные
window.state = {
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

window.textState = {
    initialized: false,
    mode: 'search',
    currentText: '',
    searchQuery: '',
    results: [],
    isProcessing: false
};

window.scheduleState = {
    initialized: false,
    items: [],
    currentFilter: 'all'
};

// Глобальные переменные для базы данных
window.db = null;
window.dbName = "arisAIDB";
window.dbVersion = 1;

// Инициализация IndexedDB
window.initDB = () => {
    return new Promise((resolve, reject) => {
        try {
            if (!window.indexedDB) {
                console.warn('IndexedDB not supported');
                resolve(null);
                return;
            }

            console.log('Initializing database...');
            const request = indexedDB.open(window.dbName, window.dbVersion);

            request.onerror = (event) => {
                console.error("Error opening DB", event);
                resolve(null); // Продолжаем без базы данных
            };

            request.onupgradeneeded = (event) => {
                console.log("Upgrading database...");
                window.db = event.target.result;

                // Создаем хранилища, если их нет
                if (!window.db.objectStoreNames.contains("chatHistory")) {
                    window.db.createObjectStore("chatHistory", { keyPath: "id", autoIncrement: true });
                    console.log("Created chatHistory store");
                }
                if (!window.db.objectStoreNames.contains("schedule")) {
                    window.db.createObjectStore("schedule", { keyPath: "id" });
                    console.log("Created schedule store");
                }
            };

            request.onsuccess = (event) => {
                console.log("Database opened successfully");
                window.db = event.target.result;

                // Проверяем наличие необходимых хранилищ
                if (!window.db.objectStoreNames.contains("chatHistory") || 
                    !window.db.objectStoreNames.contains("schedule")) {
                    console.log("Required stores missing, closing and reopening with upgrade");
                    window.db.close();
                    window.dbVersion += 1;
                    const reopenRequest = indexedDB.open(window.dbName, window.dbVersion);
                    reopenRequest.onerror = request.onerror;
                    reopenRequest.onupgradeneeded = request.onupgradeneeded;
                    reopenRequest.onsuccess = (event) => {
                        window.db = event.target.result;
                        resolve(window.db);
                    };
                } else {
                    resolve(window.db);
                }

                // Обработка ошибок базы данных
                window.db.onerror = (event) => {
                    console.error("Database error:", event);
                };
            };
        } catch (error) {
            console.error("Error in initDB:", error);
            resolve(null); // Продолжаем без базы данных
        }
    });
};

// Безопасное сохранение в базу данных
async function safeDBOperation(storeName, operation) {
    if (!window.db) {
        console.warn('Database not initialized, skipping operation');
        return null;
    }

    try {
        return await operation();
    } catch (error) {
        console.error(`Error in ${storeName} operation:`, error);
        return null;
    }
}

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
    if (page === 'schedule' && !window.scheduleState.initialized) {
        console.log('Initializing schedule page');
        initSchedulePage();
    } else if (page === 'text' && !window.textState.initialized) {
        console.log('Initializing text page');
        initTextPage();
    }
}

// Инициализация страницы работы с текстом
function initTextPage() {
    if (window.textState.initialized) return;
    
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
            window.textState.mode = mode;
            
            modeButtons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
            
            document.getElementById('searchSection').classList.toggle('hidden', mode !== 'search');
            document.getElementById('summarySection').classList.toggle('hidden', mode !== 'summary');
            
            showEmptyState();
        });
    });
    
    // Обработка ввода текста
    textInput.addEventListener('input', (e) => {
        window.textState.currentText = e.target.value;
        const charCount = e.target.value.length;
        const charCounter = document.querySelector('.char-counter');
        charCounter.textContent = `${charCount}/10000`;
        
        if (charCount > 10000) {
            e.target.value = e.target.value.slice(0, 10000);
            window.textState.currentText = e.target.value;
            showError('Превышен лимит в 10000 символов');
        }
    });
    
    // Поиск в тексте
    searchButton.addEventListener('click', async () => {
        if (!window.textState.currentText) {
            showError('Введите текст для поиска');
            return;
        }
        
        if (!searchQuery.value) {
            showError('Введите поисковый запрос');
            return;
        }
        
        window.textState.searchQuery = searchQuery.value;
        window.textState.isProcessing = true;
        showLoading();
        
        try {
            const results = await searchInText(window.textState.currentText, window.textState.searchQuery);
            showSearchResults(results);
        } catch (error) {
            showError('Ошибка при поиске: ' + error.message);
        } finally {
            window.textState.isProcessing = false;
        }
    });
    
    // Суммаризация текста
    summarizeButton.addEventListener('click', async () => {
        if (!window.textState.currentText) {
            showError('Введите текст для суммаризации');
            return;
        }
        
        window.textState.isProcessing = true;
        showLoading();
        
        try {
            const summary = await summarizeText(window.textState.currentText);
            showSummary(summary);
        } catch (error) {
            showError('Ошибка при суммаризации: ' + error.message);
        } finally {
            window.textState.isProcessing = false;
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
    
    window.textState.initialized = true;
}

// Инициализация страницы расписания
function initSchedulePage() {
    if (window.scheduleState.initialized) return;
    
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
            await safeDBOperation('schedule', async () => {
                const transaction = window.db.transaction(["schedule"], "readwrite");
                const store = transaction.objectStore("schedule");
                await store.add(newTask);
                return newTask;
            });
            window.scheduleState.items.push(newTask);
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
            window.scheduleState.currentFilter = filter;
            
            filterButtons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
            
            renderScheduleTable();
        });
    });
    
    window.scheduleState.initialized = true;
}

// Загрузка расписания
async function loadSchedule() {
    if (!window.db) {
        console.error('Database not initialized');
        return;
    }

    return new Promise((resolve, reject) => {
        try {
            const transaction = window.db.transaction(["schedule"], "readonly");
            const store = transaction.objectStore("schedule");
            const request = store.getAll();
            
            request.onsuccess = () => {
                window.scheduleState.items = request.result;
                renderScheduleTable();
                resolve(request.result);
            };
            
            request.onerror = (error) => {
                console.error('Error loading schedule:', error);
                reject(error);
            };
        } catch (error) {
            console.error('Error in loadSchedule:', error);
            reject(error);
        }
    });
}

// Сохранение задачи
async function saveScheduleItem(task) {
    if (!window.db) {
        throw new Error('Database not initialized');
    }

    return new Promise((resolve, reject) => {
        try {
            const transaction = window.db.transaction(["schedule"], "readwrite");
            const store = transaction.objectStore("schedule");
            const request = store.add(task);
            
            request.onsuccess = () => resolve();
            request.onerror = (error) => {
                console.error('Error saving schedule item:', error);
                reject(new Error('Ошибка при сохранении в БД'));
            };
        } catch (error) {
            console.error('Error in saveScheduleItem:', error);
            reject(error);
        }
    });
}

// Удаление задачи
async function deleteScheduleItem(id) {
    try {
        await safeDBOperation('schedule', async () => {
            const transaction = window.db.transaction(["schedule"], "readwrite");
            const store = transaction.objectStore("schedule");
            await store.delete(id);
            return true;
        });
        window.scheduleState.items = window.scheduleState.items.filter(item => item.id !== id);
        renderScheduleTable();
    } catch (error) {
        console.error('Error deleting schedule item:', error);
        showError('Ошибка при удалении задачи: ' + error.message);
    }
}

// Отображение расписания
function renderScheduleTable() {
    const scheduleList = document.getElementById('scheduleList');
    const days = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье'];
    let filteredItems = window.scheduleState.items;
    
    // Применяем фильтр
    if (window.scheduleState.currentFilter === 'today') {
        const today = new Date().getDay() || 7;
        filteredItems = window.scheduleState.items.filter(item => item.day === today);
    } else if (window.scheduleState.currentFilter === 'week') {
        filteredItems = [...window.scheduleState.items];
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
    if (!container) {
        console.error('Results container not found');
        return;
    }
    
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
    
    if (!container) {
        console.error('Results container not found');
        return;
    }
    
    container.innerHTML = `
        <div class="empty-state">
            <i class="material-icons">text_fields</i>
            <p>Введите текст и нажмите кнопку для начала обработки</p>
        </div>
    `;
    
    if (copyButton) {
        copyButton.style.display = 'none';
    }
}

function showError(message) {
    console.error('Error:', message);
    try {
        const webApp = window.Telegram?.WebApp;
        if (webApp && typeof webApp.showPopup === 'function') {
            webApp.showPopup({
                title: "Ошибка",
                message: message || 'Произошла неизвестная ошибка',
                buttons: [{type: "ok"}]
            });
        } else {
            console.warn('Telegram WebApp not available, falling back to alert');
            alert(message || 'Произошла неизвестная ошибка');
        }
    } catch (error) {
        console.error('Error in error handler:', error);
        alert(message || 'Произошла неизвестная ошибка');
    }
}

// Отображение результатов поиска
function showSearchResults(results) {
    const container = document.getElementById('resultsContainer');
    const copyButton = document.getElementById('copyResults');
    
    if (!container) {
        console.error('Results container not found');
        return;
    }
    
    if (!results || results.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="material-icons">search_off</i>
                <p>Ничего не найдено</p>
            </div>
        `;
        if (copyButton) {
            copyButton.style.display = 'none';
        }
        return;
    }
    
    try {
        container.innerHTML = results.map(result => `
            <div class="search-result">
                ${result.context ? `<div class="context">${escapeHtml(result.context)}</div>` : ''}
                <div class="result-paragraph">${highlightText(escapeHtml(result.sentence), window.textState.searchQuery)}</div>
                ${result.nextContext ? `<div class="context">${escapeHtml(result.nextContext)}</div>` : ''}
            </div>
        `).join('');
        
        if (copyButton) {
            copyButton.style.display = 'block';
        }
    } catch (error) {
        console.error('Error showing search results:', error);
        showError('Ошибка при отображении результатов поиска');
    }
}

// Отображение результатов суммаризации
function showSummary(summary) {
    const container = document.getElementById('resultsContainer');
    const copyButton = document.getElementById('copyResults');
    
    if (!container) {
        console.error('Results container not found');
        return;
    }
    
    if (!summary) {
        showEmptyState();
        return;
    }
    
    try {
        container.innerHTML = `
            <div class="summary-result">${escapeHtml(summary)}</div>
        `;
        
        if (copyButton) {
            copyButton.style.display = 'block';
        }
    } catch (error) {
        console.error('Error showing summary:', error);
        showError('Ошибка при отображении результатов суммаризации');
    }
}

// Вспомогательная функция для безопасного отображения HTML
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Подсветка найденного текста
function highlightText(text, query) {
    if (!text || !query) return text;
    try {
        const regex = new RegExp(`(${escapeRegExp(query)})`, 'gi');
        return text.replace(regex, '<mark>$1</mark>');
    } catch (error) {
        console.error('Error highlighting text:', error);
        return text;
    }
}

// Экранирование специальных символов в регулярном выражении
function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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
        if (window.state.userSettings.tts_enabled) {
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
    if (!messagesContainer) {
        console.error('Messages container not found');
        return;
    }

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
    
    // Сохраняем в историю только если база данных инициализирована
    if (window.db) {
        saveToChatHistory({
            text,
            type,
            timestamp: new Date().toISOString(),
            options
        }).catch(err => console.error('Error saving to chat history:', err));
    }
}

// Показ индикатора набора текста
function showTypingIndicator() {
    const messagesContainer = document.getElementById('messages');
    if (!messagesContainer) {
        console.error('Messages container not found');
        return;
    }

    const existingIndicator = messagesContainer.querySelector('.typing');
    if (existingIndicator) {
        return; // Индикатор уже показан
    }

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
    const messagesContainer = document.getElementById('messages');
    if (!messagesContainer) {
        console.error('Messages container not found');
        return;
    }

    const typingIndicator = messagesContainer.querySelector('.typing');
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

// Сохранение сообщения в историю
async function saveToChatHistory(message) {
    if (!window.db) {
        console.error('Database not initialized');
        return;
    }

    return new Promise((resolve, reject) => {
        try {
            const transaction = window.db.transaction(["chatHistory"], "readwrite");
            const store = transaction.objectStore("chatHistory");
            const request = store.add(message);
            
            request.onsuccess = () => resolve();
            request.onerror = (error) => {
                console.error('Error saving to chat history:', error);
                reject(error);
            };
        } catch (error) {
            console.error('Error in saveToChatHistory:', error);
            reject(error);
        }
    });
}

// Загрузка истории чата
async function loadChatHistory() {
    try {
        const transaction = window.db.transaction(["chatHistory"], "readonly");
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
    console.log('Initializing chat...');
    
    const messageInput = document.getElementById('messageInput');
    const sendButton = document.getElementById('sendButton');
    const micButton = document.getElementById('micButton');
    const chatContainer = document.getElementById('chatContainer');
    
    // Проверяем наличие необходимых элементов
    if (!messageInput || !sendButton || !chatContainer) {
        console.error('Required chat elements not found:', {
            messageInput: !!messageInput,
            sendButton: !!sendButton,
            chatContainer: !!chatContainer
        });
        return;
    }
    
    // Отправка по кнопке
    sendButton.addEventListener('click', () => {
        console.log('Send button clicked');
        sendMessage();
    });
    
    // Отправка по Enter (но Shift+Enter для новой строки)
    messageInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            console.log('Enter pressed, sending message');
            sendMessage();
        }
    });
    
    // Голосовой ввод
    if (micButton) {
        micButton.addEventListener('click', () => {
            console.log('Mic button clicked');
            toggleVoiceRecording();
        });
    }
    
    // Автоматическая высота текстового поля
    messageInput.addEventListener('input', () => {
        messageInput.style.height = 'auto';
        messageInput.style.height = messageInput.scrollHeight + 'px';
    });
    
    console.log('Chat initialized successfully');
}

// Инициализация приложения
function initializeApp() {
    return new Promise(async (resolve, reject) => {
        try {
            // Инициализируем состояния, если они еще не инициализированы
            window.state = window.state || {
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

            // Проверяем готовность Telegram WebApp
            if (window.Telegram?.WebApp) {
                console.log('Telegram WebApp found');
                try {
                    window.Telegram.WebApp.ready();
                    console.log('Telegram WebApp ready called');
                } catch (e) {
                    console.warn('Error calling WebApp.ready():', e);
                }
            } else {
                console.warn('Telegram WebApp not found, continuing in standalone mode');
            }

            // Инициализация базы данных
            try {
                await initDB();
                console.log('Database initialized');
            } catch (dbError) {
                console.error('Database initialization error:', dbError);
                // Продолжаем работу без базы данных
            }

            // Инициализация чата
            try {
                await initChat();
                console.log('Chat initialized');
            } catch (chatError) {
                console.error('Chat initialization error:', chatError);
                throw chatError;
            }

            // Настройка навигации
            try {
                const navButtons = document.querySelectorAll('.nav-item');
                console.log('Found nav buttons:', navButtons.length);

                if (navButtons.length > 0) {
                    navButtons.forEach(button => {
                        button.addEventListener('click', (e) => {
                            e.preventDefault();
                            const page = button.getAttribute('data-page');
                            if (page) {
                                console.log('Nav button clicked:', page);
                                navigateToPage(page);
                            }
                        });
                    });

                    // Показываем начальную страницу
                    navigateToPage('chat');
                } else {
                    console.warn('No navigation buttons found, continuing with chat only');
                }
            } catch (navError) {
                console.error('Navigation setup error:', navError);
                // Продолжаем работу без навигации
            }

            console.log('App initialization completed');
            resolve();
        } catch (error) {
            console.error('Fatal initialization error:', error);
            reject(error);
        }
    });
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
    // Простая реализация суммаризации - берем первые 2 и последние 2 предложения
    const sentences = text.split(/[.!?]+/).filter(s => s.trim());
    if (sentences.length <= 4) return text;
    
    const firstTwo = sentences.slice(0, 2);
    const lastTwo = sentences.slice(-2);
    
    return `${firstTwo.join('. ')}. ... ${lastTwo.join('. ')}.`;
}

// Запуск приложения при загрузке DOM
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM loaded, starting initialization');
    
    initializeApp().catch(error => {
        console.error('App initialization failed:', error);
        try {
            showError('Ошибка при инициализации приложения: ' + (error.message || 'неизвестная ошибка'));
        } catch (e) {
            console.error('Error showing error message:', e);
            alert('Ошибка при инициализации приложения');
        }
    });
});