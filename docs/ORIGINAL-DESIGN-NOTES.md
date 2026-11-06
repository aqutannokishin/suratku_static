# SuratKu: Office-Network Document Generator
### Step-by-step build guide (working name, rename it later)

A web app that runs on one PC/server in your office and is opened from any other PC by URL (e.g. `http://192.168.1.50:8000`). Users **pick** a document type, a nomor surat, people, NIP, golongan, jabatan (or type new ones), press a button, and get a DOCX/PDF.

> Time estimates are rough and assume one person working a few hours a day. Code snippets are a solid starting point, but you will adjust them to your real documents.

---

## 0. Scope

**MVP (build this first)**
- Login (username + password)
- Master data: people (name, NIP, golongan, jabatan, role), golongan list, jabatan list, role list
- Nomor surat: auto-next, pick from available numbers, manual input, void
- 1 document type end-to-end, then add more
- Output: DOCX and PDF, stored on the server with a history list
- Audit log, nightly backup

**Later (Phase 2)**
- Excel bulk import, photo evidence upload, HTTPS, Windows/AD login, dashboard

---

## 1. Decisions and assumptions (change any you disagree with)

| Topic | Choice | Why |
|---|---|---|
| Language | Python 3.12 | Best libraries for Word/Excel/PDF |
| Web framework | FastAPI + Jinja2 + htmx | Server-rendered forms, no JS build step |
| Dropdown widget | Tom Select | Searchable dropdown that supports "create new" |
| Database | SQLite (WAL mode) | Zero admin, fine for roughly 30 users. Move to PostgreSQL later if needed |
| ORM / migrations | SQLAlchemy 2 + Alembic | Standard, safe schema changes |
| Word filling | docxtpl | Jinja syntax in Word, handles split runs, loops, table rows |
| PDF | LibreOffice headless, on the server only | Installed once, not on every PC |
| Auth | Session cookie + argon2 password hashes | Simple and solid |
| Hosting | One always-on Windows PC (or Linux box) | Matches your "office only" idea |
| Process count | **1 uvicorn worker** | Keeps the PDF lock and SQLite simple |

---

## 2. Architecture

```
 Office PCs (browser only)
        |  http://suratku.kantor:8000   (LAN only)
        v
 +---------------------------------------------+
 |  Server PC                                  |
 |  uvicorn + FastAPI                          |
 |   |- routers: login, forms, API, admin      |
 |   |- services: numbering, people, render,   |
 |   |            pdf, audit                   |
 |   |- SQLite  (data/suratku.db)              |
 |   |- storage/ (generated docx + pdf)        |
 |   |- doctemplates/ (versioned .docx)        |
 |   '- LibreOffice (headless, called by pdf)  |
 +---------------------------------------------+
```

**Request flow for "Generate":**
1. Form POST arrives, input is validated.
2. Short DB transaction: create any new people, **reserve nomor**, commit.
3. Render DOCX (no DB lock held), convert to PDF if requested.
4. Short DB transaction: save `Document`, mark number `used`, write audit, commit.

If step 3 fails, the number stays `reserved` with no document. It then shows up in "available numbers" so it is never silently lost. This is also how your "pick available nomor" feature gets its data.

---

## 3. Data model

```
users(id, username*, full_name, password_hash, is_admin, is_active)
golongan(id, code*, pangkat, sort)             -- "III/a", "Penata Muda"
jabatan(id, name*, name_norm*)
person_roles(id, name*)                        -- PPL, PML, Pegawai, Mitra, ...
persons(id, name, name_norm, nip*?, golongan_id?, jabatan_id?, role_id,
        is_active, created_by, created_at)

number_series(id, code*, name, pattern, reset)  -- reset: yearly|monthly|never
number_reservations(id, series_id, period_key, seq, formatted, status,
                    reserved_by, reserved_at, void_reason,
                    UNIQUE(series_id, period_key, seq))
                    -- status: reserved | used | void

template_versions(id, doctype_code, version, file_path, sha256, uploaded_by,
                  uploaded_at, is_active)
documents(id, doctype_code, reservation_id?, payload JSON, template_version_id,
          docx_path, pdf_path?, created_by, created_at)
audit_log(id, at, user_id, action, entity, entity_id, detail JSON)
```
`*` = unique, `?` = nullable (SQLite allows many NULLs in a unique column, so people without NIP are fine).

**Key rule:** every document stores a **snapshot** of the people and values used (in `payload`). If someone's jabatan changes later, old documents don't change.

---

## 4. Step-by-step build

### Step 1: Prepare the machine (about 1 hour)

On the server PC and your dev PC (they can be the same at first):

1. Install **Python 3.12** (tick "Add to PATH").
2. Install **Git** and **VS Code**.
3. Install **LibreOffice** (MSI from libreoffice.org). Note the path, normally `C:\Program Files\LibreOffice\program\soffice.exe`.
4. Make sure Word-compatible fonts used by your templates exist (Arial, Times New Roman, Bookman Old Style, and so on). A Windows PC with Office has them. See pitfall #3 if you later use Linux/Docker.

### Step 2: Project skeleton (about 1 hour)

```powershell
mkdir suratku; cd suratku
git init
py -3.12 -m venv .venv
.\.venv\Scripts\Activate.ps1
```

`requirements.txt`:
```
fastapi
uvicorn[standard]
sqlalchemy>=2.0
alembic
jinja2
python-multipart
itsdangerous
argon2-cffi
pydantic-settings
docxtpl
python-docx
rapidfuzz
pillow
openpyxl
pytest
httpx
```
```powershell
pip install -r requirements.txt
```

Folder layout:
```
suratku/
  app/
    main.py
    config.py
    db.py
    models.py
    security.py
    deps.py
    doctypes.py
    services/
      numbering.py
      people.py
      render.py
      pdf.py
      generate.py
      audit.py
    routers/
      auth.py
      pages.py
      api.py
      admin.py
    templates/        (Jinja HTML: base, login, form, history, admin)
    static/           (htmx.min.js, tom-select css/js, app.css)
  doctemplates/       (Word templates, versioned per doc type)
  storage/            (generated files)
  data/               (suratku.db)
  backup/
  migrations/         (alembic)
  scripts/            (seed.py, backup.py)
  tests/
  .env
  .gitignore          (.venv, data, storage, backup, .env)
```

**Vendor your JS/CSS** (htmx, Tom Select) into `app/static/` so the app works with **no internet**. Download them once and commit the files.

### Step 3: Config and database (about 1 hour)

`.env`:
```
SECRET_KEY=change-me-to-a-long-random-string
DATABASE_URL=sqlite:///data/suratku.db
STORAGE_DIR=storage
TEMPLATES_DIR=doctemplates
SOFFICE_PATH=C:\Program Files\LibreOffice\program\soffice.exe
ALLOW_REUSE_VOID=true
```

`app/config.py`:
```python
from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env")
    secret_key: str
    database_url: str = "sqlite:///data/suratku.db"
    storage_dir: Path = Path("storage")
    templates_dir: Path = Path("doctemplates")
    soffice_path: str = "soffice"
    allow_reuse_void: bool = True

settings = Settings()
```

`app/db.py`:
```python
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from .config import settings

engine = create_engine(
    settings.database_url,
    connect_args={"check_same_thread": False},
)

@event.listens_for(engine, "connect")
def _sqlite_pragmas(conn, _):
    cur = conn.cursor()
    cur.execute("PRAGMA journal_mode=WAL")
    cur.execute("PRAGMA foreign_keys=ON")
    cur.execute("PRAGMA busy_timeout=5000")
    cur.close()

SessionLocal = sessionmaker(engine, expire_on_commit=False)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
```

### Step 4: Models, migrations, seed data (about half a day)

`app/models.py` (core of it):
```python
from __future__ import annotations
from datetime import datetime
from sqlalchemy import (String, ForeignKey, UniqueConstraint, DateTime, Text,
                        JSON, func)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

class Base(DeclarativeBase):
    pass

class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(String(50), unique=True)
    full_name: Mapped[str] = mapped_column(String(120))
    password_hash: Mapped[str] = mapped_column(String(255))
    is_admin: Mapped[bool] = mapped_column(default=False)
    is_active: Mapped[bool] = mapped_column(default=True)

class Golongan(Base):
    __tablename__ = "golongan"
    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(20), unique=True)      # "III/a"
    pangkat: Mapped[str] = mapped_column(String(80), default="")    # "Penata Muda"
    sort: Mapped[int] = mapped_column(default=0)

class Jabatan(Base):
    __tablename__ = "jabatan"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(150))
    name_norm: Mapped[str] = mapped_column(String(150), unique=True)

class PersonRole(Base):
    __tablename__ = "person_roles"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(60), unique=True)

class Person(Base):
    __tablename__ = "persons"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(150))
    name_norm: Mapped[str] = mapped_column(String(150), index=True)
    nip: Mapped[str | None] = mapped_column(String(18), unique=True)
    golongan_id: Mapped[int | None] = mapped_column(ForeignKey("golongan.id"))
    jabatan_id: Mapped[int | None] = mapped_column(ForeignKey("jabatan.id"))
    role_id: Mapped[int] = mapped_column(ForeignKey("person_roles.id"))
    is_active: Mapped[bool] = mapped_column(default=True)
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    golongan: Mapped[Golongan | None] = relationship()
    jabatan: Mapped[Jabatan | None] = relationship()
    role: Mapped[PersonRole] = relationship()

class NumberSeries(Base):
    __tablename__ = "number_series"
    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(20), unique=True)      # "ST"
    name: Mapped[str] = mapped_column(String(100))
    pattern: Mapped[str] = mapped_column(String(200))
    # example: "{seq:03d}/{kode}/{romawi}/{tahun}"
    reset: Mapped[str] = mapped_column(String(10), default="yearly")

class NumberReservation(Base):
    __tablename__ = "number_reservations"
    __table_args__ = (UniqueConstraint("series_id", "period_key", "seq"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    series_id: Mapped[int] = mapped_column(ForeignKey("number_series.id"))
    period_key: Mapped[str] = mapped_column(String(10))
    seq: Mapped[int]
    formatted: Mapped[str] = mapped_column(String(200))
    status: Mapped[str] = mapped_column(String(10), default="reserved")
    reserved_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    reserved_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    void_reason: Mapped[str | None] = mapped_column(Text)
    series: Mapped[NumberSeries] = relationship()

class TemplateVersion(Base):
    __tablename__ = "template_versions"
    id: Mapped[int] = mapped_column(primary_key=True)
    doctype_code: Mapped[str] = mapped_column(String(50), index=True)
    version: Mapped[int]
    file_path: Mapped[str] = mapped_column(String(300))
    sha256: Mapped[str] = mapped_column(String(64))
    uploaded_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    uploaded_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    is_active: Mapped[bool] = mapped_column(default=False)

class Document(Base):
    __tablename__ = "documents"
    id: Mapped[int] = mapped_column(primary_key=True)
    doctype_code: Mapped[str] = mapped_column(String(50), index=True)
    reservation_id: Mapped[int | None] = mapped_column(
        ForeignKey("number_reservations.id"), unique=True)
    payload: Mapped[dict] = mapped_column(JSON)
    template_version_id: Mapped[int | None] = mapped_column(
        ForeignKey("template_versions.id"))
    docx_path: Mapped[str] = mapped_column(String(400))
    pdf_path: Mapped[str | None] = mapped_column(String(400))
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

class AuditLog(Base):
    __tablename__ = "audit_log"
    id: Mapped[int] = mapped_column(primary_key=True)
    at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    action: Mapped[str] = mapped_column(String(50))
    entity: Mapped[str] = mapped_column(String(50))
    entity_id: Mapped[int | None]
    detail: Mapped[dict | None] = mapped_column(JSON)
```

Set up Alembic:
```powershell
alembic init migrations
# edit migrations/env.py: import Base, set target_metadata = Base.metadata,
# and read the URL from app.config.settings
alembic revision --autogenerate -m "initial"
alembic upgrade head
```
(For SQLite, turn on `render_as_batch=True` in `env.py` so later column changes work.)

`scripts/seed.py` should insert:
- **Golongan PNS**: I/a Juru Muda, I/b Juru Muda Tk. I, I/c Juru, I/d Juru Tk. I, II/a Pengatur Muda, II/b Pengatur Muda Tk. I, II/c Pengatur, II/d Pengatur Tk. I, III/a Penata Muda, III/b Penata Muda Tk. I, III/c Penata, III/d Penata Tk. I, IV/a Pembina, IV/b Pembina Tk. I, IV/c Pembina Utama Muda, IV/d Pembina Utama Madya, IV/e Pembina Utama. PPPK and others go in through "Lain-lain" or an admin screen.
- **Roles**: Pegawai, PPL, PML, Mitra.
- **Number series**, for example `ST` (Surat Tugas, yearly).
- **First admin user** (ask for the password on the console; never hardcode it).

### Step 5: Login and sessions (about half a day)

`app/security.py`:
```python
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError

_ph = PasswordHasher()

def hash_password(p: str) -> str:
    return _ph.hash(p)

def verify_password(hash_: str, p: str) -> bool:
    try:
        return _ph.verify(hash_, p)
    except VerifyMismatchError:
        return False
```

`app/deps.py`:
```python
from fastapi import Depends, Request
from sqlalchemy.orm import Session
from .db import get_db
from .models import User

class NeedLogin(Exception): ...
class Forbidden(Exception): ...

def current_user(request: Request, db: Session = Depends(get_db)) -> User:
    uid = request.session.get("uid")
    user = db.get(User, uid) if uid else None
    if not user or not user.is_active:
        raise NeedLogin()
    return user

def admin_user(user: User = Depends(current_user)) -> User:
    if not user.is_admin:
        raise Forbidden()
    return user
```

`app/main.py`:
```python
from fastapi import FastAPI, Request
from fastapi.responses import RedirectResponse, PlainTextResponse
from fastapi.staticfiles import StaticFiles
from starlette.middleware.sessions import SessionMiddleware
from .config import settings
from .deps import NeedLogin, Forbidden
from .routers import auth, pages, api, admin

app = FastAPI(title="SuratKu")
app.add_middleware(SessionMiddleware, secret_key=settings.secret_key,
                   same_site="lax", https_only=False, max_age=60 * 60 * 10)
app.mount("/static", StaticFiles(directory="app/static"), name="static")
for r in (auth.router, pages.router, api.router, admin.router):
    app.include_router(r)

@app.exception_handler(NeedLogin)
async def _need_login(request: Request, exc: NeedLogin):
    return RedirectResponse("/login", status_code=303)

@app.exception_handler(Forbidden)
async def _forbidden(request: Request, exc: Forbidden):
    return PlainTextResponse("Tidak punya akses", status_code=403)
```

Login route: look up the user, `verify_password`, set `request.session["uid"] = user.id`. Add a tiny brute-force guard (e.g. 5 failed attempts per username per 10 minutes, kept in memory). Because your site is LAN-only, `SameSite=Lax` already blocks cross-site form posts; add an `Origin` header check on POST if you want extra safety.

### Step 6: Master data: people, golongan, jabatan, roles (about 1 day)

**Helpers** (`app/services/people.py`):
```python
import re
from rapidfuzz import fuzz
from sqlalchemy import select, or_
from ..models import Person, Jabatan, Golongan, PersonRole

NIP_RE = re.compile(r"^\d{18}$")

def norm(s: str) -> str:
    return " ".join(s.lower().split())

def clean_nip(raw: str | None) -> str | None:
    if not raw:
        return None
    nip = re.sub(r"\D", "", raw)           # drop spaces and dashes
    if nip and not NIP_RE.match(nip):
        raise ValueError("NIP harus 18 digit angka")
    return nip or None

def get_or_create_jabatan(db, name: str) -> Jabatan:
    n = norm(name)
    j = db.scalar(select(Jabatan).where(Jabatan.name_norm == n))
    if not j:
        j = Jabatan(name=" ".join(name.split()), name_norm=n)
        db.add(j); db.flush()
    return j

def similar_people(db, name: str, threshold: int = 90) -> list[Person]:
    n = norm(name)
    cands = db.scalars(select(Person).where(Person.is_active)).all()
    return [p for p in cands if fuzz.token_sort_ratio(n, p.name_norm) >= threshold]

def search_people(db, q: str, limit: int = 20):
    q = q.strip()
    qn = norm(q)
    stmt = (select(Person).where(Person.is_active)
            .where(or_(Person.name_norm.like(f"%{qn}%"),
                       Person.nip.like(f"{q}%")))
            .order_by(Person.name_norm).limit(limit))
    return db.scalars(stmt).all()

def snapshot(p: Person) -> dict:
    return {
        "id": p.id, "nama": p.name, "nip": p.nip or "",
        "golongan": p.golongan.code if p.golongan else "",
        "pangkat": p.golongan.pangkat if p.golongan else "",
        "jabatan": p.jabatan.name if p.jabatan else "",
        "role": p.role.name,
    }
```

**API endpoints** (`app/routers/api.py`), all behind `current_user`:
- `GET /api/persons/search?q=` returns JSON `[{id, label, name, nip, golongan, jabatan, role}]`
- `POST /api/persons` quick-add (name required, others optional). It returns "mirip dengan: ..." if `similar_people` finds close matches, so the user can pick the existing one instead.
- `GET /api/golongan`, `GET /api/jabatan?q=`, `GET /api/roles`
- `POST /api/jabatan` and `POST /api/roles` for "Lain-lain" (use `get_or_create_*` so duplicates can't happen)

**Dedupe rules that keep your data clean:**
- NIP is unique. A second person with the same NIP is rejected with a message pointing to the existing record.
- Names are compared normalized (lowercase, collapsed spaces) and fuzzily (warn at ≥90 similarity).
- Jabatan and roles are unique by normalized name.
- Non-PNS people (mitra) can have no NIP and no golongan. Never make those required.

**Admin screen** (Step 13) lets an admin merge two duplicate people and deactivate (not delete) people.

### Step 7: Nomor surat service (about 1 day, the most important part)

`app/services/numbering.py`:
```python
from datetime import date, datetime
from sqlalchemy import select, func
from sqlalchemy.exc import IntegrityError
from ..config import settings
from ..models import NumberSeries, NumberReservation as NR

ROMAN = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"]

class NumberTaken(Exception): ...

def period_key(series: NumberSeries, d: date) -> str:
    return {"yearly": f"{d.year}",
            "monthly": f"{d.year}-{d.month:02d}",
            "never": "all"}[series.reset]

def format_number(series: NumberSeries, seq: int, d: date) -> str:
    return series.pattern.format(seq=seq, kode=series.code,
                                 romawi=ROMAN[d.month], bulan=d.month, tahun=d.year)

def next_seq(db, series, d) -> int:
    pk = period_key(series, d)
    last = db.scalar(select(func.max(NR.seq)).where(
        NR.series_id == series.id, NR.period_key == pk)) or 0
    return last + 1

def preview_next(db, series, d) -> str:
    return format_number(series, next_seq(db, series, d), d)

def available_numbers(db, series, d, user_id, limit=50) -> list[dict]:
    """Numbers a user may pick instead of 'next':
       - void numbers (if ALLOW_REUSE_VOID)
       - reserved-but-no-document numbers reserved by this user
       - gaps below the highest number"""
    pk = period_key(series, d)
    rows = db.execute(select(NR).where(NR.series_id == series.id,
                                       NR.period_key == pk)).scalars().all()
    taken = {r.seq for r in rows if r.status != "void"}
    out = []
    for r in rows:
        if r.status == "void" and settings.allow_reuse_void:
            out.append({"seq": r.seq, "formatted": r.formatted, "why": "dibatalkan"})
        elif r.status == "reserved" and r.reserved_by == user_id:
            out.append({"seq": r.seq, "formatted": r.formatted, "why": "belum dipakai"})
    mx = max((r.seq for r in rows), default=0)
    seen = {r.seq for r in rows}
    for n in range(1, mx + 1):
        if n not in taken and n not in seen:
            out.append({"seq": n, "formatted": format_number(series, n, d), "why": "lompat"})
    return sorted(out, key=lambda x: x["seq"])[:limit]

def reserve(db, series, d, user_id, pick_seq: int | None = None) -> NR:
    """Call inside a short transaction; caller commits."""
    pk = period_key(series, d)
    for _ in range(5):
        try:
            with db.begin_nested():                       # savepoint
                if pick_seq is None:
                    seq = next_seq(db, series, d)
                else:
                    seq = pick_seq
                    ex = db.scalar(select(NR).where(
                        NR.series_id == series.id, NR.period_key == pk, NR.seq == seq))
                    if ex:
                        reusable = (ex.status == "void" and settings.allow_reuse_void) or \
                                   (ex.status == "reserved" and ex.reserved_by == user_id)
                        if not reusable:
                            raise NumberTaken(f"Nomor {ex.formatted} sudah dipakai")
                        ex.status = "reserved"
                        ex.reserved_by = user_id
                        ex.reserved_at = datetime.now()
                        ex.void_reason = None
                        ex.formatted = format_number(series, seq, d)
                        db.flush()
                        return ex
                r = NR(series_id=series.id, period_key=pk, seq=seq,
                       formatted=format_number(series, seq, d),
                       status="reserved", reserved_by=user_id)
                db.add(r)
                db.flush()
                return r
        except IntegrityError:
            if pick_seq is not None:
                raise NumberTaken("Nomor baru saja dipakai orang lain")
            continue                                       # lost the race, retry with next
    raise RuntimeError("Gagal mengambil nomor, coba lagi")

def void(db, reservation_id: int, user_id: int, reason: str):
    r = db.get(NR, reservation_id)
    if r.status == "used":
        raise ValueError("Nomor sudah dipakai oleh dokumen. Batalkan dokumennya dulu.")
    r.status = "void"
    r.void_reason = reason
```

**Why this is safe:** the `UNIQUE(series_id, period_key, seq)` constraint is the real guard. If two users ask for "next" at the same moment, one INSERT fails with `IntegrityError`, and the loop retries with the next number. No two documents can ever get the same number, even if your code has a bug.

**UI for the three ways to pick a number:**
1. **Otomatis**: shows the preview "045/ST/X/2026" (not reserved until you generate).
2. **Pilih nomor tersedia**: dropdown from `available_numbers`.
3. **Input manual**: a number box. If it's higher than next, show a warning "akan membuat lompatan nomor 046-049" and require a tick to confirm.
4. **Ambil nomor saja** button: reserves without generating (for when the letter isn't ready yet).

> **Ask your admin staff first:** are voided numbers allowed to be reused in your office? Many offices say no. If not, set `ALLOW_REUSE_VOID=false`.

### Step 8: Document type registry (about half a day)

Each document type is a small config object. The form is **generated from it**, so a new document type usually means one new entry plus one new Word template, with no new HTML.

`app/doctypes.py`:
```python
from dataclasses import dataclass

@dataclass(frozen=True)
class Field:
    key: str
    label: str
    kind: str          # text | textarea | date | number | choice | person | person_multi
    required: bool = True
    choices: tuple[str, ...] = ()
    help: str = ""

@dataclass(frozen=True)
class DocTypeSpec:
    code: str
    name: str
    series: str | None          # number series code, None = no nomor
    fields: tuple[Field, ...]
    pdf_default: bool = True

REGISTRY = {s.code: s for s in [
    DocTypeSpec(
        code="surat_tugas", name="Surat Tugas", series="ST",
        fields=(
            Field("tanggal", "Tanggal surat", "date"),
            Field("pegawai", "Yang ditugaskan", "person_multi"),
            Field("kegiatan", "Kegiatan", "textarea"),
            Field("tempat", "Tempat", "text"),
            Field("tgl_mulai", "Tanggal mulai", "date"),
            Field("tgl_selesai", "Tanggal selesai", "date"),
            Field("penandatangan", "Penandatangan", "person"),
        ),
    ),
    # add more document types here
]}
```

### Step 9: Word templates and rendering (about 1 day)

**Authoring a template in Word:**
- Write the letter normally, and put `{{ variable }}` where data goes.
- Use `{{ nomor }}`, `{{ tanggal }}`, `{{ kegiatan }}` for simple values.
- For one person: `{{ penandatangan.nama }}`, `{{ penandatangan.nip }}`, `{{ penandatangan.jabatan }}`.
- Loop over people in a **table row**: put `{%tr for p in pegawai %}` in the first cell of the row, `{{ loop.index }} | {{ p.nama }} | {{ p.nip }} | {{ p.golongan }}` in the cells, and `{%tr endfor %}` in the last cell of the same row (see docxtpl docs for exact placement).
- Loop in **paragraphs**: `{%p for p in pegawai %}` ... `{%p endfor %}`.
- Type each tag in one go, don't edit the middle of it, and use straight quotes inside `{% %}` tags.

`app/services/render.py`:
```python
from docxtpl import DocxTemplate

BULAN = ["", "Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli",
         "Agustus", "September", "Oktober", "November", "Desember"]

def tgl_indo(d) -> str:
    return f"{d.day} {BULAN[d.month]} {d.year}"

def render_docx(template_path, context: dict, out_path):
    tpl = DocxTemplate(str(template_path))
    tpl.render(context)
    tpl.save(str(out_path))

def template_variables(template_path) -> set[str]:
    return DocxTemplate(str(template_path)).get_undeclared_template_variables()
```
Pre-format dates in Python (`tgl_indo`) before putting them in the context, so people editing templates don't need Jinja filters.

**Template upload with validation (admin screen):**
```python
def validate_template(path, spec) -> list[str]:
    used = template_variables(path)
    allowed = {f.key for f in spec.fields} | {"nomor"}
    errors = []
    unknown = sorted(used - allowed)
    if unknown:
        errors.append(f"Variabel tidak dikenal: {', '.join(unknown)}")
    if spec.series and "nomor" not in used:
        errors.append("Template tidak memuat {{ nomor }}")
    return errors
```
On a successful upload: save as `doctemplates/<code>/v<N>.docx`, store its SHA-256 in `template_versions`, mark it `is_active`, and deactivate the previous one. Every generated `Document` records which version produced it.

### Step 10: PDF conversion (about half a day)

`app/services/pdf.py`:
```python
import subprocess, threading
from pathlib import Path
from ..config import settings

_lock = threading.Lock()                 # LibreOffice cannot run two conversions on one profile
_PROFILE = Path("data/lo_profile").resolve()

def docx_to_pdf(docx: Path, outdir: Path, timeout: int = 180) -> Path:
    outdir.mkdir(parents=True, exist_ok=True)
    cmd = [settings.soffice_path,
           f"-env:UserInstallation={_PROFILE.as_uri()}",
           "--headless", "--convert-to", "pdf",
           "--outdir", str(outdir), str(docx)]
    with _lock:
        subprocess.run(cmd, check=True, timeout=timeout, capture_output=True)
    pdf = outdir / (docx.stem + ".pdf")
    if not pdf.exists() or pdf.stat().st_size == 0:
        raise RuntimeError("Konversi PDF gagal")
    return pdf
```
Notes:
- The lock is why you run **one** uvicorn worker. With several processes you'd need a file lock instead.
- The first conversion after a reboot takes a few seconds (LibreOffice cold start). Warm it up in the app's startup hook by converting a tiny blank DOCX.
- Test every real template by converting it and comparing the PDF to what Word shows. Layout can differ slightly (fonts, spacing).

### Step 11: The form UI (about 2 days)

**Page flow:** `/` (pick a document type) → `/documents/new/<code>` (the form) → result panel with download buttons → `/documents` (history, filter by type/number/date/user).

**Rendering the form from the registry:** in `pages.py`, pass `spec` to a Jinja template that loops over `spec.fields` and includes a partial per `kind`:

```html
{% for f in spec.fields %}
  <div class="field">
    <label>{{ f.label }}{% if f.required %} *{% endif %}</label>
    {% if f.kind == "text" %}
      <input name="{{ f.key }}" {{ "required" if f.required }}>
    {% elif f.kind == "textarea" %}
      <textarea name="{{ f.key }}" {{ "required" if f.required }}></textarea>
    {% elif f.kind == "date" %}
      <input type="date" name="{{ f.key }}" {{ "required" if f.required }}>
    {% elif f.kind == "person" %}
      {% set key = f.key %}{% set idx = 0 %}
      {% include "partials/person_row.html" %}
    {% elif f.kind == "person_multi" %}
      <div id="rows-{{ f.key }}">
        {% set key = f.key %}{% set idx = 0 %}
        {% include "partials/person_row.html" %}
      </div>
      <button type="button"
              hx-get="/partials/person-row?key={{ f.key }}&idx=1"
              hx-target="#rows-{{ f.key }}" hx-swap="beforeend">+ Tambah orang</button>
    {% endif %}
  </div>
{% endfor %}
```
(For the "Tambah orang" button, increment `idx` on each click using a small JS counter or `hx-vals='js:{idx: nextIdx("{{ f.key }}")}'`.)

**Nomor surat block** (top of the form): the radio group from Step 7 (Otomatis / Pilih tersedia / Manual), and the preview refreshes with htmx when the date changes: `hx-get="/partials/number-preview" hx-trigger="change from:[name=tanggal]"`.

**Person row partial** (`partials/person_row.html`). One row has a name/NIP combobox that **auto-fills** the other four fields, and every field stays editable:
```html
<div class="person-row" data-idx="{{ idx }}">
  <select class="person-pick" placeholder="Cari nama atau NIP…"></select>
  <input type="hidden" name="{{ key }}__{{ idx }}__id">
  <input name="{{ key }}__{{ idx }}__name"    placeholder="Nama">
  <input name="{{ key }}__{{ idx }}__nip"     placeholder="NIP (18 digit, kosongkan untuk mitra)">
  <select name="{{ key }}__{{ idx }}__golongan" class="tom-create" data-src="/api/golongan"></select>
  <select name="{{ key }}__{{ idx }}__jabatan"  class="tom-create" data-src="/api/jabatan"></select>
  <select name="{{ key }}__{{ idx }}__role"     class="tom-create" data-src="/api/roles"></select>
</div>
```

**Tom Select setup** (`static/app.js`):
```js
function initPersonPick(el) {
  const row = el.closest('.person-row');
  new TomSelect(el, {
    valueField: 'id', labelField: 'label', searchField: ['name', 'nip'],
    maxOptions: 20,
    load: (q, cb) =>
      fetch('/api/persons/search?q=' + encodeURIComponent(q))
        .then(r => r.json()).then(cb).catch(() => cb()),
    onChange: id => {
      const p = this.options[id]; if (!p) return;
      row.querySelector('[name$="__id"]').value = p.id;
      row.querySelector('[name$="__name"]').value = p.name;
      row.querySelector('[name$="__nip"]').value = p.nip || '';
      setTom(row, 'golongan', p.golongan);
      setTom(row, 'jabatan', p.jabatan);
      setTom(row, 'role', p.role);
    },
  });
}
// "Lain-lain": a Tom Select with create:true. On create, POST to the matching API
// (/api/jabatan, /api/roles), then call the callback with the saved item.
document.querySelectorAll('.tom-create').forEach(el => new TomSelect(el, {
  create: (input, cb) =>
    fetch(el.dataset.src, {method: 'POST', headers: {'Content-Type': 'application/json'},
                           body: JSON.stringify({name: input})})
      .then(r => r.json()).then(cb),
  load: (q, cb) => fetch(el.dataset.src + '?q=' + encodeURIComponent(q))
      .then(r => r.json()).then(cb).catch(() => cb()),
}));
```
(Adapt option field names to what your API returns. Tom Select's `create` callback expects an object with your `valueField`/`labelField`.)

**Parsing the form on the server:**
```python
def parse_people(form, key):
    rows = {}
    for k, v in form.multi_items():
        if k.startswith(f"{key}__"):
            _, idx, prop = k.split("__", 2)
            rows.setdefault(int(idx), {})[prop] = (v or "").strip()
    return [rows[i] for i in sorted(rows) if rows[i].get("name")]
```
If a row has an `id`, use that person (and just take the submitted NIP/golongan/jabatan as this document's snapshot). If it has **no id** but has a name, **create a new person** (after the NIP/duplicate checks from Step 6), so typing a new person in the form also adds them to master data.

### Step 12: The generate pipeline (about 1 day)

`app/services/generate.py` (shape of it):
```python
def generate(db, user, spec, form, want_pdf: bool):
    # 1) validate + build context
    ctx, payload, doc_date = build_context(db, user, spec, form)   # may create persons

    # 2) short transaction: reserve the nomor, commit
    res = None
    if spec.series:
        series = db.scalar(select(NumberSeries).where(NumberSeries.code == spec.series))
        mode = form.get("nomor_mode", "auto")            # auto | pick | manual
        pick = int(form["nomor_pick"]) if mode in ("pick", "manual") else None
        res = numbering.reserve(db, series, doc_date, user.id, pick)
        ctx["nomor"] = res.formatted
    db.commit()

    # 3) slow work, no DB write lock held
    tv = active_template(db, spec.code)
    out_dir = settings.storage_dir / spec.code / str(doc_date.year)
    base = safe_filename(f"{ctx.get('nomor', 'tanpa-nomor')}-{spec.code}")  # "/" -> "-"
    docx_path = out_dir / f"{base}.docx"
    out_dir.mkdir(parents=True, exist_ok=True)
    render_docx(tv.file_path, ctx, docx_path)
    pdf_path = docx_to_pdf(docx_path, out_dir) if want_pdf else None

    # 4) short transaction: record the result
    doc = Document(doctype_code=spec.code, reservation_id=res.id if res else None,
                   payload=payload, template_version_id=tv.id,
                   docx_path=str(docx_path), pdf_path=str(pdf_path) if pdf_path else None,
                   created_by=user.id)
    db.add(doc)
    if res:
        res.status = "used"
    audit(db, user.id, "document.create", "document", None, {"nomor": ctx.get("nomor")})
    db.commit()
    return doc
```
Details that matter:
- `build_context` turns each person into `snapshot()`-style dicts (`nama, nip, golongan, pangkat, jabatan, role`) and pre-formats dates with `tgl_indo`.
- `payload` stores the exact submitted values (JSON-safe) so you can "duplicate this document" later.
- A download route `GET /documents/{id}/download?fmt=docx|pdf` must check the user is logged in. Never serve `storage/` as a static folder.
- `safe_filename` must replace `/`, `\`, `:` and other characters that are illegal on Windows (nomor surat contains `/`).

### Step 13: Admin pages (about 2 days)

Minimum admin screens (all behind `admin_user`):
1. **Users**: create, deactivate, reset password.
2. **Master data**: people list with search, edit, deactivate, **merge duplicates**; golongan/jabatan/role lists.
3. **Number series**: edit pattern and reset policy. Show a table of all numbers for a series/period with status (reserved/used/void), who took them and when, and a **Void** button that asks for a reason.
4. **Templates**: upload new version, show validation errors, list versions, roll back.
5. **Audit log**: filter by user, action and date.

### Step 14: Tests (about 1 day, do not skip)

```python
# tests/test_numbering.py
from concurrent.futures import ThreadPoolExecutor

def test_numbers_are_unique_and_contiguous(session_factory, series):
    def take(_):
        db = session_factory()
        try:
            r = numbering.reserve(db, series, date(2026, 10, 5), user_id=1)
            db.commit()
            return r.seq
        finally:
            db.close()
    with ThreadPoolExecutor(8) as ex:
        seqs = list(ex.map(take, range(50)))
    assert sorted(seqs) == list(range(1, 51))
```
Also test:
- Voiding then reusing a number (and that it's refused when `ALLOW_REUSE_VOID=false`)
- Picking a number that is already used raises `NumberTaken`
- Period rollover: the first number of a new year is 001
- Roman month formatting
- NIP validation and duplicate detection
- Rendering: build a tiny DOCX with python-docx containing `{{ nomor }}`, render it, reopen it, assert the number appears
- A full generate flow with PDF mocked out
- Login required on every route; non-admin blocked on admin routes

### Step 15: Deploy on the office LAN (about half a day, needs IT)

1. Pick the host PC: always on, wired network, sleep disabled, ideally on a UPS. Windows Update restarts will happen, so the service must auto-start (below).
2. Copy the project to, say, `D:\suratku`, create the venv, `pip install -r requirements.txt`, set `.env`, then:
   ```powershell
   alembic upgrade head
   python scripts\seed.py
   ```
3. Test locally:
   ```powershell
   python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 1
   ```
4. Open the firewall for the office network only:
   ```powershell
   New-NetFirewallRule -DisplayName "SuratKu" -Direction Inbound -Protocol TCP `
     -LocalPort 8000 -Action Allow -Profile Domain,Private
   ```
5. From **another PC**, open `http://<server-ip>:8000`. If it fails, check the firewall profile and that both PCs are on the same subnet or VLAN.
6. Give the server a **fixed IP** (DHCP reservation on the router), and ask IT for a friendly DNS name like `suratku.kantor`. If IT can't, add a `hosts` file entry on each PC or just share the IP.
7. Run as a Windows service with **NSSM** so it survives reboots and logouts:
   ```powershell
   nssm install SuratKu "D:\suratku\.venv\Scripts\python.exe" "-m uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 1"
   nssm set SuratKu AppDirectory D:\suratku
   nssm set SuratKu AppStdout D:\suratku\data\out.log
   nssm set SuratKu AppStderr D:\suratku\data\err.log
   nssm set SuratKu Start SERVICE_AUTO_START
   nssm start SuratKu
   ```
8. **Do not expose the port to the internet.** If staff need remote access, use your office VPN.
9. **HTTPS (optional, Phase 2):** put Caddy in front with an internal certificate. Without it, passwords travel unencrypted on the LAN. That's a risk your supervisor/IT should consciously accept, or you can fix it.

**Docker alternative:** build an image from `python:3.12-slim`, `apt-get install libreoffice-writer fonts-liberation`, copy the app, mount `data/`, `storage/`, `doctemplates/` as volumes. Remember pitfall #3 about fonts.

### Step 16: Backups and operations (about 2 hours)

`scripts/backup.py`:
```python
import sqlite3, datetime, pathlib
from contextlib import closing

src = pathlib.Path("data/suratku.db")
dst_dir = pathlib.Path("backup"); dst_dir.mkdir(exist_ok=True)
dst = dst_dir / f"suratku_{datetime.datetime.now():%Y%m%d_%H%M}.db"
with closing(sqlite3.connect(src)) as s, closing(sqlite3.connect(dst)) as d:
    s.backup(d)                                   # safe while the app is running
for old in sorted(dst_dir.glob("suratku_*.db"))[:-30]:   # keep the last 30
    old.unlink()
```
Schedule it daily, and also copy `backup/`, `storage/` and `doctemplates/` to **another machine or NAS**:
```powershell
schtasks /Create /SC DAILY /ST 18:00 /TN "SuratKu Backup" `
  /TR "D:\suratku\.venv\Scripts\python.exe D:\suratku\scripts\backup.py"
robocopy D:\suratku\storage \\NAS\backup\suratku\storage /MIR
```
A backup that has never been restored is not a backup. **Do one test restore** before go-live.

Also: rotate the NSSM log files, and write a half-page "if the server is down" note for your supervisor (restart service, who to call).

### Step 17: Pilot and rollout (1–2 weeks)

1. Give 2–3 friendly users the app with **one** document type. Collect their complaints in a shared list.
2. Compare generated documents against your current manual/SIOMAY output, side by side, for the same input.
3. Fix, then add document types one at a time. For each: write the registry entry, build the Word template, validate it, generate a sample, have the owner of that document sign off.
4. Import the real people list (Excel to master data) before wider rollout so users find themselves in the dropdown.
5. Announce a **cutover date** after which nomor surat comes only from the app, otherwise numbers will be issued outside the system and drift.

---

## 5. Phase 2 features

**Excel bulk import** (for batch work like SE2026)
- Upload `.xlsx`, validate with openpyxl/pandas, show a **preview with row-level errors** before doing anything.
- Reserve N consecutive numbers in **one** transaction, so a batch gets contiguous nomor.
- Generate in a background job (a `jobs` table plus a worker thread), show a progress bar via polling, and offer a ZIP download at the end. Hundreds of PDFs take a while, so never do that inside one HTTP request.

**Photo evidence**
- On a LAN, **upload photos straight to the server**. That's simpler and more reliable than Google Drive links.
- Use Pillow `ImageOps.exif_transpose` to fix rotation, `pillow-heif` for HEIC, and docxtpl's `InlineImage` to place images in the template.

**Other**
- HTTPS with Caddy; optional login via your office's directory (LDAP/AD) if IT has one
- A dashboard: documents per month, per type, per user
- "Duplicate this document" using the stored `payload`
- Editable document type definitions in the admin UI instead of code

---

## 6. Pitfalls to avoid

1. **Numbering outside the app.** If anyone issues numbers on paper or in Excel, your sequence breaks. Announce a clear cutover.
2. **Holding a DB write lock during PDF conversion.** Reserve the number, commit, then render. (Built into Step 12.)
3. **Fonts on Linux/Docker.** LibreOffice substitutes missing fonts, which shifts layout. `fonts-liberation` is metric-compatible with Arial/Times/Courier, but other fonts (like Bookman Old Style) need the real font files, with their licence. A Windows host with Office avoids this.
4. **Smart quotes / split tags in Word templates.** Type `{{ ... }}` in one go and check with the upload validator.
5. **Free-text "lain-lain" creating duplicates.** Always normalize and use `get_or_create`; give admins a merge tool.
6. **Editing master data rewrites history.** Always store snapshots in `payload`.
7. **NIP is personal data.** Keep the server physically and network-wise restricted, don't log NIPs in plain text app logs, restrict who is admin, and back up to a trusted place. LAN-only does not mean "no access control".
8. **Single point of failure.** One PC hosts everything. Have the backup, the restore test, and a written recovery note.
9. **Multiple uvicorn workers.** They break the in-process PDF lock. Keep `--workers 1`, or move to a job queue first.
10. **Deleting numbers.** Never delete number rows. Void them with a reason so the audit trail stays intact.

---

## 7. Questions to settle with your supervisor before heavy building

1. Which documents are in scope, and can you get the **current Word versions** of each?
2. For each document: the **numbering pattern** (example: `045/XX/10/2026`), does it reset yearly or monthly, and is there a separate series per document type?
3. May a voided number be reused? Who may void?
4. Where does the **master list** of people (name, NIP, golongan, jabatan) come from today? Can you get it as Excel?
5. Who are the signers, and does the signer list change per letter?
6. Which PC/server will host this, and does IT approve a service on the network? Is a friendly DNS name possible?
7. Is plain HTTP on the LAN acceptable, or is HTTPS required?
8. Who administers it after you (users, templates, backups)?
9. Do documents need a retention period or an approval step before being "final"?
10. Do you need bulk (hundreds of documents at once) from day one, or can that wait for Phase 2?

---

## 8. Rough timeline

| Phase | Work | Rough time |
|---|---|---|
| 0 | Machine setup, skeleton, config, DB, migrations, seed | 1–2 days |
| 1 | Login, master data API and admin | 3–4 days |
| 2 | Numbering service, registry, one document type end-to-end, PDF | 4–5 days |
| 3 | Form polish, history, remaining document types, template admin, audit | 1–2 weeks |
| 4 | Tests, deployment, backups, restore test | 2–3 days |
| 5 | Pilot, fixes, rollout | 1–2 weeks |
| 6 | Phase 2 features (bulk, photos, HTTPS) | as needed |

## 9. Definition of done for the MVP

- [ ] Two people generate documents at the same time and never get the same nomor
- [ ] Voided and unused numbers appear in the "available" picker (if your policy allows reuse)
- [ ] A new person can be added directly from the form, and duplicates are flagged
- [ ] DOCX and PDF look right next to the current official format
- [ ] Old documents don't change when master data changes
- [ ] The app survives a server reboot without anyone touching it
- [ ] A backup was restored successfully at least once
- [ ] Only logged-in users can download files; only admins can reach admin pages
