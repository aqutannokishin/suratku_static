"""Membuat templates/workbook.xlsx dari Honor_mitra.xlsx (struktur standar SuratKu).
Pakai:  python3 -I tools/make_workbook.py <Honor_mitra.xlsx> <templates/workbook.xlsx>
Isi asli (tab, header, contoh) dipertahankan; yang ditambah/diperbaiki ada di bawah.
"""
import sys, copy
import openpyxl
from openpyxl.styles import Alignment


def style_like(ws, ref):
    for c in ws[1]:
        if c.value is None: continue
        r = ref[1][0]
        c.font = copy.copy(r.font); c.fill = copy.copy(r.fill); c.alignment = copy.copy(r.alignment); c.border = copy.copy(r.border)
        ws.column_dimensions[c.column_letter].width = 24
    ws.freeze_panes = 'A2'


def new_tab(wb, name, headers, row2, ref, after=None):
    ws = wb.create_sheet(name)
    ws.append(headers); ws.append(row2)
    style_like(ws, ref)
    return ws


def col(ws, header):
    for c in ws[1]:
        if c.value == header: return c.column
    return None


def ensure_cols(ws, names, ref):
    for n in names:
        if col(ws, n) is None:
            c = ws.cell(row=1, column=ws.max_column + 1, value=n)
            r = ref['A1']; c.font = copy.copy(r.font); c.fill = copy.copy(r.fill); c.alignment = copy.copy(r.alignment); c.border = copy.copy(r.border)
            ws.column_dimensions[c.column_letter].width = 22


def put(ws, row, **kv):
    for k, v in kv.items():
        c = col(ws, k)
        if c is None: raise SystemExit('kolom %s tidak ada di %s' % (k, ws.title))
        ws.cell(row=row, column=c, value=v)
        if isinstance(v, str) and v.isdigit(): ws.cell(row=row, column=c).number_format = '@'


def main(src, dst):
    wb = openpyxl.load_workbook(src)
    ref = wb['Spk_Kontrak']
    # Catatan sel hasil openpyxl tidak terbaca ExcelJS (di browser) -> pindahkan ke tab Panduan
    kolom_notes = []
    for ws in wb:
        for rw in ws.iter_rows(max_row=1):
            for c in rw:
                if c.comment:
                    kolom_notes.append('%s.%s  ->  %s' % (ws.title, c.value, c.comment.text.replace('Dipakai di: ', '')))
                    c.comment = None

    # --- Kegiatan: perbaiki contoh & tambah variabel
    kg = wb['Kegiatan']
    rows = {kg.cell(row=r, column=1).value: r for r in range(2, kg.max_row + 1) if kg.cell(row=r, column=1).value}
    kg.cell(row=rows['tanggal'], column=2, value='20 Mei 2024')
    def add(var, val, ket):
        r = rows.get(var)
        if r is None:
            r = max(rows.values()) + 1; rows[var] = r
            kg.cell(row=r, column=1, value=var)
        kg.cell(row=r, column=2, value=val); kg.cell(row=r, column=3, value=ket)
        for c in (1, 2, 3): kg.cell(row=r, column=c)._style = copy.copy(kg.cell(row=2, column=c)._style)
    add('kode_kegiatan', '054.01.GG.2896.BMA.004.051.A (CONTOH)', 'Kuitansi, SPBY, Daftar Pembayaran')
    add('kode_akun', '521213 (CONTOH)', 'Kuitansi, SPBY, Daftar Pembayaran')
    add('tahun', '2024', 'Kuitansi, SK (kosong = tahun dari tanggal)')

    # --- Petugas: kolom tambahan + contoh (mitra, gol III, gol IV, gol II)
    pt = wb['Petugas']
    ensure_cols(pt, ['rute', 'transport', 'check_in', 'check_out'], pt)
    data = [
        dict(nama='Okta Van Hellsing (CONTOH)', nik='6211010101900001', nip='-', alamat='Jl. Contoh No. 1, Kuala Kurun', asal='Kuala Kurun', pekerjaan='Wiraswasta', gol='-', sebagai='PCL', keterangan='Mitra BPS', volume='20', satuan='Dokumen', honor='1600000', nomor_bukti='-'),
        dict(nama='Pegawai Golongan III (CONTOH)', nik='6211010101900002', nip='198501012010011001', alamat='Jl. Contoh No. 2, Kuala Kurun', asal='Kuala Kurun', pekerjaan='Pegawai Negeri Sipil', gol='III/b', sebagai='Instruktur', keterangan='Organik', volume='10', satuan='Jam', honor='1230000', nomor_bukti='-'),
        dict(nama='Pegawai Golongan IV (CONTOH)', nik='6211010101900003', nip='197501012000121001', alamat='Jl. Contoh No. 3, Kuala Kurun', asal='Kuala Kurun', pekerjaan='Pegawai Negeri Sipil', gol='IV/a', sebagai='Instruktur', keterangan='Organik', volume='10', satuan='Jam', honor='1230000', nomor_bukti='-'),
        dict(nama='Pegawai Golongan II (CONTOH)', nik='6211010101900004', nip='199001012015031001', alamat='Jl. Contoh No. 4, Kuala Kurun', asal='Kuala Kurun', pekerjaan='Pegawai Negeri Sipil', gol='II/c', sebagai='Petugas', keterangan='Organik', volume='10', satuan='Jam', honor='1230000', nomor_bukti='-'),
    ]
    for i, d in enumerate(data):
        for k, v in list(d.items()):
            pass
        put(pt, 2 + i, **d)
        pt.cell(row=2 + i, column=1, value='(no otomatis)' if i == 0 else None)
        put(pt, 2 + i, rute='Jl. Contoh No. %d, Kuala Kurun ke Hotel Contoh, Kuala Kurun' % (i + 1), transport='150000')
    pt.cell(row=2, column=col(pt, 'honor_terbilang')).value = None

    # --- Kuitansi tab: kolom tambahan
    kt = wb['Kuitansi']
    ensure_cols(kt, ['kode_akun', 'nomor_bukti', 'pembuat_nama', 'pembuat_nip'], kt)
    put(kt, 2, kode_kegiatan='054.01.GG.2896.BMA.004.051.A (CONTOH)', kode_akun='521213 (CONTOH)', bendahara_nip='197808302009012006', nomor_bukti='001', pembuat_nama='Pembuat Daftar (CONTOH)', pembuat_nip='198001012005011001')
    put(kt, 2, untuk_pembayaran='Honor Instruktur Pelatihan Petugas Survei Ekonomi Pertanian Tahun 2024')
    kt.cell(row=2, column=col(kt, 'bendahara_nama')).value = 'Rina Fitrianita, S.M'

    # --- contoh isi tab surat (supaya templat langsung bisa dicoba)
    st = wb['Surat_Tugas']
    put(st, 2, menimbang_st='Untuk kelancaran pelaksanaan kegiatan Survei Ekonomi Pertanian Tahun 2024, dipandang perlu menugaskan petugas pendataan lapangan.', untuk='Melaksanakan pendataan lapangan Survei Ekonomi Pertanian Tahun 2024 di wilayah tugas masing-masing.', nomor_st_kolektif='B-070/62110/VS.220/2024')
    sp = wb['Spk_Kontrak']
    put(sp, 2, jangka_perjanjian='1 s.d. 30 Mei 2024', batas_tambahan='10 Juni 2024', batas_penyerahan='3 Juni 2024', beban='054.01.GG.2896.BMA.004.051.A (CONTOH)', uraian='Melakukan pendataan lapangan sesuai pedoman', jangka_waktu='1 s.d. 30 Mei 2024')
    ba = wb['BAST']
    put(ba, 2, hasil_berupa='dokumen hasil pendataan lapangan')
    col_p, col_u = col(ba, '#pernyataan'), col(ba, '#uraian_tugas')
    ba.cell(row=2, column=col_p, value='Telah menyelesaikan pekerjaan sesuai dengan SPK.'); ba.cell(row=3, column=col_p, value='Hasil pekerjaan diserahkan dalam keadaan lengkap dan baik.')
    ba.cell(row=2, column=col_u, value='Melakukan pendataan lapangan'); ba.cell(row=3, column=col_u, value='Menyerahkan dokumen hasil pendataan')
    sb = wb['SPBY']
    ensure_cols(sb, ['nomor_spby'], sb)
    put(sb, 2, kuitansi_nota='Kuitansi', tanda_bukti='Daftar nominatif', nomor_spby='100/SPBY/2024')
    kg.cell(row=rows['dipa_nomor'], column=2, value='DIPA-054.01.GG.2896.BMA/2024 (CONTOH)')
    add('dipa_tanggal', '2 Januari 2024', 'SK')
    for i, nm in enumerate(['PCL', 'Instruktur', 'Instruktur', 'Petugas']):
        put(pt, 2 + i, nomor_st='B-%03d/62110/VS.220/2024' % (i + 1), nomor_spk='%03d/SPK/2024' % (i + 1), nomor_bast='%03d/BAST/2024' % (i + 1), nomor_spby='%03d/SPBY/2024' % (i + 1))
        put(pt, 2 + i, nomor_bukti='%03d' % (i + 1))

    # --- tab baru yang belum ada
    if 'S_Dinas' not in wb.sheetnames:
        new_tab(wb, 'S_Dinas', ['unit_kerja'], ['BPS Kabupaten Gunung Mas'], ref)
    if 'Pengeluaran_Rill' not in wb.sheetnames:
        new_tab(wb, 'Pengeluaran_Rill', ['berdasarkan', 'keterangan_biaya'], ['Surat Tugas Nomor B-070/62110/VS.220/2024 tanggal 2 Mei 2024', ''], ref)
    if 'Undangan' not in wb.sheetnames:
        new_tab(wb, 'Undangan', ['nomor_surat', 'tipe_surat', 'grup_media', 'tempat_pelatihan', 'alamat_pelatihan', 'tempat_penginapan', 'alamat_penginapan', 'isi_lampiran3', 'check_in', 'check_out'],
                ['B-100/62110/KP.100/2024', 'Segera', 'WhatsApp "Peserta SEP2024"', 'Aula Hotel Contoh', 'Jl. Contoh, Kuala Kurun', 'Hotel Contoh', 'Jl. Contoh, Kuala Kurun', 'Hari 1: Pembukaan dan materi umum\nHari 2: Praktik dan penutupan', '30 Mei 2024', '31 Mei 2024'], ref)
    wb._sheets.append(wb._sheets.pop(wb.sheetnames.index('Alias_Variabel')))

    # --- Panduan: tambahkan aturan honor/PPh
    pn = wb['Panduan']
    r = pn.max_row
    while r > 1 and pn.cell(row=r, column=1).value is None: r -= 1
    r += 2
    notes = [
        'ATURAN HONOR & PPh 21',
        'Honor diisi SATU total per orang di Petugas.honor (SPK: harga satuan = honor / volume). Kuitansi & SPBY mencatat jumlah kotor.',
        'Bukan pegawai (mitra / petugas / lainnya): kolom gol kosong atau "-" -> bebas pajak.',
        'Pegawai/ASN: gol III -> PPh 21 5%; gol IV -> 15%; gol II (dan I) -> bebas. Contoh isian: III/b, IV/a, Penata Muda / III/b.',
        'Pegawai (ada NIP) wajib punya gol; gol yang tidak dikenali akan ditolak agar pajak tidak salah.',
        'Kuitansi pegawai III/IV otomatis memuat kalimat potongan PPh dan jumlah diterima bersih. Daftar Pembayaran Honor memuat kolom PPh per orang.',
        'Bendahara (bendahara_nama, bendahara_nip) diisi di tab Kuitansi atau Data kantor; bawaan: Rina Fitrianita, S.M.',
    ]
    notes += ['', 'KOLOM TAB PETUGAS -> DIPAKAI DI'] + kolom_notes
    for i, t in enumerate(notes):
        c = pn.cell(row=r + i, column=1, value=t)
        c.font = copy.copy(pn['A1'].font) if t.isupper() or t.startswith('ATURAN') or t.startswith('KOLOM') else copy.copy(pn['A2'].font)
        c.alignment = Alignment(wrap_text=False)

    # --- Alias_Variabel: tambahkan yang baru
    al = wb['Alias_Variabel']
    have = {al.cell(row=i, column=1).value for i in range(2, al.max_row + 1)}
    def row(v, jenis, sheet, alias='', ket=''):
        if v in have: return
        r = al.max_row
        while r > 1 and al.cell(row=r, column=1).value is None: r -= 1
        r += 1
        for j, x in enumerate([v, jenis, sheet, alias, ket], 1):
            c = al.cell(row=r, column=j, value=x or None); c._style = copy.copy(al.cell(row=2, column=j)._style)
    row('pembuat_nama', 'Input', 'Kuitansi', '', 'pembuat Daftar Pembayaran Honor')
    row('pembuat_nip', 'Input', 'Kuitansi', '', 'pembuat Daftar Pembayaran Honor')
    row('rute', 'Input', 'Petugas', 'Alamat Rumah ke Alamat Tempat Pelatihan/penugasan', 'per orang (Pengeluaran Rill)')
    row('transport', 'Input', 'Petugas', 'jumlah (Pengeluaran Rill)', 'per orang (Pengeluaran Rill)')
    row('check_in', 'Input', 'Petugas / Undangan', '', 'per peserta; kosong = nilai umum tab Undangan')
    row('check_out', 'Input', 'Petugas / Undangan', '', 'per peserta; kosong = nilai umum tab Undangan')
    row('tahun', 'Input', 'Kegiatan', 'ta; tahun_anggaran', 'kosong = tahun dari tanggal')
    wb.save(dst)


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
