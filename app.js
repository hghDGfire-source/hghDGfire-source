let tg = window.Telegram.WebApp;
tg.expand();

// Инициализация темы
document.body.removeAttribute('data-theme'); // Всегда используем темную тему

// Элементы интерфейса
const chatContainer = document.getElementById('chatContainer');
const messageInput = document.getElementById('messageInput');
const sendButton = document.getElementById('sendButton');
const pagesWrapper = document.querySelector('.pages-wrapper');
const navItems = document.querySelectorAll('.nav-item');

// Настройки
const settings = {
    start: false,
    help: false,
    sound: false,
    notifications: false
};

// Переменные для свайпов
let touchStartX = 0;
let touchEndX = 0;
let currentPage = 'chat';

// Обработка свайпов
document.addEventListener('touchstart', e => {
    touchStartX = e.touches[0].clientX;
});

document.addEventListener('touchmove', e => {
    if (touchStartX) {
        const touch = e.touches[0];
        const diff = touchStartX - touch.clientX;
        
        if ((currentPage === 'chat' && diff < 0) || 
            (currentPage === 'settings' && diff > 0)) {
            return;
        }
        
        const translateX = -diff / 2;
        pagesWrapper.style.transform = `translateX(${currentPage === 'chat' ? translateX : -50 + translateX}%)`;
    }
});

document.addEventListener('touchend', e => {
    touchEndX = e.changedTouches[0].clientX;
    const diff = touchStartX - touchEndX;
    
    if (Math.abs(diff) > 100) {
        if (diff > 0 && currentPage === 'chat') {
            navigateToPage('settings');
        } else if (diff < 0 && currentPage === 'settings') {
            navigateToPage('chat');
        }
    } else {
        pagesWrapper.style.transform = currentPage === 'chat' ? 'translateX(0)' : 'translateX(-50%)';
    }
    
    touchStartX = null;
});

// Навигация между страницами
function navigateToPage(page) {
    currentPage = page;
    pagesWrapper.style.transform = page === 'chat' ? 'translateX(0)' : 'translateX(-50%)';
    
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
    
    // Выполняем соответствующее действие
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
            // Включение/выключение уведомлений
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
        
        // Воспроизводим звук отправки, если включено
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
    
    // Прокрутка к последнему сообщению
    chatContainer.scrollTop = chatContainer.scrollHeight;
    
    // Воспроизводим звук получения сообщения, если включено
    if (!isUser && settings.sound) {
        playSound('receive');
    }
    
    // Показываем уведомление, если включено
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
