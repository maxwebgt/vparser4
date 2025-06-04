# 🌐 Система Прокси для Playwright Parser

## Что создано

### 📁 Структура файлов
```
modules/
├── proxyHandler.js  - Основной модуль для работы с прокси
└── config.js       - Конфигурационный файл

test-proxy.js                - Полный тест прокси с WebShare API
test-proxy-simple.js         - Простой тест без API (публичные прокси)  
playwright-parser-with-proxy.js - Основной парсер с поддержкой прокси
```

### 🔧 Основные возможности

#### 1. ProxyHandler класс (`modules/proxyHandler.js`)
- ✅ Загрузка прокси из WebShare.io API
- ✅ Случайная ротация прокси
- ✅ Отслеживание неработающих прокси
- ✅ Статистика использования
- ✅ Автоматическое определение защиты (HTTP 403)

#### 2. Основные методы:
```javascript
const proxyHandler = new ProxyHandler();

// Загрузить прокси из WebShare API
await proxyHandler.fetchProxies();

// Получить следующий рабочий прокси
const proxy = proxyHandler.getNextProxy();

// Отметить прокси как неработающий
proxyHandler.markProxyFailed(proxy, 'причина');

// Отметить прокси как рабочий
proxyHandler.markProxySuccess(proxy);

// Зарегистрировать попытку защиты (HTTP 403)
const needProxy = proxyHandler.registerProtectionHit();

// Показать статистику
proxyHandler.printStats();
```

#### 3. Интеграция с Playwright
```javascript
const launchOptions = {
  headless: true,
  proxy: {
    server: `http://${proxy.host}:${proxy.port}`,
    username: proxy.username,
    password: proxy.password
  }
};

const browser = await chromium.launch(launchOptions);
```

## 🧪 Тестирование

### Простой тест прокси:
```bash
node test-proxy-simple.js
```

### Полный тест с WebShare API:
```bash
node test-proxy.js
```

### Парсер с прокси:
```bash
node playwright-parser-with-proxy.js
```

## 📊 Что показали тесты

### ✅ Успешно работает:
1. **Загрузка прокси**: 25 прокси из WebShare API
2. **Детекция защиты**: HTTP 403 правильно определяется
3. **Автопереключение**: После 3 срабатываний защиты включается прокси
4. **Ротация**: Случайный выбор из доступных прокси
5. **Статистика**: Отслеживание работающих/неработающих прокси

### 🎯 Логика работы:
1. Начинает парсинг **без прокси** (прямое подключение)
2. При получении **HTTP 403** - регистрирует "удар защиты"
3. После **3 ударов** - автоматически переключается на прокси
4. При проблемах с прокси - переключается на следующий
5. Ведет статистику успехов/неудач

## 🔑 Конфигурация

API ключ WebShare в `modules/proxyHandler.js`:
```javascript
const API_KEY = 'qf8qedpyxethbo8qjdhiol5r4js7lm8jmcs59pkf';
```

## 🚀 Готово к использованию

Система полностью готова и протестирована:
- ✅ Модульная архитектура  
- ✅ Простая интеграция
- ✅ Автоматическое управление
- ✅ Подробная статистика
- ✅ Обработка ошибок

Можно использовать `playwright-parser-with-proxy.js` как базу для дальнейшей разработки парсеров с автоматической поддержкой прокси. 