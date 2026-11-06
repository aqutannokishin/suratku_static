"""Alur pembuatan dokumen.

Urutan (sengaja dibuat begini supaya database tidak terkunci lama):
  1. Transaksi singkat : validasi isian, simpan orang baru, AMBIL NOMOR, commit.
  2. Kerja lambat      : isi template Word, ubah ke PDF (tanpa mengunci database).
  3. Transaksi singkat : simpan catatan dokumen, tandai nomor 'dipakai', commit.
Kalau langkah 2 gagal, nomor tetap 'diambil' dan muncul di daftar nomor tersedia,
jadi tidak ada nomor yang hilang diam-diam.
"""
import re
from dataclasses import dataclass, field
from datetime import date, datetime
from pathlib import Path

from sqlalchemy import select

from ..config import settings
from ..db import write_session
from ..doctypes import DocTypeSpec
from ..models import Document, NumberSeries
from ..models import NumberReservation as NR
from . import numbering
from .audit import audit
from .pdf import PdfError, docx_to_pdf
from .people import DataError, clean_text, parse_people, resolve_row
from .render import render_docx, tgl_indo
from .templates_svc import active_template, template_file

EMPTY_PERSON = {"id": None, "nama": "", "nip": "", "golongan": "", "pangkat": "", "jabatan": "", "role": ""}


class FormError(Exception):
    """Isian formulir bermasalah. `messages` aman ditampilkan ke pengguna."""

    def __init__(self, messages):
        self.messages = [messages] if isinstance(messages, str) else list(messages)
        super().__init__("; ".join(self.messages))


class GenerateError(Exception):
    """Gagal di tengah pembuatan file (setelah nomor diambil)."""


@dataclass
class GenerateResult:
    doc_id: int
    nomor: str | None
    warnings: list = field(default_factory=list)
    pdf_error: str | None = None


def safe_filename(s: str) -> str:
    return re.sub(r'[\\/:*?"<>|\s]+', "-", s).strip("-") or "dokumen"


def parse_iso(value: str, label: str) -> date:
    try:
        return date.fromisoformat((value or "").strip())
    except ValueError:
        raise FormError(f"{label}: tanggal tidak valid.")


def storage_path(rel: str) -> Path:
    """Ubah path relatif di database menjadi path file; tolak yang keluar dari folder storage."""
    base = settings.storage_dir.resolve()
    p = (base / rel).resolve()
    if base not in p.parents and p != base:
        raise ValueError("Path tidak valid")
    return p


def build_context(db, user_id: int, spec: DocTypeSpec, form, warnings: list):
    """Baca formulir -> (isi template, salinan isian untuk arsip, tanggal surat)."""
    ctx: dict = {}
    payload: dict = {"fields": {}, "people": {}}
    errors: list[str] = []
    doc_date: date | None = None
    update_master = form.get("update_master") == "on"

    for f in spec.fields:
        if f.kind in ("person", "person_multi"):
            rows = parse_people(form, f.key)
            if f.required and not rows:
                errors.append(f"{f.label}: isi minimal satu orang (nama wajib).")
            resolved = []
            for r in rows:
                try:
                    resolved.append(resolve_row(db, r, user_id, update_master, warnings))
                except DataError as e:
                    errors.append(f"{f.label}: {e}")
            if f.kind == "person":
                ctx[f.key] = resolved[0] if resolved else dict(EMPTY_PERSON)
            else:
                ctx[f.key] = resolved
            payload["people"][f.key] = resolved
            continue

        raw = (form.get(f.key) or "").strip()
        if not raw:
            if f.required:
                errors.append(f"{f.label}: wajib diisi.")
            ctx[f.key] = ""
            payload["fields"][f.key] = ""
            continue

        if f.kind == "date":
            try:
                d = parse_iso(raw, f.label)
            except FormError as e:
                errors.extend(e.messages)
                continue
            ctx[f.key] = tgl_indo(d)
            payload["fields"][f.key] = d.isoformat()
            if f.key == "tanggal":
                doc_date = d
        elif f.kind == "textarea":
            text = "\n".join(line.rstrip() for line in raw.replace("\r\n", "\n").split("\n"))
            ctx[f.key] = text
            payload["fields"][f.key] = text
        elif f.kind == "choice":
            if f.choices and raw not in f.choices:
                errors.append(f"{f.label}: pilihan tidak valid.")
            ctx[f.key] = raw
            payload["fields"][f.key] = raw
        else:
            ctx[f.key] = clean_text(raw)
            payload["fields"][f.key] = ctx[f.key]

    if errors:
        raise FormError(errors)
    return ctx, payload, doc_date or date.today()


def _choose_seq(db, series: NumberSeries, d: date, mode: str, pick: str, manual: str,
                confirm_gap: bool) -> int | None:
    """Terjemahkan pilihan nomor di formulir menjadi nomor urut (None = otomatis berikutnya)."""
    if mode == "pick":
        try:
            return int(pick)
        except (TypeError, ValueError):
            raise FormError("Pilih salah satu nomor dari daftar 'nomor tersedia'.")
    if mode == "manual":
        try:
            seq = int(manual)
        except (TypeError, ValueError):
            raise FormError("Nomor manual harus berupa angka.")
        nxt = numbering.next_seq(db, series, d)
        if seq > nxt and not confirm_gap:
            raise FormError(f"Nomor {seq} akan melompati nomor berikutnya ({nxt}). "
                            "Centang kotak konfirmasi lompat nomor kalau memang disengaja.")
        return seq
    return None


def generate(user_id: int, spec: DocTypeSpec, form, want_pdf: bool) -> GenerateResult:
    warnings: list[str] = []

    # ---- 1. transaksi singkat: validasi + ambil nomor ---------------------------------
    with write_session() as w:
        tv = active_template(w, spec.code)
        if tv is None or not template_file(tv).exists():
            raise FormError("Template Word untuk jenis dokumen ini belum ada. "
                            "Minta admin mengunggahnya di menu Admin > Template.")
        tv_id, tpath = tv.id, template_file(tv)

        ctx, payload, doc_date = build_context(w, user_id, spec, form, warnings)

        res_id, nomor = None, None
        if spec.series:
            series = w.scalar(select(NumberSeries).where(NumberSeries.code == spec.series))
            if series is None:
                raise FormError(f"Seri nomor '{spec.series}' belum dibuat. Hubungi admin.")
            seq = _choose_seq(w, series, doc_date, form.get("nomor_mode", "auto"),
                              form.get("nomor_pick"), form.get("nomor_manual"),
                              form.get("confirm_gap") == "on")
            try:
                res = numbering.reserve(w, series, doc_date, user_id, seq)
            except numbering.NumberTaken as e:
                raise FormError(str(e))
            res_id, nomor = res.id, res.formatted
            ctx["nomor"] = nomor
            audit(w, user_id, "number.reserve", "number", res_id, {"nomor": nomor})

    # ---- 2. kerja lambat: buat file ---------------------------------------------------
    rel_dir = Path(spec.code) / str(doc_date.year)
    base = f"{safe_filename(nomor or spec.code)}_{datetime.now():%Y%m%d%H%M%S}"
    docx_rel = (rel_dir / f"{base}.docx").as_posix()
    docx_abs = storage_path(docx_rel)
    try:
        render_docx(tpath, ctx, docx_abs)
    except Exception as e:
        hint = f" Nomor {nomor} tetap tersimpan dan bisa dipilih lagi." if nomor else ""
        raise GenerateError(f"Dokumen gagal dibuat: {e}.{hint}")

    pdf_rel, pdf_error = None, None
    if want_pdf:
        try:
            pdf_abs = docx_to_pdf(docx_abs, docx_abs.parent)
            pdf_rel = (rel_dir / pdf_abs.name).as_posix()
        except PdfError as e:
            pdf_error = f"{e} File Word tetap berhasil dibuat."

    # ---- 3. transaksi singkat: catat hasil --------------------------------------------
    with write_session() as w:
        doc = Document(doctype_code=spec.code, nomor=nomor, doc_date=doc_date, reservation_id=res_id,
                       payload=payload, template_version_id=tv_id, docx_path=docx_rel,
                       pdf_path=pdf_rel, created_by=user_id)
        w.add(doc)
        w.flush()
        if res_id:
            w.get(NR, res_id).status = "used"
        audit(w, user_id, "document.create", "document", doc.id,
              {"type": spec.code, "nomor": nomor, "pdf": bool(pdf_rel)})
    return GenerateResult(doc.id, nomor, warnings, pdf_error)


def reserve_only(user_id: int, series_code: str, d: date, mode: str, value: str,
                 confirm_gap: bool) -> NR:
    """Tombol 'Ambil nomor saja': ambil nomor tanpa membuat dokumen."""
    with write_session() as w:
        series = w.scalar(select(NumberSeries).where(NumberSeries.code == series_code))
        if series is None:
            raise FormError("Seri nomor tidak ditemukan.")
        seq = _choose_seq(w, series, d, mode, value, value, confirm_gap)
        try:
            res = numbering.reserve(w, series, d, user_id, seq)
        except numbering.NumberTaken as e:
            raise FormError(str(e))
        audit(w, user_id, "number.reserve", "number", res.id, {"nomor": res.formatted, "only": True})
        return res
