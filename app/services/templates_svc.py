"""Template Word per jenis dokumen: versi, validasi, unggah."""
import hashlib
import shutil
import tempfile
from datetime import date
from pathlib import Path

from sqlalchemy import func, select

from ..config import settings
from ..doctypes import REGISTRY, DocTypeSpec
from ..models import TemplateVersion
from .render import render_docx, template_variables


def sha256_of(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def active_template(db, code: str) -> TemplateVersion | None:
    return db.scalar(select(TemplateVersion).where(
        TemplateVersion.doctype_code == code, TemplateVersion.is_active.is_(True)))


def template_file(tv: TemplateVersion) -> Path:
    return settings.templates_dir / tv.file_path


def sample_context(spec: DocTypeSpec) -> dict:
    """Data contoh untuk uji coba isi template."""
    person = {"id": 0, "nama": "Contoh Nama", "nip": "199001012015011001", "golongan": "III/a",
              "pangkat": "Penata Muda", "jabatan": "Staf", "role": "Pegawai"}
    ctx: dict = {"nomor": "001/XX/I/2026"}
    for f in spec.fields:
        if f.kind == "person":
            ctx[f.key] = dict(person)
        elif f.kind == "person_multi":
            ctx[f.key] = [dict(person), dict(person, nama="Contoh Nama Dua", nip="")]
        elif f.kind == "date":
            ctx[f.key] = "5 Oktober 2026"
        elif f.kind == "textarea":
            ctx[f.key] = "Baris pertama\nBaris kedua & contoh <tanda>"
        else:
            ctx[f.key] = "contoh"
    return ctx


def validate_template(path: Path, spec: DocTypeSpec) -> list[str]:
    """Periksa template. Kembalikan daftar masalah (kosong = aman)."""
    errors: list[str] = []
    try:
        used = template_variables(path)
    except Exception as e:  # file rusak / sintaks salah
        return [f"File tidak bisa dibaca sebagai template Word: {e}"]

    allowed = {f.key for f in spec.fields} | {"nomor", "loop", "p"}
    unknown = sorted(v for v in used if v not in allowed)
    if unknown:
        errors.append("Variabel tidak dikenal: " + ", ".join("{{ " + u + " }}" for u in unknown)
                      + ". Cek ejaan, atau lihat daftar variabel yang tersedia di halaman ini.")
    if spec.series and "nomor" not in used:
        errors.append("Template tidak memuat {{ nomor }}. Surat tanpa nomor tidak ada gunanya.")
    if errors:
        return errors

    # uji coba isi: menangkap kesalahan sintaks perulangan, dll.
    with tempfile.TemporaryDirectory() as tmp:
        try:
            render_docx(path, sample_context(spec), Path(tmp) / "uji.docx")
        except Exception as e:
            errors.append(f"Template gagal diisi saat uji coba: {e}")
    return errors


def register_template(db, code: str, src: Path, user_id: int | None, note: str = "") -> TemplateVersion:
    """Simpan file sebagai versi baru dan jadikan aktif."""
    last = db.scalar(select(func.max(TemplateVersion.version)).where(
        TemplateVersion.doctype_code == code)) or 0
    version = last + 1
    rel = f"{code}/v{version}.docx"
    dest = settings.templates_dir / rel
    dest.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(src, dest)
    for old in db.scalars(select(TemplateVersion).where(
            TemplateVersion.doctype_code == code, TemplateVersion.is_active.is_(True))):
        old.is_active = False
    tv = TemplateVersion(doctype_code=code, version=version, file_path=rel,
                         sha256=sha256_of(dest), uploaded_by=user_id, is_active=True, note=note or None)
    db.add(tv)
    db.flush()
    return tv


def seed_default_templates(db) -> None:
    """Pada pemakaian pertama: pasang template contoh bawaan untuk jenis dokumen yang belum punya."""
    seed_dir = Path(__file__).resolve().parent.parent / "seed_templates"
    for code in REGISTRY:
        if active_template(db, code):
            continue
        src = seed_dir / f"{code}.docx"
        if src.exists():
            register_template(db, code, src, None, note="Template contoh bawaan")
