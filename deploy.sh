#!/bin/bash

# Deploy script for VDS/VPS
# Usage: ./deploy.sh

echo "🚀 Starting deployment..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
SERVER_USER="root"  # Change to your server user
SERVER_HOST="your-server.com"  # Change to your server IP/domain
SERVER_PATH="/var/www/telegram-catalog"  # Change to your server path
GIT_REPO="https://github.com/yourusername/telegram-catalog.git"  # Change to your repo

echo -e "${YELLOW}📦 Pulling latest changes from Git...${NC}"
git pull origin main

echo -e "${YELLOW}📤 Uploading files to server...${NC}"
rsync -avz --delete \
    --exclude 'node_modules' \
    --exclude '.git' \
    --exclude '.env' \
    --exclude '*.log' \
    ./ $SERVER_USER@$SERVER_HOST:$SERVER_PATH/

echo -e "${YELLOW}🔧 Installing dependencies on server...${NC}"
ssh $SERVER_USER@$SERVER_HOST "cd $SERVER_PATH && npm install --production"

echo -e "${YELLOW}🔄 Restarting services...${NC}"
ssh $SERVER_USER@$SERVER_HOST "cd $SERVER_PATH && pm2 restart telegram-catalog || pm2 start server.js --name telegram-catalog"

echo -e "${GREEN}✅ Deployment completed successfully!${NC}"
echo -e "${GREEN}🌐 Your site is now live at: http://$SERVER_HOST${NC}"