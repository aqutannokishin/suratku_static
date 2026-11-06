"""Isi awal database (aman dijalankan berulang kali)."""
from sqlalchemy import select

from .db import engine, write_session
from .doctypes import REGISTRY
from .models import Base, Golongan, NumberSeries, PersonRole
from .services.templates_svc import seed_default_templates

# Golongan PNS. Golongan lain (PPPK dll.) bisa ditambah lewat pilihan "Lain-lain" di formulir.
GOLONGAN = [
    ("I/a", "Juru Muda"), ("I/b", "Juru Muda Tk. I"), ("I/c", "Juru"), ("I/d", "Juru Tk. I"),
    ("II/a", "Pengatur Muda"), ("II/b", "Pengatur Muda Tk. I"), ("II/c", "Pengatur"),
    ("II/d", "Pengatur Tk. I"),
    ("III/a", "Penata Muda"), ("III/b", "Penata Muda Tk. I"), ("III/c", "Penata"),
    ("III/d", "Penata Tk. I"),
    ("IV/a", "Pembina"), ("IV/b", "Pembina Tk. I"), ("IV/c", "Pembina Utama Muda"),
    ("IV/d", "Pembina Utama Madya"), ("IV/e", "Pembina Utama"),
]
ROLES = ["Pegawai", "PPL", "PML", "Mitra"]

# kode, nama, pola nomor, reset.  Pola: {seq:03d}=urutan 3 digit, {kode}, {romawi}=bulan romawi, {tahun}
SERIES = [
    ("ST", "Surat Tugas", "{seq:03d}/{kode}/{romawi}/{tahun}", "yearly"),
    ("SK", "Surat Keterangan", "{seq:03d}/{kode}/{romawi}/{tahun}", "yearly"),
]


def init_db() -> None:
    Base.metadata.create_all(engine)
    with write_session() as db:
        existing = {g.code for g in db.scalars(select(Golongan))}
        for i, (code, pangkat) in enumerate(GOLONGAN):
            if code not in existing:
                db.add(Golongan(code=code, pangkat=pangkat, sort=i))
        names = {r.name for r in db.scalars(select(PersonRole))}
        for r in ROLES:
            if r not in names:
                db.add(PersonRole(name=r))
        codes = {s.code for s in db.scalars(select(NumberSeries))}
        needed = {spec.series for spec in REGISTRY.values() if spec.series}
        for code, name, pattern, reset in SERIES:
            if code not in codes and code in needed:
                db.add(NumberSeries(code=code, name=name, pattern=pattern, reset=reset))
        db.flush()
        seed_default_templates(db)
