@echo off
setlocal
cd /d "%~dp0"
if exist ".venv\Scripts\python.exe" goto :go
echo SuratKu belum dipasang. Jalankan setup.bat dulu.
pause
exit /b 1
:go
title SuratKu - jangan ditutup
echo ============================================================
echo   SuratKu sedang berjalan - JANGAN TUTUP JENDELA INI
echo ============================================================
echo   Alamat untuk dibuka di browser:
".venv\Scripts\python.exe" scripts\show_address.py 8000
echo.
echo   Untuk berhenti: tutup jendela ini atau tekan Ctrl+C.
echo ------------------------------------------------------------
".venv\Scripts\python.exe" -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 1
echo.
echo SuratKu berhenti. Jika ini tidak disengaja, baca pesan error di atas.
pause
