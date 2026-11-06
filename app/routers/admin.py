"""Halaman khusus admin: pengguna, data master, seri nomor, template, log."""
import tempfile
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, Request, UploadFile
from fastapi.responses import FileResponse, RedirectResponse, Response
from sqlalchemy import func, or_, select

from ..db import get_db, write_session
from ..deps import admin_user
from ..doctypes import REGISTRY, variable_help
from ..models import (AuditLog, Golongan, Jabatan, NumberSeries, Person, PersonRole,
                      TemplateVersion, User)
from ..security import check_new_password, hash_password
from ..services import numbering, people
from ..services import templates_svc as tsvc
from ..services.audit import audit
from ..web import flash, render

router = APIRouter(prefix="/admin")
MAX_UPLOAD = 10 * 1024 * 1024  # 10 MB


def _back(url: str):
    return RedirectResponse(url, status_code=303)


@router.get("")
def admin_home(request: Request, user: User = Depends(admin_user), db=Depends(get_db)):
    stats = {
        "users": db.scalar(select(func.count(User.id)).where(User.is_active)),
        "people": db.scalar(select(func.count(Person.id)).where(Person.is_active)),
        "series": db.scalar(select(func.count(NumberSeries.id))),
    }
    return render(request, "admin/home.html", user=user, stats=stats)


# ================================================================ pengguna
@router.get("/users")
def users_page(request: Request, user: User = Depends(admin_user), db=Depends(get_db)):
    users = db.scalars(select(User).order_by(User.username)).all()
    return render(request, "admin/users.html", user=user, users=users)


@router.post("/users")
def users_create(request: Request, username: str = Form(""), full_name: str = Form(""),
                 password: str = Form(""), is_admin: str = Form(""), user: User = Depends(admin_user)):
    uname = username.strip().lower()
    err = None
    if not uname or not full_name.strip():
        err = "Username dan nama lengkap wajib diisi."
    else:
        err = check_new_password(password)
    if err:
        flash(request, err, "error")
        return _back("/admin/users")
    with write_session() as w:
        if w.scalar(select(User).where(func.lower(User.username) == uname)):
            flash(request, f"Username '{uname}' sudah dipakai.", "error")
            return _back("/admin/users")
        u = User(username=uname, full_name=full_name.strip(), password_hash=hash_password(password),
                 is_admin=bool(is_admin))
        w.add(u)
        w.flush()
        audit(w, user.id, "user.create", "user", u.id, {"username": uname, "admin": bool(is_admin)})
    flash(request, f"Pengguna '{uname}' dibuat.")
    return _back("/admin/users")


@router.post("/users/{uid}")
def users_update(uid: int, request: Request, full_name: str = Form(""), password: str = Form(""),
                 is_admin: str = Form(""), is_active: str = Form(""), user: User = Depends(admin_user)):
    with write_session() as w:
        u = w.get(User, uid)
        if u is None:
            flash(request, "Pengguna tidak ditemukan.", "error")
            return _back("/admin/users")
        new_admin, new_active = bool(is_admin), bool(is_active)
        if u.id == user.id and (not new_admin or not new_active):
            flash(request, "Anda tidak bisa mencabut admin/mengnonaktifkan akun Anda sendiri.", "error")
            return _back("/admin/users")
        if full_name.strip():
            u.full_name = full_name.strip()
        if password:
            err = check_new_password(password)
            if err:
                flash(request, err, "error")
                return _back("/admin/users")
            u.password_hash = hash_password(password)
        u.is_admin, u.is_active = new_admin, new_active
        audit(w, user.id, "user.update", "user", u.id,
              {"admin": new_admin, "active": new_active, "password_reset": bool(password)})
    flash(request, "Pengguna diperbarui.")
    return _back("/admin/users")


# ================================================================ data master
PEOPLE_PAGE = 50


@router.get("/people")
def people_page(request: Request, q: str = "", show: str = "active", page: int = 1,
                user: User = Depends(admin_user), db=Depends(get_db)):
    stmt = select(Person)
    if show == "active":
        stmt = stmt.where(Person.is_active)
    elif show == "inactive":
        stmt = stmt.where(Person.is_active.is_(False))
    if q.strip():
        stmt = stmt.where(or_(Person.name_norm.like(f"%{people.norm(q)}%"), Person.nip.like(f"{q.strip()}%")))
    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    page = max(page, 1)
    rows = db.scalars(stmt.order_by(Person.name_norm).limit(PEOPLE_PAGE).offset((page - 1) * PEOPLE_PAGE)).all()
    return render(request, "admin/people.html", user=user, rows=rows, q=q, show=show, page=page, total=total,
                  pages=max((total + PEOPLE_PAGE - 1) // PEOPLE_PAGE, 1),
                  golongan=db.scalars(select(Golongan).order_by(Golongan.sort, Golongan.code)).all(),
                  jabatan=db.scalars(select(Jabatan).order_by(Jabatan.name_norm)).all(),
                  roles=db.scalars(select(PersonRole).order_by(PersonRole.id)).all())


@router.post("/people")
def people_create(request: Request, name: str = Form(""), nip: str = Form(""), golongan: str = Form(""),
                  jabatan: str = Form(""), role: str = Form(""), user: User = Depends(admin_user)):
    try:
        with write_session() as w:
            p = people.create_person(w, user.id, name, nip, golongan, jabatan, role)
            audit(w, user.id, "person.create", "person", p.id, {"name": p.name})
        flash(request, f"{p.name} ditambahkan.")
    except people.DataError as e:
        flash(request, str(e), "error")
    return _back("/admin/people")


@router.post("/people/{pid}")
def people_update(pid: int, request: Request, name: str = Form(""), nip: str = Form(""),
                  golongan: str = Form(""), jabatan: str = Form(""), role: str = Form(""),
                  is_active: str = Form(""), user: User = Depends(admin_user)):
    try:
        with write_session() as w:
            p = w.get(Person, pid)
            if p is None:
                flash(request, "Data tidak ditemukan.", "error")
                return _back("/admin/people")
            people.update_person(w, p, name, nip, golongan, jabatan, role, bool(is_active))
            audit(w, user.id, "person.update", "person", p.id, {"name": p.name})
        flash(request, "Data diperbarui.")
    except people.DataError as e:
        flash(request, str(e), "error")
    return _back(request.headers.get("referer") or "/admin/people")


@router.post("/people-merge")
def people_merge(request: Request, source: int = Form(...), target: int = Form(...),
                 user: User = Depends(admin_user)):
    try:
        with write_session() as w:
            tgt = people.merge_people(w, source, target)
            audit(w, user.id, "person.merge", "person", tgt.id, {"source": source, "target": target})
        flash(request, "Data digabung. Data yang digabung kini nonaktif.")
    except people.DataError as e:
        flash(request, str(e), "error")
    return _back("/admin/people")


@router.get("/people-import")
def people_import_page(request: Request, user: User = Depends(admin_user)):
    return render(request, "admin/people_import.html", user=user, result=None)


@router.get("/people-template.xlsx")
def people_template(user: User = Depends(admin_user)):
    return Response(people.build_import_template(),
                    media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    headers={"Content-Disposition": 'attachment; filename="template-data-orang.xlsx"'})


@router.post("/people-import")
async def people_import(request: Request, file: UploadFile = File(...), user: User = Depends(admin_user)):
    data = await file.read(MAX_UPLOAD + 1)
    if len(data) > MAX_UPLOAD:
        flash(request, "File terlalu besar (maksimal 10 MB).", "error")
        return _back("/admin/people-import")
    try:
        with write_session() as w:
            result = people.import_people(w, data, user.id)
            audit(w, user.id, "person.import", "person", None,
                  {k: (v if k != "errors" else len(v)) for k, v in result.items()})
    except people.DataError as e:
        flash(request, str(e), "error")
        return _back("/admin/people-import")
    except Exception:
        flash(request, "File Excel tidak bisa dibaca. Pastikan formatnya .xlsx dan sesuai template.", "error")
        return _back("/admin/people-import")
    return render(request, "admin/people_import.html", user=user, result=result)


@router.get("/lists")
def lists_page(request: Request, user: User = Depends(admin_user), db=Depends(get_db)):
    return render(request, "admin/lists.html", user=user,
                  golongan=db.scalars(select(Golongan).order_by(Golongan.sort, Golongan.code)).all(),
                  jabatan=db.scalars(select(Jabatan).order_by(Jabatan.name_norm)).all(),
                  roles=db.scalars(select(PersonRole).order_by(PersonRole.id)).all())


@router.post("/lists/golongan")
def golongan_save(request: Request, code: str = Form(""), pangkat: str = Form(""),
                  user: User = Depends(admin_user)):
    code = people.clean_text(code)
    if not code:
        flash(request, "Kode golongan wajib diisi.", "error")
        return _back("/admin/lists")
    with write_session() as w:
        g = w.scalar(select(Golongan).where(Golongan.code.ilike(code)))
        if g:
            g.pangkat = people.clean_text(pangkat)
        else:
            w.add(Golongan(code=code, pangkat=people.clean_text(pangkat), sort=999))
        audit(w, user.id, "golongan.save", "golongan", None, {"code": code})
    flash(request, "Golongan disimpan.")
    return _back("/admin/lists")


@router.post("/lists/jabatan/{jid}")
def jabatan_rename(jid: int, request: Request, name: str = Form(""), user: User = Depends(admin_user)):
    name = people.clean_text(name)
    if not name:
        flash(request, "Nama jabatan wajib diisi.", "error")
        return _back("/admin/lists")
    with write_session() as w:
        clash = w.scalar(select(Jabatan).where(Jabatan.name_norm == people.norm(name), Jabatan.id != jid))
        if clash:
            flash(request, "Jabatan dengan nama itu sudah ada.", "error")
            return _back("/admin/lists")
        j = w.get(Jabatan, jid)
        if j:
            j.name, j.name_norm = name, people.norm(name)
            audit(w, user.id, "jabatan.rename", "jabatan", jid, {"name": name})
    flash(request, "Jabatan diperbarui.")
    return _back("/admin/lists")


# ================================================================ seri nomor
@router.get("/series")
def series_page(request: Request, user: User = Depends(admin_user), db=Depends(get_db)):
    from datetime import date
    rows = db.scalars(select(NumberSeries).order_by(NumberSeries.code)).all()
    examples = {s.id: numbering.format_number(s, 7, date.today()) for s in rows}
    used_by = {}
    for spec in REGISTRY.values():
        if spec.series:
            used_by.setdefault(spec.series, []).append(spec.name)
    return render(request, "admin/series.html", user=user, rows=rows, examples=examples,
                  used_by=used_by, resets=numbering.RESET_CHOICES)


@router.post("/series/{sid}")
def series_update(sid: int, request: Request, name: str = Form(""), pattern: str = Form(""),
                  reset: str = Form("yearly"), user: User = Depends(admin_user)):
    err = numbering.validate_pattern(pattern)
    if err:
        flash(request, err, "error")
        return _back("/admin/series")
    if reset not in numbering.RESET_CHOICES:
        flash(request, "Pilihan reset tidak valid.", "error")
        return _back("/admin/series")
    with write_session() as w:
        s = w.get(NumberSeries, sid)
        if s is None:
            flash(request, "Seri tidak ditemukan.", "error")
            return _back("/admin/series")
        s.name, s.pattern, s.reset = name.strip() or s.name, pattern.strip(), reset
        audit(w, user.id, "series.update", "series", sid, {"pattern": pattern, "reset": reset})
    flash(request, "Seri nomor diperbarui. Perubahan berlaku untuk nomor berikutnya; nomor lama tidak berubah.")
    return _back("/admin/series")


# ================================================================ template Word
@router.get("/templates")
def templates_page(request: Request, user: User = Depends(admin_user), db=Depends(get_db)):
    versions = {}
    for code in REGISTRY:
        versions[code] = db.scalars(select(TemplateVersion).where(TemplateVersion.doctype_code == code)
                                    .order_by(TemplateVersion.version.desc())).all()
    helps = {code: variable_help(spec) for code, spec in REGISTRY.items()}
    return render(request, "admin/templates.html", user=user, specs=list(REGISTRY.values()),
                  versions=versions, helps=helps)


@router.post("/templates/{code}")
async def templates_upload(code: str, request: Request, file: UploadFile = File(...), note: str = Form(""),
                           user: User = Depends(admin_user)):
    spec = REGISTRY.get(code)
    if spec is None:
        flash(request, "Jenis dokumen tidak dikenal.", "error")
        return _back("/admin/templates")
    if not (file.filename or "").lower().endswith(".docx"):
        flash(request, "File harus berformat .docx (bukan .doc). Simpan ulang dari Word sebagai .docx.", "error")
        return _back("/admin/templates")
    data = await file.read(MAX_UPLOAD + 1)
    if len(data) > MAX_UPLOAD or len(data) < 1000:
        flash(request, "Ukuran file tidak wajar (harus antara 1 KB dan 10 MB).", "error")
        return _back("/admin/templates")
    with tempfile.TemporaryDirectory() as tmp:
        tmp_path = Path(tmp) / "upload.docx"
        tmp_path.write_bytes(data)
        problems = tsvc.validate_template(tmp_path, spec)
        if problems:
            for p in problems:
                flash(request, f"Template ditolak: {p}", "error")
            return _back("/admin/templates")
        with write_session() as w:
            tv = tsvc.register_template(w, code, tmp_path, user.id, note.strip())
            audit(w, user.id, "template.upload", "template", tv.id, {"type": code, "version": tv.version})
            ver = tv.version
    flash(request, f"Template {spec.name} versi {ver} berhasil dipasang dan sekarang aktif.")
    return _back("/admin/templates")


@router.post("/templates/{code}/activate/{tid}")
def templates_activate(code: str, tid: int, request: Request, user: User = Depends(admin_user)):
    with write_session() as w:
        tv = w.get(TemplateVersion, tid)
        if tv is None or tv.doctype_code != code:
            flash(request, "Versi tidak ditemukan.", "error")
            return _back("/admin/templates")
        for other in w.scalars(select(TemplateVersion).where(TemplateVersion.doctype_code == code)):
            other.is_active = other.id == tid
        audit(w, user.id, "template.activate", "template", tid, {"type": code, "version": tv.version})
    flash(request, "Versi template diaktifkan.")
    return _back("/admin/templates")


@router.get("/templates/download/{tid}")
def templates_download(tid: int, user: User = Depends(admin_user), db=Depends(get_db)):
    tv = db.get(TemplateVersion, tid)
    if tv is None or not tsvc.template_file(tv).exists():
        return RedirectResponse("/admin/templates", status_code=303)
    return FileResponse(tsvc.template_file(tv), filename=f"template-{tv.doctype_code}-v{tv.version}.docx",
                        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document")


# ================================================================ log aktivitas
LOG_PAGE = 100


@router.get("/audit")
def audit_page(request: Request, action: str = "", page: int = 1, user: User = Depends(admin_user),
               db=Depends(get_db)):
    stmt = select(AuditLog)
    if action:
        stmt = stmt.where(AuditLog.action.like(f"{action}%"))
    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    page = max(page, 1)
    rows = db.scalars(stmt.order_by(AuditLog.id.desc()).limit(LOG_PAGE).offset((page - 1) * LOG_PAGE)).all()
    actions = [a for (a,) in db.execute(select(AuditLog.action).distinct().order_by(AuditLog.action))]
    return render(request, "admin/audit.html", user=user, rows=rows, action=action, actions=actions,
                  page=page, total=total, pages=max((total + LOG_PAGE - 1) // LOG_PAGE, 1))
