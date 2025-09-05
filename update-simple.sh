#!/bin/bash

# Simple update script
# Usage: ./update-simple.sh

echo "🔄 Starting update..."

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

echo -e "${BLUE}🔧 Configuration:${NC}"
echo -e "   Server: $SERVER_USER@$SERVER_HOST"
echo -e "   Path: $SERVER_PATH"
echo ""

echo -e "${YELLOW}📝 Quick update steps:${NC}"
echo -e "${BLUE}1. Connect to server:${NC}"
echo -e "   ssh $SERVER_USER@$SERVER_HOST"
echo -e "   Password: HTZhvgJPd55L"
echo ""
echo -e "${BLUE}2. Run these commands on the server:${NC}"
echo ""
echo -e "${GREEN}# Update repository${NC}"
echo -e "cd $SERVER_PATH && git pull origin main"
echo ""
echo -e "${GREEN}# Install dependencies${NC}"
echo -e "npm install --production"
echo ""
echo -e "${GREEN}# Restart application${NC}"
echo -e "pm2 restart telegram-catalog"
echo ""
echo -e "${GREEN}# Check status${NC}"
echo -e "pm2 status telegram-catalog"
echo ""
echo -e "${GREEN}# View logs (if needed)${NC}"
echo -e "pm2 logs telegram-catalog --lines 50"