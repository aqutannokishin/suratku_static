"""Uji skrip operasional (cadangan, pemulihan, reset password) pada salinan data terpisah."""
import os
import subprocess
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def env_for(base: Path):
    e = dict(os.environ)
    e.update(DATA_DIR=str(base / "data"), STORAGE_DIR=str(base / "storage"),
             TEMPLATES_DIR=str(base / "doctemplates"), SECRET_KEY="uji")
    return e


def run_py(code_or_args, env, *, code=False):
    cmd = [sys.executable, "-c", code_or_args] if code else [sys.executable, *code_or_args]
    r = subprocess.run(cmd, cwd=ROOT, env=env, capture_output=True, text=True, timeout=120)
    assert r.returncode == 0, r.stdout + r.stderr
    return r.stdout.strip()


def test_backup_restore_roundtrip(tmp_path):
    env = env_for(tmp_path)
    run_py("""
from app.seed import init_db; init_db()
from app.db import write_session
from app.models import User
from app.security import hash_password
with write_session() as w:
    w.add(User(username='asli', full_name='Pengguna Asli', password_hash=hash_password('12345678')))
""", env, code=True)
    (tmp_path / "storage" / "surat_tugas").mkdir(parents=True)
    (tmp_path / "storage" / "surat_tugas" / "a.docx").write_bytes(b"dokumen-penting")

    out = run_py([str(ROOT / "scripts" / "backup.py")], env)
    assert "Cadangan dibuat" in out
    zips = sorted((ROOT / "backup").glob("suratku_*.zip"))
    z = zips[-1]
    try:
        names = zipfile.ZipFile(z).namelist()
        assert "data/suratku.db" in names and "storage/surat_tugas/a.docx" in names
        assert any(n.startswith("doctemplates/surat_tugas/") for n in names)

        # rusak: tambah pengguna, hapus dokumen, ubah isi
        run_py("""
from app.db import write_session
from app.models import User
from app.security import hash_password
with write_session() as w:
    w.add(User(username='penyusup', full_name='Tidak Boleh Ada', password_hash=hash_password('12345678')))
""", env, code=True)
        (tmp_path / "storage" / "surat_tugas" / "a.docx").unlink()

        out = run_py([str(ROOT / "scripts" / "restore.py"), str(z)], env)
        assert "Pemulihan selesai" in out
        users = run_py("""
from app.db import SessionLocal
from app.models import User
db = SessionLocal(); print(','.join(sorted(u.username for u in db.query(User))))
""", env, code=True)
        assert users == "asli"                                           # 'penyusup' hilang
        assert (tmp_path / "storage" / "surat_tugas" / "a.docx").read_bytes() == b"dokumen-penting"
    finally:
        z.unlink(missing_ok=True)
        for d in (ROOT / "backup").glob("sebelum_restore_*"):
            import shutil
            shutil.rmtree(d, ignore_errors=True)


def test_restore_rejects_foreign_zip(tmp_path):
    bad = tmp_path / "bukan.zip"
    with zipfile.ZipFile(bad, "w") as z:
        z.writestr("hello.txt", "x")
    r = subprocess.run([sys.executable, str(ROOT / "scripts" / "restore.py"), str(bad)], cwd=ROOT,
                       env=env_for(tmp_path), capture_output=True, text=True)
    assert r.returncode != 0 and "bukan cadangan" in (r.stdout + r.stderr)


def test_reset_password_function():
    from app.db import SessionLocal, write_session
    from app.models import User
    from app.security import hash_password, verify_password
    from scripts.reset_password import reset_password
    import pytest
    with write_session() as w:
        w.add(User(username="lupa_pw", full_name="Lupa", password_hash=hash_password("lama-lama"), is_active=False))
    assert reset_password("LUPA_PW", "baru-baru-1", make_admin=True) == "lupa_pw"
    db = SessionLocal()
    u = db.query(User).filter_by(username="lupa_pw").one()
    assert verify_password(u.password_hash, "baru-baru-1") and u.is_active and u.is_admin
    db.close()
    with pytest.raises(ValueError):
        reset_password("lupa_pw", "pendek")
    with pytest.raises(ValueError):
        reset_password("tidak_ada", "panjang-sekali-1")


def test_show_address_runs():
    out = run_py([str(ROOT / "scripts" / "show_address.py"), "8000"], dict(os.environ))
    assert "http://localhost:8000" in out
