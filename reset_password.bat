@echo off
setlocal
cd /d "%~dp0"
echo Atur ulang password pengguna (dijalankan di komputer server).
set /p U=Username yang akan diatur ulang: 
".venv\Scripts\python.exe" scripts\reset_password.py %U%
echo.
pause
