# 🚀 Полное руководство по переносу проекта на VPS

## 📋 Пошаговый план

### **Этап 1: Подготовка GitHub репозитория**

1. **Создайте аккаунт на GitHub** (если нет)
2. **Создайте новый репозиторий:**
   - Название: `telegram-catalog`
   - Описание: `Каталог Telegram каналов с рейтингами`
   - Публичный или приватный (на ваш выбор)
   - НЕ добавляйте README, .gitignore, license

3. **Подключите локальный репозиторий:**
```bash
# Добавьте удаленный репозиторий
git remote add origin https://github.com/YOUR_USERNAME/telegram-catalog.git

# Переименуйте ветку в main
git branch -M main

# Отправьте код на GitHub
git push -u origin main
```

### **Этап 2: Настройка VPS**

1. **Купите VPS:**
   - Рекомендуется: DigitalOcean, Vultr, Timeweb
   - Конфигурация: 1GB RAM, 1 CPU, 20GB SSD
   - ОС: Ubuntu 22.04 LTS

2. **Подключитесь к серверу:**
```bash
ssh root@YOUR_SERVER_IP
```

3. **Установите необходимые пакеты:**
```bash
# Обновление системы
apt update && apt upgrade -y

# Установка Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
apt-get install -y nodejs

# Установка PM2
npm install -g pm2

# Установка Nginx
apt install nginx -y

# Установка Git
apt install git -y

# Установка Certbot для SSL
apt install certbot python3-certbot-nginx -y
```

### **Этап 3: Настройка SSH ключей**

1. **На локальной машине создайте SSH ключ:**
```bash
ssh-keygen -t ed25519 -C "your-email@example.com"
```

2. **Скопируйте публичный ключ:**
```bash
cat ~/.ssh/id_ed25519.pub
```

3. **Добавьте ключ на сервер:**
```bash
# На сервере
mkdir -p ~/.ssh
echo "YOUR_PUBLIC_KEY" >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
chmod 700 ~/.ssh
```

### **Этап 4: Настройка скриптов деплоя**

1. **Отредактируйте `deploy.sh`:**
```bash
# Измените эти строки на ваши данные:
SERVER_USER="root"
SERVER_HOST="YOUR_SERVER_IP"  # IP вашего сервера
SERVER_PATH="/var/www/telegram-catalog"
GIT_REPO="https://github.com/YOUR_USERNAME/telegram-catalog.git"
```

2. **Отредактируйте `update.sh`:**
```bash
# Измените эти строки на ваши данные:
SERVER_USER="root"
SERVER_HOST="YOUR_SERVER_IP"  # IP вашего сервера
SERVER_PATH="/var/www/telegram-catalog"
```

### **Этап 5: Первый деплой**

1. **Запустите полный деплой:**
```bash
./deploy.sh
```

2. **Проверьте работу сайта:**
```bash
curl http://YOUR_SERVER_IP
```

### **Этап 6: Настройка домена (опционально)**

1. **Купите домен** у регистратора
2. **Настройте DNS A-запись** на IP сервера
3. **Настройте Nginx:**
```bash
# Создайте конфигурацию сайта
nano /etc/nginx/sites-available/telegram-catalog
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

4. **Активируйте сайт:**
```bash
ln -s /etc/nginx/sites-available/telegram-catalog /etc/nginx/sites-enabled/
nginx -t
systemctl restart nginx
```

5. **Установите SSL сертификат:**
```bash
certbot --nginx -d your-domain.com -d www.your-domain.com
```

## 🔄 Рабочий процесс с AI

### **Когда я вношу изменения:**

1. **Я делаю изменения** в коде через вас
2. **Вы тестируете локально:**
```bash
npm start
```

3. **Фиксируете изменения:**
```bash
git add .
git commit -m "Описание изменений от AI"
git push origin main
```

4. **Обновляете сервер:**
```bash
./update.sh
```

### **Быстрое обновление (только код):**
```bash
./update.sh  # Автоматически подтягивает изменения с GitHub
```

### **Полный деплой (с зависимостями):**
```bash
./deploy.sh  # Полная переустановка
```

## 📊 Мониторинг и управление

### **Полезные команды:**
```bash
# Просмотр логов
ssh root@YOUR_SERVER_IP 'pm2 logs telegram-catalog'

# Статус приложения
ssh root@YOUR_SERVER_IP 'pm2 status'

# Перезапуск приложения
ssh root@YOUR_SERVER_IP 'pm2 restart telegram-catalog'

# Просмотр логов Nginx
ssh root@YOUR_SERVER_IP 'tail -f /var/log/nginx/access.log'
```

## 🔒 Безопасность

### **Настройка файрвола:**
```bash
# На сервере
ufw allow 22/tcp    # SSH
ufw allow 80/tcp    # HTTP
ufw allow 443/tcp   # HTTPS
ufw enable
```

### **Автоматические обновления:**
```bash
# На сервере
apt install unattended-upgrades -y
dpkg-reconfigure -plow unattended-upgrades
```

## 🚨 Устранение неполадок

### **Если сайт не работает:**
1. Проверьте статус PM2: `pm2 status`
2. Проверьте логи: `pm2 logs telegram-catalog`
3. Проверьте Nginx: `systemctl status nginx`
4. Проверьте порт: `netstat -tlnp | grep :3000`

### **Если не работает деплой:**
1. Проверьте SSH подключение: `ssh root@YOUR_SERVER_IP`
2. Проверьте права на файлы: `chmod +x deploy.sh update.sh`
3. Проверьте конфигурацию в скриптах

## ✅ Результат

После выполнения всех шагов у вас будет:
- ✅ Сайт работает на VPS
- ✅ Домен привязан (если настроили)
- ✅ SSL сертификат установлен
- ✅ Автоматическое обновление через GitHub
- ✅ Возможность редактирования через AI
- ✅ Мониторинг и логирование

## 🎯 Следующие шаги

1. **Настройте мониторинг** (опционально)
2. **Настройте резервное копирование** базы данных
3. **Оптимизируйте производительность** при необходимости
4. **Настройте CDN** для статических файлов (опционально)