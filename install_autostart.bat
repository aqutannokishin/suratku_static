@echo off
setlocal
cd /d "%~dp0"
echo ============================================================
echo   SuratKu - jalan otomatis saat komputer menyala + cadangan harian
echo ============================================================
net session >nul 2>nul
if errorlevel 1 goto :needadmin

schtasks /Create /TN "SuratKu" /TR "\"%~dp0run_service.bat\"" /SC ONSTART /RU SYSTEM /RL HIGHEST /F
if errorlevel 1 goto :fail
schtasks /Create /TN "SuratKu Backup" /TR "\"%~dp0backup.bat\" silent" /SC DAILY /ST 18:00 /RU SYSTEM /RL HIGHEST /F
if errorlevel 1 goto :fail
netsh advfirewall firewall delete rule name="SuratKu" >nul 2>nul
netsh advfirewall firewall add rule name="SuratKu" dir=in action=allow protocol=TCP localport=8000 profile=private,domain
schtasks /Run /TN "SuratKu" >nul 2>nul

echo.
echo SELESAI.
echo  - SuratKu akan menyala otomatis setiap komputer ini dihidupkan (tanpa perlu login).
echo  - Cadangan otomatis setiap hari jam 18:00 ke folder backup.
echo  - Port 8000 dibuka di firewall untuk jaringan Domain dan Private.
echo  - Aplikasi sudah dijalankan sekarang. Tunggu 10 detik lalu buka http://localhost:8000
pause
exit /b 0

:needadmin
echo GAGAL: harus dijalankan sebagai Administrator.
echo Klik KANAN file install_autostart.bat lalu pilih "Run as administrator".
pause
exit /b 1

:fail
echo GAGAL membuat tugas terjadwal. Baca pesan error di atas.
pause
exit /b 1
