# SuratKu statis

Pembuat surat yang jalan 100% di browser. Tidak ada server, database, atau login.
Template Word diisi di browser, hasilnya diunduh sebagai .docx (atau .zip kalau dari Excel).

Alur layar: **kategori kelengkapan → centang surat (boleh banyak) → cara isi (formulir / Excel / Google Sheets) → isi data → periksa & buat**.
Surat yang templatenya sudah ada: **Surat Tugas**, **Surat Tugas Kolektif** (banyak petugas dalam satu surat), **BAST Hasil Pekerjaan** (untuk kegiatan apa pun), **SK Pelatihan** (instruktur, peserta, panitia),
**Surat Perjanjian Kerja (SPK)**, **Kuitansi**, **SPBY**, **Daftar Pengeluaran Riil**, **Surat Pernyataan** (kendaraan dinas/hotel), dan **Undangan Pelatihan**.
Surat lain (Laporan, Rincian, dst.) sudah tampil di kategorinya, bertanda "Template menyusul", dan belum bisa dipilih.
Terbilang (kuitansi, SPBY, SPK, pengeluaran riil) dan nilai perjanjian SPK (volume x harga) dihitung otomatis.

## Pasang di Netlify
1. Buka https://app.netlify.com/drop lalu seret seluruh folder ini (atau hubungkan repo GitHub-nya).
2. Selesai. Tidak ada langkah build; `netlify.toml` sudah ada.

GitHub Pages: unggah isi folder ini ke repo, aktifkan Pages dari branch utama.

Mencoba di komputer sendiri: jalankan `python -m http.server 8000` di folder ini, lalu buka http://localhost:8000.
Klik dua kali `index.html` tidak bisa, karena browser memblokir pengambilan template dari file lokal.

## Cara pakai
- **Data kantor** (tombol di pojok kanan atas, atau "Ubah ›" di kotak ringkasan): isi NIP Kepala dan NIP PPK sekali; tersimpan di browser setelah klik Simpan.
  Selama NIP kosong, kotak ringkasan menampilkan tanda merah "NIP belum diisi". NIP dicek langsung saat diketik (harus 18 angka; spasi boleh).
  Data bisa disimpan ke file (`pengaturan-kantor.json`) dan dibuka di komputer/browser lain lewat "Buka pengaturan dari file", jadi cukup satu orang yang mengetik.
- **Banyak surat sekaligus**: di langkah 1 centang beberapa surat (mis. Surat Tugas + BAST). Dalam mode formulir tiap surat punya tab sendiri di langkah 2;
  isian yang sama (nama petugas, tanggal mulai/selesai) otomatis ikut terisi di tab lain selama belum diketik sendiri (lihat `share` di `js/docs.js`).
- **Periksa & buat (langkah 3)**: semua surat diperiksa sekaligus. Masalah ditampilkan per surat; tombol "Perbaiki di isian" membawa kembali ke tab itu dengan kolom salah ditandai merah.
  Tombol Buat aktif bila tidak ada masalah; bila ada baris/surat galat, tersedia "Buat hanya yang sudah benar". Hasil lebih dari satu file diunduh sebagai satu .zip (satu folder per jenis surat bila jenisnya lebih dari satu).
- **Pemeriksaan NIK/NIP**: NIK harus 16 angka dan NIP 18 angka (spasi dan titik diabaikan). Angka yang sudah rusak karena kolom Excel/Sheets berformat Angka
  (muncul sebagai `6,21E+15`, atau tersimpan sebagai angka biasa) ditolak dengan petunjuk "ubah format kolom jadi Teks". Pemeriksaan ini ada di `checkDigits` di `js/docs.js`;
  panjangnya diatur lewat `digits:` pada isian dan `SK.SETTING_DIGITS` di `js/config.js`. Catatan: Google Sheets/Excel yang sudah membulatkan angka jadi `...0000` tidak bisa terdeteksi.
- **Kolom bermasalah** ditandai merah dan kursor pindah ke kolom pertama yang salah. Tulisan abu-abu di dalam kolom adalah contoh pengisian (diambil dari `example` di `js/docs.js`).
- **Pratinjau surat sebelum unduh** (di langkah 3): surat digambar seperti halaman kertas di dalam kotak (bisa digulir, otomatis diperkecil agar pas di HP; tombol "Ukuran asli" untuk membaca ukuran penuh).
  - *Satu surat (formulir)*: bagian "Pratinjau surat" muncul di bawah hasil pemeriksaan (satu tab per surat yang dipilih). Nilai yang berasal dari isian diberi warna kuning dan bisa diklik untuk diubah di tempat
    (kotak kecil; "Terapkan" memeriksa ulang semua surat dan menggambar ulang; ditolak bila tidak valid, mis. tanggal selesai sebelum mulai). Perubahan ikut tersimpan di formulir.
    Bagian kuning yang berasal dari Data kantor (nama/NIP Kepala dan PPK) membuka tombol "Ubah di Data kantor". Isi tabel (daftar instruktur/peserta SK) tidak berwarna; ubah lewat formulir.
  - *Excel* dan *Google Sheets*: tiap baris OK di tabel hasil punya tombol "Lihat surat" (jendela pratinjau dengan Sebelumnya/Berikutnya, melewati semua surat OK). Hanya untuk dibaca; perbaikan dilakukan di workbook.
  - Cara kerja: `js/preview.js` mengisi template yang sama, tetapi untuk pratinjau tiap nilai diberi penanda tak terlihat (karakter privat U+E000..U+E002) supaya bisa diberi warna dan diklik; file unduhan memakai isian bersih tanpa penanda.
    Peta variabel turunan -> isian ada di `previewMap` pada tiap jenis surat di `js/docs.js` (tambahkan bila template baru punya variabel turunan).
  - **Batasan**: pustaka docx-preview menggambar mendekati Word, bukan sama persis. Huruf (mis. Bookman Old Style hanya ada bila terpasang di komputer), jarak, dan tempat pindah halaman bisa berbeda.
    Pratinjau tidak menggantikan membuka file di Word. PDF persis tampilan Word tidak mungkin tanpa server/LibreOffice.
- **BAST untuk kegiatan apa pun**: nama kegiatan, jenis pekerjaan (pengolahan/pendataan/...), sebutan petugas, hasil pekerjaan (tahun ditulis di nama kegiatan),
  volume + satuan, dan **uraian tugas 1 sampai N butir** (tombol "Tambah butir", bisa dihapus dan digeser) semuanya diisi di formulir.
  Pernyataan tambahan (angka 4, 5, ...) opsional. Tidak ada teks khusus satu kegiatan di template.
- **Isian kegiatan tersimpan**: setelah mengisi kegiatan + uraian tugas, ketik nama lalu "Simpan isian kegiatan saat ini";
  lain kali tinggal pilih dari daftar. Tersimpan di browser (bukan di situs). Ada satu contoh bawaan (Pengolahan Wilkerstat 2026).
- **SK Pelatihan**: judul, nama kegiatan, dasar anggaran, lalu dua tabel: Daftar instruktur (Lampiran I) dan Daftar peserta (Lampiran II); tombol "Tambah ..." menambah baris.
  Kolom Gol kosong dicetak "-"; honor `123000` dicetak `123.000`.
- Nomor surat diketik manual. Tidak ada riwayat atau penomoran otomatis.
- PDF: buka .docx di Word, Simpan sebagai PDF.

## Workbook kegiatan (mode "Banyak surat dari Excel" dan "Dari Google Sheets")
Standar data = `Honor_mitra.xlsx`. Satu workbook = data SATU kegiatan untuk semua surat yang dipilih. Template-nya: `templates/workbook.xlsx` (tombol "Unduh template workbook"), dibuat dari Honor_mitra.xlsx oleh `tools/make_workbook.py`. Isi dengan Excel, atau unggah ke Google Drive dan buka dengan Google Sheets.
Nama tab dan judul kolom tidak peduli huruf besar/kecil, spasi, atau garis bawah.

| Tab | Isi |
|---|---|
| `Kegiatan` | `variabel` / `nilai` / `dipakai di`: nilai yang sama untuk semua surat (kegiatan, kota, tanggal, rentang, kepala_*, ppk_*, tgl_online, tgl_offline, kode_kegiatan, kode_akun, dipa_nomor, ...) |
| `Petugas` | DAFTAR ORANG: satu baris = satu surat per orang. Kolom: nama, nik, nip, alamat, asal, pekerjaan, gol, sebagai, keterangan, volume, satuan, honor, nomor_st / nomor_spk / nomor_bast / nomor_spby / nomor_bukti, rute, transport, check_in, check_out. Nomor urut otomatis bila kolom `no` tidak ada |
| tab surat (`Surat_Tugas`, `BAST`, `Spk_Kontrak`, `SPBY`, `Kuitansi`, `S_Dinas`, `Pengeluaran_Rill`, `Undangan`) | baris 1 = judul kolom, baris 2 = nilai untuk SEMUA orang. Judul berawalan `#` (mis. `#tugas`, `#pernyataan`) memulai daftar: satu butir per baris ke bawah |
| `SK` | satu baris = satu SK. `Instruktur` = Lampiran I; Lampiran II diambil dari `Petugas` |

- **Urutan nilai** (yang di kanan menimpa yang di kiri): `Kegiatan` > baris 2 tab surat > baris di `Petugas`.
- **Honor & PPh 21**: `honor` = SATU total per orang di `Petugas` (SPK: harga satuan = honor / volume). Bukan pegawai (gol kosong atau `-`, mis. mitra/petugas) = bebas pajak. Pegawai: gol III = 5%, gol IV = 15%, gol II/I = bebas. Gol ditulis `III`, `III/b`, atau `Penata Muda / III/b`. Pegawai (ada NIP) tanpa gol, atau gol tidak dikenali, ditolak.
  Kuitansi/SPBY mencatat jumlah kotor; Kuitansi pegawai III/IV memuat kalimat potongan PPh dan jumlah bersih. `Kuitansi + Daftar Pembayaran Honor` (kolektif) memuat tabel kotor/PPh/diterima per orang. Bendahara: `bendahara_nama` / `bendahara_nip` di tab `Kuitansi` (bawaan Rina Fitrianita, S.M).
- **Rentang tanggal**: kolom/variabel `rentang` ditulis `27 - 31 Mei 2024` atau `29 Mei - 2 Juni 2024`; aplikasi memecahnya jadi tanggal mulai dan selesai (`parseRentang` di `js/words.js`).
- **Data kantor menang**: nilai kepala/PPK/kota/wilayah di tab `Kegiatan` hanya dipakai bila Data kantor di aplikasi masih kosong. Bila berbeda, aplikasi menampilkan catatan.
- **Siapa yang dibuatkan surat**: setelah workbook dibaca, daftar orang bisa dicentang/dilepas (berlaku untuk semua surat per orang). SK tidak terpengaruh.
- **Peringatan "(CONTOH)"**: sel yang masih bertuliskan `(CONTOH)` atau NIP contoh membuat baris ditandai "Periksa". Hapus data contoh sebelum dipakai.
- **Google Sheets**: bagikan lewat "Siapa saja yang memiliki link" (Pelihat), tempel link biasa, klik "Ambil data" (klik lagi setelah mengubah sheet). Tiap tab dibaca lewat namanya, jadi nama tab harus sama.
  Link terbitan ("Publikasikan ke web") tidak didukung. Sheet pribadi tidak bisa dibaca (aplikasi statis tidak punya sign-in Google).
  Format kolom NIK/NIP dan kolom `nilai` sebagai Teks biasa. Google Sheets dapat mengosongkan sel yang jenisnya berbeda dari mayoritas kolomnya; kolom teks sebaiknya seluruhnya berformat Teks.
- Kolom yang tidak dikenali ditampilkan sebagai catatan di langkah 3 (tidak menghentikan pembuatan surat).

## Privasi
Semua pemrosesan terjadi di browser. File Excel tidak diunggah ke mana pun.
Tab Google Sheets: browser mengambil data langsung dari docs.google.com (tidak lewat server lain), tetapi sheet-nya harus dibagikan lewat link,
sehingga siapa pun yang memegang link bisa membacanya. Pakai sheet khusus yang hanya berisi kolom yang perlu, jangan sebarkan link-nya, cabut akses setelah selesai.
Tetapi semua file di folder ini (template, `js/config.js`) terbaca siapa pun yang punya alamat situs.
Jangan taruh NIP, daftar petugas, atau file Data Source di folder ini.

## Struktur
```
index.html            halaman (5 langkah, modal Data kantor, modal selesai)
css/style.css
js/config.js          nilai awal kantor (wilayah, nama Kepala/PPK)
js/docs.js            DEFINISI JENIS SURAT (isian, nilai bawaan, validasi, nama file) + SK.CATEGORIES (kategori & daftar surat di layar)
js/words.js           terbilang, tanggal Indonesia, rentang tanggal, format NIP
js/generate.js        isi template .docx
js/preview.js         pratinjau surat berbentuk halaman + penanda nilai yang bisa diklik (memakai docx-preview)
js/workbook.js        membaca workbook kegiatan (Excel / Google Sheets) dan menyusun nilai tiap surat
js/sheets.js          mengambil satu tab Google Sheets lewat link (CSV) dan mengurai CSV
js/app.js             tampilan & alur (navigasi, formulir, panel workbook, periksa, pratinjau, buat)
templates/workbook.xlsx  template workbook kegiatan (tab Panduan menjelaskan isinya)
templates/*.docx      template Word dengan tanda {nama_isian}; daftar berulang memakai tiga paragraf {#daftar} / {t} / {/daftar}
vendor/               pustaka (docxtemplater, pizzip, exceljs, jszip, docx-preview), tanpa CDN. docx-preview: Apache-2.0; jszip: MIT
tools/convert_templates.py   contoh mengubah .docx asli kantor jadi template (python + lxml)
tools/generalize_bast.py     mengubah template BAST lama (khusus pemetaan) menjadi BAST umum; jalankan SETELAH convert_templates.py
tools/tmpl.py                pembantu mengganti teks di .docx lintas potongan teks Word (badan, header, footer)
tools/make_templates.py      membuat template Kuitansi, SPBY, Pengeluaran Riil, Surat Pernyataan, Undangan, SPK, Kolektif dari .docx asli kantor
                             (python3 -I tools/make_templates.py folder_asli folder_hasil)
tools/make_daftar_honor.py   membuat templates/daftar_honor.docx dari kuitansi.docx hasil make_templates.py
tools/make_workbook.py       membuat templates/workbook.xlsx dari Honor_mitra.xlsx (python3 -I tools/make_workbook.py Honor_mitra.xlsx templates/workbook.xlsx)
```

## Menambah jenis surat baru
1. Ubah .docx asli menjadi template: ganti bagian yang berubah dengan `{nama_isian}`.
   Ketik tiap tanda sekaligus tanpa mengganti huruf tebal/miring di tengahnya
   (Word memecah teks jadi potongan; tanda yang terpecah tidak dikenali).
   Daftar berulang: tiga paragraf `{#daftar}` / `{t}` / `{/daftar}`, atau satu baris tabel `{#daftar}{no}` ... `{kolom}{/daftar}` (lihat `templates/sk.docx`).
2. Taruh di `templates/kode_surat.docx`.
3. Tambah satu entri di `SK.DOCS` pada `js/docs.js` (salin entri BAST, SURTUG, atau SK): daftar isian, `build()` untuk variabel turunan, `filename()`.
   Tanggal otomatis jadi teks Indonesia di `build()` (lihat `dateVars`); `W.terbilang(n)` mengubah angka jadi kata.
   Bila `build()` membuat variabel turunan yang dipakai template (mis. `rentang`, `kegiatan_upper`), tambahkan `previewMap: { variabel: 'isian_asal' }` agar bagian itu bisa diklik di pratinjau.
4. Di `SK.CATEGORIES` (paling bawah `js/docs.js`) ganti `null` pada surat yang bersangkutan dengan kode dokumennya, mis. `['SPBY', 'Surat pernyataan belanja', 'spby']`.
   Surat yang sama di beberapa kategori (SPBY, Kuitansi) cukup memakai kode yang sama. Setelah itu "Template menyusul" hilang dan surat bisa dipilih.
   Isian yang sama dengan surat lain (mis. nama petugas) diberi `share: 'petugas_nama'` agar ikut terisi otomatis saat dipilih bersamaan.
5. Agar surat bisa dibuat dari workbook: tambah `book` pada entri itu dan tab-nya di `templates/workbook.xlsx`.
   - Per orang: `book: { tab: 'Surat_Tugas', person: { nama: 'kepada' } }`. `person` memetakan kolom orang (nama, nik, alamat) ke isian bila isian itu tidak diisi di tempat lain.
   - Satu surat per baris: `book: { tab: 'SK', single: true, tables: { instruktur: 'Instruktur', peserta: 'Peserta' } }`.
   - Rincian tugas per orang dari satu baris (SPK): `rowTable: { tugas: 'tugas' }`; kolom tab yang cocok dengan kolom tabel `tugas` (uraian, volume, satuan, harga, beban) dibentuk jadi satu baris tabel.
   - Daftar dari tab `Petugas`: `tables: { peserta: 'Petugas' }` (nama, alamat, peran, ... dicocokkan lewat `alias` kolom).
   - Nama kolom/variabel di workbook yang berbeda dari `key` isian didaftarkan lewat `alias: ['nama_di_workbook']` pada isian itu (mis. `nomor_st`, `tanggal_bast`).
     Isian yang hanya berupa tabel memakai `kind: 'table'` dan `columns: [{ key, label, required, alias, def }]`.

## Batasan
- Tidak ada PDF otomatis (LibreOffice tidak bisa jalan di hosting statis).
- Satu file surat = satu orang (kecuali SK: satu file per baris di tab `SK`). Lampiran BAST punya satu jangka waktu dan satu volume/satuan untuk semua butir uraian tugas
  (sama seperti format aslinya); butir uraian hanya teks bernomor.
- Daftar berulang di template Word: tanda `{#daftar}` dan `{/daftar}` harus berada di paragraf SENDIRI (di antaranya paragraf isi).
  Bila ketiganya ditaruh dalam satu paragraf, isinya hanya tersambung dalam satu paragraf, tidak jadi butir bernomor.
