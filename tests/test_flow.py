"""Uji alur lengkap lewat halaman web: login, buat dokumen (Word + PDF), batalkan, hak akses."""
import io
import re

import pytest
from docx import Document as DocxDocument
from fastapi.testclient import TestClient

from app.main import app
from app.services.generate import storage_path
from app.services.pdf import pdf_available

PDF = pytest.mark.skipif(not pdf_available(), reason="LibreOffice tidak terpasang")


@pytest.fixture(scope="module")
def admin():
    with TestClient(app) as c:
        r = c.post("/setup", data={"username": "Admin", "full_name": "Admin Kantor",
                                   "password": "rahasia123", "password2": "rahasia123"},
                   follow_redirects=False)
        assert r.status_code == 303
        yield c


def form(**over):
    d = {
        "tanggal": "2026-10-05", "kegiatan": "Pelatihan A & B <uji>\nBaris kedua",
        "tempat": "Aula", "tgl_mulai": "2026-10-06", "tgl_selesai": "2026-10-08",
        "pegawai__0__name": "Budi Santoso", "pegawai__0__nip": "199001012015011100",
        "pegawai__0__golongan": "III/b", "pegawai__0__jabatan": "Analis", "pegawai__0__role": "Pegawai",
        "pegawai__1__name": "Mitra Baru", "pegawai__1__nip": "", "pegawai__1__golongan": "",
        "pegawai__1__jabatan": "Petugas Lapangan", "pegawai__1__role": "Mitra",
        "penandatangan__0__name": "Kepala Kantor", "penandatangan__0__nip": "197001011995011001",
        "penandatangan__0__golongan": "IV/a", "penandatangan__0__jabatan": "Kepala",
        "penandatangan__0__role": "Pegawai",
        "nomor_mode": "auto",
    }
    d.update(over)
    return {k: v for k, v in d.items() if v is not None}


def doc_id_from(html: str) -> int:
    return int(re.search(r"/documents/(\d+)/download\?fmt=docx", html).group(1))


def docx_text(content: bytes) -> str:
    d = DocxDocument(io.BytesIO(content))
    parts = [p.text for p in d.paragraphs]
    for t in d.tables:
        for r in t.rows:
            parts.extend(c.text for c in r.cells)
    return "\n".join(parts)


def test_login_required_everywhere():
    with TestClient(app) as anon:
        for url in ("/", "/documents", "/numbers", "/documents/new/surat_tugas", "/admin", "/documents/1/download"):
            r = anon.get(url, follow_redirects=False)
            assert r.status_code == 303 and r.headers["location"] == "/login", url
        assert anon.get("/api/persons/search?q=a").status_code == 401
        assert anon.get("/api/numbers/surat_tugas").status_code == 401


def test_setup_only_once(admin):
    r = admin.get("/setup", follow_redirects=False)
    assert r.status_code == 303
    r = TestClient(app).post("/setup", data={"username": "x", "full_name": "x", "password": "12345678",
                                             "password2": "12345678"}, follow_redirects=False)
    assert r.status_code == 303 and r.headers["location"] == "/login"


def test_home_and_form_render(admin):
    assert "Surat Tugas" in admin.get("/").text
    html = admin.get("/documents/new/surat_tugas").text
    assert "Nomor surat" in html and 'name="pegawai__0__name"' in html and "__IDX__" in html
    assert admin.get("/documents/new/tidak_ada").status_code == 404


def test_api_numbers_before_any_document(admin):
    j = admin.get("/api/numbers/surat_tugas?d=2026-10-05&seq=9").json()
    assert j["next"] == "001/ST/X/2026" and j["next_seq"] == 1 and j["formatted"] == "009/ST/X/2026"
    assert j["available"] == []


@PDF
def test_generate_word_and_pdf(admin):
    r = admin.post("/documents/new/surat_tugas", data=form(make_pdf="on"))
    assert r.status_code == 200 and "Dokumen berhasil dibuat" in r.text
    assert "001/ST/X/2026" in r.text
    did = doc_id_from(r.text)

    word = admin.get(f"/documents/{did}/download?fmt=docx")
    assert word.status_code == 200
    text = docx_text(word.content)
    assert "Nomor: 001/ST/X/2026" in text
    assert "Budi Santoso" in text and "Mitra Baru" in text and "Petugas Lapangan" in text
    assert "A & B <uji>" in text                      # karakter khusus tidak merusak dokumen
    assert "Baris kedua" in text
    assert "5 Oktober 2026" in text and "6 Oktober 2026 s.d. 8 Oktober 2026" in text
    assert "Kepala Kantor" in text and "197001011995011001" in text
    assert "{{" not in text and "{%" not in text      # tidak ada tag template yang tersisa

    pdf = admin.get(f"/documents/{did}/download?fmt=pdf")
    assert pdf.status_code == 200 and pdf.content.startswith(b"%PDF") and len(pdf.content) > 5000


def test_second_number_and_people_saved_to_master(admin):
    r = admin.post("/documents/new/surat_tugas", data=form())          # tanpa PDF
    assert "002/ST/X/2026" in r.text
    hits = admin.get("/api/persons/search?q=budi").json()
    assert hits and hits[0]["nip"] == "199001012015011100" and hits[0]["golongan"] == "III/b"
    assert admin.get("/api/persons/search?q=1990010120150111").json()   # cari lewat NIP
    mitra = admin.get("/api/persons/search?q=mitra baru").json()
    assert mitra and mitra[0]["nip"] == "" and "tanpa NIP" in mitra[0]["label"]


def test_validation_errors_do_not_consume_number_or_create_people(admin):
    before = admin.get("/api/numbers/surat_tugas?d=2026-10-05").json()["next_seq"]
    bad = form(kegiatan="", pegawai__0__nip="123", pegawai__0__name="Orang Gagal")
    r = admin.post("/documents/new/surat_tugas", data=bad)
    assert r.status_code == 422
    assert "Kegiatan: wajib diisi" in r.text and "NIP harus 18 digit" in r.text
    assert "Orang Gagal" in r.text                                       # isian dipertahankan di formulir
    assert admin.get("/api/numbers/surat_tugas?d=2026-10-05").json()["next_seq"] == before
    assert not admin.get("/api/persons/search?q=Orang Gagal").json()

    r = admin.post("/documents/new/surat_tugas", data=form(tanggal="bukan-tanggal"))
    assert r.status_code == 422 and "tanggal tidak valid" in r.text


def test_manual_and_pick_modes(admin):
    r = admin.post("/documents/new/surat_tugas", data=form(nomor_mode="manual", nomor_manual="9"))
    assert r.status_code == 422 and "melompati" in r.text               # lompat harus dikonfirmasi
    r = admin.post("/documents/new/surat_tugas",
                   data=form(nomor_mode="manual", nomor_manual="9", confirm_gap="on"))
    assert "009/ST/X/2026" in r.text
    avail = admin.get("/api/numbers/surat_tugas?d=2026-10-05").json()
    assert [a["seq"] for a in avail["available"]] == [3, 4, 5, 6, 7, 8]
    assert avail["next_seq"] == 10
    r = admin.post("/documents/new/surat_tugas", data=form(nomor_mode="pick", nomor_pick="5"))
    assert "005/ST/X/2026" in r.text
    r = admin.post("/documents/new/surat_tugas", data=form(nomor_mode="pick", nomor_pick="9"))
    assert r.status_code == 422 and "sudah dipakai" in r.text            # 009 sudah dipakai


def test_reserve_only_then_use_it(admin):
    r = admin.post("/api/numbers/surat_tugas/reserve", json={"date": "2026-10-05", "mode": "auto"})
    assert r.status_code == 200 and r.json()["nomor"] == "010/ST/X/2026"
    avail = admin.get("/api/numbers/surat_tugas?d=2026-10-05").json()["available"]
    assert any(a["seq"] == 10 and a["why"] == "diambil, belum dipakai" for a in avail)
    r = admin.post("/documents/new/surat_tugas", data=form(nomor_mode="pick", nomor_pick="10"))
    assert "010/ST/X/2026" in r.text


def test_cancel_document_voids_number_and_allows_reuse(admin):
    r = admin.post("/documents/new/surat_tugas", data=form())
    did, nomor = doc_id_from(r.text), re.search(r"(\d{3})/ST/X/2026", r.text).group(0)
    seq = int(nomor[:3])
    r = admin.post(f"/documents/{did}/cancel", data={"reason": "salah tujuan"}, follow_redirects=False)
    assert r.status_code == 303
    page = admin.get("/documents").text
    assert "batal" in page
    avail = admin.get("/api/numbers/surat_tugas?d=2026-10-05").json()["available"]
    assert any(a["seq"] == seq and a["why"] == "dibatalkan" for a in avail)
    r = admin.post("/documents/new/surat_tugas", data=form(nomor_mode="pick", nomor_pick=str(seq)))
    assert nomor in r.text                                              # nomor batal dipakai lagi


def test_history_and_numbers_pages(admin):
    h = admin.get("/documents?type=surat_tugas&q=001").text
    assert "001/ST/X/2026" in h
    assert "Pelatihan" not in admin.get("/documents?q=zzzzzz").text
    n = admin.get("/numbers?series=ST").text
    assert "001/ST/X/2026" in n and "dipakai" in n


def test_numbers_other_year_starts_again(admin):
    r = admin.post("/documents/new/surat_tugas", data=form(tanggal="2027-01-15"))
    assert "001/ST/I/2027" in r.text


def test_surat_keterangan_other_type(admin):
    data = {"tanggal": "2026-10-05", "keperluan": "Melamar beasiswa", "nomor_mode": "auto",
            "orang__0__name": "Budi Santoso", "orang__0__nip": "199001012015011100",
            "orang__0__golongan": "III/b", "orang__0__jabatan": "Analis", "orang__0__role": "Pegawai",
            "penandatangan__0__name": "Kepala Kantor", "penandatangan__0__nip": "197001011995011001",
            "penandatangan__0__golongan": "IV/a", "penandatangan__0__jabatan": "Kepala"}
    r = admin.post("/documents/new/surat_keterangan", data=data)
    assert "001/SK/X/2026" in r.text
    t = docx_text(admin.get(f"/documents/{doc_id_from(r.text)}/download?fmt=docx").content)
    assert "Penata Muda Tk. I" in t and "(III/b)" in t                  # pangkat otomatis dari golongan


# ---------------------------------------------------------------- hak akses & keamanan
@pytest.fixture(scope="module")
def staff(admin):
    r = admin.post("/admin/users", data={"username": "Staf1", "full_name": "Staf Satu", "password": "password1"},
                   follow_redirects=False)
    assert r.status_code == 303
    with TestClient(app) as c:
        r = c.post("/login", data={"username": "staf1", "password": "password1"}, follow_redirects=False)
        assert r.status_code == 303
        yield c


def test_staff_cannot_use_admin(staff):
    for url in ("/admin", "/admin/users", "/admin/people", "/admin/templates", "/admin/audit"):
        assert staff.get(url).status_code == 403, url
    assert staff.post("/admin/users", data={"username": "x", "full_name": "x", "password": "12345678"}).status_code == 403
    assert staff.post("/documents/1/cancel", data={"reason": "x"}).status_code == 403
    assert staff.post("/numbers/1/void", data={"reason": "x"}).status_code == 403
    assert staff.get("/api/persons/search?q=a").status_code == 200       # tapi bisa membuat dokumen
    assert staff.get("/documents/new/surat_tugas").status_code == 200
    assert "Admin" not in staff.get("/").text.split("</header>")[0].replace("Admin Kantor", "")


def test_wrong_password_and_lockout():
    with TestClient(app) as c:
        for _ in range(5):
            assert c.post("/login", data={"username": "orangiseng", "password": "salah"}).status_code == 401
        assert c.post("/login", data={"username": "orangiseng", "password": "salah"}).status_code == 429
    with TestClient(app) as c:
        assert c.post("/login", data={"username": "admin", "password": "salah!!!"}).status_code == 401
        assert c.post("/login", data={"username": "admin", "password": "rahasia123"},
                      follow_redirects=False).status_code == 303


def test_deactivated_user_is_locked_out(admin, staff):
    uid = int(re.search(r'/admin/users/(\d+)"', admin.get("/admin/users").text).group(1))
    users_html = admin.get("/admin/users").text
    staf_id = int(re.search(r'id="uf-(\d+)"[^>]*action="/admin/users/\d+"></form>\s*<input[^>]*value="Staf Satu"', users_html).group(1))
    assert uid and staf_id
    admin.post(f"/admin/users/{staf_id}", data={"full_name": "Staf Satu"})        # is_active tidak dicentang
    assert staff.get("/", follow_redirects=False).status_code == 303


def test_cross_site_post_rejected(admin):
    r = admin.post("/logout", headers={"Origin": "http://evil.example"})
    assert r.status_code == 403
    assert admin.get("/").status_code == 200                                   # masih login


def test_path_traversal_blocked():
    with pytest.raises(ValueError):
        storage_path("../../etc/passwd")
    with pytest.raises(ValueError):
        storage_path("/etc/passwd")


def test_admin_cannot_lock_self_out(admin):
    html = admin.get("/admin/users").text
    my_id = int(re.search(r'id="uf-(\d+)"[^>]*action="/admin/users/\d+"></form>\s*<input[^>]*value="Admin Kantor"', html).group(1))
    admin.post(f"/admin/users/{my_id}", data={"full_name": "Admin Kantor"})   # coba cabut admin & aktif
    assert admin.get("/admin").status_code == 200


# ---------------------------------------------------------------- template Word
def make_docx(text_lines):
    d = DocxDocument()
    for line in text_lines:
        d.add_paragraph(line)
    bio = io.BytesIO()
    d.save(bio)
    return bio.getvalue()


DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"


def test_template_upload_validation(admin):
    # variabel tidak dikenal
    bad = make_docx(["No {{ nomor }}", "{{ kegiatann }}"])
    r = admin.post("/admin/templates/surat_tugas", files={"file": ("t.docx", bad, DOCX)}, follow_redirects=True)
    assert "Variabel tidak dikenal" in r.text and "kegiatann" in r.text
    # tanpa {{ nomor }}
    r = admin.post("/admin/templates/surat_tugas", files={"file": ("t.docx", make_docx(["{{ kegiatan }}"]), DOCX)},
                   follow_redirects=True)
    assert "tidak memuat" in r.text
    # sintaks rusak
    r = admin.post("/admin/templates/surat_tugas",
                   files={"file": ("t.docx", make_docx(["{{ nomor }} {% for x in %}"]), DOCX)}, follow_redirects=True)
    assert "Template ditolak" in r.text
    # bukan .docx
    r = admin.post("/admin/templates/surat_tugas", files={"file": ("t.doc", b"x" * 2000, "application/msword")},
                   follow_redirects=True)
    assert ".docx" in r.text
    # bukan file Word sungguhan
    r = admin.post("/admin/templates/surat_tugas", files={"file": ("t.docx", b"bukan zip" * 300, DOCX)},
                   follow_redirects=True)
    assert "Template ditolak" in r.text


def test_template_upload_good_and_rollback(admin):
    good = make_docx(["Surat Versi Baru {{ nomor }}", "Kegiatan: {{ kegiatan }} di {{ tempat }}"])
    r = admin.post("/admin/templates/surat_tugas", files={"file": ("baru.docx", good, DOCX)},
                   data={"note": "uji"}, follow_redirects=True)
    assert "berhasil dipasang" in r.text and "v2" in r.text
    r = admin.post("/documents/new/surat_tugas", data=form())
    t = docx_text(admin.get(f"/documents/{doc_id_from(r.text)}/download?fmt=docx").content)
    assert "Surat Versi Baru" in t
    # kembalikan ke versi 1
    tid = int(re.search(r"/admin/templates/surat_tugas/activate/(\d+)", admin.get("/admin/templates").text).group(1))
    admin.post(f"/admin/templates/surat_tugas/activate/{tid}")
    r = admin.post("/documents/new/surat_tugas", data=form())
    t = docx_text(admin.get(f"/documents/{doc_id_from(r.text)}/download?fmt=docx").content)
    assert "KOP SURAT INSTANSI" in t


def test_admin_pages_render(admin):
    for url in ("/admin", "/admin/users", "/admin/people", "/admin/people-import", "/admin/lists",
                "/admin/series", "/admin/templates", "/admin/audit", "/account", "/admin/people-template.xlsx"):
        r = admin.get(url)
        assert r.status_code == 200, url
    assert admin.get("/admin/audit?action=document").text.count("document.create") >= 3


def test_series_edit_validation(admin):
    sid = int(re.search(r'action="/admin/series/(\d+)"', admin.get("/admin/series").text).group(1))
    r = admin.post(f"/admin/series/{sid}", data={"name": "x", "pattern": "{kode}/{tahun}", "reset": "yearly"},
                   follow_redirects=True)
    assert "harus memuat {seq}" in r.text
    r = admin.post(f"/admin/series/{sid}", data={"name": "x", "pattern": "{seq.__class__}", "reset": "yearly"},
                   follow_redirects=True)
    assert "tidak dikenal" in r.text or "tidak didukung" in r.text or "tidak valid" in r.text.lower()


def test_people_admin_and_import_endpoints(admin):
    r = admin.post("/admin/people", data={"name": "Admin Tambah", "nip": "199001012015011200",
                                          "golongan": "II/a", "jabatan": "Staf", "role": "Pegawai"},
                   follow_redirects=True)
    assert "ditambahkan" in r.text
    r = admin.post("/admin/people", data={"name": "Orang Lain", "nip": "199001012015011200"},
                   follow_redirects=True)
    assert "sudah dimiliki" in r.text
    tpl = admin.get("/admin/people-template.xlsx").content
    r = admin.post("/admin/people-import", files={"file": ("o.xlsx", tpl, "application/octet-stream")})
    assert r.status_code == 200 and "Hasil impor" in r.text
    r = admin.post("/admin/people-import", files={"file": ("o.xlsx", b"bukan excel", "application/octet-stream")},
                   follow_redirects=True)
    assert "tidak bisa dibaca" in r.text
