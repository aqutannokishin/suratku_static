"""Pengaturan aplikasi.

Semua nilai bisa diubah lewat file `.env` di folder utama (lihat `.env.example`).
Yang paling sering diubah: SOFFICE_PATH (lokasi LibreOffice) dan ALLOW_REUSE_VOID.
"""
import os
import secrets
import shutil
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parent.parent

_WINDOWS_SOFFICE = [
    r"C:\Program Files\LibreOffice\program\soffice.exe",
    r"C:\Program Files (x86)\LibreOffice\program\soffice.exe",
]


def _find_soffice() -> str:
    """Cari LibreOffice otomatis. Kembalikan '' kalau tidak ketemu."""
    found = shutil.which("soffice") or shutil.which("libreoffice")
    if found:
        return found
    for p in _WINDOWS_SOFFICE:
        if os.path.exists(p):
            return p
    return ""


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=str(BASE_DIR / ".env"), extra="ignore")

    secret_key: str = ""                      # dibuat otomatis kalau kosong
    data_dir: Path = BASE_DIR / "data"        # database + kunci rahasia
    storage_dir: Path = BASE_DIR / "storage"  # hasil dokumen (DOCX/PDF)
    templates_dir: Path = BASE_DIR / "doctemplates"  # template Word
    soffice_path: str = ""                    # kosong = cari otomatis
    allow_reuse_void: bool = True             # nomor yang dibatalkan boleh dipakai lagi?
    session_hours: int = 10                   # lama login
    app_name: str = "SuratKu"
    org_name: str = ""                        # tampil di pojok atas (opsional)


settings = Settings()

for _d in (settings.data_dir, settings.storage_dir, settings.templates_dir):
    _d.mkdir(parents=True, exist_ok=True)

if not settings.secret_key:
    _key_file = settings.data_dir / "secret.key"
    if _key_file.exists():
        settings.secret_key = _key_file.read_text().strip()
    else:
        settings.secret_key = secrets.token_hex(32)
        _key_file.write_text(settings.secret_key)

if not settings.soffice_path:
    settings.soffice_path = _find_soffice()
