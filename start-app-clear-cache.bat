@echo off
echo ========================================
echo Starting App with Cache Clear
echo ========================================
cd /d "%~dp0"

echo.
echo Clearing Expo cache and starting...
echo This helps when you have errors or outdated code
echo.
echo Press Ctrl+C to stop the server
echo.
call npx expo start -c

pause
