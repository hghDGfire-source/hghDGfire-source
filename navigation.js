// Файл для управления навигацией
console.log('Загрузка модуля навигации...');

// Ждем полной загрузки DOM
document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM загружен, инициализация навигации...');
    initNavigation();
});

// Инициализация навигации
function initNavigation() {
    // Находим все элементы нижней навигации
    const navItems = document.querySelectorAll('.nav-item');
    console.log('Найдено элементов навигации:', navItems.length);
    
    // Добавляем обработчики событий для каждого элемента
    navItems.forEach(function(item) {
        item.addEventListener('click', function(e) {
            e.preventDefault();
            const pageName = this.getAttribute('data-page');
            console.log('Клик по навигации:', pageName);
            switchToPage(pageName);
        });
    });
    
    // Инициализация кнопки меню
    const menuButton = document.getElementById('menuButton');
    if (menuButton) {
        menuButton.addEventListener('click', function() {
            toggleSidebar();
        });
    }
}

// Переключение на указанную страницу
function switchToPage(pageName) {
    console.log('Переключение на страницу:', pageName);
    
    // Скрываем все страницы
    const pages = document.querySelectorAll('.page');
    pages.forEach(function(page) {
        page.classList.remove('active');
    });
    
    // Снимаем активное состояние со всех элементов навигации
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(function(item) {
        item.classList.remove('active');
    });
    
    // Активируем нужную страницу
    const pageId = pageName + 'Page';
    const targetPage = document.getElementById(pageId);
    if (targetPage) {
        targetPage.classList.add('active');
        console.log('Страница активирована:', pageId);
    } else {
        console.error('Страница не найдена:', pageId);
    }
    
    // Активируем соответствующий элемент навигации
    const targetNavItem = document.querySelector('.nav-item[data-page="' + pageName + '"]');
    if (targetNavItem) {
        targetNavItem.classList.add('active');
        console.log('Навигация активирована:', pageName);
    } else {
        console.error('Элемент навигации не найден:', pageName);
    }
    
    // Закрываем боковое меню на мобильных устройствах
    const sidebar = document.getElementById('chatSidebar');
    if (sidebar && sidebar.classList.contains('open')) {
        sidebar.classList.remove('open');
    }
}

// Переключение бокового меню
function toggleSidebar() {
    const sidebar = document.getElementById('chatSidebar');
    if (sidebar) {
        sidebar.classList.toggle('open');
        console.log('Переключение состояния бокового меню');
    }
}
