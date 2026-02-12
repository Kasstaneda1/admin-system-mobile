@echo off
echo Pushing to GitHub...
cd /d "%~dp0"
git push -u origin main
echo.
echo Done! Check your repository at:
echo https://github.com/Kasstaneda1/admin-system-mobile
pause
