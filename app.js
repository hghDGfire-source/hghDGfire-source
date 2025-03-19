let tg = window.Telegram.WebApp;
tg.expand();

// Инициализация темы
if (tg.colorScheme === 'dark') {
    document.body.removeAttribute('data-theme');
} else {
    document.body.setAttribute('data-theme', 'light');
}

const chatContainer = document.getElementById('chatContainer');
const messageInput = document.getElementById('messageInput');
const sendButton = document.getElementById('sendButton');

// Автоматическая регулировка высоты текстового поля
messageInput.addEventListener('input', function() {
    this.style.height = 'auto';
    this.style.height = (this.scrollHeight) + 'px';
});

// Отправка сообщения
function sendMessage() {
    const text = messageInput.value.trim();
    if (text) {
        // Добавляем сообщение пользователя в чат
        addMessage(text, true);
        
        // Отправляем данные в Telegram
        tg.sendData(JSON.stringify({
            type: 'message',
            text: text
        }));
        
        // Очищаем поле ввода
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
}

// Переключение темы
function toggleTheme() {
    if (document.body.hasAttribute('data-theme')) {
        document.body.removeAttribute('data-theme');
    } else {
        document.body.setAttribute('data-theme', 'light');
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

// Получение сообщений от бота
window.addEventListener('message', (event) => {
    if (event.data.type === 'botMessage') {
        addMessage(event.data.text, false);
    }
});
