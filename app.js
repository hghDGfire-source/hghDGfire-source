// Состояние приложения
const state = {
    currentPage: 'chat',
    textMode: 'search',
    notes: [],
    userSettings: {
        notifications: true,
        sound: true,
        theme: 'dark',
        language: 'ru'
    }
};

// Инициализация приложения при загрузке DOM
document.addEventListener('DOMContentLoaded', function() {
    console.log('Инициализация приложения...');
    
    // Инициализация навигации
    initNavigation();
    
    // Инициализация всех страниц
    initChatPage();
    initSchedulePage();
    initTextPage();
    initSettingsPage();
    
    // Обработка выбора файла изображения
    const noteImageInput = document.getElementById('noteImage');
    const selectedFileName = document.getElementById('selectedFileName');
    const imagePreview = document.getElementById('imagePreview');
    
    if (noteImageInput) {
        noteImageInput.addEventListener('change', function(e) {
            const file = e.target.files[0];
            if (file) {
                // Отображаем имя файла
                selectedFileName.textContent = file.name;
                
                // Обновляем предпросмотр изображения
                const reader = new FileReader();
                reader.onload = function(event) {
                    imagePreview.innerHTML = `<img src="${event.target.result}" alt="Предпросмотр">`;
                    imagePreview.style.display = 'block';
                };
                reader.readAsDataURL(file);
            } else {
                selectedFileName.textContent = '';
                imagePreview.innerHTML = '';
                imagePreview.style.display = 'none';
            }
        });
    }
    
    console.log('Приложение полностью инициализировано');
});

// Функция инициализации навигации
function initNavigation() {
    console.log('Инициализация навигации...');
    
    // Находим все элементы нижней навигации
    const navItems = document.querySelectorAll('.bottom-nav .nav-item');
    console.log('Найдено элементов навигации:', navItems.length);
    
    // Добавляем обработчики событий для каждого элемента
    navItems.forEach(function(item) {
        item.addEventListener('click', function(e) {
            e.preventDefault();
            const pageName = this.getAttribute('data-page');
            console.log('Клик по навигации:', pageName);
            navigateToPage(pageName);
        });
    });
}

// Функция переключения страниц
function navigateToPage(pageName) {
    console.log('Переключение на страницу:', pageName);
    
    // Сохраняем текущую страницу
    state.currentPage = pageName;
    
    // Скрываем все страницы
    document.querySelectorAll('.page').forEach(function(page) {
        page.classList.remove('active');
    });
    
    // Снимаем активное состояние со всех элементов навигации
    document.querySelectorAll('.nav-item').forEach(function(navItem) {
        navItem.classList.remove('active');
    });
    
    // Активируем нужную страницу
    const targetPage = document.getElementById(pageName + 'Page');
    if (targetPage) {
        targetPage.classList.add('active');
        console.log('Страница активирована:', pageName + 'Page');
    } else {
        console.error('Страница не найдена:', pageName + 'Page');
    }
    
    // Активируем соответствующий элемент навигации
    const targetNavItem = document.querySelector(`.nav-item[data-page="${pageName}"]`);
    if (targetNavItem) {
        targetNavItem.classList.add('active');
        console.log('Навигация активирована:', pageName);
    } else {
        console.error('Элемент навигации не найден:', pageName);
    }
}

// Функция инициализации страницы чата
function initChatPage() {
    console.log('Инициализация страницы чата...');
    
    // Обработчик для кнопки меню
    const menuButton = document.getElementById('menuButton');
    if (menuButton) {
        menuButton.addEventListener('click', function() {
            const sidebar = document.getElementById('chatSidebar');
            if (sidebar) {
                sidebar.classList.toggle('open');
                console.log('Переключение сайдбара');
            }
        });
    }
    
    // Обработчик для кнопки поиска
    const searchButton = document.getElementById('searchButton');
    if (searchButton) {
        searchButton.addEventListener('click', function() {
            console.log('Клик по кнопке поиска');
            alert('Функция поиска в разработке');
        });
    }
    
    // Обработчик для отправки сообщений
    const sendButton = document.getElementById('sendButton');
    const messageInput = document.getElementById('messageInput');
    
    if (sendButton && messageInput) {
        sendButton.addEventListener('click', function() {
            sendMessage();
        });
        
        // Отправка по Enter
        messageInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });
    }
    
    // Показываем приветственное сообщение
    setTimeout(function() {
        addMessage('👋 Привет! Я Aris AI, ваш умный ассистент. Чем могу помочь?', 'bot');
    }, 500);
}

// Функция отправки сообщения
function sendMessage() {
    const messageInput = document.getElementById('messageInput');
    const message = messageInput.value.trim();
    
    if (message) {
        console.log('Отправка сообщения:', message);
        
        // Добавляем сообщение пользователя в интерфейс
        addMessage(message, 'user');
        
        // Очищаем поле ввода
        messageInput.value = '';
        
        // Показываем индикатор загрузки
        const chatContainer = document.querySelector('.chat-container');
        if (chatContainer) {
            const loadingDiv = document.createElement('div');
            loadingDiv.className = 'message bot loading';
            loadingDiv.innerHTML = '<div class="message-content"><div class="typing-indicator"><span></span><span></span><span></span></div></div>';
            chatContainer.appendChild(loadingDiv);
            chatContainer.scrollTop = chatContainer.scrollHeight;
        }
        
        // Отправляем запрос на сервер
        fetch('/api/message', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ 
                message: message,
                user_id: 'web_user',
                username: 'Web User'
            })
        })
        .then(response => {
            if (!response.ok) {
                throw new Error('Ошибка сети: ' + response.status);
            }
            return response.json();
        })
        .then(data => {
            console.log('Ответ от сервера:', data);
            
            // Удаляем индикатор загрузки
            const loadingMessage = document.querySelector('.message.loading');
            if (loadingMessage) {
                loadingMessage.remove();
            }
            
            // Добавляем ответ от бота
            if (data.response) {
                addMessage(data.response, 'bot');
            } else {
                addMessage('Извините, произошла ошибка при обработке вашего запроса.', 'bot');
            }
        })
        .catch(error => {
            console.error('Ошибка при отправке сообщения:', error);
            
            // Удаляем индикатор загрузки
            const loadingMessage = document.querySelector('.message.loading');
            if (loadingMessage) {
                loadingMessage.remove();
            }
            
            // Добавляем сообщение об ошибке
            addMessage('Извините, не удалось получить ответ. Проверьте соединение с сервером.', 'bot error');
        });
    }
}

// Функция добавления сообщения в чат
function addMessage(text, type) {
    const chatContainer = document.querySelector('.chat-container');
    if (!chatContainer) return;
    
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${type}`;
    
    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';
    contentDiv.textContent = text;
    
    messageDiv.appendChild(contentDiv);
    
    // Добавляем время
    const timeDiv = document.createElement('div');
    timeDiv.className = 'message-time';
    
    // Используем 24-часовой формат без AM/PM
    const now = new Date();
    const hours = now.getHours().toString().padStart(2, '0');
    const minutes = now.getMinutes().toString().padStart(2, '0');
    timeDiv.textContent = `${hours}:${minutes}`;
    
    messageDiv.appendChild(timeDiv);
    
    chatContainer.appendChild(messageDiv);
    chatContainer.scrollTop = chatContainer.scrollHeight;
}

// Функция инициализации страницы расписания
function initSchedulePage() {
    console.log('Инициализация страницы расписания...');
    
    const addButton = document.getElementById('addScheduleButton');
    if (addButton) {
        addButton.addEventListener('click', function() {
            const modal = document.getElementById('scheduleModal');
            if (modal) {
                modal.classList.add('active');
            }
        });
    }
    
    // Обработчики для модального окна
    const modal = document.getElementById('scheduleModal');
    if (modal) {
        const closeButton = modal.querySelector('.close-button');
        if (closeButton) {
            closeButton.addEventListener('click', function() {
                modal.classList.remove('active');
            });
        }
        
        const cancelButton = document.getElementById('cancelSchedule');
        if (cancelButton) {
            cancelButton.addEventListener('click', function() {
                modal.classList.remove('active');
            });
        }
        
        // Обработчик формы
        const saveButton = document.getElementById('saveSchedule');
        if (saveButton) {
            saveButton.addEventListener('click', function() {
                const daySelect = document.getElementById('daySelect');
                const timeInput = document.getElementById('timeInput');
                const taskInput = document.getElementById('taskInput');
                
                if (daySelect && timeInput && taskInput) {
                    const dayOfWeek = daySelect.value;
                    const time = timeInput.value;
                    const task = taskInput.value.trim();
                    
                    if (dayOfWeek && time && task) {
                        console.log('Добавление задачи:', { dayOfWeek, time, task });
                        
                        // Добавляем задачу в таблицу
                        addScheduleItem(dayOfWeek, time, task);
                        
                        // Сохраняем в localStorage
                        saveScheduleToLocalStorage();
                        
                        // Закрываем модальное окно и сбрасываем форму
                        modal.classList.remove('active');
                        daySelect.selectedIndex = 0;
                        timeInput.value = '';
                        taskInput.value = '';
                        
                        // Применяем текущий фильтр
                        const currentFilter = localStorage.getItem('scheduleFilter') || 'all';
                        applyScheduleFilter(currentFilter);
                        
                        // Показываем уведомление
                        showNotification('Задача успешно добавлена в расписание', 'success');
                    } else {
                        showNotification('Пожалуйста, заполните все поля', 'error');
                    }
                }
            });
        }
    }
    
    // Обработчики фильтров
    const filterButtons = document.querySelectorAll('.filter-button');
    if (filterButtons.length > 0) {
        filterButtons.forEach(button => {
            button.addEventListener('click', function() {
                const filter = this.getAttribute('data-filter');
                applyScheduleFilter(filter);
            });
        });
    }
    
    // Загружаем расписание из localStorage
    loadScheduleFromLocalStorage();
    
    // Применяем сохраненный фильтр или фильтр по умолчанию
    const savedFilter = localStorage.getItem('scheduleFilter') || 'all';
    applyScheduleFilter(savedFilter);
}

// Функция добавления элемента расписания
function addScheduleItem(dayOfWeek, time, task) {
    const scheduleList = document.getElementById('scheduleList');
    if (!scheduleList) return;
    
    // Получаем название дня недели
    const dayNames = [
        'Понедельник', 'Вторник', 'Среда', 
        'Четверг', 'Пятница', 'Суббота', 'Воскресенье'
    ];
    const dayName = dayNames[parseInt(dayOfWeek) - 1];
    
    // Создаем новую строку расписания
    const scheduleRow = document.createElement('div');
    scheduleRow.className = 'schedule-row';
    scheduleRow.setAttribute('data-day', dayOfWeek);
    scheduleRow.setAttribute('data-time', time);
    
    // Сортируем задачи по дню недели и времени
    scheduleRow.innerHTML = `
        <div class="schedule-cell">${dayName}</div>
        <div class="schedule-cell">${time}</div>
        <div class="schedule-cell">${task}</div>
        <div class="schedule-cell">
            <button class="delete-schedule-item" onclick="deleteScheduleItem(this)">
                <i class="material-icons">delete</i>
            </button>
        </div>
    `;
    
    // Добавляем строку в список
    scheduleList.appendChild(scheduleRow);
    
    // Сортируем расписание
    sortSchedule();
    
    // Применяем текущий фильтр
    const currentFilter = localStorage.getItem('scheduleFilter') || 'all';
    applyScheduleFilter(currentFilter);
}

// Функция сортировки расписания
function sortSchedule() {
    const scheduleList = document.getElementById('scheduleList');
    if (!scheduleList) return;
    
    const rows = Array.from(scheduleList.querySelectorAll('.schedule-row'));
    
    // Сортируем строки по дню недели и времени
    rows.sort((a, b) => {
        const dayA = parseInt(a.getAttribute('data-day'));
        const dayB = parseInt(b.getAttribute('data-day'));
        
        if (dayA !== dayB) {
            return dayA - dayB;
        }
        
        const timeA = a.getAttribute('data-time');
        const timeB = b.getAttribute('data-time');
        
        return timeA.localeCompare(timeB);
    });
    
    // Очищаем список и добавляем отсортированные строки
    scheduleList.innerHTML = '';
    rows.forEach(row => {
        scheduleList.appendChild(row);
    });
}

// Функция удаления элемента расписания
function deleteScheduleItem(button) {
    const scheduleRow = button.closest('.schedule-row');
    if (scheduleRow) {
        // Анимация удаления
        scheduleRow.style.opacity = '0';
        scheduleRow.style.transform = 'translateX(20px)';
        
        setTimeout(() => {
            scheduleRow.remove();
            saveScheduleToLocalStorage();
            showNotification('Задача удалена из расписания', 'success');
        }, 300);
    }
}

// Функция сохранения расписания в localStorage
function saveScheduleToLocalStorage() {
    const scheduleList = document.getElementById('scheduleList');
    if (!scheduleList) return;
    
    const scheduleItems = [];
    const rows = scheduleList.querySelectorAll('.schedule-row');
    
    rows.forEach(row => {
        const dayOfWeek = row.getAttribute('data-day');
        const time = row.getAttribute('data-time');
        const task = row.querySelectorAll('.schedule-cell')[2].textContent;
        
        scheduleItems.push({
            dayOfWeek,
            time,
            task
        });
    });
    
    localStorage.setItem('scheduleItems', JSON.stringify(scheduleItems));
}

// Функция загрузки расписания из localStorage
function loadScheduleFromLocalStorage() {
    const scheduleList = document.getElementById('scheduleList');
    if (!scheduleList) return;
    
    // Очищаем текущий список
    scheduleList.innerHTML = '';
    
    // Получаем сохраненные элементы
    const savedItems = localStorage.getItem('scheduleItems');
    if (savedItems) {
        try {
            const scheduleItems = JSON.parse(savedItems);
            
            // Добавляем каждый элемент в список
            scheduleItems.forEach(item => {
                addScheduleItem(item.dayOfWeek, item.time, item.task);
            });
        } catch (error) {
            console.error('Ошибка при загрузке расписания:', error);
        }
    }
}

// Функция применения фильтра к расписанию
function applyScheduleFilter(filter) {
    console.log('Применение фильтра к расписанию:', filter);
    
    const scheduleRows = document.querySelectorAll('#scheduleList .schedule-row');
    const today = new Date().getDay(); // 0 = воскресенье, 1 = понедельник, ...
    const todayAdjusted = today === 0 ? 7 : today; // Преобразуем в формат 1-7
    
    // Обновляем активную кнопку фильтра
    const filterButtons = document.querySelectorAll('.filter-button');
    filterButtons.forEach(btn => {
        if (btn.getAttribute('data-filter') === filter) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
    
    // Применяем фильтр к строкам расписания
    scheduleRows.forEach(row => {
        const dayOfWeek = parseInt(row.getAttribute('data-day'));
        
        switch (filter) {
            case 'today':
                if (dayOfWeek === todayAdjusted) {
                    row.style.display = '';
                } else {
                    row.style.display = 'none';
                }
                break;
                
            case 'week':
                row.style.display = '';
                break;
                
            case 'all':
            default:
                row.style.display = '';
                break;
        }
    });
    
    // Сохраняем выбранный фильтр
    localStorage.setItem('scheduleFilter', filter);
    
    // Показываем сообщение, если нет задач для отображения
    const visibleRows = Array.from(scheduleRows).filter(row => row.style.display !== 'none');
    const emptyMessage = document.querySelector('.schedule-empty-message');
    
    if (visibleRows.length === 0) {
        if (!emptyMessage) {
            const scheduleContainer = document.querySelector('.schedule-container');
            const newEmptyMessage = document.createElement('div');
            newEmptyMessage.className = 'schedule-empty-message';
            newEmptyMessage.innerHTML = `
                <i class="material-icons">event_busy</i>
                <p>Нет задач для отображения</p>
            `;
            scheduleContainer.appendChild(newEmptyMessage);
        }
    } else if (emptyMessage) {
        emptyMessage.remove();
    }
}

// Функция инициализации страницы работы с текстом
function initTextPage() {
    console.log('Инициализация страницы работы с текстом...');
    
    // Переключение между режимами
    const modeButtons = document.querySelectorAll('.mode-button');
    const sections = {
        'search': document.getElementById('searchSection'),
        'summary': document.getElementById('summarySection'),
        'notes': document.getElementById('notesSection')
    };
    
    modeButtons.forEach(button => {
        button.addEventListener('click', () => {
            const mode = button.getAttribute('data-mode');
            console.log('Переключение режима текста:', mode);
            
            // Убираем активный класс у всех кнопок
            modeButtons.forEach(btn => btn.classList.remove('active'));
            
            // Скрываем все секции
            Object.values(sections).forEach(section => {
                if (section) section.classList.add('hidden');
            });
            
            // Активируем нужную кнопку и секцию
            button.classList.add('active');
            if (sections[mode]) {
                sections[mode].classList.remove('hidden');
            }
            
            // Обновляем текущий режим
            state.textMode = mode;
            
            // Если выбран режим записок, загружаем их
            if (mode === 'notes') {
                loadNotes();
            }
        });
    });
    
    // Инициализация функций для работы с записками
    initNotesFeature();
    
    // Инициализация функций для поиска
    initSearchFeature();
    
    // Инициализация функций для суммаризации
    initSummaryFeature();
}

// Инициализация функций для работы с записками
function initNotesFeature() {
    console.log('Инициализация функций для работы с записками...');
    
    // Загружаем записки из localStorage
    loadNotes();
    
    // Обработчик кнопки добавления записки
    const addNoteButton = document.getElementById('addNoteButton');
    if (addNoteButton) {
        addNoteButton.addEventListener('click', () => {
            openNoteModal();
        });
    }
    
    // Обработчики для модального окна
    const noteModal = document.getElementById('noteModal');
    if (noteModal) {
        const closeModalButton = noteModal.querySelector('.note-modal-close');
        const cancelButton = document.getElementById('cancelNoteButton');
        const saveButton = document.getElementById('saveNoteButton');
        
        if (closeModalButton) {
            closeModalButton.addEventListener('click', closeNoteModal);
        }
        
        if (cancelButton) {
            cancelButton.addEventListener('click', closeNoteModal);
        }
        
        if (saveButton) {
            saveButton.addEventListener('click', () => {
                const noteId = document.getElementById('noteId').value;
                const title = document.getElementById('noteTitle').value.trim();
                const content = document.getElementById('noteContent').value.trim();
                const imageInput = document.getElementById('noteImage');
                
                if (!title || !content) {
                    showNotification('Пожалуйста, заполните все обязательные поля', 'error');
                    return;
                }
                
                // Проверяем, есть ли изображение
                if (imageInput && imageInput.files && imageInput.files[0]) {
                    const reader = new FileReader();
                    
                    reader.onload = function(e) {
                        const imageData = e.target.result;
                        
                        if (noteId) {
                            // Редактирование существующей записки
                            editNote(noteId, title, content, imageData);
                        } else {
                            // Добавление новой записки
                            addNote(title, content, imageData);
                        }
                        
                        closeNoteModal();
                    };
                    
                    reader.readAsDataURL(imageInput.files[0]);
                } else {
                    // Нет изображения
                    if (noteId) {
                        // Редактирование существующей записки
                        // Сохраняем существующее изображение, если оно есть
                        const existingNote = state.notes.find(note => note.id === noteId);
                        const existingImage = existingNote ? existingNote.image : null;
                        
                        editNote(noteId, title, content, existingImage);
                    } else {
                        // Добавление новой записки без изображения
                        addNote(title, content);
                    }
                    
                    closeNoteModal();
                }
            });
        }
        
        // Обработчик предпросмотра изображения
        const imageInput = document.getElementById('noteImage');
        if (imageInput) {
            imageInput.addEventListener('change', function() {
                const imagePreview = document.getElementById('imagePreview');
                
                if (this.files && this.files[0]) {
                    const reader = new FileReader();
                    
                    reader.onload = function(e) {
                        imagePreview.innerHTML = `<img src="${e.target.result}" alt="Предпросмотр">`;
                    };
                    
                    reader.readAsDataURL(this.files[0]);
                } else {
                    imagePreview.innerHTML = '';
                }
            });
        }
    }
    
    // Обработчики для кнопок редактирования и удаления
    document.addEventListener('click', (e) => {
        if (e.target.closest('.edit-note')) {
            const noteCard = e.target.closest('.note-card');
            if (noteCard) {
                const noteId = noteCard.getAttribute('data-id');
                const title = noteCard.querySelector('h4').textContent;
                const content = noteCard.querySelector('.note-content').innerHTML;
                const imageElement = noteCard.querySelector('.note-image img');
                const imageData = imageElement ? imageElement.src : null;
                
                openNoteModal(noteId, title, content, imageData);
            }
        } else if (e.target.closest('.delete-note')) {
            const noteCard = e.target.closest('.note-card');
            if (noteCard) {
                const noteId = noteCard.getAttribute('data-id');
                
                if (confirm('Вы уверены, что хотите удалить эту запись?')) {
                    deleteNote(noteId);
                }
            }
        }
    });
}

// Инициализация функций для поиска
function initSearchFeature() {
    console.log('Инициализация функций для поиска...');
    
    const searchButton = document.querySelector('#searchSection .button');
    const searchQuery = document.getElementById('searchQuery');
    const textInput = document.getElementById('textInput');
    const resultsContainer = document.getElementById('resultsContainer');
    
    if (searchButton && searchQuery && textInput && resultsContainer) {
        searchButton.addEventListener('click', () => {
            const query = searchQuery.value.trim();
            const text = textInput.value.trim();
            
            if (!query) {
                showNotification('Введите поисковый запрос', 'error');
                return;
            }
            
            if (!text) {
                showNotification('Введите текст для поиска', 'error');
                return;
            }
            
            // Показываем индикатор загрузки
            resultsContainer.innerHTML = '<div class="loading-indicator"><span></span><span></span><span></span></div>';
            
            // Отправляем запрос на сервер
            fetch('/api/search', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ text, query })
            })
            .then(response => {
                if (!response.ok) {
                    throw new Error('Ошибка сети: ' + response.status);
                }
                return response.json();
            })
            .then(data => {
                console.log('Результаты поиска:', data);
                
                if (data.error) {
                    showNotification(data.error, 'error');
                    resultsContainer.innerHTML = `<div class="error-message">${data.error}</div>`;
                    return;
                }
                
                if (data.results && data.results.length > 0) {
                    // Отображаем результаты поиска
                    const resultsHtml = data.results.map(result => `
                        <div class="search-result">
                            <div class="result-content">${result.highlight}</div>
                        </div>
                    `).join('');
                    
                    resultsContainer.innerHTML = `
                        <div class="results-header">
                            <h4>Найдено совпадений: ${data.count}</h4>
                        </div>
                        <div class="results-list">
                            ${resultsHtml}
                        </div>
                    `;
                    
                    // Показываем кнопку копирования
                    const copyButton = document.getElementById('copyResults');
                    if (copyButton) {
                        copyButton.style.display = 'flex';
                    }
                } else {
                    resultsContainer.innerHTML = '<div class="empty-results">По вашему запросу ничего не найдено</div>';
                }
            })
            .catch(error => {
                console.error('Ошибка при поиске:', error);
                resultsContainer.innerHTML = `<div class="error-message">Произошла ошибка при поиске: ${error.message}</div>`;
                showNotification('Ошибка при поиске', 'error');
            });
        });
        
        // Поиск по нажатию Enter
        searchQuery.addEventListener('keydown', e => {
            if (e.key === 'Enter') {
                searchButton.click();
            }
        });
    }
}

// Инициализация функций для суммаризации
function initSummaryFeature() {
    console.log('Инициализация функций для суммаризации...');
    
    const summarizeButton = document.querySelector('#summarySection .button');
    const textInput = document.getElementById('textInput');
    const resultsContainer = document.getElementById('resultsContainer');
    
    if (summarizeButton && textInput && resultsContainer) {
        summarizeButton.addEventListener('click', () => {
            const text = textInput.value.trim();
            
            if (!text) {
                showNotification('Введите текст для суммаризации', 'error');
                return;
            }
            
            // Показываем индикатор загрузки
            resultsContainer.innerHTML = '<div class="loading-indicator"><span></span><span></span><span></span></div>';
            
            // Отправляем запрос на сервер
            fetch('/api/summarize', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ text })
            })
            .then(response => {
                if (!response.ok) {
                    throw new Error('Ошибка сети: ' + response.status);
                }
                return response.json();
            })
            .then(data => {
                console.log('Результат суммаризации:', data);
                
                if (data.error) {
                    showNotification(data.error, 'error');
                    resultsContainer.innerHTML = `<div class="error-message">${data.error}</div>`;
                    return;
                }
                
                if (data.summary) {
                    // Отображаем результат суммаризации
                    resultsContainer.innerHTML = `
                        <div class="summary-result">
                            <h4>Краткое содержание:</h4>
                            <div class="summary-content">${data.summary}</div>
                        </div>
                    `;
                    
                    // Показываем кнопку копирования
                    const copyButton = document.getElementById('copyResults');
                    if (copyButton) {
                        copyButton.style.display = 'flex';
                    }
                } else {
                    resultsContainer.innerHTML = '<div class="empty-results">Не удалось создать краткое содержание</div>';
                }
            })
            .catch(error => {
                console.error('Ошибка при суммаризации:', error);
                resultsContainer.innerHTML = `<div class="error-message">Произошла ошибка при суммаризации: ${error.message}</div>`;
                showNotification('Ошибка при суммаризации', 'error');
            });
        });
    }
    
    // Добавляем обработчик для кнопки копирования результатов
    const copyButton = document.getElementById('copyResults');
    if (copyButton) {
        copyButton.addEventListener('click', () => {
            const resultsContent = resultsContainer.textContent;
            
            if (resultsContent) {
                navigator.clipboard.writeText(resultsContent)
                    .then(() => {
                        showNotification('Результаты скопированы в буфер обмена', 'success');
                    })
                    .catch(err => {
                        console.error('Ошибка при копировании:', err);
                        showNotification('Не удалось скопировать результаты', 'error');
                    });
            }
        });
    }
}

// Загрузка записок из localStorage
function loadNotes() {
    console.log('Загрузка записок...');
    
    // Получаем записки из localStorage
    const savedNotes = localStorage.getItem('arisNotes');
    if (savedNotes) {
        try {
            state.notes = JSON.parse(savedNotes);
        } catch (e) {
            console.error('Ошибка при загрузке записок:', e);
            state.notes = [];
        }
    } else {
        // Если записок нет, создаем предустановленные
        state.notes = [
            {
                id: '1',
                title: 'Формулы сокращенного умножения',
                content: '<p>(a + b)² = a² + 2ab + b²</p><p>(a - b)² = a² - 2ab + b²</p><p>(a + b)(a - b) = a² - b²</p><p>(a + b)³ = a³ + 3a²b + 3ab² + b³</p><p>(a - b)³ = a³ - 3a²b + 3ab² - b³</p>',
                type: 'math-formula'
            },
            {
                id: '2',
                title: 'Теоремы',
                content: '<p><strong>Теорема Пифагора:</strong> В прямоугольном треугольнике квадрат гипотенузы равен сумме квадратов катетов: a² + b² = c²</p><p><strong>Теорема Виета:</strong> Для квадратного уравнения ax² + bx + c = 0 с корнями x₁ и x₂: x₁ + x₂ = -b/a, x₁·x₂ = c/a</p>',
                type: 'math-formula'
            }
        ];
        saveNotes();
    }
    
    // Отображаем записки
    renderNotes();
}

// Сохранение записок в localStorage
function saveNotes() {
    console.log('Сохранение записок...');
    
    try {
        localStorage.setItem('arisNotes', JSON.stringify(state.notes));
    } catch (e) {
        console.error('Ошибка при сохранении записок:', e);
    }
}

// Отображение записок
function renderNotes() {
    console.log('Отображение записок...');
    
    const notesList = document.querySelector('.notes-list');
    if (!notesList) {
        console.error('Контейнер для записок не найден!');
        return;
    }
    
    // Очищаем список
    notesList.innerHTML = '';
    
    // Добавляем записки
    state.notes.forEach(note => {
        const noteCard = document.createElement('div');
        noteCard.className = `note-card ${note.type || ''}`;
        noteCard.setAttribute('data-id', note.id);
        
        let imageHtml = '';
        if (note.image) {
            imageHtml = `
                <div class="note-image">
                    <img src="${note.image}" alt="${note.title}">
                </div>
            `;
        }
        
        noteCard.innerHTML = `
            <div class="note-header">
                <h4>${note.title}</h4>
                <div class="note-actions">
                    <button class="edit-note" title="Редактировать">
                        <i class="material-icons">edit</i>
                    </button>
                    <button class="delete-note" title="Удалить">
                        <i class="material-icons">delete</i>
                    </button>
                </div>
            </div>
            <div class="note-content">
                ${note.content}
            </div>
            ${imageHtml}
        `;
        
        notesList.appendChild(noteCard);
    });
}

// Открытие модального окна для добавления/редактирования записки
function openNoteModal(id = '', title = '', content = '', imageData = null) {
    console.log('Открытие модального окна для записки:', id);
    
    const noteModal = document.getElementById('noteModal');
    if (!noteModal) {
        console.error('Модальное окно для записок не найдено!');
        return;
    }
    
    const modalTitle = document.getElementById('noteModalTitle');
    const noteIdInput = document.getElementById('noteId');
    const noteTitleInput = document.getElementById('noteTitle');
    const noteContentInput = document.getElementById('noteContent');
    const imagePreview = document.getElementById('imagePreview');
    
    // Устанавливаем значения полей
    if (noteIdInput) noteIdInput.value = id;
    if (noteTitleInput) noteTitleInput.value = title;
    if (noteContentInput) noteContentInput.value = content.replace(/<[^>]*>/g, ''); // Удаляем HTML-теги
    
    // Предпросмотр изображения, если оно есть
    if (imagePreview) {
        if (imageData) {
            imagePreview.innerHTML = `<img src="${imageData}" alt="Предпросмотр">`;
        } else {
            imagePreview.innerHTML = '';
        }
    }
    
    // Обновляем заголовок модального окна
    if (modalTitle) modalTitle.textContent = id ? 'Редактировать запись' : 'Добавить запись';
    
    // Показываем модальное окно
    noteModal.classList.add('active');
}

// Закрытие модального окна
function closeNoteModal() {
    console.log('Закрытие модального окна для записки');
    
    const noteModal = document.getElementById('noteModal');
    if (!noteModal) {
        console.error('Модальное окно для записок не найдено!');
        return;
    }
    
    const noteForm = document.getElementById('noteForm');
    const imagePreview = document.getElementById('imagePreview');
    
    if (noteForm) noteForm.reset();
    if (imagePreview) imagePreview.innerHTML = '';
    
    // Скрываем модальное окно
    noteModal.classList.remove('active');
}

// Добавление новой записки
function addNote(title, content, image = null) {
    console.log('Добавление новой записки:', title);
    
    // Создаем новую записку
    const newNote = {
        id: Date.now().toString(),
        title,
        content: formatNoteContent(content),
        type: 'user-note'
    };
    
    // Добавляем изображение, если оно есть
    if (image) {
        newNote.image = image;
    }
    
    // Добавляем в массив
    state.notes.push(newNote);
    
    // Сохраняем и обновляем отображение
    saveNotes();
    renderNotes();
    
    // Показываем уведомление
    showNotification('Запись успешно добавлена', 'success');
}

// Редактирование записки
function editNote(id, title, content, image = null) {
    console.log('Редактирование записки:', id);
    
    // Находим записку по id
    const noteIndex = state.notes.findIndex(note => note.id === id);
    if (noteIndex === -1) {
        console.error('Записка не найдена:', id);
        return;
    }
    
    // Обновляем данные
    state.notes[noteIndex].title = title;
    state.notes[noteIndex].content = formatNoteContent(content);
    
    // Обновляем изображение, если оно есть
    if (image) {
        state.notes[noteIndex].image = image;
    }
    
    // Сохраняем и обновляем отображение
    saveNotes();
    renderNotes();
    
    // Показываем уведомление
    showNotification('Запись успешно обновлена', 'success');
}

// Удаление записки
function deleteNote(id) {
    console.log('Удаление записки:', id);
    
    // Фильтруем массив, оставляя только записки с другими id
    state.notes = state.notes.filter(note => note.id !== id);
    
    // Сохраняем и обновляем отображение
    saveNotes();
    renderNotes();
    
    // Показываем уведомление
    showNotification('Запись успешно удалена', 'success');
}

// Форматирование содержимого записки
function formatNoteContent(content) {
    // Разбиваем текст на абзацы
    return content.split('\n').map(line => `<p>${line}</p>`).join('');
}

// Функция инициализации страницы настроек
function initSettingsPage() {
    console.log('Инициализация страницы настроек...');
    
    // Загружаем настройки из localStorage
    loadSettings();
    
    // Обработчики переключателей
    const toggles = document.querySelectorAll('.toggle-switch input');
    if (toggles.length > 0) {
        toggles.forEach(toggle => {
            toggle.addEventListener('change', function() {
                const setting = this.getAttribute('data-setting');
                const value = this.checked;
                
                console.log('Изменение настройки:', setting, value);
                
                // Сохраняем настройку
                if (setting && state.userSettings) {
                    state.userSettings[setting] = value;
                    saveSettings();
                    
                    // Применяем настройку сразу
                    if (setting === 'theme') {
                        applyTheme(value ? 'light' : 'dark');
                    }
                    
                    // Показываем уведомление
                    showNotification(`Настройка "${setting}" изменена`, 'info');
                }
            });
        });
    }
}

// Загрузка настроек
function loadSettings() {
    console.log('Загрузка настроек...');
    
    // Пытаемся загрузить из localStorage
    try {
        const savedSettings = localStorage.getItem('arisSettings');
        if (savedSettings) {
            state.userSettings = JSON.parse(savedSettings);
        }
    } catch (e) {
        console.error('Ошибка при загрузке настроек:', e);
    }
    
    // Применяем настройки
    applySettings();
}

// Сохранение настроек
function saveSettings() {
    console.log('Сохранение настроек...');
    
    try {
        localStorage.setItem('arisSettings', JSON.stringify(state.userSettings));
    } catch (e) {
        console.error('Ошибка при сохранении настроек:', e);
    }
}

// Применение настроек
function applySettings() {
    console.log('Применение настроек...');
    
    // Применяем тему
    if (state.userSettings.theme) {
        applyTheme(state.userSettings.theme);
    }
    
    // Обновляем переключатели
    const toggles = document.querySelectorAll('.toggle-switch input');
    if (toggles.length > 0) {
        toggles.forEach(toggle => {
            const setting = toggle.getAttribute('data-setting');
            if (setting && state.userSettings[setting] !== undefined) {
                toggle.checked = state.userSettings[setting];
            }
        });
    }
}

// Применение темы
function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
}

// Показ уведомления
function showNotification(message, type = 'info') {
    console.log(`Уведомление (${type}):`, message);
    
    // Удаляем предыдущие уведомления
    document.querySelectorAll('.notification').forEach(note => note.remove());
    
    // Создаем новое уведомление
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    
    document.body.appendChild(notification);
    
    // Удаляем уведомление через 3 секунды
    setTimeout(() => {
        notification.classList.add('hide');
        setTimeout(() => {
            notification.remove();
        }, 300);
    }, 3000);
}