"""Mengisi template Word (docxtpl) dan memeriksa variabel template."""
from datetime import date
from pathlib import Path

from docxtpl import DocxTemplate, Listing

BULAN = ["", "Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli",
         "Agustus", "September", "Oktober", "November", "Desember"]
HARI = ["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu", "Minggu"]


def tgl_indo(d: date) -> str:
    return f"{d.day} {BULAN[d.month]} {d.year}"


def hari_indo(d: date) -> str:
    return HARI[d.weekday()]


def _prepare(context: dict) -> dict:
    """Teks yang berisi baris baru dibungkus Listing supaya jadi baris baru di Word."""
    out = {}
    for k, v in context.items():
        out[k] = Listing(v) if isinstance(v, str) and ("\n" in v or "\r" in v) else v
    return out


def render_docx(template_path: Path, context: dict, out_path: Path) -> None:
    tpl = DocxTemplate(str(template_path))
    # autoescape=True penting: tanda & < > di isian tidak boleh merusak file Word
    tpl.render(_prepare(context), autoescape=True)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    tpl.save(str(out_path))


def template_variables(template_path: Path) -> set[str]:
    return set(DocxTemplate(str(template_path)).get_undeclared_template_variables())
