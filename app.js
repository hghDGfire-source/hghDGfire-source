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
const infoPage = document.getElementById('infoPage');
const inputContainer = document.getElementById('inputContainer');
const navItems = document.querySelectorAll('.nav-item');

// Настройки
const settings = {
    start: false,
    help: false,
    sound: false,
    notifications: false,
    voice: false
};

// Переменные для записи голоса
let mediaRecorder = null;
let audioChunks = [];
let isRecording = false;

// Инициализация распознавания речи
const recognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
recognition.continuous = true;
recognition.lang = 'ru-RU';

recognition.onresult = (event) => {
    const text = event.results[event.results.length - 1][0].transcript;
    messageInput.value = text;
    sendMessage();
};

// Очистка чата
function clearChat() {
    if (confirm('Вы уверены, что хотите очистить чат?')) {
        chatContainer.innerHTML = '';
        tg.sendData(JSON.stringify({
            type: 'command',
            command: '/clear'
        }));
    }
}

// Запись голоса
async function toggleVoiceRecording() {
    if (!isRecording) {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaRecorder = new MediaRecorder(stream);
            audioChunks = [];

            mediaRecorder.ondataavailable = (event) => {
                audioChunks.push(event.data);
            };

            mediaRecorder.onstop = async () => {
                const audioBlob = new Blob(audioChunks, { type: 'audio/ogg; codecs=opus' });
                const reader = new FileReader();
                reader.readAsDataURL(audioBlob);
                reader.onloadend = () => {
                    const base64Audio = reader.result.split(',')[1];
                    tg.sendData(JSON.stringify({
                        type: 'voice',
                        audio: base64Audio
                    }));
                };
            };

            mediaRecorder.start();
            isRecording = true;
            micButton.classList.add('recording');
        } catch (err) {
            console.error('Error accessing microphone:', err);
            alert('Не удалось получить доступ к микрофону');
        }
    } else {
        mediaRecorder.stop();
        isRecording = false;
        micButton.classList.remove('recording');
    }
}

// Навигация между страницами
function navigateToPage(page) {
    const pages = {
        info: document.getElementById('infoPage'),
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
        case 'voice':
            if (value) {
                // Запрашиваем разрешение на использование микрофона
                navigator.mediaDevices.getUserMedia({ audio: true })
                    .then(() => {
                        micButton.style.display = 'flex';
                    })
                    .catch(() => {
                        alert('Не удалось получить доступ к микрофону');
                        settings.voice = false;
                    });
            } else {
                micButton.style.display = 'none';
            }
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
    
    // Сохраняем настройки
    tg.sendData(JSON.stringify({
        type: 'settings',
        settings: settings
    }));
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
        
        // Скрываем клавиатуру
        messageInput.blur();
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
    
    if (!isUser) {
        if (settings.sound) {
            playSound('receive');
        }
        
        if (settings.notifications && document.hidden) {
            showNotification(text);
        }
        
        if (settings.voice) {
            // Запрос на озвучивание через бота
            tg.sendData(JSON.stringify({
                type: 'tts',
                text: text
            }));
        }
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

// Обработка клавиши Enter
messageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
});

// Обработка кнопки "Отправить" на мобильной клавиатуре
messageInput.addEventListener('keyup', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
    }
});

// Инициализация
document.addEventListener('DOMContentLoaded', () => {
    // Добавляем кнопку микрофона
    const micButton = document.createElement('button');
    micButton.className = 'mic-button';
    micButton.innerHTML = '<i class="material-icons">mic</i>';
    micButton.style.display = 'none';
    micButton.onclick = toggleVoiceRecording;
    
    inputContainer.insertBefore(micButton, sendButton);
});
