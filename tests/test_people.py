import io

import pytest
from openpyxl import Workbook

from app.db import SessionLocal, write_session
from app.models import Jabatan, Person
from app.services import people


def test_clean_nip():
    assert people.clean_nip("1990 0101 201501 1 001") == "199001012015011001"
    assert people.clean_nip("") is None and people.clean_nip(None) is None
    with pytest.raises(people.DataError):
        people.clean_nip("12345")


def test_create_person_rules():
    with write_session() as w:
        p = people.create_person(w, None, "  Siti   Aminah ", "199001012015011002", "III/a", "Staf", "Pegawai")
        assert p.name == "Siti Aminah" and p.golongan.code == "III/a"
    with write_session() as w:
        with pytest.raises(people.DataError):                       # NIP ganda
            people.create_person(w, None, "Orang Lain", "199001012015011002", None, None, None)
    with write_session() as w:
        people.create_person(w, None, "Mitra Satu", None, None, "Petugas", "Mitra")
        with pytest.raises(people.DataError):                       # nama sama tanpa NIP
            people.create_person(w, None, "mitra   satu", None, None, None, None)


def test_get_or_create_is_case_and_space_insensitive():
    with write_session() as w:
        a = people.get_or_create_jabatan(w, "Kepala  Seksi")
        b = people.get_or_create_jabatan(w, "kepala seksi")
        assert a.id == b.id
        g = people.get_or_create_golongan(w, "III/a - Penata Muda")
        assert g.code == "III/a"
        assert people.get_or_create_role(w, "ppl").name == "PPL"    # tidak membuat 'ppl' baru


def test_similar_people():
    with write_session() as w:
        people.create_person(w, None, "Muhammad Julian Firdaus", "199001012015011003", None, None, None)
    db = SessionLocal()
    assert people.similar_people(db, "Muhamad Julian Firdaus")
    assert not people.similar_people(db, "Budi Santoso Wijaya")
    db.close()


def test_resolve_row_creates_then_reuses_and_respects_update_master():
    warnings = []
    row = {"name": "Dewi Lestari", "nip": "", "golongan": "II/c", "jabatan": "Bendahara", "role": "Pegawai"}
    with write_session() as w:
        snap1 = people.resolve_row(w, row, 1, False, warnings)
    with write_session() as w:
        snap2 = people.resolve_row(w, dict(row, jabatan="Kasubbag"), 1, False, warnings)
        assert snap2["id"] == snap1["id"]                           # orang yang sama
        assert snap2["jabatan"] == "Kasubbag"                       # dokumen ini memakai isian baru
        assert w.get(Person, snap1["id"]).jabatan.name == "Bendahara"   # master tidak berubah
    with write_session() as w:
        people.resolve_row(w, dict(row, jabatan="Kasubbag"), 1, True, warnings)
        assert w.get(Person, snap1["id"]).jabatan.name == "Kasubbag"    # sekarang master ikut berubah


def test_merge_people():
    with write_session() as w:
        a = people.create_person(w, None, "Ganda Satu", "199001012015011010", "III/b", None, None)
        b = people.create_person(w, None, "Ganda Satu", None, None, "Analis", None)
        aid, bid = a.id, b.id
        people.merge_people(w, aid, bid)           # a (punya NIP) digabung ke b (tanpa NIP)
    db = SessionLocal()
    a, b = db.get(Person, aid), db.get(Person, bid)
    assert not a.is_active and b.is_active
    assert b.nip == "199001012015011010" and b.golongan.code == "III/b" and b.jabatan.name == "Analis"
    db.close()


def _xlsx(rows):
    wb = Workbook()
    ws = wb.active
    for r in rows:
        ws.append(r)
    bio = io.BytesIO()
    wb.save(bio)
    return bio.getvalue()


def test_import_people_idempotent_and_errors():
    data = _xlsx([
        ["Nama", "NIP", "Golongan", "Jabatan", "Role"],
        ["Impor Satu", "199001012015011020", "III/c", "Staf", "Pegawai"],
        ["Impor Dua", None, None, "Petugas Lapangan", "Mitra"],
        ["Impor Rusak", "123", None, None, None],
        ["Contoh Nama Pegawai (hapus baris ini)", None, None, None, None],
        [None, None, None, None, None],
    ])
    with write_session() as w:
        r1 = people.import_people(w, data, 1)
    assert r1["added"] == 2 and len(r1["errors"]) == 1 and r1["skipped"] == 1
    assert "Impor Rusak" in r1["errors"][0]
    with write_session() as w:
        r2 = people.import_people(w, data, 1)                       # diulang: tidak menggandakan
    assert r2["added"] == 0 and r2["skipped"] >= 2
    db = SessionLocal()
    assert db.query(Person).filter(Person.name == "Impor Satu").count() == 1
    db.close()


def test_import_numeric_nip_cell():
    data = _xlsx([["Nama", "NIP"], ["Angka Murni", 199001012015011030]])     # Excel menyimpan angka
    with write_session() as w:
        assert people.import_people(w, data, 1)["added"] == 1


def test_import_template_is_valid_and_wrong_file_rejected():
    tpl = people.build_import_template()
    with write_session() as w:
        r = people.import_people(w, tpl, 1)
        assert r["added"] == 0 and r["skipped"] == 2                # dua baris contoh dilewati
    with write_session() as w:
        with pytest.raises(people.DataError):
            people.import_people(w, _xlsx([["Kolom", "Lain"], ["a", "b"]]), 1)
