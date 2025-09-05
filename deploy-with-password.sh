#!/bin/bash

# Deploy script with password authentication
# Usage: ./deploy-with-password.sh

echo "🚀 Starting deployment with password authentication..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SERVER_USER="root"
SERVER_HOST="144.31.165.36"
SERVER_PATH="/var/www/telegram-catalog"
GIT_REPO="https://github.com/sberiq/telegram-catalog.git"
DOMAIN="superpuperkrutoi.ru"
PASSWORD="HTZhvgJPd55L"

echo -e "${BLUE}🔧 Configuration:${NC}"
echo -e "   Server: $SERVER_USER@$SERVER_HOST"
echo -e "   Path: $SERVER_PATH"
echo -e "   Repo: $GIT_REPO"
echo -e "   Domain: $DOMAIN"
echo ""

# Function to run commands on server
run_on_server() {
    sshpass -p "$PASSWORD" ssh -o StrictHostKeyChecking=no $SERVER_USER@$SERVER_HOST "$1"
}

# Check if sshpass is available, if not install it
if ! command -v sshpass &> /dev/null; then
    echo -e "${YELLOW}📦 Installing sshpass...${NC}"
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        if command -v brew &> /dev/null; then
            brew install hudochenkov/sshpass/sshpass
        else
            echo -e "${RED}❌ Please install Homebrew first: /bin/bash -c \"\$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)\"${NC}"
            exit 1
        fi
    else
        # Linux
        sudo apt-get update && sudo apt-get install -y sshpass
    fi
fi

# Проверка подключения к серверу
echo -e "${YELLOW}🔍 Checking server connection...${NC}"
if ! run_on_server "echo 'Connection OK'"; then
    echo -e "${RED}❌ Не удается подключиться к серверу $SERVER_HOST${NC}"
    exit 1
fi

# Создание директории на сервере если не существует
echo -e "${YELLOW}📁 Creating server directory...${NC}"
run_on_server "mkdir -p $SERVER_PATH"

# Клонирование/обновление репозитория на сервере
echo -e "${YELLOW}📦 Setting up repository on server...${NC}"
run_on_server "
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
run_on_server "cd $SERVER_PATH && npm install --production"

# Создание директории для логов
echo -e "${YELLOW}📝 Creating logs directory...${NC}"
run_on_server "mkdir -p $SERVER_PATH/logs"

# Запуск/перезапуск приложения
echo -e "${YELLOW}🔄 Starting application...${NC}"
run_on_server "
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

# Настройка Nginx
echo -e "${YELLOW}🌐 Configuring Nginx...${NC}"
run_on_server "
    # Создаем конфигурацию Nginx
    sudo tee /etc/nginx/sites-available/telegram-catalog > /dev/null <<EOF
server {
    listen 80;
    server_name $DOMAIN www.$DOMAIN;
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \\\$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \\\$host;
        proxy_set_header X-Real-IP \\\$remote_addr;
        proxy_set_header X-Forwarded-For \\\$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \\\$scheme;
        proxy_cache_bypass \\\$http_upgrade;
        proxy_read_timeout 86400;
    }
}
EOF
    
    # Активируем сайт
    sudo ln -sf /etc/nginx/sites-available/telegram-catalog /etc/nginx/sites-enabled/
    
    # Удаляем дефолтный сайт
    sudo rm -f /etc/nginx/sites-enabled/default
    
    # Проверяем конфигурацию
    sudo nginx -t
    
    # Перезапускаем Nginx
    sudo systemctl restart nginx
"

# Проверка статуса
echo -e "${YELLOW}📊 Checking application status...${NC}"
run_on_server "pm2 status telegram-catalog"

echo ""
echo -e "${GREEN}✅ Deployment completed successfully!${NC}"
echo -e "${GREEN}🌐 Your site is now live at: http://$SERVER_HOST${NC}"
echo -e "${GREEN}🌐 Domain configured: http://$DOMAIN${NC}"
echo -e "${BLUE}📋 Useful commands:${NC}"
echo -e "   View logs: sshpass -p '$PASSWORD' ssh $SERVER_USER@$SERVER_HOST 'pm2 logs telegram-catalog'"
echo -e "   Restart: sshpass -p '$PASSWORD' ssh $SERVER_USER@$SERVER_HOST 'pm2 restart telegram-catalog'"
echo -e "   Status: sshpass -p '$PASSWORD' ssh $SERVER_USER@$SERVER_HOST 'pm2 status'"
echo -e "   Setup SSL: sshpass -p '$PASSWORD' ssh $SERVER_USER@$SERVER_HOST 'sudo certbot --nginx -d $DOMAIN -d www.$DOMAIN'"