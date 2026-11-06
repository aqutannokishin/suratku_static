"""Ubah .docx asli (yang tanda {...}-nya masih berantakan) menjadi template docxtemplater yang rapi.
Jalankan:  python3 -I tools/make_templates.py <folder_docx_asli> <folder_templates>
Nama berkas masukan: kuitansi.docx spby.docx rill.docx pernyataan.docx undangan.docx spk.docx kolektif.docx
Tiap fungsi di bawah memakai tmpl.Doc.need(lama, baru): teks lama dicari lintas "run" Word tanpa merusak format lain.
Template SK, BAST, Surat Tugas dibuat dengan alat lain (convert_templates.py / generalize_bast.py) dan tidak disentuh di sini."""
import sys, os, copy
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import tmpl
from lxml import etree
from tmpl import q

def kuitansi(d):
    d.need('{Kode Kegiatan', '{kode}')
    d.append('Nomor Bukti', '{nomor_bukti}')
    d.need('{jumlah uang/biaya(dalam angka)}', '{jumlah},-')
    d.need('{jumlah uang/biaya}', '{terbilang}')
    d.need('{nama kegiatan/Kebutuhan}', '{untuk}')
    d.need('Rp. {jumlah Uang/Biaya (dalam angka)}', 'Rp. {jumlah},-')
    d.need('{nama Petugas/mitra}', '{penerima_nama}')
    d.need('{NIP}', '{penerima_nip}', whole=True)
    d.need('{Pejabat PPK}', '{ppk_nama}')
    d.need('{NIP Pejabat PPK}', '{ppk_nip}')
    # bendahara dari variabel (bukan teks tetap); potongan PPh 21 hanya tercetak untuk pegawai bergolongan III/IV
    d.need('Rina Fitrianita, S.M', '{bendahara_nama}')
    d.need('NIP. 19780830 200901 2 006', 'NIP. {bendahara_nip}')
    d.append('Untuk pembayaran', ' {#ada_pajak}(dipotong PPh 21 sebesar {tarif_pph}% = Rp. {pph},-; diterima bersih Rp. {bersih},-){/ada_pajak}')

    # blok tanda tangan penerima terlalu sempit (indent kanan 3632): NIP 18 digit pecah 3 baris. Lebarkan.
    W = '{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'
    for p in tmpl.paragraphs(d.doc):
        s = tmpl.ptext(p)
        if s.strip() in ('{penerima_nama}', '{penerima_nip}') or s.startswith('Kuala Kurun'):
            pPr = p.find(q('pPr'))
            ind = pPr.find(q('ind')) if pPr is not None else None
            if ind is None: continue
            for k in ('right', 'firstLine', 'firstLineChars'):
                ind.attrib.pop(W + k, None)
            if s.strip() in ('{penerima_nama}', '{penerima_nip}'):
                ind.set(W + 'left', '4300')
                jc = pPr.find(q('jc'))
                if jc is not None: jc.set(W + 'val', 'center')

def spby(d):
    d.need('{tanggal surat}', '{tanggal_surat}')
    d.need('{nomor surat}/SPBy/{nomor surat}/2026', '{nomor}')
    d.need('Rp. {jumlah uang/biaya}', 'Rp. {jumlah},-')
    d.need('{ Jumlah Uang/Biaya (dalam bentuk angka)}', '{terbilang}')
    d.need('{ Nama Petugas/Pegawai/Mitra}', '{penerima_nama}')
    d.need('{ Nama Kegiatan/kebutuhan}', '{untuk}')
    d.need('UU APBN 2026 No. 17 Tahun 2025, Nomor DIPA : DIPA-054.01.2.667350/2026, tanggal 01 Desember 2025', '{dasar}')
    d.need('{kuitansi/nota}', '{bukti_kuitansi}')
    d.need('{Tanda Bukti}', '{bukti_nota}')
    d.need('{kode kegiatan}', '{kode_kegiatan}')
    d.need('{Kode}', '{kode}')
    d.need('{nama Petugas/mitra)', '{penerima_nama}')
    d.need('{Pejabat PPK}', '{ppk_nama}')
    d.need('{NIP}', '{penerima_nip}', whole=True)
    d.need('NIP.{NIP Pejabat PPK}', 'NIP. {ppk_nip}')
    d.need('Rina Fitrianita, S.M', '{bendahara_nama}')
    d.need('NIP. 19780830 200901 2 006', 'NIP. {bendahara_nip}')

def rill(d):
    d.need('Pejabat PPK', '{ppk_nama}', whole=True)
    d.need('{NIP Pejabat PPK}', '{ppk_nip}')
    d.need('{nama pegawai/mitra}', '{nama}')
    d.need('{NIP}', '{nip}', whole=True, count=None)
    d.need('{nama Surat dan nomor surat}', '{dasar_surat}')
    d.need('Rp. {jumlah uang/biaya (dalam angka)', 'Rp. {jumlah},-')
    d.need('{jumlah uang/biaya (dalam angka)', '{jumlah}')
    d.need('{Alamat Rumah ke Alamat Tempat Pelatihan/penugasan}', '{alamat_rute}')
    d.need('{jumlah Uang/Biaya}', '{terbilang}')
    d.need('{Nama Pegawai/Mitra}', '{nama}')
    # sel "Keterangan" pada baris uraian (kolom ke-4 dari tabel 6)
    tbl = list(d.doc.iter(q('tbl')))[5]
    for tr in tbl.findall(q('tr')):
        if '{alamat_rute}' in ''.join(t.text or '' for t in tr.iter(q('t'))):
            tc = tr.findall(q('tc'))[-1]; p = tc.find(q('p'))
            ts = list(p.iter(q('t')))
            if ts: ts[0].text = '{keterangan_biaya}'
            else:
                r = etree.SubElement(p, q('r')); t = etree.SubElement(r, q('t')); t.text = '{keterangan_biaya}'
            break
    else: raise AssertionError('baris uraian tidak ditemukan')

def pernyataan(d):
    d.need('{Nama Pegawai/Mitra}', '{nama}')
    d.need('{NIP Pegawai/jika Mitra Kosongkan Saja}', '{nip}')
    d.need('{pangkat/golongan pegawai/jika mitra kosongkan saja', '{pangkat}')
    d.need('NIP: -', 'NIP: {nip}')
    d.need('Pangkat/Golongan: -', 'Pangkat/Golongan: {pangkat}')
    d.need('{Jabatan Pegawai/Jabatan Mitra}', '{jabatan}')
    d.need('{kantor intansi/lokasi tempat bekerja}', '{unit_kerja}')
    d.need('{tangal,bulan,tahun}', '{tanggal}')
    d.need('{Tanggal,Bulan,Tahun}', '{tanggal}')
    d.need('{nama Pegawai/Mitra}', '{nama}')

def undangan(d):
    d.need('{Nomor Surat}', '{nomor}')
    d.need('{nomor Surat}', '{nomor}')
    d.need('{tgl,bln,thn}', '{tanggal_surat}')
    d.need('{Tipe Surat}', '{sifat}')
    d.need('{Nama Kegiatan/Pelatihan}', '{nama_kegiatan}')
    d.need('{Nama Kegiatan/pelatihan}', '{nama_kegiatan}')
    d.need('{Nama Kegiatan}', '{nama_kegiatan}')
    d.need('{tangal pelatihan dimulai sampainberakhir}', '{jadwal_mooc}')
    d.need('{grup sosial media (WA,Telegram dan Lainnya}', '{grup}')
    d.need('{Tempat Kegiatan/Pelatihan Dilakukan}', '{tempat_pelatihan}')
    d.need('{Alamat Tempat Kegiatan/Pelatihan Dilakukan}', '{alamat_pelatihan}')
    d.need('{Tanggal Kegiatan/Pelatihan Dilakukan}', '{jadwal_pelatihan}')
    d.need('{Tempat Penginapan}', '{penginapan}')
    d.need('{Alamat Penginapan}', '{alamat_penginapan}')
    d.need('{penginapan},{alamat_penginapan}', '{penginapan}, {alamat_penginapan}')
    d.need('Hotel Insevas', '{penginapan}')
    d.need('Mulya Setiawan', '{kepala_nama}', whole=True)
    d.need('{Berisi Kegiatan yang akan dilakukan/jadwal/materi dan informasi lain nya}', '{rundown}')
    # tabel peserta: satu baris berulang
    tbl = next(iter(d.doc.iter(q('tbl'))))
    rows = tbl.findall(q('tr'))
    assert len(rows) == 3
    keys = ['{#peserta}{no}', '{nama}', '{asal}', '{jabatan}', '{check_in}', '{check_out}{/peserta}']
    cells = rows[1].findall(q('tc'))
    assert len(cells) == 6
    for c, k in zip(cells, keys):
        ts = [t for t in c.iter(q('t'))]
        ts[0].text = k
        for t in ts[1:]: t.text = ''
        tmpl._clean_run(ts[0])
    tbl.remove(rows[2])
    # kolom Posisi dilebarkan (isinya bisa 'Petugas Pemeriksaan Lapangan'); jumlah lebar tetap
    W = ['321', '2000', '2150', '2000', '1330', '1330']
    for gc, w in zip(tbl.find(q('tblGrid')).findall(q('gridCol')), W): gc.set(q('w'), w)
    for tr in tbl.findall(q('tr')):
        for tc, w in zip(tr.findall(q('tc')), W): tc.find(q('tcPr')).find(q('tcW')).set(q('w'), w)

def spk(d):
    d.need('26 Februari 2026', '{batas_penyerahan}')

def kolektif(d):
    pass   # sudah berupa template rapi

JOBS = [('kuitansi', kuitansi, True), ('spby', spby, True), ('rill', rill, False), ('pernyataan', pernyataan, False),
        ('undangan', undangan, False), ('spk', spk, False), ('kolektif', kolektif, False)]
OUT = {'kuitansi': 'kuitansi', 'spby': 'spby', 'rill': 'pengeluaran_riil', 'pernyataan': 'surat_pernyataan', 'undangan': 'undangan', 'spk': 'spk', 'kolektif': 'surat_tugas_kolektif'}

if __name__ == '__main__':
    src, dst = sys.argv[1], sys.argv[2]
    for name, fn, drop in JOBS:
        d = tmpl.Doc(os.path.join(src, name + '.docx'))
        fn(d)
        bad = d.left(None)
        print('%-12s sisa tanda tidak sah: %s' % (name, bad))
        d.save(os.path.join(dst, OUT[name] + '.docx'), drop_fonts=drop)
