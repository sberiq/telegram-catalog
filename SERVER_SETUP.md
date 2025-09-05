# 🚀 Настройка сервера для Telegram Catalog

## 📋 Требования к серверу
- Ubuntu 20.04+ или CentOS 8+
- Node.js 16+
- Nginx
- PM2
- Git

## 🔧 Установка на сервере

### 1. Подключение к серверу
```bash
ssh root@your-server.com
```

### 2. Установка Node.js
```bash
# Ubuntu/Debian
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# CentOS/RHEL
curl -fsSL https://rpm.nodesource.com/setup_18.x | sudo bash -
sudo yum install -y nodejs
```

### 3. Установка PM2
```bash
sudo npm install -g pm2
```

### 4. Установка Nginx
```bash
# Ubuntu/Debian
sudo apt update
sudo apt install nginx

# CentOS/RHEL
sudo yum install nginx
```

### 5. Создание директории проекта
```bash
sudo mkdir -p /var/www/telegram-catalog
sudo chown -R $USER:$USER /var/www/telegram-catalog
cd /var/www/telegram-catalog
```

### 6. Клонирование репозитория
```bash
git clone https://github.com/yourusername/telegram-catalog.git .
```

### 7. Установка зависимостей
```bash
npm install --production
```

### 8. Настройка PM2
```bash
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

### 9. Настройка Nginx
```bash
sudo nano /etc/nginx/sites-available/telegram-catalog
```

Содержимое файла:
```nginx
server {
    listen 80;
    server_name your-domain.com www.your-domain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### 10. Активация сайта
```bash
sudo ln -s /etc/nginx/sites-available/telegram-catalog /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

### 11. SSL сертификат (Let's Encrypt)
```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com -d www.your-domain.com
```

## 🔄 Автоматический деплой

### Настройка SSH ключей
```bash
# На локальной машине
ssh-keygen -t rsa -b 4096 -C "your-email@example.com"
ssh-copy-id root@your-server.com
```

### Запуск деплоя
```bash
./deploy.sh
```

## 📝 Полезные команды

### PM2
```bash
pm2 status          # Статус процессов
pm2 restart all     # Перезапуск всех процессов
pm2 logs            # Просмотр логов
pm2 monit           # Мониторинг
```

### Nginx
```bash
sudo systemctl status nginx    # Статус
sudo systemctl restart nginx   # Перезапуск
sudo nginx -t                  # Проверка конфигурации
```

### Git
```bash
git pull origin main           # Обновление кода
git log --oneline             # История коммитов
```

## 🔒 Безопасность

### Firewall
```bash
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # HTTP
sudo ufw allow 443/tcp   # HTTPS
sudo ufw enable
```

### Автоматические обновления
```bash
sudo apt install unattended-upgrades
sudo dpkg-reconfigure -plow unattended-upgrades
```

## 📊 Мониторинг

### Логи
```bash
tail -f /var/log/nginx/access.log
tail -f /var/log/nginx/error.log
pm2 logs telegram-catalog
```

### Ресурсы
```bash
htop
df -h
free -h
```