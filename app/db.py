"""Koneksi database SQLite.

Dua jenis sesi:
- `get_db`      : sesi baca biasa untuk setiap request halaman.
- `write_session`: sesi tulis yang langsung mengunci database (BEGIN IMMEDIATE).
                  Dipakai untuk semua perubahan data supaya dua orang tidak
                  bisa saling menimpa (terutama untuk nomor surat).
"""
from contextlib import contextmanager

from sqlalchemy import create_engine, event
from sqlalchemy.engine import URL
from sqlalchemy.orm import sessionmaker

from .config import settings

DB_PATH = settings.data_dir / "suratku.db"

engine = create_engine(
    URL.create("sqlite", database=str(DB_PATH)),
    connect_args={"check_same_thread": False, "timeout": 30},
)


@event.listens_for(engine, "connect")
def _on_connect(dbapi_conn, _record):
    # Kendali transaksi diambil alih supaya SAVEPOINT dan BEGIN IMMEDIATE bekerja benar.
    dbapi_conn.isolation_level = None
    cur = dbapi_conn.cursor()
    cur.execute("PRAGMA journal_mode=WAL")
    cur.execute("PRAGMA foreign_keys=ON")
    cur.execute("PRAGMA busy_timeout=30000")
    cur.execute("PRAGMA synchronous=NORMAL")
    cur.close()


@event.listens_for(engine, "begin")
def _on_begin(conn):
    if conn.get_execution_options().get("immediate"):
        conn.exec_driver_sql("BEGIN IMMEDIATE")
    else:
        conn.exec_driver_sql("BEGIN")


SessionLocal = sessionmaker(engine, expire_on_commit=False)
_WriteSession = sessionmaker(engine.execution_options(immediate=True), expire_on_commit=False)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@contextmanager
def write_session():
    """Sesi tulis singkat: commit otomatis kalau sukses, rollback kalau error."""
    s = _WriteSession()
    try:
        yield s
        s.commit()
    except Exception:
        s.rollback()
        raise
    finally:
        s.close()
