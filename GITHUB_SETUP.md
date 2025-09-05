# 📚 Настройка GitHub для проекта

## 🔧 Шаг 1: Создание репозитория на GitHub

1. **Перейдите на GitHub.com** и войдите в аккаунт
2. **Нажмите "New repository"** (зеленая кнопка)
3. **Заполните данные:**
   - Repository name: `telegram-catalog`
   - Description: `Каталог Telegram каналов с рейтингами`
   - Visibility: `Public` (или Private)
   - НЕ добавляйте README, .gitignore, license (у нас уже есть)

4. **Нажмите "Create repository"**

## 🔗 Шаг 2: Подключение локального репозитория

После создания репозитория GitHub покажет команды. Выполните:

```bash
# Добавьте удаленный репозиторий
git remote add origin https://github.com/YOUR_USERNAME/telegram-catalog.git

# Переименуйте ветку в main (современный стандарт)
git branch -M main

# Отправьте код на GitHub
git push -u origin main
```

## 🔑 Шаг 3: Настройка SSH ключей (рекомендуется)

### Создание SSH ключа:
```bash
ssh-keygen -t ed25519 -C "your-email@example.com"
```

### Добавление ключа в GitHub:
1. Скопируйте публичный ключ:
```bash
cat ~/.ssh/id_ed25519.pub
```

2. В GitHub: Settings → SSH and GPG keys → New SSH key
3. Вставьте ключ и сохраните

### Изменение URL на SSH:
```bash
git remote set-url origin git@github.com:YOUR_USERNAME/telegram-catalog.git
```

## ✅ Проверка настройки

```bash
# Проверьте подключение
git remote -v

# Должно показать:
# origin  git@github.com:YOUR_USERNAME/telegram-catalog.git (fetch)
# origin  git@github.com:YOUR_USERNAME/telegram-catalog.git (push)
```

## 🔄 Рабочий процесс

### После изменений через AI:
```bash
# 1. Добавьте изменения
git add .

# 2. Зафиксируйте с описанием
git commit -m "Описание изменений от AI"

# 3. Отправьте на GitHub
git push origin main
```

### На сервере (автоматическое обновление):
```bash
# Сервер будет автоматически подтягивать изменения
git pull origin main
pm2 restart telegram-catalog
```

## 🚨 Важно!

- **Никогда не коммитьте** файлы с паролями или ключами
- **Используйте .gitignore** для исключения чувствительных данных
- **Делайте осмысленные коммиты** с описанием изменений