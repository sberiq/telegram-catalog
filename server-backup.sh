#!/bin/bash

# Скрипт для автоматического бэкапа данных на сервере
cd /var/www/telegram-catalog

# Добавляем все изменения (включая базу данных)
git add .

# Коммитим с датой
git commit -m "Server auto-backup: $(date '+%Y-%m-%d %H:%M:%S')" || echo "Нет изменений для коммита"

# Отправляем на GitHub
git push origin main

echo "Данные с сервера сохранены в Git!"