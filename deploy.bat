@echo off

REM Скрипт для развертывания обновленного парсера на VDS (Windows версия)

echo 🚀 DEPLOYING UPDATED PARSER WITH PROXY MODULES...

REM Остановка и удаление старых контейнеров
echo 🛑 Stopping old containers...
docker-compose down

REM Удаление старых образов (опционально)
echo 🗑️ Removing old images...
docker image prune -f

REM Сборка и запуск с новыми модулями
echo 🔧 Building and starting with proxy modules...
docker-compose up --build

echo ✅ Deployment completed!
pause 