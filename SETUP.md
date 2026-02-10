# Быстрый старт / Quick Start

## Установка и запуск / Installation and Launch

### 1. Установите зависимости / Install dependencies

Откройте терминал Windows (Command Prompt или PowerShell) в папке проекта:

```bash
cd C:\Users\mihai_m8rj2l\Downloads\Admin\admin-system-mobile
npm install
```

### 2. Установите Expo CLI глобально / Install Expo CLI globally

```bash
npm install -g expo-cli
```

### 3. Запустите проект / Start the project

```bash
npm start
```

Или используйте:

```bash
npx expo start
```

### 4. Откройте приложение на телефоне / Open app on phone

**На iOS:**
1. Установите **Expo Go** из App Store
2. Отсканируйте QR-код из терминала камерой iPhone

**На Android:**
1. Установите **Expo Go** из Google Play
2. Отсканируйте QR-код из терминала приложением Expo Go

---

## Тестовые данные / Test Credentials

Используйте учетные данные техника из вашей системы:

```
Username: [your technician username]
Password: [your technician password]
Role: technician
```

---

## Структура проекта / Project Structure

```
├── App.js                  # Главный файл с навигацией
├── src/
│   ├── screens/            # Все экраны
│   │   ├── LoginScreen.js       # Вход в систему
│   │   ├── HomeScreen.js        # Главное меню
│   │   ├── EstimatesScreen.js   # Список заказов
│   │   ├── EstimateDetailScreen.js # Детали заказа
│   │   ├── SalaryScreen.js      # Зарплатный портал
│   │   └── ReceiptsScreen.js    # Загрузка чеков
│   └── services/
│       └── api.js          # API клиент
```

---

## Возможности / Features

✅ **Авторизация** - безопасный вход через JWT
✅ **Мои заказы** - просмотр всех эстиматов техника
✅ **Детали заказа** - полная информация о работе
✅ **Зарплата** - расчет зарплаты за период
✅ **Загрузка чеков** - фото/PDF чеков для check payments
✅ **Pull-to-refresh** - обновление данных свайпом вниз

---

## Следующие шаги / Next Steps

### 1. Создать GitHub репозиторий

```bash
# Создайте новый репозиторий на GitHub с именем: admin-system-mobile
# Затем выполните:

git remote add origin https://github.com/[ваш-username]/admin-system-mobile.git
git branch -M main
git push -u origin main
```

### 2. Настроить иконки приложения

Добавьте в папку `assets/`:
- `icon.png` - иконка приложения (1024x1024)
- `splash.png` - экран загрузки (1242x2436)
- `adaptive-icon.png` - адаптивная иконка для Android (1024x1024)
- `favicon.png` - favicon для веб-версии (48x48)

### 3. Изменить цвета / Change Colors

Основные цвета в файлах:
- Teal: `#14B8A6` (основной цвет SEMIX)
- Dark Teal: `#0D9488`
- Success: `#10b981`
- Error: `#ef4444`

### 4. Сборка для продакшена / Build for Production

**iOS** (требуется Mac с Xcode):
```bash
expo build:ios
```

**Android**:
```bash
expo build:android
```

Или используйте **EAS Build** (современный метод):
```bash
npm install -g eas-cli
eas build --platform android
eas build --platform ios
```

---

## Troubleshooting

### Ошибка "Cannot find module"
```bash
rm -rf node_modules
npm install
```

### Expo не запускается
```bash
npm install -g expo-cli
expo start -c  # очистка кэша
```

### Не подключается к backend
Проверьте в `src/services/api.js`:
```javascript
const API_URL = 'https://admin-system-backend-production.up.railway.app';
```

---

## Полезные команды / Useful Commands

```bash
npm start              # Запуск dev сервера
npm run android        # Запуск на Android эмуляторе
npm run ios            # Запуск на iOS симуляторе (Mac only)
npm run web            # Запуск веб-версии

expo start -c          # Очистка кэша
expo doctor            # Проверка проблем
```

---

## Документация / Documentation

- [Expo Documentation](https://docs.expo.dev/)
- [React Native Documentation](https://reactnative.dev/)
- [React Navigation](https://reactnavigation.org/)

---

**Создано с помощью Claude Code** 🤖
