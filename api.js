// API конфигурация
const API_BASE_URL = 'http://localhost:8000/api';

// Общая функция для API запросов
async function apiRequest(endpoint, options = {}) {
    try {
        const response = await fetch(`${API_BASE_URL}${endpoint}`, {
            ...options,
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            }
        });
        
        const data = await response.json();
        
        if (!data.success) {
            throw new Error(data.error || 'API Error');
        }
        
        return data;
    } catch (error) {
        console.error('API Error:', error);
        throw error;
    }
}

// API для чата
export const chatApi = {
    sendMessage: async (text, type = 'text') => {
        return apiRequest('/chat/send', {
            method: 'POST',
            body: JSON.stringify({ text, type })
        });
    }
};

// API для работы с текстом
export const textApi = {
    summarize: async (text) => {
        return apiRequest('/text/summarize', {
            method: 'POST',
            body: JSON.stringify({ text })
        });
    },
    
    search: async (text, query) => {
        return apiRequest('/text/search', {
            method: 'POST',
            body: JSON.stringify({ text, query })
        });
    },
    
    uploadFile: async (file) => {
        const formData = new FormData();
        formData.append('file', file);
        
        return apiRequest('/text/upload', {
            method: 'POST',
            headers: {},
            body: formData
        });
    }
};

// API для работы с расписанием
export const scheduleApi = {
    getAll: async () => {
        return apiRequest('/schedule');
    },
    
    add: async (item) => {
        return apiRequest('/schedule', {
            method: 'POST',
            body: JSON.stringify(item)
        });
    },
    
    update: async (id, item) => {
        return apiRequest(`/schedule/${id}`, {
            method: 'PUT',
            body: JSON.stringify(item)
        });
    },
    
    delete: async (id) => {
        return apiRequest(`/schedule/${id}`, {
            method: 'DELETE'
        });
    },
    
    query: async (query) => {
        const formData = new FormData();
        formData.append('query', query);
        
        return apiRequest('/schedule/query', {
            method: 'POST',
            headers: {},
            body: formData
        });
    }
};

// Обработка ошибок
export function handleApiError(error) {
    console.error('API Error:', error);
    
    // Отправляем ошибку в Telegram
    const tg = window.Telegram.WebApp;
    if (tg) {
        tg.showAlert(`Error: ${error.message}`);
    }
    
    return {
        success: false,
        error: error.message
    };
}

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
