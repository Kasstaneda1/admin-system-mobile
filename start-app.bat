@echo off
echo ========================================
echo Starting SEMIX Technician Mobile App
echo ========================================
cd /d "%~dp0"

echo.
echo Starting Expo Dev Server...
echo After QR code appears, scan it with Expo Go on your iPhone
echo.
echo Press Ctrl+C to stop the server
echo.
call npm start

pause
