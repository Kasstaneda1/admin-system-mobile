# 🚀 Создание GitHub репозитория

## Шаг 1: Создайте репозиторий на GitHub

1. Откройте браузер и перейдите на: **https://github.com/new**

2. Заполните форму:
   - **Repository name**: `admin-system-mobile`
   - **Description**: "SEMIX Technician Mobile App - React Native + Expo"
   - **Visibility**: ✅ Private (рекомендуется)
   - **НЕ ставьте галочки на**:
     - ❌ Add a README file
     - ❌ Add .gitignore
     - ❌ Choose a license

3. Нажмите **"Create repository"**

---

## Шаг 2: Подключите локальный репозиторий

После создания репозитория GitHub покажет инструкции. Выполните в терминале:

### Вариант А: Если ваш username на GitHub известен

Замените `YOUR_USERNAME` на ваш GitHub username:

```bash
cd c:\Users\mihai_m8rj2l\Downloads\Admin\admin-system-mobile

git remote add origin https://github.com/YOUR_USERNAME/admin-system-mobile.git
git branch -M main
git push -u origin main
```

### Вариант Б: Копируйте команды с GitHub

На странице созданного репозитория будет раздел **"…or push an existing repository from the command line"**.

Скопируйте команды оттуда и выполните в терминале.

---

## Шаг 3: Клонируйте в VS Code

После успешного push:

1. Откройте **VS Code**
2. Нажмите `Ctrl+Shift+P`
3. Выберите: **Git: Clone**
4. Вставьте URL: `https://github.com/YOUR_USERNAME/admin-system-mobile.git`
5. Выберите папку для клонирования

Или через терминал в нужной папке:

```bash
git clone https://github.com/YOUR_USERNAME/admin-system-mobile.git
cd admin-system-mobile
code .
```

---

## 🔐 Если потребуется аутентификация

GitHub может попросить войти:

1. **Personal Access Token** (рекомендуется):
   - Перейдите: https://github.com/settings/tokens
   - Generate new token (classic)
   - Выберите scope: `repo`
   - Используйте token как пароль при git push

2. **GitHub CLI** (альтернатива):
   ```bash
   # Установите gh CLI: https://cli.github.com/
   gh auth login
   ```

---

## ✅ Проверка

После push проверьте, что код появился на GitHub:

```
https://github.com/YOUR_USERNAME/admin-system-mobile
```

Вы должны увидеть:
- ✅ 15 файлов
- ✅ 2 коммита
- ✅ Ветка `main`

---

## 📦 Следующие шаги после клонирования в VS Code

```bash
# В терминале VS Code:
npm install
npm start
```

Готово! Теперь можете работать с проектом в VS Code.
