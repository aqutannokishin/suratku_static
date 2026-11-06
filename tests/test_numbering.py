from concurrent.futures import ThreadPoolExecutor
from datetime import date

import pytest

from app.config import settings
from app.db import SessionLocal, write_session
from app.models import User
from app.security import hash_password
from app.services import numbering

D = date(2031, 10, 5)


@pytest.fixture(scope="module")
def uid():
    with write_session() as w:
        u = User(username="nomor_tester", full_name="Tester", password_hash=hash_password("x" * 8))
        w.add(u)
        w.flush()
        return u.id


@pytest.fixture(scope="module")
def uid2():
    with write_session() as w:
        u = User(username="nomor_tester2", full_name="Tester Dua", password_hash=hash_password("x" * 8))
        w.add(u)
        w.flush()
        return u.id


def take(series, d=D, user_id=1, pick=None):
    with write_session() as w:
        return numbering.reserve(w, series, d, user_id, pick).seq


def test_format_and_roman(make_series):
    s = make_series()
    assert numbering.format_number(s, 45, date(2026, 10, 5)) == f"045/{s.code}/X/2026"
    assert numbering.format_number(s, 1, date(2026, 12, 1)).split("/")[2] == "XII"
    assert numbering.format_number(s, 1, date(2026, 4, 1)).split("/")[2] == "IV"


def test_sequential_and_period_rollover(make_series, uid):
    s = make_series()
    assert [take(s, user_id=uid) for _ in range(3)] == [1, 2, 3]
    assert take(s, date(2032, 1, 1), uid) == 1           # tahun baru mulai dari 1 lagi
    assert take(s, D, uid) == 4


def test_monthly_reset(make_series, uid):
    s = make_series(reset="monthly")
    assert take(s, date(2031, 3, 1), uid) == 1
    assert take(s, date(2031, 3, 20), uid) == 2
    assert take(s, date(2031, 4, 1), uid) == 1


def test_concurrent_numbers_are_unique_and_contiguous(make_series, uid):
    s = make_series()
    with ThreadPoolExecutor(12) as ex:
        seqs = list(ex.map(lambda _: take(s, user_id=uid), range(60)))
    assert sorted(seqs) == list(range(1, 61))


def test_pick_gap_and_reuse_void(make_series, uid):
    s = make_series()
    take(s, user_id=uid)                                  # 1
    take(s, user_id=uid, pick=4)                          # 4 -> 2 dan 3 terlompat
    db = SessionLocal()
    avail = {a["seq"]: a["why"] for a in numbering.available_numbers(db, s, D, uid)}
    db.close()
    assert avail[2] == "terlompat" and avail[3] == "terlompat"
    assert avail[4] == "diambil, belum dipakai"
    assert 1 in avail                                     # nomor 1 juga masih 'diambil, belum dipakai'
    assert take(s, user_id=uid, pick=2) == 2
    assert take(s, user_id=uid) == 5                      # 'berikutnya' tetap setelah nomor tertinggi


def test_used_number_cannot_be_picked_and_other_users_reservation_blocked(make_series, uid, uid2):
    s = make_series()
    take(s, user_id=uid)
    with write_session() as w:
        from app.models import NumberReservation
        w.query(NumberReservation).filter_by(series_id=s.id, seq=1).one().status = "used"
    with pytest.raises(numbering.NumberTaken):
        take(s, user_id=uid, pick=1)
    take(s, user_id=uid)                                  # 2, diambil uid
    with pytest.raises(numbering.NumberTaken):
        take(s, user_id=uid2, pick=2)                    # orang lain tidak boleh mengambil


def test_void_then_reuse(make_series, uid, uid2):
    s = make_series()
    take(s, user_id=uid)
    take(s, user_id=uid)
    with write_session() as w:
        from app.models import NumberReservation
        r = w.query(NumberReservation).filter_by(series_id=s.id, seq=1).one()
        numbering.void(w, r.id, "salah ketik")
    db = SessionLocal()
    assert any(a["seq"] == 1 and a["why"] == "dibatalkan" for a in numbering.available_numbers(db, s, D, 1))
    db.close()
    assert take(s, user_id=uid2, pick=1) == 1             # nomor batal boleh dipakai siapa saja


def test_void_not_reusable_when_disabled(make_series, uid, monkeypatch):
    monkeypatch.setattr(settings, "allow_reuse_void", False)
    s = make_series()
    take(s, user_id=uid)
    with write_session() as w:
        from app.models import NumberReservation
        numbering.void(w, w.query(NumberReservation).filter_by(series_id=s.id, seq=1).one().id, "x")
    db = SessionLocal()
    assert not [a for a in numbering.available_numbers(db, s, D, uid) if a["seq"] == 1]
    db.close()
    with pytest.raises(numbering.NumberTaken):
        take(s, user_id=uid, pick=1)


def test_cannot_void_used(make_series, uid):
    s = make_series()
    take(s, user_id=uid)
    with write_session() as w:
        from app.models import NumberReservation
        r = w.query(NumberReservation).filter_by(series_id=s.id, seq=1).one()
        r.status = "used"
        with pytest.raises(ValueError):
            numbering.void(w, r.id, "x")


@pytest.mark.parametrize("pattern,ok", [
    ("{seq:03d}/{kode}/{romawi}/{tahun}", True),
    ("B-{seq}/{kode}/{bulan}/{tahun}", True),
    ("{kode}/{tahun}", False),                      # tanpa {seq}
    ("{seq:03d}/{salah}", False),                   # variabel tidak dikenal
    ("{seq.__class__}", False),                     # akses atribut ditolak
    ("{seq!r}", False),
    ("{seq", False),
])
def test_validate_pattern(pattern, ok):
    assert (numbering.validate_pattern(pattern) is None) == ok
