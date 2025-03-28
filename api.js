class ArisAPI {
    constructor() {
        // Используем разные URL для разработки и продакшена
        this.baseUrl = window.location.hostname === 'localhost' 
            ? 'http://localhost:8000'
            : 'https://your-backend-domain.com';  // Замените на ваш домен
        this.ws = null;
        this.messageHandlers = new Set();
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
    }

    // Инициализация WebSocket соединения
    async connect() {
        return new Promise((resolve, reject) => {
            try {
                const wsUrl = this.baseUrl.replace(/^http/, 'ws') + '/ws';
                this.ws = new WebSocket(wsUrl);
                
                this.ws.onopen = () => {
                    console.log('WebSocket connected');
                    this.reconnectAttempts = 0;
                    resolve();
                };
                
                this.ws.onerror = (error) => {
                    console.error('WebSocket error:', error);
                    reject(error);
                };
                
                this.ws.onmessage = (event) => {
                    try {
                        const data = JSON.parse(event.data);
                        this.messageHandlers.forEach(handler => handler(data));
                    } catch (error) {
                        console.error('Error parsing message:', error);
                    }
                };
                
                this.ws.onclose = () => {
                    console.log('WebSocket closed');
                    if (this.reconnectAttempts < this.maxReconnectAttempts) {
                        this.reconnectAttempts++;
                        const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
                        setTimeout(() => this.connect(), delay);
                    }
                };
            } catch (error) {
                console.error('Connection error:', error);
                reject(error);
            }
        });
    }

    // Отправка сообщения
    async sendMessage(text) {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            await this.connect();
        }
        
        this.ws.send(JSON.stringify({
            type: 'message',
            content: text,
            timestamp: new Date().toISOString()
        }));
    }

    // Отправка голосового сообщения
    async sendVoiceMessage(audioBlob) {
        const base64Audio = await this.blobToBase64(audioBlob);
        
        this.ws.send(JSON.stringify({
            type: 'voice',
            audio: base64Audio,
            timestamp: new Date().toISOString()
        }));
    }

    // Отправка команды
    async sendCommand(command) {
        this.ws.send(JSON.stringify({
            type: 'command',
            command: command
        }));
    }

    // Получение настроек пользователя
    async getUserSettings(userId) {
        const response = await fetch(`${this.baseUrl}/api/settings/${userId}`);
        return await response.json();
    }

    // Обновление настроек пользователя
    async updateUserSettings(userId, settings) {
        const response = await fetch(`${this.baseUrl}/api/settings/${userId}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(settings)
        });
        return await response.json();
    }

    // Получение истории чата
    async getChatHistory(userId) {
        const response = await fetch(`${this.baseUrl}/api/chat-history/${userId}`);
        return await response.json();
    }

    // Очистка истории чата
    async clearChatHistory(userId) {
        const response = await fetch(`${this.baseUrl}/api/chat-history/${userId}/clear`, {
            method: 'POST'
        });
        return await response.json();
    }

    // Получение доступных функций
    async getFeatures() {
        const response = await fetch(`${this.baseUrl}/api/features`);
        return await response.json();
    }

    // Добавление обработчика сообщений
    addMessageHandler(handler) {
        this.messageHandlers.add(handler);
    }

    // Удаление обработчика сообщений
    removeMessageHandler(handler) {
        this.messageHandlers.delete(handler);
    }

    // Конвертация Blob в Base64
    async blobToBase64(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result.split(',')[1]);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    }

    // Закрытие соединения
    disconnect() {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
    }
}
