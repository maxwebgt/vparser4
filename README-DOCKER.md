# 🚀 Docker Development for VDS Parser

Инструкции по развертыванию парсера на VDS через Docker с модулями прокси.

## 📦 Что исправлено

✅ **Добавлено копирование папки `modules/`** в Dockerfile  
✅ **Создан .dockerignore** для оптимизации сборки  
✅ **Добавлены скрипты развертывания** (.sh и .bat)  
✅ **Создан тест модулей** для диагностики  

## 🛠️ Быстрое развертывание

### На Linux/VDS:
```bash
./deploy.sh
```

### На Windows:
```cmd
deploy.bat
```

### Вручную:
```bash
# Остановка старых контейнеров
docker-compose down

# Сборка и запуск
docker-compose up --build
```

## 🧪 Тестирование модулей

```bash
# Локальное тестирование
node test-modules.js

# В Docker контейнере
docker exec -it playwright-parser node test-modules.js
```

## 📁 Структура файлов

```
/app/
├── playwright-parser.js      # Основной скрипт
├── modules/                  # 🔥 МОДУЛИ ПРОКСИ
│   ├── config.js            # Конфигурация API
│   ├── logger.js            # Логирование
│   └── proxyHandler.js      # Обработка прокси
├── package.json
└── test-modules.js          # Тест модулей
```

## 🔍 Диагностика

### Если модули не найдены:
1. Проверить что папка `modules/` существует
2. Проверить Dockerfile содержит `COPY modules/ ./modules/`
3. Запустить `node test-modules.js`

### Если прокси не работают:
1. Проверить API ключ в `modules/config.js`
2. Проверить сетевое соединение VDS
3. Посмотреть логи: `docker logs playwright-parser`

## 📊 Мониторинг

```bash
# Логи контейнера
docker logs -f playwright-parser

# Статус контейнера
docker ps

# Использование ресурсов
docker stats playwright-parser
```

## 🎯 Итог

Теперь парсер правильно загружает все модули и готов к работе на VDS с полной поддержкой прокси-ротации! 