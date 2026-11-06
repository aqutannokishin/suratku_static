"""Ubah templates/bast.docx (versi lama, khusus pemetaan) menjadi template BAST umum.

  python3 -I tools/generalize_bast.py templates/bast.docx templates/bast.docx

Yang berubah:
  - Judul, kalimat pernyataan 1-3 dan lampiran memakai tanda {kegiatan}, {jenis_pekerjaan}, {peran_upper},
    {hasil_berupa}, {volume}, {satuan} - tidak ada lagi teks khusus satu kegiatan.
  - Uraian tugas = SATU sel berisi daftar bernomor yang diulang (paragraf {#uraian} / {t} / {/uraian}), 1 sampai N butir.
  - Paragraf {#pernyataan} / {t} / {/pernyataan} setelah pernyataan 3 (pernyataan tambahan, boleh kosong).
Skrip ini memeriksa teks lama pada tiap langkah (assert) supaya berhenti kalau templatenya sudah berbeda.
"""
import sys, zipfile, copy
from lxml import etree

W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
XML = 'http://www.w3.org/XML/1998/namespace'
q = lambda t: '{%s}%s' % (W, t)


def runs(p): return p.findall(q('r'))
def rtext(r): return ''.join(t.text or '' for t in r.findall(q('t')))


def setrun(p, i, new, expect=None):
    r = runs(p)[i]
    old = rtext(r)
    if expect is not None:
        assert expect in old, (i, expect, old)
    ts = r.findall(q('t'))
    if not ts:
        ts = [etree.SubElement(r, q('t'))]
    ts[0].text = new
    ts[0].set('{%s}space' % XML, 'preserve')
    for t in ts[1:]:
        r.remove(t)


W14 = 'http://schemas.microsoft.com/office/word/2010/wordml'


def tag_paragraph(model, text):
    """Paragraf berisi hanya satu tanda ({#daftar} atau {/daftar}), tanpa nomor. docxtemplater (paragraphLoop)
    membuang paragraf seperti ini dan mengulang paragraf di antaranya. Tanda {#..}{..}{/..} dalam SATU
    paragraf justru mengulang teks di dalam paragraf yang sama, bukan paragrafnya."""
    c = copy.deepcopy(model)
    for k in list(c.attrib):
        if k.startswith('{%s}' % W14):
            del c.attrib[k]
    for r in runs(c)[1:]:
        c.remove(r)
    setrun(c, 0, text)
    ppr = c.find(q('pPr'))
    if ppr is not None:
        for tag in ('numPr', 'pStyle'):
            for e in ppr.findall(q(tag)):
                ppr.remove(e)
    return c


def process(src, dst):
    zin = zipfile.ZipFile(src)
    doc = etree.fromstring(zin.read('word/document.xml'))
    body = doc.find(q('body'))
    P = list(body)  # indeks tetap selama kita hanya mengubah isi, lalu menyisip paragraf di akhir

    # --- halaman 1: judul
    setrun(P[1], 0, 'HASIL PEKERJAAN {peran_upper}', 'HASIL PEKERJAAN')
    setrun(P[2], 0, '{kegiatan_upper}', 'PENETAPAN')
    assert rtext(runs(P[3])[0]).startswith('TAHUN')
    body.remove(P[3])   # tahun ikut di nama kegiatan

    # --- pernyataan 1
    p = P[21]
    setrun(p, 2, '{jenis_pekerjaan}', 'p'); setrun(p, 3, '', 'engolahan')
    setrun(p, 5, '{kegiatan} pada Badan Pusat Statistik {wilayah} ', 'Penetapan')
    # --- pernyataan 2
    p = P[22]
    setrun(p, 5, '{jenis_pekerjaan}', 'pengolahan')
    setrun(p, 7, '{kegiatan} kepada ', 'Penetapan')
    # --- pernyataan 3
    p = P[23]
    setrun(p, 1, '{jenis_pekerjaan}', 'p'); setrun(p, 2, '', 'engolahan')
    setrun(p, 4, '{kegiatan} sebagaimana dimaksud dalam angka ', 'Penetapan')
    setrun(p, 7, '{hasil_berupa}', 'fail peta')
    setrun(p, 11, ' {volume} {satuan}{akhir3}', '{jumlah_sls}')
    for i in (12, 13, 14, 15):
        setrun(p, i, '')

    # --- pernyataan tambahan: tiga paragraf: {#pernyataan} | {t} (daftar bernomor yang sama dgn pernyataan 3) | {/pernyataan}
    item = copy.deepcopy(P[23])
    for k in list(item.attrib):
        if k.startswith('{%s}' % W14):
            del item.attrib[k]
    for r in runs(item)[1:]:
        item.remove(r)
    setrun(item, 0, '{t}')
    rpr = runs(item)[0].find(q('rPr'))
    if rpr is not None:  # buang format tebal/miring bila ada
        for tag in ('b', 'bCs', 'i', 'iCs'):
            for e in rpr.findall(q(tag)):
                rpr.remove(e)
    open_p, close_p = tag_paragraph(P[23], '{#pernyataan}'), tag_paragraph(P[23], '{/pernyataan}')
    P[23].addnext(open_p); open_p.addnext(item); item.addnext(close_p)

    # --- lampiran: judul
    setrun(P[31], 0, '{peran_upper}', 'PETUGAS')
    setrun(P[32], 0, '{kegiatan_upper}', 'PENETAPAN'); setrun(P[32], 1, '')
    assert rtext(runs(P[33])[0]).startswith('TAHUN')
    body.remove(P[33])

    # --- lampiran: tabel uraian tugas -> satu baris data, uraian = daftar bernomor yang diulang
    tbl = P[40]
    assert tbl.tag == q('tbl')
    trs = tbl.findall(q('tr'))
    assert len(trs) == 6, len(trs)
    data = trs[3]
    tcs = data.findall(q('tc'))
    # sel uraian
    p = tcs[0].find(q('p'))
    assert 'uraian1' in rtext(runs(p)[0])
    setrun(p, 0, '{t}')
    for r in runs(p)[1:]:
        p.remove(r)
    sp = p.find(q('pPr')).find(q('spacing'))
    sp.set(q('after'), '80')
    p.addprevious(tag_paragraph(p, '{#uraian}'))
    p.addnext(tag_paragraph(p, '{/uraian}'))
    # tiga sel lain: tidak digabung lagi (tidak ada baris lanjutan)
    for tc in tcs[1:]:
        for vm in tc.find(q('tcPr')).findall(q('vMerge')):
            tc.find(q('tcPr')).remove(vm)
    setrun(runs_p(tcs[2]), 0, '{volume}', '{jumlah_sls}')
    setrun(runs_p(tcs[3]), 0, '{satuan}', 'SLS')
    tbl.remove(trs[4]); tbl.remove(trs[5])
    # baris judul tabel diulang di halaman berikutnya bila daftar uraian panjang dan tabel berlanjut
    for tr in trs[:3]:
        trpr = tr.find(q('trPr'))
        if trpr.find(q('tblHeader')) is None:
            etree.SubElement(trpr, q('tblHeader'))

    out = zipfile.ZipFile(dst, 'w', zipfile.ZIP_DEFLATED)
    for n in zin.namelist():
        data_ = zin.read(n)
        if n == 'word/document.xml':
            data_ = etree.tostring(doc, xml_declaration=True, encoding='UTF-8', standalone=True)
        out.writestr(n, data_)
    out.close()


def runs_p(tc):
    return tc.find(q('p'))


if __name__ == '__main__':
    src, dst = sys.argv[1], sys.argv[2]
    if src == dst:  # tulis lewat berkas sementara supaya sumber tidak terbaca & tertulis bersamaan
        import tempfile, shutil, os
        fd, tmp = tempfile.mkstemp(suffix='.docx'); os.close(fd)
        process(src, tmp); shutil.move(tmp, dst)
    else:
        process(src, dst)
    print('ok')
