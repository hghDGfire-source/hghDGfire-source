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
    const request = indexedDB.open(dbName, dbVersion);

    request.onerror = (event) => {
        console.error("Error opening DB", event);
    };

    request.onupgradeneeded = (event) => {
        db = event.target.result;
        if (!db.objectStoreNames.contains("chatHistory")) {
            db.createObjectStore("chatHistory", { keyPath: "id", autoIncrement: true });
        }
        if (!db.objectStoreNames.contains("schedule")) {
            db.createObjectStore("schedule", { keyPath: "id" });
        }
    };

    request.onsuccess = (event) => {
        db = event.target.result;
        loadChatHistory();
        loadSchedule();
    };
};

// Навигация между страницами
function navigateToPage(page) {
    const pages = ['chat', 'schedule', 'text', 'settings'];
    const navButtons = document.querySelectorAll('.nav-item');
    
    // Скрываем все страницы
    pages.forEach(p => {
        document.getElementById(`${p}Page`).classList.remove('active');
    });
    
    // Убираем активный класс у всех кнопок навигации
    navButtons.forEach(btn => {
        btn.classList.remove('active');
    });
    
    // Показываем выбранную страницу
    document.getElementById(`${page}Page`).classList.add('active');
    
    // Активируем соответствующую кнопку навигации
    const activeButton = document.querySelector(`.nav-item[data-page="${page}"]`);
    if (activeButton) {
        activeButton.classList.add('active');
    }

    // Инициализация страниц при первом открытии
    if (page === 'schedule' && !scheduleState.initialized) {
        initSchedulePage();
    } else if (page === 'text' && !textState.initialized) {
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

// Загрузка расписания из IndexedDB
async function loadSchedule() {
    const transaction = db.transaction(["schedule"], "readonly");
    const store = transaction.objectStore("schedule");
    const request = store.getAll();
    
    request.onsuccess = () => {
        scheduleState.items = request.result;
        renderScheduleTable();
    };
}

// Сохранение задачи в IndexedDB
async function saveScheduleItem(task) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(["schedule"], "readwrite");
        const store = transaction.objectStore("schedule");
        const request = store.add(task);
        
        request.onsuccess = () => resolve();
        request.onerror = () => reject(new Error('Ошибка при сохранении в БД'));
    });
}

// Удаление задачи из IndexedDB
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
        // Оставляем все задачи для текущей недели
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
    webApp.showPopup({
        title: "Ошибка",
        message: message,
        buttons: [{type: "ok"}]
    });
}

// Инициализация приложения
document.addEventListener('DOMContentLoaded', () => {
    // Инициализация базы данных
    initDB();
    
    // Настройка навигации
    const navButtons = document.querySelectorAll('.nav-item');
    navButtons.forEach(button => {
        button.addEventListener('click', () => {
            const page = button.dataset.page;
            navigateToPage(page);
        });
    });
    
    // Загрузка настроек
    loadSettings();
});