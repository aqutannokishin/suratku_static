"""Nomor surat: hitung, ambil, pilih yang tersedia, batalkan.

Jaminan utama: tabel `number_reservations` punya aturan UNIQUE (seri, periode, urutan).
Jadi walaupun ada bug atau dua orang menekan tombol bersamaan, dua dokumen
TIDAK MUNGKIN mendapat nomor yang sama.
"""
import string
from datetime import date, datetime

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError

from ..config import settings
from ..models import NumberReservation as NR
from ..models import NumberSeries

ROMAN = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"]
ALLOWED_FIELDS = {"seq", "kode", "romawi", "bulan", "tahun"}
RESET_CHOICES = {"yearly": "Setiap tahun mulai dari 1", "monthly": "Setiap bulan mulai dari 1",
                 "never": "Tidak pernah di-reset"}


class NumberTaken(Exception):
    """Nomor yang diminta sudah dipakai atau tidak boleh dipakai."""


def validate_pattern(pattern: str) -> str | None:
    """Kembalikan pesan error kalau pola tidak valid, None kalau aman."""
    try:
        parts = list(string.Formatter().parse(pattern))
    except ValueError as e:
        return f"Pola tidak valid: {e}"
    names = []
    for _lit, field, spec, conv in parts:
        if field is None:
            continue
        if field not in ALLOWED_FIELDS:
            return (f"Bagian {{{field}}} tidak dikenal. "
                    f"Yang boleh: {', '.join('{' + f + '}' for f in sorted(ALLOWED_FIELDS))}")
        if conv:
            return "Tanda ! tidak diperbolehkan di pola."
        if spec and not (spec.isdigit() or (spec.endswith("d") and spec[:-1].isdigit())
                         or (spec.startswith("0") and spec.endswith("d"))):
            return f"Format {{{field}:{spec}}} tidak didukung. Contoh yang benar: {{seq:03d}}"
        names.append(field)
    if "seq" not in names:
        return "Pola harus memuat {seq} (nomor urut), contoh: {seq:03d}/{kode}/{romawi}/{tahun}"
    return None


def period_key(series: NumberSeries, d: date) -> str:
    return {"yearly": f"{d.year}", "monthly": f"{d.year}-{d.month:02d}", "never": "all"}[series.reset]


def format_number(series: NumberSeries, seq: int, d: date) -> str:
    return series.pattern.format(seq=seq, kode=series.code, romawi=ROMAN[d.month],
                                 bulan=d.month, tahun=d.year)


def next_seq(db, series: NumberSeries, d: date) -> int:
    last = db.scalar(select(func.max(NR.seq)).where(
        NR.series_id == series.id, NR.period_key == period_key(series, d))) or 0
    return last + 1


def preview_next(db, series: NumberSeries, d: date) -> str:
    return format_number(series, next_seq(db, series, d), d)


def available_numbers(db, series: NumberSeries, d: date, user_id: int, limit: int = 60) -> list[dict]:
    """Nomor yang boleh dipilih selain 'berikutnya':
       - nomor batal (kalau ALLOW_REUSE_VOID aktif)
       - nomor yang sudah diambil user ini tapi belum jadi dokumen
       - nomor yang terlompat (ada celah di bawah nomor tertinggi)"""
    pk = period_key(series, d)
    rows = db.scalars(select(NR).where(NR.series_id == series.id, NR.period_key == pk)).all()
    out = []
    for r in rows:
        if r.status == "void" and settings.allow_reuse_void:
            out.append({"seq": r.seq, "formatted": r.formatted, "why": "dibatalkan"})
        elif r.status == "reserved" and r.reserved_by == user_id:
            out.append({"seq": r.seq, "formatted": r.formatted, "why": "diambil, belum dipakai"})
    seen = {r.seq for r in rows}
    top = max(seen, default=0)
    for n in range(1, top + 1):
        if n not in seen:
            out.append({"seq": n, "formatted": format_number(series, n, d), "why": "terlompat"})
    return sorted(out, key=lambda x: x["seq"])[:limit]


def reserve(db, series: NumberSeries, d: date, user_id: int, pick_seq: int | None = None) -> NR:
    """Ambil nomor. Panggil di dalam `write_session()`; commit dilakukan pemanggil."""
    pk = period_key(series, d)
    for _ in range(5):
        try:
            with db.begin_nested():                      # savepoint
                if pick_seq is None:
                    seq = next_seq(db, series, d)
                else:
                    seq = pick_seq
                    if seq < 1:
                        raise NumberTaken("Nomor urut harus 1 atau lebih.")
                    ex = db.scalar(select(NR).where(
                        NR.series_id == series.id, NR.period_key == pk, NR.seq == seq))
                    if ex:
                        reusable = ((ex.status == "void" and settings.allow_reuse_void) or
                                    (ex.status == "reserved" and ex.reserved_by == user_id))
                        if not reusable:
                            raise NumberTaken(f"Nomor {ex.formatted} sudah dipakai dan tidak bisa dipilih.")
                        ex.status = "reserved"
                        ex.reserved_by = user_id
                        ex.reserved_at = datetime.now()
                        ex.void_reason = None
                        ex.formatted = format_number(series, seq, d)
                        db.flush()
                        return ex
                r = NR(series_id=series.id, period_key=pk, seq=seq,
                       formatted=format_number(series, seq, d),
                       status="reserved", reserved_by=user_id)
                db.add(r)
                db.flush()
                return r
        except IntegrityError:
            if pick_seq is not None:
                raise NumberTaken("Nomor itu baru saja diambil orang lain.")
            continue                                      # kalah cepat, coba nomor berikutnya
    raise RuntimeError("Gagal mengambil nomor surat, silakan coba lagi.")


def void(db, reservation_id: int, reason: str) -> NR:
    r = db.get(NR, reservation_id)
    if r is None:
        raise ValueError("Nomor tidak ditemukan.")
    if r.status == "used":
        raise ValueError("Nomor sudah dipakai dokumen. Batalkan dokumennya dulu di menu Riwayat.")
    r.status = "void"
    r.void_reason = reason or "tanpa alasan"
    return r
