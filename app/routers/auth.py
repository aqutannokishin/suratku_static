"""Login, logout, pembuatan admin pertama, ganti password."""
from fastapi import APIRouter, Depends, Form, Request
from fastapi.responses import RedirectResponse
from sqlalchemy import func, select

from ..db import get_db, write_session
from ..deps import current_user
from ..models import User
from ..security import (check_new_password, clear_fails, hash_password, record_fail,
                        too_many_fails, verify_password)
from ..services.audit import audit
from ..web import flash, render

router = APIRouter()


def _no_users(db) -> bool:
    return (db.scalar(select(func.count(User.id))) or 0) == 0


@router.get("/login")
def login_page(request: Request, db=Depends(get_db)):
    if _no_users(db):
        return RedirectResponse("/setup", status_code=303)
    if request.session.get("uid"):
        return RedirectResponse("/", status_code=303)
    return render(request, "login.html")


@router.post("/login")
def login(request: Request, username: str = Form(""), password: str = Form(""), db=Depends(get_db)):
    uname = username.strip().lower()
    if too_many_fails(uname):
        return render(request, "login.html", status_code=429, username=username,
                      error="Terlalu banyak percobaan gagal. Tunggu 10 menit lalu coba lagi.")
    user = db.scalar(select(User).where(func.lower(User.username) == uname))
    if user is None or not user.is_active or not verify_password(user.password_hash, password):
        record_fail(uname)
        return render(request, "login.html", status_code=401, username=username,
                      error="Username atau password salah.")
    clear_fails(uname)
    request.session.clear()
    request.session["uid"] = user.id
    with write_session() as w:
        audit(w, user.id, "login", "user", user.id)
    return RedirectResponse("/", status_code=303)


@router.post("/logout")
def logout(request: Request):
    request.session.clear()
    return RedirectResponse("/login", status_code=303)


@router.get("/setup")
def setup_page(request: Request, db=Depends(get_db)):
    if not _no_users(db):
        return RedirectResponse("/login", status_code=303)
    return render(request, "setup.html")


@router.post("/setup")
def setup(request: Request, username: str = Form(""), full_name: str = Form(""),
          password: str = Form(""), password2: str = Form(""), db=Depends(get_db)):
    if not _no_users(db):
        return RedirectResponse("/login", status_code=303)
    uname = username.strip().lower()
    error = None
    if not uname or not full_name.strip():
        error = "Username dan nama lengkap wajib diisi."
    elif password != password2:
        error = "Password dan ulangi password tidak sama."
    else:
        error = check_new_password(password)
    if error:
        return render(request, "setup.html", status_code=400, error=error,
                      username=username, full_name=full_name)
    with write_session() as w:
        u = User(username=uname, full_name=full_name.strip(), password_hash=hash_password(password),
                 is_admin=True)
        w.add(u)
        w.flush()
        audit(w, u.id, "user.create", "user", u.id, {"first_admin": True})
        uid = u.id
    request.session.clear()
    request.session["uid"] = uid
    flash(request, "Admin pertama berhasil dibuat. Selamat datang!")
    return RedirectResponse("/", status_code=303)


@router.get("/account")
def account_page(request: Request, user: User = Depends(current_user)):
    return render(request, "account.html", user=user)


@router.post("/account")
def account_change(request: Request, current: str = Form(""), new1: str = Form(""),
                   new2: str = Form(""), user: User = Depends(current_user)):
    error = None
    if not verify_password(user.password_hash, current):
        error = "Password lama salah."
    elif new1 != new2:
        error = "Password baru dan ulangi password tidak sama."
    else:
        error = check_new_password(new1)
    if error:
        return render(request, "account.html", user=user, status_code=400, error=error)
    with write_session() as w:
        w.get(User, user.id).password_hash = hash_password(new1)
        audit(w, user.id, "user.password", "user", user.id)
    flash(request, "Password berhasil diganti.")
    return RedirectResponse("/", status_code=303)
