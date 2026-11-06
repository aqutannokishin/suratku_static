"""Membuat template Word contoh di app/seed_templates/.

Dijalankan sekali oleh pembuat aplikasi. Anda TIDAK perlu menjalankannya;
template contoh sudah termasuk. Anda akan mengganti isinya dengan surat resmi kantor
lewat Admin > Template.
"""
from pathlib import Path

from docx import Document
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.shared import Cm, Pt

OUT = Path(__file__).resolve().parent.parent / "app" / "seed_templates"
OUT.mkdir(parents=True, exist_ok=True)


def base_doc() -> Document:
    d = Document()
    sec = d.sections[0]
    sec.page_width, sec.page_height = Cm(21), Cm(29.7)
    sec.left_margin = sec.right_margin = Cm(2.5)
    sec.top_margin = sec.bottom_margin = Cm(2.2)
    st = d.styles["Normal"]
    st.font.name = "Times New Roman"
    st.font.size = Pt(12)
    return d


def centered(d, text, bold=False, size=None, space_after=0):
    p = d.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r = p.add_run(text)
    r.bold = bold
    if size:
        r.font.size = Pt(size)
    p.paragraph_format.space_after = Pt(space_after)
    return p


def letterhead(d):
    centered(d, "KOP SURAT INSTANSI", bold=True, size=14)
    centered(d, "(ganti bagian ini dengan kop resmi kantor Anda)", size=10, space_after=2)
    p = d.add_paragraph("_" * 78)
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER


def signer_block(d, tanggal_var="tanggal"):
    d.add_paragraph()
    for text in ("{{ " + tanggal_var + " }}", "{{ penandatangan.jabatan }}", "", "", "",
                 "{{ penandatangan.nama }}", "NIP. {{ penandatangan.nip }}"):
        p = d.add_paragraph(text)
        p.paragraph_format.left_indent = Cm(9)
        p.paragraph_format.space_after = Pt(0)


def surat_tugas():
    d = base_doc()
    letterhead(d)
    centered(d, "SURAT TUGAS", bold=True, size=13)
    centered(d, "Nomor: {{ nomor }}", space_after=10)
    d.add_paragraph("Yang bertanda tangan di bawah ini menugaskan kepada:")

    t = d.add_table(rows=4, cols=5)
    t.style = "Table Grid"
    t.alignment = WD_TABLE_ALIGNMENT.CENTER
    for c, h in zip(t.rows[0].cells, ("No", "Nama", "NIP", "Gol.", "Jabatan")):
        c.text = h
        c.paragraphs[0].runs[0].bold = True
    # Baris 2 dan 4 adalah "penanda perulangan" dan akan hilang di hasil akhir.
    t.rows[1].cells[0].text = "{%tr for p in pegawai %}"
    for c, v in zip(t.rows[2].cells, ("{{ loop.index }}", "{{ p.nama }}", "{{ p.nip }}",
                                      "{{ p.golongan }}", "{{ p.jabatan }}")):
        c.text = v
    t.rows[3].cells[0].text = "{%tr endfor %}"

    d.add_paragraph()
    d.add_paragraph("Untuk melaksanakan kegiatan:")
    d.add_paragraph("{{ kegiatan }}")
    d.add_paragraph("Tempat\t: {{ tempat }}")
    d.add_paragraph("Waktu\t: {{ tgl_mulai }} s.d. {{ tgl_selesai }}")
    d.add_paragraph("Demikian surat tugas ini dibuat untuk dilaksanakan dengan penuh tanggung jawab.")
    signer_block(d)
    d.save(OUT / "surat_tugas.docx")


def surat_keterangan():
    d = base_doc()
    letterhead(d)
    centered(d, "SURAT KETERANGAN", bold=True, size=13)
    centered(d, "Nomor: {{ nomor }}", space_after=10)
    d.add_paragraph("Yang bertanda tangan di bawah ini menerangkan bahwa:")
    for line in ("Nama\t\t: {{ orang.nama }}", "NIP\t\t: {{ orang.nip }}",
                 "Pangkat/Gol.\t: {{ orang.pangkat }} ({{ orang.golongan }})",
                 "Jabatan\t\t: {{ orang.jabatan }}"):
        d.add_paragraph(line)
    d.add_paragraph()
    d.add_paragraph("Surat keterangan ini dibuat untuk keperluan:")
    d.add_paragraph("{{ keperluan }}")
    d.add_paragraph("Demikian surat keterangan ini dibuat untuk dipergunakan sebagaimana mestinya.")
    signer_block(d)
    d.save(OUT / "surat_keterangan.docx")


if __name__ == "__main__":
    surat_tugas()
    surat_keterangan()
    print("Template contoh dibuat di", OUT)
