#!/bin/bash

# Скрипт для развертывания обновленного парсера на VDS

echo "🚀 DEPLOYING UPDATED PARSER WITH PROXY MODULES..."

# Остановка и удаление старых контейнеров
echo "🛑 Stopping old containers..."
docker-compose down

# Удаление старых образов (опционально)
echo "🗑️ Removing old images..."
docker image prune -f

# Сборка и запуск с новыми модулями
echo "🔧 Building and starting with proxy modules..."
docker-compose up --build

echo "✅ Deployment completed!" 