@echo off
setlocal
cd /d "%~dp0"
".venv\Scripts\python.exe" scripts\backup.py
if /i "%~1"=="silent" exit /b 0
echo.
pause
