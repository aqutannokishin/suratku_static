"""Halaman utama untuk pengguna: beranda, formulir dokumen, riwayat, daftar nomor."""
from datetime import date

from fastapi import APIRouter, Depends, Form, HTTPException, Request
from fastapi.responses import FileResponse, RedirectResponse
from sqlalchemy import String, cast, func, or_, select
from starlette.concurrency import run_in_threadpool

from ..db import get_db, write_session
from ..deps import admin_user, current_user
from ..doctypes import REGISTRY
from ..models import Document, Golongan, Jabatan, NumberSeries, PersonRole, User
from ..models import NumberReservation as NR
from ..services import numbering
from ..services.audit import audit
from ..services.generate import FormError, GenerateError, generate, parse_iso, storage_path
from ..services.pdf import pdf_available
from ..services.people import parse_people
from ..web import flash, render

router = APIRouter()
PAGE_SIZE = 100


@router.get("/")
def home(request: Request, user: User = Depends(current_user), db=Depends(get_db)):
    recent = db.scalars(select(Document).order_by(Document.created_at.desc()).limit(8)).all()
    return render(request, "home.html", user=user, specs=list(REGISTRY.values()), recent=recent)


# ---------------------------------------------------------------- formulir dokumen
def _render_form(request, user, db, spec, form=None, errors=None, status_code=200):
    values = {}
    prefill = {}
    for f in spec.fields:
        if f.kind in ("person", "person_multi"):
            rows = parse_people(form, f.key) if form is not None else []
            prefill[f.key] = rows or [{}]
    if form is not None:
        values = {k: v for k, v in form.multi_items()}
    return render(
        request, "form.html", status_code=status_code, user=user, spec=spec, errors=errors or [],
        values=values, prefill=prefill, today=date.today().isoformat(),
        golongan=db.scalars(select(Golongan).order_by(Golongan.sort, Golongan.code)).all(),
        jabatan=db.scalars(select(Jabatan).order_by(Jabatan.name_norm)).all(),
        roles=db.scalars(select(PersonRole).order_by(PersonRole.id)).all())


def _spec_or_404(code: str):
    spec = REGISTRY.get(code)
    if spec is None:
        raise HTTPException(404)
    return spec


@router.get("/documents/new/{code}")
def form_page(code: str, request: Request, user: User = Depends(current_user), db=Depends(get_db)):
    return _render_form(request, user, db, _spec_or_404(code))


@router.post("/documents/new/{code}")
async def form_submit(code: str, request: Request, user: User = Depends(current_user),
                      db=Depends(get_db)):
    spec = _spec_or_404(code)
    form = await request.form()
    want_pdf = form.get("make_pdf") == "on" and pdf_available()
    try:
        result = await run_in_threadpool(generate, user.id, spec, form, want_pdf)
    except FormError as e:
        return _render_form(request, user, db, spec, form, e.messages, status_code=422)
    except GenerateError as e:
        return _render_form(request, user, db, spec, form, [str(e)], status_code=500)
    # Sesi baca ini dibuka sebelum dokumen disimpan, jadi masih "melihat" data lama.
    # Akhiri transaksinya supaya pembacaan berikutnya melihat dokumen yang baru dibuat.
    db.rollback()
    doc = db.get(Document, result.doc_id)
    return render(request, "result.html", user=user, spec=spec, doc=doc, result=result)


# ---------------------------------------------------------------- unduh & riwayat
@router.get("/documents/{doc_id}/download")
def download(doc_id: int, fmt: str = "docx", user: User = Depends(current_user), db=Depends(get_db)):
    doc = db.get(Document, doc_id)
    if doc is None:
        raise HTTPException(404)
    rel = doc.pdf_path if fmt == "pdf" else doc.docx_path
    if not rel:
        raise HTTPException(404, "File PDF tidak tersedia untuk dokumen ini.")
    try:
        path = storage_path(rel)
    except ValueError:
        raise HTTPException(404, "File tidak ditemukan di server.")
    if not path.exists():
        raise HTTPException(404, "File tidak ditemukan di server.")
    media = ("application/pdf" if fmt == "pdf" else
             "application/vnd.openxmlformats-officedocument.wordprocessingml.document")
    return FileResponse(path, media_type=media, filename=path.name)


@router.get("/documents")
def history(request: Request, type: str = "", q: str = "", page: int = 1,
            user: User = Depends(current_user), db=Depends(get_db)):
    stmt = select(Document)
    if type in REGISTRY:
        stmt = stmt.where(Document.doctype_code == type)
    if q.strip():
        like = f"%{q.strip()}%"
        stmt = stmt.where(or_(Document.nomor.like(like), cast(Document.payload, String).like(like)))
    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    page = max(page, 1)
    docs = db.scalars(stmt.order_by(Document.created_at.desc())
                      .limit(PAGE_SIZE).offset((page - 1) * PAGE_SIZE)).all()
    return render(request, "history.html", user=user, docs=docs, type=type, q=q, page=page,
                  total=total, pages=max((total + PAGE_SIZE - 1) // PAGE_SIZE, 1))


@router.post("/documents/{doc_id}/cancel")
def cancel_document(doc_id: int, request: Request, reason: str = Form(""),
                    user: User = Depends(admin_user)):
    reason = reason.strip()
    if not reason:
        flash(request, "Alasan pembatalan wajib diisi.", "error")
        return RedirectResponse("/documents", status_code=303)
    with write_session() as w:
        doc = w.get(Document, doc_id)
        if doc is None or doc.cancelled:
            flash(request, "Dokumen tidak ditemukan atau sudah dibatalkan.", "error")
            return RedirectResponse("/documents", status_code=303)
        doc.cancelled, doc.cancel_reason = True, reason
        if doc.reservation_id:
            res = w.get(NR, doc.reservation_id)
            res.status, res.void_reason = "void", f"Dokumen dibatalkan: {reason}"
            doc.reservation_id = None
        audit(w, user.id, "document.cancel", "document", doc.id, {"nomor": doc.nomor, "reason": reason})
    flash(request, "Dokumen dibatalkan. Nomornya sekarang berstatus batal.")
    return RedirectResponse("/documents", status_code=303)


# ---------------------------------------------------------------- daftar nomor surat
@router.get("/numbers")
def numbers_page(request: Request, series: str = "", period: str = "",
                 user: User = Depends(current_user), db=Depends(get_db)):
    all_series = db.scalars(select(NumberSeries).order_by(NumberSeries.code)).all()
    cur = next((s for s in all_series if s.code == series), all_series[0] if all_series else None)
    rows, periods, now_period = [], [], ""
    if cur:
        now_period = numbering.period_key(cur, date.today())
        periods = [p for (p,) in db.execute(select(NR.period_key).where(NR.series_id == cur.id)
                                            .distinct().order_by(NR.period_key.desc()))]
        if now_period not in periods:
            periods.insert(0, now_period)
        period = period if period in periods else now_period
        rows = db.scalars(select(NR).where(NR.series_id == cur.id, NR.period_key == period)
                          .order_by(NR.seq.desc())).all()
    docs = {d.reservation_id: d for d in db.scalars(
        select(Document).where(Document.reservation_id.in_([r.id for r in rows]))).all()} if rows else {}
    return render(request, "numbers.html", user=user, all_series=all_series, cur=cur,
                  rows=rows, periods=periods, period=period, docs=docs)


@router.post("/numbers/{rid}/void")
def void_number(rid: int, request: Request, reason: str = Form(""), user: User = Depends(admin_user)):
    reason = reason.strip()
    back = RedirectResponse(request.headers.get("referer") or "/numbers", status_code=303)
    if not reason:
        flash(request, "Alasan pembatalan nomor wajib diisi.", "error")
        return back
    try:
        with write_session() as w:
            r = numbering.void(w, rid, reason)
            audit(w, user.id, "number.void", "number", rid, {"nomor": r.formatted, "reason": reason})
    except ValueError as e:
        flash(request, str(e), "error")
        return back
    flash(request, "Nomor dibatalkan.")
    return back
