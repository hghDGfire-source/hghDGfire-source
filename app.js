let tg = window.Telegram.WebApp;
tg.expand();

// Инициализация темы
document.body.removeAttribute('data-theme'); // Всегда используем темную тему

// Элементы интерфейса
const chatContainer = document.getElementById('chatContainer');
const messageInput = document.getElementById('messageInput');
const sendButton = document.getElementById('sendButton');
const chatPage = document.getElementById('chatPage');
const settingsPage = document.getElementById('settingsPage');
const inputContainer = document.getElementById('inputContainer');
const navItems = document.querySelectorAll('.nav-item');

// Настройки
const settings = {
    start: false,
    help: false,
    sound: false,
    notifications: false
};

// Навигация между страницами
function navigateToPage(page) {
    if (page === 'chat') {
        chatPage.style.display = 'block';
        settingsPage.style.display = 'none';
        inputContainer.style.display = 'flex';
    } else {
        chatPage.style.display = 'none';
        settingsPage.style.display = 'block';
        inputContainer.style.display = 'none';
    }
    
    // Обновляем активную кнопку
    navItems.forEach(item => {
        if (item.dataset.page === page) {
            item.classList.add('active');
        } else {
            item.classList.remove('active');
        }
    });
}

// Обработчики нажатий на кнопки навигации
navItems.forEach(item => {
    item.addEventListener('click', (e) => {
        e.preventDefault();
        navigateToPage(item.dataset.page);
    });
});

// Обработка переключателей
function handleToggle(setting, value) {
    settings[setting] = value;
    
    switch(setting) {
        case 'start':
            if (value) handleCommand('/start');
            break;
        case 'help':
            if (value) handleCommand('/help');
            break;
        case 'sound':
            // Включение/выключение звуков
            break;
        case 'notifications':
            if (value) {
                Notification.requestPermission();
            }
            break;
    }
}

// Автоматическая регулировка высоты текстового поля
messageInput.addEventListener('input', function() {
    this.style.height = 'auto';
    this.style.height = (this.scrollHeight) + 'px';
});

// Отправка сообщения
function sendMessage() {
    const text = messageInput.value.trim();
    if (text) {
        addMessage(text, true);
        
        if (settings.sound) {
            playSound('send');
        }
        
        tg.sendData(JSON.stringify({
            type: 'message',
            text: text
        }));
        
        messageInput.value = '';
        messageInput.style.height = 'auto';
    }
}

// Обработка команд
function handleCommand(command) {
    tg.sendData(JSON.stringify({
        type: 'command',
        command: command
    }));
}

// Добавление сообщения в чат
function addMessage(text, isUser = false) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${isUser ? 'user' : 'bot'}`;
    
    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';
    contentDiv.textContent = text;
    
    messageDiv.appendChild(contentDiv);
    chatContainer.appendChild(messageDiv);
    
    chatContainer.scrollTop = chatContainer.scrollHeight;
    
    if (!isUser && settings.sound) {
        playSound('receive');
    }
    
    if (!isUser && settings.notifications && document.hidden) {
        showNotification(text);
    }
}

// Воспроизведение звуков
function playSound(type) {
    // Здесь можно добавить воспроизведение звуков
}

// Показ уведомлений
function showNotification(text) {
    if (Notification.permission === 'granted') {
        new Notification('Новое сообщение', {
            body: text,
            icon: '/icon.png'
        });
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
