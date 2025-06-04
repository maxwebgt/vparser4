# Используем официальный образ Playwright
FROM mcr.microsoft.com/playwright:v1.52.0-jammy

# Создаем рабочую директорию
WORKDIR /app

# Копируем файлы зависимостей
COPY package*.json ./

# Устанавливаем зависимости
RUN npm install

# Копируем скрипты
COPY playwright-parser.js ./
COPY optimized-warmup.js ./

# Создаем пользователя для безопасности
RUN groupadd -r playwright && useradd -r -g playwright -G audio,video playwright \
    && mkdir -p /home/playwright/Downloads \
    && chown -R playwright:playwright /home/playwright \
    && chown -R playwright:playwright /app

# Переключаемся на пользователя
USER playwright

# Запускаем Playwright версию скрипта
CMD ["npm", "start"] 