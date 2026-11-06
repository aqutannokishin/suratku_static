"""Atur ulang password pengguna dari komputer server (kalau admin lupa password).

Cara pakai:  .venv\\Scripts\\python.exe scripts\\reset_password.py namauser
"""
import getpass
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from sqlalchemy import func, select  # noqa: E402

from app.db import write_session  # noqa: E402
from app.models import User  # noqa: E402
from app.security import check_new_password, hash_password  # noqa: E402


def reset_password(username: str, password: str, make_admin: bool = False) -> str:
    err = check_new_password(password)
    if err:
        raise ValueError(err)
    with write_session() as w:
        u = w.scalar(select(User).where(func.lower(User.username) == username.strip().lower()))
        if u is None:
            raise ValueError(f"Pengguna '{username}' tidak ditemukan.")
        u.password_hash = hash_password(password)
        u.is_active = True
        if make_admin:
            u.is_admin = True
        return u.username


if __name__ == "__main__":
    if len(sys.argv) < 2:
        raise SystemExit("Pemakaian: python scripts/reset_password.py namauser")
    p1 = getpass.getpass("Password baru: ")
    p2 = getpass.getpass("Ulangi password baru: ")
    if p1 != p2:
        raise SystemExit("Kedua password tidak sama.")
    try:
        print("Berhasil mengatur ulang password untuk:", reset_password(sys.argv[1], p1))
    except ValueError as e:
        raise SystemExit(str(e))
