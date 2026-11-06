"""Data master: orang, golongan, jabatan, peran. Termasuk pencegahan data ganda."""
import io
import re

from openpyxl import Workbook, load_workbook
from rapidfuzz import fuzz
from sqlalchemy import or_, select

from ..models import Golongan, Jabatan, Person, PersonRole

NIP_RE = re.compile(r"^\d{18}$")
DEFAULT_ROLE = "Pegawai"


class DataError(Exception):
    """Isian tidak valid; pesannya aman ditampilkan ke pengguna."""


def norm(s: str) -> str:
    return " ".join((s or "").lower().split())


def clean_text(s: str | None) -> str:
    return " ".join((s or "").split())


def clean_nip(raw: str | None) -> str | None:
    if not raw:
        return None
    nip = re.sub(r"\D", "", str(raw))          # buang spasi, titik, strip
    if not nip:
        return None
    if not NIP_RE.match(nip):
        raise DataError(f"NIP harus 18 digit angka (yang diisi: {len(nip)} digit).")
    return nip


# ---- golongan / jabatan / peran: ambil kalau ada, buat kalau belum ----------------
def get_or_create_golongan(db, text: str | None) -> Golongan | None:
    code = clean_text(text)
    if not code:
        return None
    # terima "III/a - Penata Muda" -> ambil bagian sebelum " - "
    code = code.split(" - ")[0].strip()
    g = db.scalar(select(Golongan).where(Golongan.code.ilike(code)))
    if not g:
        g = Golongan(code=code, pangkat="", sort=999)
        db.add(g)
        db.flush()
    return g


def get_or_create_jabatan(db, text: str | None) -> Jabatan | None:
    name = clean_text(text)
    if not name:
        return None
    j = db.scalar(select(Jabatan).where(Jabatan.name_norm == norm(name)))
    if not j:
        j = Jabatan(name=name, name_norm=norm(name))
        db.add(j)
        db.flush()
    return j


def get_or_create_role(db, text: str | None) -> PersonRole:
    name = clean_text(text) or DEFAULT_ROLE
    r = db.scalar(select(PersonRole).where(PersonRole.name.ilike(name)))
    if not r:
        r = PersonRole(name=name)
        db.add(r)
        db.flush()
    return r


# ---- pencarian -------------------------------------------------------------------
def search_people(db, q: str, limit: int = 20) -> list[Person]:
    q = (q or "").strip()
    stmt = select(Person).where(Person.is_active)
    if q:
        qn = norm(q)
        like_name = f"%{qn}%"
        stmt = stmt.where(or_(Person.name_norm.like(like_name), Person.nip.like(f"{q}%")))
    return list(db.scalars(stmt.order_by(Person.name_norm).limit(limit)).all())


def similar_people(db, name: str, threshold: int = 88) -> list[Person]:
    n = norm(name)
    cands = db.scalars(select(Person).where(Person.is_active)).all()
    return [p for p in cands if fuzz.token_sort_ratio(n, p.name_norm) >= threshold]


def person_dict(p: Person) -> dict:
    """Bentuk untuk dropdown pencarian di web."""
    gol = p.golongan.code if p.golongan else ""
    return {
        "id": p.id,
        "label": p.name + (f"  ({p.nip})" if p.nip else "  (tanpa NIP)"),
        "name": p.name, "nip": p.nip or "", "golongan": gol,
        "jabatan": p.jabatan.name if p.jabatan else "",
        "role": p.role.name if p.role else "",
    }


# ---- baris orang dari formulir ----------------------------------------------------
def parse_people(form, key: str) -> list[dict]:
    """Ambil baris 'key__0__name', 'key__0__nip', ... dari data formulir."""
    rows: dict[int, dict] = {}
    for k, v in form.multi_items():
        if not k.startswith(f"{key}__"):
            continue
        try:
            _, idx, prop = k.split("__", 2)
            rows.setdefault(int(idx), {})[prop] = (v or "").strip()
        except ValueError:
            continue
    return [rows[i] for i in sorted(rows) if clean_text(rows[i].get("name"))]


def resolve_row(db, row: dict, user_id: int | None, update_master: bool,
                warnings: list[str]) -> dict:
    """Ubah satu baris formulir menjadi 'snapshot' orang untuk dokumen.

    - Kalau orangnya belum ada di data master, dibuat otomatis.
    - Isian di formulir (NIP/golongan/jabatan/peran) dipakai untuk dokumen ini.
    - Data master hanya diubah kalau `update_master` dicentang."""
    name = clean_text(row.get("name"))
    nip = clean_nip(row.get("nip"))
    gol = get_or_create_golongan(db, row.get("golongan"))
    jab = get_or_create_jabatan(db, row.get("jabatan"))
    role = get_or_create_role(db, row.get("role"))

    person = None
    pid = (row.get("id") or "").strip()
    if pid.isdigit():
        person = db.get(Person, int(pid))
    if person is None and nip:
        person = db.scalar(select(Person).where(Person.nip == nip))
    if person is None:
        same = db.scalars(select(Person).where(Person.name_norm == norm(name))).all()
        for cand in same:
            if not nip or not cand.nip or cand.nip == nip:
                person = cand
                break

    if person is None:
        similar = similar_people(db, name)
        if similar:
            warnings.append(f"Orang baru \"{name}\" mirip dengan: "
                            + ", ".join(p.name for p in similar[:3])
                            + ". Pastikan bukan orang yang sama.")
        person = Person(name=name, name_norm=norm(name), nip=nip, golongan_id=gol.id if gol else None,
                        jabatan_id=jab.id if jab else None, role_id=role.id, created_by=user_id)
        db.add(person)
        db.flush()
    elif update_master:
        if nip and person.nip != nip:
            clash = db.scalar(select(Person).where(Person.nip == nip, Person.id != person.id))
            if clash:
                raise DataError(f"NIP {nip} sudah dimiliki {clash.name}.")
            person.nip = nip
        person.name, person.name_norm = name, norm(name)
        person.golongan_id = gol.id if gol else None
        person.jabatan_id = jab.id if jab else None
        person.role_id = role.id
        db.flush()

    return {
        "id": person.id, "nama": name, "nip": nip or "",
        "golongan": gol.code if gol else "", "pangkat": gol.pangkat if gol else "",
        "jabatan": jab.name if jab else "", "role": role.name,
    }


# ---- gabung data ganda -----------------------------------------------------------
def merge_people(db, source_id: int, target_id: int) -> Person:
    """Gabungkan `source` ke `target`: isian kosong di target diisi dari source,
    lalu source dinonaktifkan. (Dokumen lama tidak terpengaruh karena menyimpan salinan.)"""
    if source_id == target_id:
        raise DataError("Pilih dua orang yang berbeda.")
    src, tgt = db.get(Person, source_id), db.get(Person, target_id)
    if not src or not tgt:
        raise DataError("Data orang tidak ditemukan.")
    src_nip = src.nip
    if src_nip and not tgt.nip:
        src.nip = None
        db.flush()
        tgt.nip = src_nip
    tgt.golongan_id = tgt.golongan_id or src.golongan_id
    tgt.jabatan_id = tgt.jabatan_id or src.jabatan_id
    src.is_active = False
    db.flush()
    return tgt


# ---- impor dari Excel ------------------------------------------------------------
IMPORT_HEADERS = ["Nama", "NIP", "Golongan", "Jabatan", "Role"]


def build_import_template() -> bytes:
    wb = Workbook()
    ws = wb.active
    ws.title = "Orang"
    ws.append(IMPORT_HEADERS)
    ws.append(["Contoh Nama Pegawai (hapus baris ini)", "199001012015011001", "III/a",
               "Staf Pelaksana", "Pegawai"])
    ws.append(["Contoh Nama Mitra (hapus baris ini)", "", "", "Petugas Lapangan", "Mitra"])
    for col, w in zip("ABCDE", (38, 22, 12, 30, 14)):
        ws.column_dimensions[col].width = w
    # kolom NIP sebagai teks supaya Excel tidak mengubah jadi 1,99E+17
    for row in ws.iter_rows(min_row=2, min_col=2, max_col=2):
        for c in row:
            c.number_format = "@"
    bio = io.BytesIO()
    wb.save(bio)
    return bio.getvalue()


def import_people(db, file_bytes: bytes, user_id: int) -> dict:
    """Impor orang dari Excel. Mengembalikan ringkasan {added, updated, skipped, errors}."""
    wb = load_workbook(io.BytesIO(file_bytes), read_only=True, data_only=True)
    ws = wb.worksheets[0]
    rows = ws.iter_rows(values_only=True)
    header = next(rows, None)
    if not header:
        raise DataError("File Excel kosong.")
    idx = {norm(str(h)): i for i, h in enumerate(header) if h is not None}
    if "nama" not in idx:
        raise DataError("Kolom 'Nama' tidak ditemukan di baris pertama. Pakai template dari tombol Unduh.")

    def cell(r, name):
        i = idx.get(name)
        return None if i is None or i >= len(r) else r[i]

    def nip_text(v):
        if v is None:
            return None
        if isinstance(v, float) and v.is_integer():
            v = int(v)
        return str(v)

    res = {"added": 0, "updated": 0, "skipped": 0, "errors": []}
    for n, r in enumerate(rows, start=2):
        name = clean_text(str(cell(r, "nama") or ""))
        if not name:
            continue
        if "contoh nama" in name.lower():
            res["skipped"] += 1
            continue
        try:
            with db.begin_nested():
                nip = clean_nip(nip_text(cell(r, "nip")))
                gol = get_or_create_golongan(db, str(cell(r, "golongan") or ""))
                jab = get_or_create_jabatan(db, str(cell(r, "jabatan") or ""))
                role_txt = str(cell(r, "role") or "")
                existing = None
                if nip:
                    existing = db.scalar(select(Person).where(Person.nip == nip))
                if existing is None:
                    existing = db.scalar(select(Person).where(
                        Person.name_norm == norm(name),
                        or_(Person.nip.is_(None), Person.nip == nip) if nip else Person.nip.is_(None)))
                if existing:
                    changed = False
                    if gol and existing.golongan_id != gol.id:
                        existing.golongan_id, changed = gol.id, True
                    if jab and existing.jabatan_id != jab.id:
                        existing.jabatan_id, changed = jab.id, True
                    if role_txt.strip() and existing.role.name.lower() != role_txt.strip().lower():
                        existing.role_id, changed = get_or_create_role(db, role_txt).id, True
                    if nip and not existing.nip:
                        existing.nip, changed = nip, True
                    res["updated" if changed else "skipped"] += 1
                else:
                    role = get_or_create_role(db, role_txt)
                    db.add(Person(name=name, name_norm=norm(name), nip=nip,
                                  golongan_id=gol.id if gol else None,
                                  jabatan_id=jab.id if jab else None,
                                  role_id=role.id, created_by=user_id))
                    db.flush()
                    res["added"] += 1
        except DataError as e:
            res["errors"].append(f"Baris {n} ({name}): {e}")
    return res


# ---- tambah / ubah satu orang (dipakai halaman admin) -----------------------------
def create_person(db, user_id: int | None, name: str, nip: str | None, golongan: str | None,
                  jabatan: str | None, role: str | None) -> Person:
    name = clean_text(name)
    if not name:
        raise DataError("Nama wajib diisi.")
    nip = clean_nip(nip)
    if nip:
        clash = db.scalar(select(Person).where(Person.nip == nip))
        if clash:
            raise DataError(f"NIP {nip} sudah dimiliki {clash.name}.")
    else:
        same = db.scalar(select(Person).where(Person.name_norm == norm(name), Person.nip.is_(None)))
        if same:
            raise DataError(f"\"{name}\" sudah ada (tanpa NIP). Ubah datanya saja, jangan dibuat ganda.")
    gol, jab, rol = get_or_create_golongan(db, golongan), get_or_create_jabatan(db, jabatan), get_or_create_role(db, role)
    p = Person(name=name, name_norm=norm(name), nip=nip, golongan_id=gol.id if gol else None,
               jabatan_id=jab.id if jab else None, role_id=rol.id, created_by=user_id)
    db.add(p)
    db.flush()
    return p


def update_person(db, p: Person, name: str, nip: str | None, golongan: str | None,
                  jabatan: str | None, role: str | None, is_active: bool) -> Person:
    name = clean_text(name)
    if not name:
        raise DataError("Nama wajib diisi.")
    nip = clean_nip(nip)
    if nip:
        clash = db.scalar(select(Person).where(Person.nip == nip, Person.id != p.id))
        if clash:
            raise DataError(f"NIP {nip} sudah dimiliki {clash.name}.")
    gol, jab, rol = get_or_create_golongan(db, golongan), get_or_create_jabatan(db, jabatan), get_or_create_role(db, role)
    p.name, p.name_norm, p.nip = name, norm(name), nip
    p.golongan_id = gol.id if gol else None
    p.jabatan_id = jab.id if jab else None
    p.role_id = rol.id
    p.is_active = is_active
    db.flush()
    return p
