@echo off
rem Dipakai oleh Task Scheduler (install_autostart.bat). Tanpa pause; log di data\server.log
cd /d "%~dp0"
if not exist "data" mkdir "data"
".venv\Scripts\python.exe" -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 1 >> "data\server.log" 2>&1
