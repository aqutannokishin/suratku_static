"""Pengecekan login untuk setiap halaman."""
from fastapi import Depends, Request
from sqlalchemy.orm import Session

from .db import get_db
from .models import User


class NeedLogin(Exception):
    pass


class Forbidden(Exception):
    pass


def current_user(request: Request, db: Session = Depends(get_db)) -> User:
    uid = request.session.get("uid")
    user = db.get(User, uid) if uid else None
    if user is None or not user.is_active:
        request.session.clear()
        raise NeedLogin()
    return user


def admin_user(user: User = Depends(current_user)) -> User:
    if not user.is_admin:
        raise Forbidden()
    return user
