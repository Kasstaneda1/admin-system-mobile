@echo off
echo ========================================
echo Installing Expo SDK 54
echo ========================================
cd /d "%~dp0"

echo.
echo [1/5] Installing base packages...
call npm install

echo.
echo [2/5] Fixing Expo packages...
call npx expo install --fix

echo.
echo [3/5] Installing additional Expo packages...
call npx expo install expo-asset expo-font expo-splash-screen expo-image-picker expo-document-picker react-native-screens react-native-safe-area-context

echo.
echo [4/5] Installing babel preset...
call npm install --save-dev babel-preset-expo

echo.
echo ========================================
echo Installation complete!
echo ========================================
echo.
echo To start the app, run:
echo npm start
echo.
pause
