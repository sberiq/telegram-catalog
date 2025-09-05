#!/bin/bash

# Автоматическое обновление сайта
# Usage: ./auto-update.sh

echo "🔄 Автоматическое обновление сайта..."

# Configuration
SERVER_USER="root"
SERVER_HOST="144.31.165.36"
SERVER_PATH="/var/www/telegram-catalog"
PASSWORD="HTZhvgJPd55L"

# Функция для выполнения команд на сервере
run_on_server() {
    expect << EOF
spawn ssh $SERVER_USER@$SERVER_HOST "$1"
expect "password:"
send "$PASSWORD\r"
expect eof
EOF
}

echo "📦 Обновление репозитория..."
run_on_server "cd $SERVER_PATH && git pull origin main"

echo "🔧 Установка зависимостей..."
run_on_server "cd $SERVER_PATH && npm install --production"

echo "🔄 Перезапуск приложения..."
run_on_server "cd $SERVER_PATH && pm2 restart telegram-catalog"

echo "📊 Проверка статуса..."
run_on_server "pm2 status telegram-catalog"

echo "✅ Обновление завершено!"
echo "🌐 Сайт доступен по адресу: http://superpuperkrutoi.ru"