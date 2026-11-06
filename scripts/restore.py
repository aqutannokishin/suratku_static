"""Memulihkan dari file cadangan.  HENTIKAN aplikasi (tutup jendela run.bat) sebelum menjalankan ini.

Cara pakai:  .venv\\Scripts\\python.exe scripts\\restore.py backup\\suratku_20261006_180000.zip
"""
import shutil
import sys
import zipfile
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from app.config import settings  # noqa: E402


def restore(zip_path: Path) -> None:
    with zipfile.ZipFile(zip_path) as z:
        names = z.namelist()
        if "data/suratku.db" not in names:
            raise SystemExit("File ini bukan cadangan SuratKu (tidak ada data/suratku.db).")
        for n in names:                                  # cegah path berbahaya di dalam zip
            if n.startswith(("/", "\\")) or ".." in Path(n).parts:
                raise SystemExit(f"Isi zip tidak aman: {n}")
        # simpan kondisi sekarang dulu, jaga-jaga
        stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        safety = ROOT / "backup" / f"sebelum_restore_{stamp}"
        for folder in (settings.data_dir, settings.templates_dir, settings.storage_dir):
            if folder.exists():
                shutil.copytree(folder, safety / folder.name, ignore=shutil.ignore_patterns("lo_profile"))
        for f in ("suratku.db", "suratku.db-wal", "suratku.db-shm"):
            (settings.data_dir / f).unlink(missing_ok=True)
        for folder in (settings.templates_dir, settings.storage_dir):
            shutil.rmtree(folder, ignore_errors=True)
            folder.mkdir(parents=True, exist_ok=True)
        for n in names:
            if n.endswith("/"):
                continue
            head, _, rest = n.partition("/")
            base = {"data": settings.data_dir, "doctemplates": settings.templates_dir,
                    "storage": settings.storage_dir}.get(head)
            if base is None:
                continue
            target = base / rest
            target.parent.mkdir(parents=True, exist_ok=True)
            with z.open(n) as src, open(target, "wb") as dst:
                shutil.copyfileobj(src, dst)
    print(f"Pemulihan selesai dari {zip_path.name}.")
    print(f"Kondisi sebelumnya disimpan di: {safety}")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit("Pemakaian: python scripts/restore.py backup/suratku_XXXX.zip")
    restore(Path(sys.argv[1]))
