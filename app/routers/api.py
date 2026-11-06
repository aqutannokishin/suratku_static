"""Endpoint JSON yang dipanggil dropdown di formulir. Semua wajib login."""
from datetime import date

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse
from sqlalchemy import select

from ..db import get_db, write_session
from ..deps import current_user
from ..doctypes import REGISTRY
from ..models import Golongan, Jabatan, NumberSeries, PersonRole, User
from ..services import numbering
from ..services.audit import audit
from ..services.generate import FormError, reserve_only
from ..services.people import (DataError, create_person, get_or_create_jabatan,
                               get_or_create_role, norm, person_dict, search_people,
                               similar_people)

router = APIRouter(prefix="/api")


def _err(msg: str, status: int = 400, **extra):
    return JSONResponse({"error": msg, **extra}, status_code=status)


@router.get("/persons/search")
def persons_search(q: str = "", user: User = Depends(current_user), db=Depends(get_db)):
    return [person_dict(p) for p in search_people(db, q)]


@router.post("/persons")
async def persons_create(request: Request, user: User = Depends(current_user)):
    """Tambah orang baru ke data master (dari halaman Data Master)."""
    data = await request.json()
    try:
        with write_session() as w:
            similar = similar_people(w, data.get("name", ""))
            if similar and not data.get("force"):
                return _err("Nama ini mirip dengan data yang sudah ada.", 409,
                            similar=[person_dict(p) for p in similar[:5]])
            p = create_person(w, user.id, data.get("name", ""), data.get("nip"),
                              data.get("golongan"), data.get("jabatan"), data.get("role"))
            audit(w, user.id, "person.create", "person", p.id, {"name": p.name})
            return person_dict(p)
    except DataError as e:
        return _err(str(e))


@router.get("/golongan")
def golongan_list(q: str = "", user: User = Depends(current_user), db=Depends(get_db)):
    rows = db.scalars(select(Golongan).order_by(Golongan.sort, Golongan.code)).all()
    ql = q.strip().lower()
    return [{"id": g.code, "label": f"{g.code} - {g.pangkat}" if g.pangkat else g.code, "name": g.code}
            for g in rows if not ql or ql in g.code.lower() or ql in g.pangkat.lower()]


@router.get("/jabatan")
def jabatan_list(q: str = "", user: User = Depends(current_user), db=Depends(get_db)):
    stmt = select(Jabatan).order_by(Jabatan.name_norm).limit(50)
    if q.strip():
        stmt = select(Jabatan).where(Jabatan.name_norm.like(f"%{norm(q)}%")).order_by(Jabatan.name_norm).limit(50)
    return [{"id": j.name, "label": j.name, "name": j.name} for j in db.scalars(stmt)]


@router.post("/jabatan")
async def jabatan_create(request: Request, user: User = Depends(current_user)):
    name = ((await request.json()).get("name") or "").strip()
    if not name:
        return _err("Nama jabatan kosong.")
    with write_session() as w:
        j = get_or_create_jabatan(w, name)
        return {"id": j.name, "label": j.name, "name": j.name}


@router.get("/roles")
def roles_list(q: str = "", user: User = Depends(current_user), db=Depends(get_db)):
    ql = q.strip().lower()
    return [{"id": r.name, "label": r.name, "name": r.name}
            for r in db.scalars(select(PersonRole).order_by(PersonRole.id)) if not ql or ql in r.name.lower()]


@router.post("/roles")
async def roles_create(request: Request, user: User = Depends(current_user)):
    name = ((await request.json()).get("name") or "").strip()
    if not name:
        return _err("Nama peran kosong.")
    with write_session() as w:
        r = get_or_create_role(w, name)
        return {"id": r.name, "label": r.name, "name": r.name}


# ---------------------------------------------------------------- nomor surat
def _series_and_date(db, doc_code: str, d_iso: str):
    spec = REGISTRY.get(doc_code)
    if spec is None or not spec.series:
        raise FormError("Jenis dokumen ini tidak memakai nomor surat.")
    series = db.scalar(select(NumberSeries).where(NumberSeries.code == spec.series))
    if series is None:
        raise FormError("Seri nomor belum dibuat.")
    try:
        d = date.fromisoformat(d_iso) if d_iso else date.today()
    except ValueError:
        d = date.today()
    return series, d


@router.get("/numbers/{doc_code}")
def numbers_info(doc_code: str, d: str = "", seq: int = 0, user: User = Depends(current_user),
                 db=Depends(get_db)):
    """Nomor berikutnya + daftar nomor tersedia untuk tanggal tertentu.
    Kalau `seq` diisi, ikut mengembalikan tampilan nomor untuk urutan itu (pratinjau nomor manual)."""
    try:
        series, dt = _series_and_date(db, doc_code, d)
    except FormError as e:
        return _err(e.messages[0], 404)
    out = {
        "next_seq": numbering.next_seq(db, series, dt),
        "next": numbering.preview_next(db, series, dt),
        "available": numbering.available_numbers(db, series, dt, user.id),
        "period": numbering.period_key(series, dt),
    }
    if seq > 0:
        out["formatted"] = numbering.format_number(series, seq, dt)
    return out


@router.post("/numbers/{doc_code}/reserve")
async def numbers_reserve(doc_code: str, request: Request, user: User = Depends(current_user),
                          db=Depends(get_db)):
    """'Ambil nomor saja' tanpa membuat dokumen."""
    data = await request.json()
    try:
        series, dt = _series_and_date(db, doc_code, data.get("date", ""))
        res = reserve_only(user.id, series.code, dt, data.get("mode", "auto"),
                           str(data.get("value", "")), bool(data.get("confirm_gap")))
    except FormError as e:
        return _err(e.messages[0], 422)
    return {"nomor": res.formatted, "seq": res.seq}
