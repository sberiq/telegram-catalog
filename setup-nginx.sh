#!/bin/bash

# Скрипт для настройки Nginx на сервере
# Использование: ./setup-nginx.sh your-domain.com

set -e

DOMAIN=$1

if [ -z "$DOMAIN" ]; then
    echo "Использование: $0 your-domain.com"
    exit 1
fi

echo "Настройка Nginx для домена: $DOMAIN"

# Создаем конфигурацию Nginx
sudo tee /etc/nginx/sites-available/telegram-catalog > /dev/null <<EOF
server {
    listen 80;
    server_name $DOMAIN www.$DOMAIN;
    
    # Временно проксируем на Node.js приложение
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
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

echo "Nginx настроен для домена: $DOMAIN"
echo "Теперь можно настроить SSL с помощью Let's Encrypt:"
echo "sudo certbot --nginx -d $DOMAIN -d www.$DOMAIN"