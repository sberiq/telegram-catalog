#!/bin/bash

# Quick update script for development
# Usage: ./update.sh

echo "🔄 Quick update script..."

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Configuration
SERVER_USER="root"
SERVER_HOST="your-server.com"
SERVER_PATH="/var/www/telegram-catalog"

echo -e "${YELLOW}📤 Uploading changes to server...${NC}"

# Upload only changed files
rsync -avz --progress \
    --exclude 'node_modules' \
    --exclude '.git' \
    --exclude '.env' \
    --exclude '*.log' \
    --exclude 'telegram_catalog*.db' \
    ./ $SERVER_USER@$SERVER_HOST:$SERVER_PATH/

echo -e "${YELLOW}🔄 Restarting application...${NC}"
ssh $SERVER_USER@$SERVER_HOST "cd $SERVER_PATH && pm2 restart telegram-catalog"

echo -e "${GREEN}✅ Update completed!${NC}"