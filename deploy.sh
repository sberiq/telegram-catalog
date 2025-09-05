#!/bin/bash

# Deploy script for VDS/VPS with GitHub integration
# Usage: ./deploy.sh

echo "🚀 Starting deployment..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration - ОБЯЗАТЕЛЬНО ИЗМЕНИТЕ НА ВАШИ ДАННЫЕ!
SERVER_USER="root"
SERVER_HOST="your-server-ip"
SERVER_PATH="/var/www/telegram-catalog"
GIT_REPO="https://github.com/yourusername/telegram-catalog.git"

# Проверка конфигурации
if [ "$SERVER_HOST" = "your-server-ip" ]; then
    echo -e "${RED}❌ Ошибка: Не настроен SERVER_HOST в deploy.sh${NC}"
    echo -e "${YELLOW}📝 Отредактируйте файл deploy.sh и укажите IP вашего сервера${NC}"
    exit 1
fi

echo -e "${BLUE}🔧 Configuration:${NC}"
echo -e "   Server: $SERVER_USER@$SERVER_HOST"
echo -e "   Path: $SERVER_PATH"
echo -e "   Repo: $GIT_REPO"
echo ""

# Проверка подключения к серверу
echo -e "${YELLOW}🔍 Checking server connection...${NC}"
if ! ssh -o ConnectTimeout=10 $SERVER_USER@$SERVER_HOST "echo 'Connection OK'" 2>/dev/null; then
    echo -e "${RED}❌ Не удается подключиться к серверу $SERVER_HOST${NC}"
    echo -e "${YELLOW}💡 Проверьте:${NC}"
    echo -e "   1. IP адрес сервера"
    echo -e "   2. SSH ключи настроены"
    echo -e "   3. Сервер запущен"
    exit 1
fi

# Создание директории на сервере если не существует
echo -e "${YELLOW}📁 Creating server directory...${NC}"
ssh $SERVER_USER@$SERVER_HOST "mkdir -p $SERVER_PATH"

# Клонирование/обновление репозитория на сервере
echo -e "${YELLOW}📦 Setting up repository on server...${NC}"
ssh $SERVER_USER@$SERVER_HOST "
    if [ -d '$SERVER_PATH/.git' ]; then
        echo 'Updating existing repository...'
        cd $SERVER_PATH && git pull origin main
    else
        echo 'Cloning repository...'
        cd $(dirname $SERVER_PATH) && git clone $GIT_REPO $(basename $SERVER_PATH)
    fi
"

# Установка зависимостей
echo -e "${YELLOW}🔧 Installing dependencies...${NC}"
ssh $SERVER_USER@$SERVER_HOST "cd $SERVER_PATH && npm install --production"

# Создание директории для логов
echo -e "${YELLOW}📝 Creating logs directory...${NC}"
ssh $SERVER_USER@$SERVER_HOST "mkdir -p $SERVER_PATH/logs"

# Запуск/перезапуск приложения
echo -e "${YELLOW}🔄 Starting application...${NC}"
ssh $SERVER_USER@$SERVER_HOST "
    cd $SERVER_PATH
    if pm2 list | grep -q telegram-catalog; then
        echo 'Restarting existing application...'
        pm2 restart telegram-catalog
    else
        echo 'Starting new application...'
        pm2 start ecosystem.config.js
        pm2 save
    fi
"

# Проверка статуса
echo -e "${YELLOW}📊 Checking application status...${NC}"
ssh $SERVER_USER@$SERVER_HOST "pm2 status telegram-catalog"

echo ""
echo -e "${GREEN}✅ Deployment completed successfully!${NC}"
echo -e "${GREEN}🌐 Your site is now live at: http://$SERVER_HOST${NC}"
echo -e "${BLUE}📋 Useful commands:${NC}"
echo -e "   View logs: ssh $SERVER_USER@$SERVER_HOST 'pm2 logs telegram-catalog'"
echo -e "   Restart: ssh $SERVER_USER@$SERVER_HOST 'pm2 restart telegram-catalog'"
echo -e "   Status: ssh $SERVER_USER@$SERVER_HOST 'pm2 status'"