@echo off
setlocal
net session >nul 2>nul
if errorlevel 1 goto :needadmin
schtasks /End /TN "SuratKu" >nul 2>nul
schtasks /Delete /TN "SuratKu" /F
schtasks /Delete /TN "SuratKu Backup" /F
netsh advfirewall firewall delete rule name="SuratKu"
echo.
echo Selesai. Jika SuratKu masih berjalan, tutup lewat Task Manager (python.exe) atau restart komputer.
pause
exit /b 0
:needadmin
echo GAGAL: klik KANAN file ini lalu pilih "Run as administrator".
pause
exit /b 1
