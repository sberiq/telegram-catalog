#!/bin/bash

# Quick update script for development with GitHub sync
# Usage: ./update.sh

echo "🔄 Quick update script..."

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration - ОБЯЗАТЕЛЬНО ИЗМЕНИТЕ НА ВАШИ ДАННЫЕ!
SERVER_USER="root"
SERVER_HOST="144.31.165.36"
SERVER_PATH="/var/www/telegram-catalog"

# Проверка конфигурации
if [ "$SERVER_HOST" = "your-server-ip" ]; then
    echo -e "${RED}❌ Ошибка: Не настроен SERVER_HOST в update.sh${NC}"
    echo -e "${YELLOW}📝 Отредактируйте файл update.sh и укажите IP вашего сервера${NC}"
    exit 1
fi

echo -e "${BLUE}🔧 Configuration:${NC}"
echo -e "   Server: $SERVER_USER@$SERVER_HOST"
echo -e "   Path: $SERVER_PATH"
echo ""

# Проверка подключения к серверу
echo -e "${YELLOW}🔍 Checking server connection...${NC}"
if ! ssh -o ConnectTimeout=10 $SERVER_USER@$SERVER_HOST "echo 'Connection OK'" 2>/dev/null; then
    echo -e "${RED}❌ Не удается подключиться к серверу $SERVER_HOST${NC}"
    exit 1
fi

echo -e "${YELLOW}📦 Pulling latest changes from GitHub...${NC}"
git pull origin main

echo -e "${YELLOW}📤 Updating server from GitHub...${NC}"
ssh $SERVER_USER@$SERVER_HOST "
    cd $SERVER_PATH
    echo 'Pulling latest changes...'
    git pull origin main
    echo 'Installing dependencies if needed...'
    npm install --production
    echo 'Restarting application...'
    pm2 restart telegram-catalog
"

echo -e "${GREEN}✅ Update completed!${NC}"
echo -e "${BLUE}🌐 Your site is updated at: http://$SERVER_HOST${NC}"
