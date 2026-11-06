"""Konversi DOCX ke PDF memakai LibreOffice (tanpa tampilan)."""
import subprocess
import threading
from pathlib import Path

from ..config import settings

# LibreOffice tidak bisa menjalankan dua konversi sekaligus pada profil yang sama.
_lock = threading.Lock()
_PROFILE = (settings.data_dir / "lo_profile").resolve()


class PdfError(Exception):
    pass


def pdf_available() -> bool:
    return bool(settings.soffice_path)


def docx_to_pdf(docx: Path, outdir: Path, timeout: int = 180) -> Path:
    if not pdf_available():
        raise PdfError("LibreOffice tidak ditemukan di komputer server ini.")
    outdir.mkdir(parents=True, exist_ok=True)
    cmd = [settings.soffice_path, f"-env:UserInstallation={_PROFILE.as_uri()}",
           "--headless", "--convert-to", "pdf", "--outdir", str(outdir), str(docx)]
    try:
        with _lock:
            proc = subprocess.run(cmd, timeout=timeout, capture_output=True, text=True)
    except subprocess.TimeoutExpired:
        raise PdfError("Konversi PDF terlalu lama (lebih dari 3 menit).")
    pdf = outdir / (docx.stem + ".pdf")
    if proc.returncode != 0 or not pdf.exists() or pdf.stat().st_size == 0:
        raise PdfError("Konversi PDF gagal. " + (proc.stderr or proc.stdout or "").strip()[:300])
    return pdf
