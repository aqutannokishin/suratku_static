"""Cadangan: database + template Word + semua dokumen hasil -> backup/suratku_TANGGAL.zip

Aman dijalankan saat aplikasi sedang berjalan. Menyimpan 30 cadangan terakhir.
Cara pakai:  .venv\\Scripts\\python.exe scripts\\backup.py   (atau klik dua kali backup.bat)
"""
import sqlite3
import sys
import tempfile
import zipfile
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from app.config import settings  # noqa: E402

KEEP = 30


def make_backup(dest_dir: Path | None = None) -> Path:
    dest_dir = dest_dir or ROOT / "backup"
    dest_dir.mkdir(parents=True, exist_ok=True)
    db_file = settings.data_dir / "suratku.db"
    if not db_file.exists():
        raise SystemExit("Database belum ada, tidak ada yang perlu dicadangkan.")
    out = dest_dir / f"suratku_{datetime.now():%Y%m%d_%H%M%S}.zip"
    with tempfile.TemporaryDirectory() as tmp:
        snap = Path(tmp) / "suratku.db"
        src, dst = sqlite3.connect(db_file), sqlite3.connect(snap)
        try:
            src.backup(dst)                       # salinan konsisten walau aplikasi sedang dipakai
        finally:
            dst.close()
            src.close()
        with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
            z.write(snap, "data/suratku.db")
            key = settings.data_dir / "secret.key"
            if key.exists():
                z.write(key, "data/secret.key")
            for folder, arc in ((settings.templates_dir, "doctemplates"), (settings.storage_dir, "storage")):
                for f in sorted(folder.rglob("*")):
                    if f.is_file():
                        z.write(f, f"{arc}/{f.relative_to(folder).as_posix()}")
    for old in sorted(dest_dir.glob("suratku_*.zip"))[:-KEEP]:
        old.unlink()
    return out


if __name__ == "__main__":
    p = make_backup()
    print(f"Cadangan dibuat: {p}  ({p.stat().st_size / 1024:.0f} KB)")
    print("Salin file ini juga ke komputer/flashdisk/NAS lain supaya aman.")
