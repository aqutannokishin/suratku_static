"""Semua tes memakai folder sementara; data asli tidak tersentuh."""
import os
import tempfile

_TMP = tempfile.mkdtemp(prefix="suratku_test_")
os.environ["DATA_DIR"] = os.path.join(_TMP, "data")
os.environ["STORAGE_DIR"] = os.path.join(_TMP, "storage")
os.environ["TEMPLATES_DIR"] = os.path.join(_TMP, "doctemplates")
os.environ["SECRET_KEY"] = "kunci-untuk-tes"

import pytest  # noqa: E402

from app.db import SessionLocal, write_session  # noqa: E402
from app.models import Base, NumberSeries  # noqa: E402
from app.db import engine  # noqa: E402
from app.seed import init_db  # noqa: E402


@pytest.fixture(scope="session", autouse=True)
def _database():
    init_db()
    yield


_COUNTER = {"n": 0}


@pytest.fixture
def make_series():
    """Buat seri nomor baru dengan kode unik supaya tes tidak saling mengganggu."""
    counter = _COUNTER

    def _make(pattern="{seq:03d}/{kode}/{romawi}/{tahun}", reset="yearly"):
        counter["n"] += 1
        code = f"T{os.getpid()}{counter['n']}"
        with write_session() as w:
            s = NumberSeries(code=code, name="tes", pattern=pattern, reset=reset)
            w.add(s)
            w.flush()
            sid = s.id
        db = SessionLocal()
        s = db.get(NumberSeries, sid)
        db.close()
        return s

    return _make
