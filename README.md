# Aris AI - Telegram Mini App

Умный AI-ассистент с продвинутыми возможностями общения и помощи.

## Функции

- Умный диалог
- Генерация мыслей
- Голосовое общение
- Управление временем
- Поиск и суммаризация текста
- Настройка уведомлений
- Персонализированные настройки

## Установка

1. Клонируйте репозиторий:
```bash
git clone https://github.com/your-username/aris-ai.git
cd aris-ai
```

2. Установите зависимости:
```bash
cd backend
npm install
```

3. Создайте файл .env в папке backend и заполните его:
```env
PORT=3000
MONGODB_URI=mongodb://localhost:27017/aris-ai
TELEGRAM_BOT_TOKEN=your_bot_token_here
JWT_SECRET=your_jwt_secret_here
```

4. Запустите MongoDB:
```bash
mongod
```

5. Запустите сервер:
```bash
npm run dev
```

## Разработка

- Frontend: HTML, CSS, JavaScript
- Backend: Node.js, Express.js
- База данных: MongoDB
- API: Telegram Bot API

## Деплой

Приложение автоматически деплоится при пуше в ветку main через GitHub Actions.

## Лицензия

MIT 