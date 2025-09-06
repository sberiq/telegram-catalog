#!/bin/bash

# Автоматическое сохранение данных в Git
echo "Сохранение данных в Git..."

# Добавляем все изменения
git add .

# Коммитим с текущей датой
git commit -m "Auto-backup: $(date '+%Y-%m-%d %H:%M:%S')"

# Отправляем на GitHub
git push origin main

echo "Данные сохранены в Git!"