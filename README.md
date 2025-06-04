# Парсер наличия товаров

Простой Docker проект для парсинга наличия товаров с сайта vseinstrumenti.ru

## 🔄 Миграция с Puppeteer на Playwright

Проект содержит две версии парсера:

- **`optimized-warmup.js`** - оригинальная версия с Puppeteer
- **`playwright-parser.js`** - новая версия с Playwright (по умолчанию)

## Запуск

```bash
# Запуск Playwright версии (по умолчанию)
docker-compose up --build

# Локальный запуск Playwright версии
npm install
npm start

# Локальный запуск Puppeteer версии
npm run puppeteer
```

## Преимущества Playwright

✅ **Более быстрая установка** - официальный Docker образ с предустановленными браузерами  
✅ **Лучшая стабильность** - меньше проблем с зависимостями  
✅ **Современный API** - более удобные методы работы  
✅ **Меньший размер образа** - оптимизированный Docker образ  

## Что происходит

1. Скрипт запускается один раз
2. Парсит наличие конкретного товара
3. Выводит результат в консоль
4. Контейнер завершается

## Структура

- `playwright-parser.js` - **новая версия** с Playwright
- `optimized-warmup.js` - оригинальная версия с Puppeteer  
- `Dockerfile` - конфигурация Docker образа для Playwright
- `docker-compose.yml` - композиция для запуска
- `package.json` - зависимости Node.js 