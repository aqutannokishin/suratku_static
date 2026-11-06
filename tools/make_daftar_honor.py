"""Membuat templates/daftar_honor.docx (kuitansi kolektif + Daftar Pembayaran Honor, landscape)
dari templates/kuitansi.docx hasil make_templates.py.
Pakai:  python3 -I tools/make_daftar_honor.py <kuitansi.docx> <daftar_honor.docx>
"""
import os, sys, tempfile
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import tmpl
import docx
from docx.enum.section import WD_ORIENT, WD_SECTION
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.shared import Pt, Cm, Emu
from docx.oxml.ns import qn
from docx.oxml import OxmlElement

FONT = 'Arial'


def prep(src, tmp):
    d = tmpl.Doc(src)
    # kuitansi kolektif: tanpa kalimat PPh per orang (ada di daftar), penandatangan = pembuat daftar
    d.need(' {#ada_pajak}(dipotong PPh 21 sebesar {tarif_pph}% = Rp. {pph},-; diterima bersih Rp. {bersih},-){/ada_pajak}', '')
    d.need('{penerima_nama}', '{pembuat_nama}')
    d.need('{penerima_nip}', 'NIP. {pembuat_nip}')
    d.save(tmp, drop_fonts=False)


def run(p, text, bold=False, size=9):
    r = p.add_run(text); r.bold = bold; r.font.size = Pt(size); r.font.name = FONT
    r._element.rPr.rFonts.set(qn('w:eastAsia'), FONT)
    return r


def para(cell_or_doc, text='', bold=False, size=9, align=None):
    p = cell_or_doc.add_paragraph() if hasattr(cell_or_doc, 'add_paragraph') else cell_or_doc
    if text: run(p, text, bold, size)
    if align is not None: p.alignment = align
    p.paragraph_format.space_after = Pt(0); p.paragraph_format.space_before = Pt(0)
    return p


def set_cell(c, text, bold=False, align=WD_ALIGN_PARAGRAPH.LEFT, size=9):
    p = c.paragraphs[0]
    p.paragraph_format.space_after = Pt(0); p.alignment = align
    if text: run(p, text, bold, size)


def borders(tbl):
    pr = tbl._tbl.tblPr
    b = OxmlElement('w:tblBorders')
    for k in ('top', 'left', 'bottom', 'right', 'insideH', 'insideV'):
        e = OxmlElement('w:' + k); e.set(qn('w:val'), 'single'); e.set(qn('w:sz'), '4'); e.set(qn('w:color'), '000000'); b.append(e)
    pr.append(b)


def main(src, dst):
    tmp = tempfile.mkstemp(suffix='.docx')[1]
    prep(src, tmp)
    d = docx.Document(tmp)
    sec = d.add_section(WD_SECTION.NEW_PAGE)
    sec.orientation = WD_ORIENT.LANDSCAPE
    sec.page_width, sec.page_height = Emu(10058400), Emu(7772400)
    for a in ('left_margin', 'right_margin'): setattr(sec, a, Cm(1.5))
    sec.top_margin = Cm(1.5); sec.bottom_margin = Cm(1.5)
    C, L, R = WD_ALIGN_PARAGRAPH.CENTER, WD_ALIGN_PARAGRAPH.LEFT, WD_ALIGN_PARAGRAPH.RIGHT

    para(d, 'DAFTAR PEMBAYARAN HONOR', True, 12, C)
    para(d, 'BADAN PUSAT STATISTIK KABUPATEN GUNUNG MAS', True, 10, C)
    para(d, '', size=6)
    para(d, 'Kegiatan\t: {untuk}', size=9)
    para(d, 'Kode Keg/Akun\t: {kode}', size=9)
    para(d, 'Nomor Bukti\t: {nomor_bukti}          Tahun Anggaran : {tahun}', size=9)
    para(d, '', size=6)

    heads = ['No', 'Nama', 'Gol', 'Jadwal', 'Volume (O-J)', 'Upah per O-J (Rp)', 'Jumlah Kotor (Rp)', 'PPh 21 (Rp)', 'Jumlah Diterima (Rp)']
    w = [1.0, 6.0, 1.3, 3.6, 2.0, 2.6, 2.9, 2.4, 3.0]
    t = d.add_table(rows=3, cols=len(heads))
    t.alignment = WD_TABLE_ALIGNMENT.CENTER; t.autofit = False
    borders(t)
    for i, h in enumerate(heads): set_cell(t.cell(0, i), h, True, C)
    row1 = ['{#penerima}{no}', '{nama}', '{gol}', '{jadwal}', '{volume}', '{upah}', '{kotor}', '{pph}', '{bersih}{/penerima}']
    al = [C, L, C, L, R, R, R, R, R]
    for i, x in enumerate(row1): set_cell(t.cell(1, i), x, False, al[i])
    tot = ['', 'JUMLAH', '', '', '{total_volume}', '', '{total_kotor}', '{total_pph}', '{total_bersih}']
    for i, x in enumerate(tot): set_cell(t.cell(2, i), x, True, al[i])
    for r in t.rows:
        for i, c in enumerate(r.cells): c.width = Cm(w[i])
    # baris judul diulang di halaman berikutnya
    trPr = t.rows[0]._tr.get_or_add_trPr(); h = OxmlElement('w:tblHeader'); h.set(qn('w:val'), 'true'); trPr.append(h)

    para(d, '', size=6)
    para(d, 'Terbilang\t: {terbilang} (jumlah kotor)', size=9)
    para(d, '', size=8)
    s = d.add_table(rows=1, cols=3); s.autofit = False
    blocks = [['', 'Yang membuat daftar,', '', '', '', '{pembuat_nama}', 'NIP. {pembuat_nip}'],
              ['Kuala Kurun, {tanggal}', 'Pejabat Pembuat Komitmen', '', '', '', '{ppk_nama}', 'NIP. {ppk_nip}'],
              ['', 'Bendahara Pengeluaran', '', '', '', '{bendahara_nama}', 'NIP. {bendahara_nip}']]
    for i, b in enumerate(blocks):
        c = s.cell(0, i); c.width = Cm(8.5)
        c.paragraphs[0].paragraph_format.space_after = Pt(0)
        first = True
        for line in b:
            p = c.paragraphs[0] if first else c.add_paragraph()
            first = False
            p.paragraph_format.space_after = Pt(0); p.alignment = C
            if line: run(p, line, bold=line.startswith('{') and 'nama' in line, size=9)
    d.save(dst)
    os.unlink(tmp)


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
