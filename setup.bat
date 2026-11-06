@echo off
setlocal
cd /d "%~dp0"
echo ============================================================
echo   SuratKu - Pemasangan pertama (cukup dilakukan sekali)
echo ============================================================
echo.

set "PY="
where py >nul 2>nul && set "PY=py -3"
if not defined PY where python >nul 2>nul && set "PY=python"
if not defined PY goto :nopython
%PY% -c "import sys; sys.exit(0 if sys.version_info >= (3,10) else 1)" >nul 2>nul
if errorlevel 1 goto :nopython

echo [1/4] Python ditemukan:
%PY% --version
echo.

if exist ".venv\Scripts\python.exe" goto :venvok
echo [2/4] Membuat lingkungan Python khusus untuk SuratKu...
%PY% -m venv .venv
if errorlevel 1 goto :fail
:venvok

echo [3/4] Memasang pustaka yang dibutuhkan. Perlu internet, sekitar 1-3 menit...
".venv\Scripts\python.exe" -m pip install --upgrade pip >nul 2>nul
".venv\Scripts\python.exe" -m pip install -r requirements.txt
if errorlevel 1 goto :fail

if not exist ".env" copy ".env.example" ".env" >nul

echo.
echo [4/4] Memeriksa LibreOffice, dipakai untuk membuat PDF...
set "SOFFICE="
if exist "%ProgramFiles%\LibreOffice\program\soffice.exe" set "SOFFICE=1"
if exist "%ProgramFiles(x86)%\LibreOffice\program\soffice.exe" set "SOFFICE=1"
if defined SOFFICE goto :lo_ok
echo     LibreOffice BELUM terpasang. Aplikasi tetap jalan, tetapi hanya bisa membuat file Word.
echo     Untuk PDF: pasang LibreOffice dari https://www.libreoffice.org lalu jalankan ulang run.bat.
goto :done
:lo_ok
echo     LibreOffice ditemukan. Pembuatan PDF akan tersedia.

:done
echo.
echo ============================================================
echo   SELESAI. Langkah berikutnya: klik dua kali  run.bat
echo ============================================================
pause
exit /b 0

:nopython
echo GAGAL: Python belum terpasang, atau versinya terlalu lama. Butuh Python 3.10 atau lebih baru.
echo Pasang dari https://www.python.org/downloads/  dan CENTANG "Add python.exe to PATH" saat memasang.
echo Setelah itu jalankan setup.bat lagi.
pause
exit /b 1

:fail
echo.
echo GAGAL. Baca pesan error di atas. Penyebab paling umum: tidak ada koneksi internet,
echo atau proxy kantor memblokir pip. Coba lagi setelah koneksi normal.
pause
exit /b 1
