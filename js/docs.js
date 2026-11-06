/* Definisi jenis dokumen. Untuk menambah jenis baru: tambah satu entri di SK.DOCS + satu file di /templates,
   lalu ganti `null` pada surat yang bersangkutan di SK.CATEGORIES (paling bawah file ini) dengan kode dokumennya.
   field.kind: text | textarea | date | number | list | table
               list  = daftar butir 1..N; nilainya array teks
               table = daftar baris bertabel (mis. instruktur, peserta); field.columns = [{ key, label, required, alias, def, num }], nilainya array objek
   field.preset: true  -> ikut disimpan/dipakai di "Isian kegiatan tersimpan"
   field.default: teks, atau fungsi (pengaturan) => teks. Dipakai bila isian kosong (juga untuk baris Excel kosong).
   field.example: contoh untuk baris "contoh" pada template Excel.
   field.alias: nama kolom/variabel lain di workbook (Excel/Google Sheets) yang dikenali untuk isian ini (selain key dan label).
   field.share: nama bebas. Isian dengan nama `share` yang sama di beberapa surat yang dipilih bersamaan
                (mis. nama petugas di Surat Tugas dan di BAST) otomatis ikut terisi, selama isian itu belum diketik sendiri.
   doc.groupNotes: { 'Nama grup': 'catatan kecil di bawah judul grup' } (opsional).
   doc.book: cara surat ini dibaca dari workbook kegiatan (lihat js/workbook.js dan tab Panduan di workbook):
       { tab: 'Surat_Tugas', person: { nama: 'kepada' } }   satu surat per ORANG di tab Petugas. Nilai tingkat surat dari baris 2 tab itu (judul kolom di baris 1),
                                                            daftar vertikal dari kolom "#nama". person = kolom Petugas -> isian bila isian itu belum terisi dari tempat lain
                                                            (ignore: ['nama_kolom'] = kolom yang sengaja dilewati tanpa catatan "tidak dikenali"; also: ['Tab'] = tab tambahan sumber nilai)
       { tab: 'SK', single: true, tables: { instruktur: 'Instruktur', peserta: 'Petugas' }, fill: { peserta: { kolom: 'variabel' } } }
                                                            satu surat per baris tab itu (emptyOk: true = baris 2 boleh kosong; surat tetap dibuat dan isian yang kurang ditandai);
                                                            daftar diambil dari tab lain. Tab 'Petugas' boleh jadi sumber daftar (orang yang tidak dicentang di panel disaring);
                                                            fill = kolom daftar yang kosong diisi dari variabel tab Kegiatan / tab surat. */
(function (SK) {
  const W = SK.words;
  const s = (k) => (st) => st[k] || '';

  function dateVars(ctx, key, t) {
    ctx[key] = W.fmtTanggal(t);
    ctx[key + '_hari'] = W.hariOf(t);
    ctx[key + '_bulan'] = W.BULAN[t.m - 1];
    ctx[key + '_tgl_kata'] = W.terbilang(t.d);
    ctx[key + '_tahun_kata'] = W.terbilang(t.y);
  }
  function commonCtx(v, st) {
    return {
      wilayah: st.wilayah,
      wilayah_upper: (st.wilayah || '').toUpperCase(),
      kota: st.kota,
      alamat_kantor: st.alamat_kantor,
    };
  }

  const lowerFirst = (t) => t.charAt(0).toLowerCase() + t.slice(1);
  const upperFirst = (t) => t.charAt(0).toUpperCase() + t.slice(1);
  const noEnd = (t) => String(t).replace(/[\s.;,]+$/, '');

  const BAST = {
    code: 'bast',
    name: 'BAST Hasil Pekerjaan',
    desc: 'Berita Acara Serah Terima hasil pekerjaan petugas/mitra untuk kegiatan apa pun. Nama kegiatan, jenis pekerjaan, hasil, volume/satuan, dan butir uraian tugas (1 sampai berapa pun) semuanya diisi sendiri.',
    template: 'templates/bast.docx',
    fields: [
      { key: 'nomor', label: 'Nomor BAST', kind: 'text', required: true, example: '014/BAST-SE2026/6211/2026', alias: ['nomor_bast'], help: 'Ketik lengkap persis seperti yang akan tercetak.', group: 'Dokumen' },
      { key: 'tanggal', label: 'Tanggal BAST', kind: 'date', required: true, example: '2026-12-10', alias: ['tanggal_bast'], group: 'Dokumen' },
      { key: 'tempat', label: 'Bertempat di', kind: 'text', required: true, default: (st) => `Kantor BPS ${st.wilayah}`, example: '', group: 'Dokumen' },
      { key: 'spk_nomor', label: 'Nomor SPK', kind: 'text', required: true, example: 'B-014/6211/PPK/10/2026', alias: ['No SPK', 'nomor_spk'], group: 'Dokumen' },

      { key: 'kegiatan', label: 'Nama kegiatan', kind: 'text', required: true, preset: true, example: 'Sensus Pertanian 2023',
        help: 'Ditulis seperti nama resmi, tahun ikut di sini bila ada (mis. Sensus Pertanian 2023). Di judul otomatis jadi huruf besar semua.', group: 'Kegiatan & pekerjaan' },
      { key: 'jenis_pekerjaan', label: 'Jenis pekerjaan', kind: 'text', required: true, preset: true, example: 'pendataan', alias: ['Jenis'],
        help: 'Masuk ke kalimat "…melaksanakan pekerjaan ___ kegiatan …". Contoh: pengolahan, pendataan, pencacahan, pemeriksaan.', group: 'Kegiatan & pekerjaan' },
      { key: 'peran', label: 'Sebutan Pihak Kedua di judul', kind: 'text', required: false, preset: true, example: '', alias: ['Sebutan', 'sebagai'],
        help: 'Kosong = "Petugas" + jenis pekerjaan (mis. Petugas Pendataan). Bisa diganti, mis. Mitra Statistik.', group: 'Kegiatan & pekerjaan' },

      { key: 'hasil_berupa', label: 'Hasil pekerjaan berupa', kind: 'textarea', required: true, preset: true, example: 'dokumen hasil pendataan yang telah diperiksa dan lengkap',
        help: 'Melanjutkan kalimat "…hasil … berupa ___, sejumlah [volume] [satuan]". Tanpa titik di akhir.', group: 'Hasil pekerjaan' },
      { key: 'volume', label: 'Volume (jumlah)', kind: 'number', required: true, example: 12, alias: ['Jumlah'], help: 'Sama dengan volume pada lampiran.', group: 'Hasil pekerjaan' },
      { key: 'satuan', label: 'Satuan', kind: 'text', required: true, preset: true, example: 'dokumen', help: 'Mis. dokumen, ruta, blok sensus, usaha, bangunan, SLS.', group: 'Hasil pekerjaan' },
      { key: 'tgl_mulai', label: 'Tanggal mulai pekerjaan', kind: 'date', required: true, example: '2026-10-01', share: 'tgl_mulai', group: 'Hasil pekerjaan' },
      { key: 'tgl_selesai', label: 'Tanggal selesai pekerjaan', kind: 'date', required: true, example: '2026-10-30', share: 'tgl_selesai', group: 'Hasil pekerjaan' },

      { key: 'pihak2_nama', label: 'Nama Pihak Kedua (petugas)', kind: 'text', required: true, example: 'Nama Petugas', alias: ['Nama', 'Nama Petugas', 'Nama Mitra'], share: 'petugas_nama', group: 'Pihak Kedua (petugas)' },
      { key: 'pihak2_nik', label: 'NIK Pihak Kedua', kind: 'text', required: true, digits: 16, example: '6211010101010001', alias: ['NIK'],
        help: 'Harus 16 angka. Di Excel/Google Sheets, format kolom ini sebagai Teks supaya angkanya tidak berubah.', group: 'Pihak Kedua (petugas)' },
      { key: 'pihak2_alamat', label: 'Alamat Pihak Kedua', kind: 'text', required: true, example: 'Kuala Kurun', alias: ['Alamat'], group: 'Pihak Kedua (petugas)' },

      { key: 'ppk_nama', label: 'Nama Pihak Pertama (PPK)', kind: 'text', required: true, default: s('ppk_nama'), setting: 'ppk_nama', group: 'Pihak Pertama (PPK)' },
      { key: 'ppk_nip', label: 'NIP PPK', kind: 'text', required: true, digits: 18, default: s('ppk_nip'), setting: 'ppk_nip', group: 'Pihak Pertama (PPK)' },
      { key: 'ppk_jabatan', label: 'Jabatan PPK', kind: 'text', required: true, default: s('ppk_jabatan'), setting: 'ppk_jabatan', group: 'Pihak Pertama (PPK)' },
      { key: 'ppk_alamat', label: 'Alamat unit kerja', kind: 'text', required: true, default: s('alamat_kantor'), setting: 'alamat_kantor', group: 'Pihak Pertama (PPK)' },

      { key: 'uraian', label: 'Uraian tugas', kind: 'list', required: true, preset: true, alias: ['Uraian', 'uraian_tugas', 'uraian_bast'], addLabel: 'Tambah butir uraian tugas', itemLabel: 'Butir',
        example: ['Mengerjakan tugas pertama sesuai pedoman', 'Mengerjakan tugas kedua sesuai pedoman'],
        help: 'Satu kotak = satu butir bernomor di lampiran. Tambah atau hapus sebanyak yang perlu. Di Excel: satu baris dalam sel (Alt+Enter) = satu butir.',
        group: 'Uraian tugas (lampiran)' },

      { key: 'pernyataan', label: 'Pernyataan tambahan', kind: 'list', required: false, preset: true, alias: ['Pernyataan'], addLabel: 'Tambah pernyataan', itemLabel: 'Pernyataan',
        example: '',
        help: 'Opsional. Dicetak sebagai angka 4, 5, … setelah tiga pernyataan baku. Kosongkan bila tidak ada.',
        group: 'Pernyataan tambahan (opsional)' },
    ],
    groupNotes: { 'Pihak Pertama (PPK)': 'Sudah terisi dari Data kantor (tombol di pojok kanan atas). Ubah di sana, cukup sekali.' },
    /* Isian siap pakai. Bukan bagian dari template: hanya mengisi formulir, bisa diubah lagi. */
    presets: [
      { name: 'Contoh: Pengolahan Penetapan Kerangka Geospasial & Muatan Wilkerstat', values: {
        kegiatan: 'Penetapan Kerangka Geospasial dan Muatan Wilkerstat Tahun 2026',
        jenis_pekerjaan: 'pengolahan',
        peran: 'Petugas Pengolahan',
        hasil_berupa: 'fail peta wilkerstat dan peta geotagging yang telah dimutakhirkan',
        satuan: 'SLS/non-SLS/sub-SLS',
        uraian: [
          'Mengolah peta SLS/non-SLS/sub-SLS berdasarkan peta hasil lapangan dan telah lolos pengecekan kualitas',
          'Melakukan pengolahan geotagging bangunan hasil lapangan SE2026 pada SLS/ non-SLS/ sub-SLS yang mengalami perubahan batas wilayah',
          'Melaksanakan tugas-tugas lain sesuai buku pedoman Penetapan Kerangka Geospasial dan Muatan Wilkerstat atau petunjuk teknis lainnya dan telah menandatangani BAST',
        ],
        pernyataan: [],
      } },
    ],
    book: { tab: 'BAST', person: { nama: 'pihak2_nama', nik: 'pihak2_nik', alamat: 'pihak2_alamat' }, ignore: ['akhir3', 'wilayah'] },
    /* Pratinjau: variabel turunan di template -> isian yang bisa diklik untuk mengubahnya */
    previewMap: {
      hari: 'tanggal', bulan: 'tanggal', tgl_kata: 'tanggal', tahun_kata: 'tanggal',
      tanggal_hari: 'tanggal', tanggal_bulan: 'tanggal', tanggal_tgl_kata: 'tanggal', tanggal_tahun_kata: 'tanggal',
      rentang: 'tgl_mulai', kegiatan_upper: 'kegiatan', peran_upper: (v) => (v.peran ? 'peran' : 'jenis_pekerjaan'), wilayah_upper: 'wilayah',
    },
    checkKeys: ['tgl_selesai'],
    check(v) {
      const e = [];
      if (v.tgl_mulai && v.tgl_selesai && W.cmp(v.tgl_selesai, v.tgl_mulai) < 0) e.push('Tanggal selesai tidak boleh sebelum tanggal mulai.');
      return e;
    },
    build(v, st) {
      const ctx = Object.assign(commonCtx(v, st), v);
      dateVars(ctx, 'tanggal', v.tanggal);
      ctx.hari = ctx.tanggal_hari; ctx.bulan = ctx.tanggal_bulan; ctx.tgl_kata = ctx.tanggal_tgl_kata; ctx.tahun_kata = ctx.tanggal_tahun_kata;
      ctx.tanggal = W.fmtTanggal(v.tanggal);
      ctx.rentang = W.rentang(v.tgl_mulai, v.tgl_selesai);
      ctx.ppk_nip = W.fmtNip(v.ppk_nip);

      const jenis = lowerFirst(noEnd(v.jenis_pekerjaan));
      const peran = v.peran || `Petugas ${upperFirst(jenis)}`;
      ctx.jenis_pekerjaan = jenis;
      ctx.peran_upper = peran.toUpperCase();
      ctx.kegiatan_upper = v.kegiatan.toUpperCase();
      ctx.hasil_berupa = noEnd(v.hasil_berupa);
      ctx.volume = W.fmtAngka(v.volume);

      ctx.uraian = v.uraian.map((t) => ({ t }));
      // Tanda baca: pernyataan 3 berakhir ";" bila masih ada pernyataan tambahan, "." bila ia yang terakhir.
      ctx.pernyataan = v.pernyataan.map((t, i) => ({ t: noEnd(t) + (i === v.pernyataan.length - 1 ? '.' : ';') }));
      ctx.akhir3 = v.pernyataan.length ? ';' : '.';
      return ctx;
    },
    summary: (v) => `${v.nomor || '(tanpa nomor)'} - ${v.pihak2_nama || ''}`,
    filename: (v) => `BAST - ${v.pihak2_nama}`,
  };

  const SURTUG = {
    code: 'surat_tugas',
    name: 'Surat Tugas',
    desc: 'Surat Perintah/Surat Tugas Kepala BPS untuk satu petugas. Banyak petugas: pakai tab Excel (satu baris = satu surat).',
    template: 'templates/surat_tugas.docx',
    needs: ['kepala_nama', 'kepala_nip', 'kota'],
    fields: [
      { key: 'nomor', label: 'Nomor surat', kind: 'text', required: true, example: 'B-070/62110/VS.220/2026', alias: ['nomor_st'], help: 'Ketik lengkap persis seperti yang akan tercetak.', group: 'Surat' },
      { key: 'tanggal_surat', label: 'Tanggal surat', kind: 'date', required: true, example: '2026-11-02', alias: ['Tanggal', 'tanggal_st'], group: 'Surat' },
      { key: 'kota', label: 'Kota tanda tangan', kind: 'text', required: true, default: s('kota'), setting: 'kota', group: 'Surat' },
      { key: 'menimbang', label: 'Menimbang', kind: 'textarea', required: true, preset: true, alias: ['menimbang_st'], example: 'Untuk kelancaran terselenggaranya kegiatan ...', help: 'Tanpa titik koma di akhir; ditambahkan otomatis.', group: 'Isi surat' },
      { key: 'kepada', label: 'Kepada (nama petugas)', kind: 'text', required: true, example: 'Nama Petugas', share: 'petugas_nama', group: 'Isi surat' },
      { key: 'untuk', label: 'Untuk (maksud tugas)', kind: 'textarea', required: true, preset: true, example: 'Melakukan Pendampingan ...', help: 'Kalimat akan diikuti "pada Tanggal ..." otomatis.', alias: ['Maksud', 'Maksud Tugas'], group: 'Isi surat' },
      { key: 'tgl_mulai', label: 'Tanggal mulai tugas', kind: 'date', required: true, example: '2026-11-02', share: 'tgl_mulai', group: 'Isi surat' },
      { key: 'tgl_selesai', label: 'Tanggal selesai tugas', kind: 'date', required: true, example: '2026-11-04', share: 'tgl_selesai', group: 'Isi surat' },
    ],
    book: { tab: 'Surat_Tugas', person: { nama: 'kepada' }, ignore: ['nomor_st_kolektif'] },
    previewMap: { rentang: 'tgl_mulai' },
    checkKeys: ['tgl_selesai'],
    check(v) {
      const e = [];
      if (v.tgl_mulai && v.tgl_selesai && W.cmp(v.tgl_selesai, v.tgl_mulai) < 0) e.push('Tanggal selesai tidak boleh sebelum tanggal mulai.');
      return e;
    },
    build(v, st) {
      const ctx = Object.assign(commonCtx(v, st), v);
      ctx.tanggal_surat = W.fmtTanggal(v.tanggal_surat);
      ctx.rentang = W.rentang(v.tgl_mulai, v.tgl_selesai);
      ctx.menimbang = String(v.menimbang).replace(/[;\s]+$/, '');
      ctx.kepala_nama = st.kepala_nama;
      ctx.kepala_nip = W.fmtNip(st.kepala_nip);
      return ctx;
    },
    summary: (v) => `${v.nomor || '(tanpa nomor)'} - ${v.kepada || ''}`,
    filename: (v) => `Surat Tugas - ${v.kepada}`,
  };

  /* Kolom tabel Lampiran I (instruktur) dan II (peserta). def = isi bila sel kosong. */
  const COL_NAMA = { key: 'nama', label: 'Nama', required: true };
  const SKDOC = {
    code: 'sk',
    name: 'SK Pelatihan',
    desc: 'Keputusan Kepala BPS tentang penetapan Instruktur, Peserta, dan Panitia pelatihan, lengkap dengan Lampiran I (instruktur + honor) dan Lampiran II (peserta + jadwal).',
    template: 'templates/sk.docx',
    needs: ['kepala_nama'],
    fields: [
      { key: 'nomor_sk', label: 'Nomor SK', kind: 'text', required: true, example: '080', alias: ['nomor'], help: 'Hanya nomornya (mis. 080); judul "NOMOR ... TAHUN ..." disusun otomatis.', group: 'Surat Keputusan' },
      { key: 'tanggal_sk', label: 'Tanggal SK (ditetapkan)', kind: 'date', required: true, example: '2026-05-16', group: 'Surat Keputusan' },
      { key: 'tempat', label: 'Ditetapkan di', kind: 'text', required: true, default: s('kota'), setting: 'kota', group: 'Surat Keputusan' },
      { key: 'tahun', label: 'Tahun SK', kind: 'number', required: false, example: 2026, help: 'Kosong = tahun dari tanggal SK.', group: 'Surat Keputusan' },

      { key: 'judul', label: 'Judul SK (tanpa nama kegiatan)', kind: 'textarea', required: true, alias: ['judul_sk'], example: 'Instruktur Daerah (Inda), Peserta, dan Panitia Pelatihan Petugas',
        help: 'Nama kegiatan ditambahkan otomatis di belakangnya. Di judul otomatis jadi huruf besar.', group: 'Judul & kegiatan' },
      { key: 'kegiatan', label: 'Nama kegiatan', kind: 'text', required: true, example: 'Survei Ekonomi Pertanian Tahun 2024', alias: ['nama_kegiatan'], group: 'Judul & kegiatan' },
      { key: 'sebutan', label: 'Sebutan di diktum KESATU dan KEDUA', kind: 'textarea', required: false, alias: ['sebutan_sk'], help: 'Kosong = judul + nama kegiatan.', group: 'Judul & kegiatan' },
      { key: 'judul_lampiran_1', label: 'Judul Lampiran I', kind: 'text', required: true, alias: ['lampiran1', 'lampiran_1'], example: 'Instruktur Daerah Pelatihan Petugas', group: 'Judul & kegiatan' },
      { key: 'judul_lampiran_2', label: 'Judul Lampiran II', kind: 'text', required: true, alias: ['lampiran2', 'lampiran_2'], example: 'Peserta Pelatihan Petugas', group: 'Judul & kegiatan' },

      { key: 'menimbang', label: 'Menimbang (lanjutan "Bahwa dalam rangka ...")', kind: 'textarea', required: true, alias: ['menimbang_sk'], help: 'Mulai dari kata setelah "dalam rangka", tanpa titik di akhir.', group: 'Dasar & anggaran' },
      { key: 'nomor_sk_anggaran', label: 'Nomor SK Pengelola Anggaran', kind: 'text', required: true, alias: ['sk_anggaran_nomor'], example: 'B-011/62110/KU.000/02/2024', group: 'Dasar & anggaran' },
      { key: 'nomor_dipa', label: 'Nomor dan tanggal DIPA', kind: 'text', required: true, alias: ['dipa_nomor'], example: 'SP DIPA-054.01.2.667350/2026 Tanggal 1 Desember 2025',
        help: 'Tulis lengkap termasuk tanggalnya, persis seperti yang akan tercetak. Bila tanggal diisi terpisah di bawah, cukup nomornya di sini.', group: 'Dasar & anggaran' },
      { key: 'dipa_tanggal', label: 'Tanggal DIPA (opsional)', kind: 'date', required: false, example: '2025-12-01', help: 'Diisi hanya bila nomor DIPA di atas belum memuat tanggal. Ditambahkan sebagai "Tanggal ...".', group: 'Dasar & anggaran' },

      { key: 'instruktur', label: 'Daftar instruktur', kind: 'table', required: true, addLabel: 'Tambah instruktur', group: 'Lampiran I: Instruktur',
        columns: [COL_NAMA, { key: 'golongan', label: 'Gol', alias: ['gol'], def: '-' }, { key: 'asal', label: 'Asal' }, { key: 'satuan', label: 'Satuan' },
          { key: 'tarif_rp', label: 'Honor per satuan (Rp)', alias: ['honor', 'tarif', 'tarif_rp'], num: true }, { key: 'keterangan', label: 'Keterangan' }] },
      { key: 'peserta', label: 'Daftar peserta', kind: 'table', required: true, addLabel: 'Tambah peserta', group: 'Lampiran II: Peserta',
        columns: [COL_NAMA, { key: 'golongan', label: 'Gol', alias: ['gol'], def: '-' }, { key: 'asal', label: 'Asal' }, { key: 'jabatan', label: 'Jabatan', alias: ['sebagai', 'peran'] },
          { key: 'tanggal_pelatihan_online', label: 'Tanggal pelatihan online', alias: ['online', 'pelatihan_online', 'tgl_online'] },
          { key: 'tanggal_pelatihan_offline', label: 'Tanggal pelatihan offline', alias: ['offline', 'pelatihan_offline', 'tgl_offline'] }, { key: 'keterangan', label: 'Keterangan' }] },
    ],
    book: { tab: 'SK', single: true, tables: { instruktur: 'Instruktur', peserta: 'Petugas' }, fill: { peserta: { tanggal_pelatihan_online: 'tgl_online', tanggal_pelatihan_offline: 'tgl_offline' } } },
    previewMap: { judul_sk: 'judul', sebutan_sk: (v) => (v.sebutan ? 'sebutan' : 'judul'), nama_kegiatan: 'kegiatan' },
    checkKeys: [],
    check() { return []; },
    build(v, st) {
      const ctx = Object.assign(commonCtx(v, st), v);
      ctx.tanggal_sk = W.fmtTanggal(v.tanggal_sk);
      ctx.tahun = v.tahun || v.tanggal_sk.y;
      const full = `${noEnd(v.judul)} ${v.kegiatan}`;
      ctx.judul_sk = full.toUpperCase();
      ctx.sebutan_sk = v.sebutan || full;
      ctx.nama_kegiatan = v.kegiatan.toUpperCase();
      ctx.judul_lampiran_1 = v.judul_lampiran_1.toUpperCase();
      ctx.judul_lampiran_2 = v.judul_lampiran_2.toUpperCase();
      ctx.kepala_nama = st.kepala_nama;
      if (v.dipa_tanggal) ctx.nomor_dipa = `${v.nomor_dipa} Tanggal ${W.fmtTanggal(v.dipa_tanggal)}`;
      ctx.instruktur = v.instruktur.map((r, i) => Object.assign({ no: i + 1 }, r));
      ctx.peserta = v.peserta.map((r, i) => Object.assign({ no: i + 1 }, r));
      return ctx;
    },
    summary: (v) => `${v.nomor_sk || '(tanpa nomor)'} - ${noEnd(v.judul || '')} ${v.kegiatan || ''}`.trim(),
    filename: (v) => `SK - ${v.kegiatan}`,
  };

  /* ====================================================================== surat-surat tambahan */
  const titleCase = (t) => String(t).replace(/\S+/g, (w) => w.charAt(0).toUpperCase() + w.slice(1));
  const num = (x) => { const n = Number(String(x == null ? '' : x).replace(/\./g, '').replace(/,/g, '.')); return Number.isFinite(n) ? n : NaN; };
  const rupiahKata = (n) => upperFirst(W.terbilang(n)) + ' rupiah';
  /* NIP pegawai 18 angka diberi spasi; mitra (kosong) jadi "-" */
  const nipOrDash = (x) => (x ? W.fmtNip(x) : '-');
  const dmy = (t) => `${String(t.d).padStart(2, '0')}-${String(t.m).padStart(2, '0')}-${t.y}`;
  const PPK = [
    { key: 'ppk_nama', label: 'Nama PPK', kind: 'text', required: true, default: s('ppk_nama'), setting: 'ppk_nama', group: 'Pejabat Pembuat Komitmen' },
    { key: 'ppk_nip', label: 'NIP PPK', kind: 'text', required: true, digits: 18, default: s('ppk_nip'), setting: 'ppk_nip', group: 'Pejabat Pembuat Komitmen' },
  ];
  const PPK_NOTE = { 'Pejabat Pembuat Komitmen': 'Sudah terisi dari Data kantor (tombol di pojok kanan atas). Ubah di sana, cukup sekali.' };
  const BENDAHARA = [
    { key: 'bendahara_nama', label: 'Nama Bendahara Pengeluaran', kind: 'text', required: true, default: 'Rina Fitrianita, S.M', alias: ['bendahara'], group: 'Bendahara Pengeluaran' },
    { key: 'bendahara_nip', label: 'NIP Bendahara', kind: 'text', required: true, digits: 18, default: '197808302009012006', group: 'Bendahara Pengeluaran' },
  ];
  const BENDAHARA_NOTE = { 'Bendahara Pengeluaran': 'Sudah terisi bendahara yang biasa; ubah bila berganti.' };
  const rangeCheck = (v) => (v.tgl_mulai && v.tgl_selesai && W.cmp(v.tgl_selesai, v.tgl_mulai) < 0 ? ['Tanggal selesai tidak boleh sebelum tanggal mulai.'] : []);
  const kodeGabung = (v) => [v.kode_kegiatan, v.kode_akun].filter(Boolean).join(' / ');

  /* ---- PPh 21 atas honor ----
     Mitra/petugas (bukan pegawai) bebas pajak. Pegawai (ASN) menurut golongan: IV = 15%, III = 5%, II (dan I) = 0%.
     Golongan boleh ditulis "III", "III/b", "Penata Muda / III/b", ... ; kosong atau "-" = bukan pegawai. */
  const PPH_TARIF = { IV: 15, III: 5, II: 0, I: 0 };
  function golInfo(gol) {
    const g = String(gol == null ? '' : gol).trim();
    if (!g || /^[-–—\s]+$/.test(g)) return { pegawai: false, rate: 0, gol: '' };
    const m = /(?:^|[^A-Za-z])(IV|III|II|I)(?![A-Za-z])/i.exec(g);
    return m ? { pegawai: true, rate: PPH_TARIF[m[1].toUpperCase()], gol: m[1].toUpperCase() } : { pegawai: true, rate: null, gol: g };
  }
  const hitungPph = (gol, bruto) => { const g = golInfo(gol), rate = g.rate || 0, pph = Math.round(bruto * rate / 100); return { rate, pph, bersih: bruto - pph }; };
  function golCheck(label, gol, nip) {
    const g = golInfo(gol);
    if (g.rate === null) return [`${label}: golongan "${g.gol}" tidak dikenali. Tulis misalnya III, III/b, atau Penata Muda / III/b. Mitra: isi "-".`];
    if (!g.pegawai && nip) return [`${label}: ada NIP tetapi golongan kosong. Golongan pegawai wajib diisi karena menentukan PPh 21 (II = 0%, III = 5%, IV = 15%). Mitra: kosongkan NIP.`];
    return [];
  }

  const KUITANSI = {
    code: 'kuitansi',
    name: 'Kuitansi',
    desc: 'Kuitansi/bukti pembayaran untuk satu penerima (honor, pulsa, transport, konsumsi, dan lain-lain). Terbilang dibuat otomatis. Penerima pegawai bergolongan III/IV: potongan PPh 21 ikut dicetak.',
    template: 'templates/kuitansi.docx',
    fields: [
      { key: 'nomor_bukti', label: 'Nomor bukti', kind: 'text', required: false, example: '001', alias: ['nomor'], help: 'Boleh dikosongkan.', group: 'Kuitansi' },
      { key: 'tanggal', label: 'Tanggal kuitansi', kind: 'date', required: true, example: '2026-12-10', alias: ['tanggal_kuitansi'], group: 'Kuitansi' },
      { key: 'tahun', label: 'Tahun anggaran', kind: 'number', required: false, example: 2026, alias: ['ta', 'tahun_anggaran'], help: 'Kosong = tahun dari tanggal kuitansi.', group: 'Kuitansi' },
      { key: 'kode_kegiatan', label: 'Kode program/kegiatan', kind: 'text', required: true, preset: true, example: '054.01.GG.2896.BMA.004.051.A', alias: ['kode'], share: 'kode_kegiatan', group: 'Kuitansi' },
      { key: 'kode_akun', label: 'Kode akun (MAK)', kind: 'text', required: false, preset: true, example: '521213', alias: ['mak'], share: 'kode_akun', help: 'Boleh dikosongkan.', group: 'Kuitansi' },
      { key: 'jumlah', label: 'Jumlah (Rp)', kind: 'number', required: true, example: 1500000, alias: ['honor', 'nominal', 'jumlah_uang'], share: 'jumlah', help: 'Angka saja, tanpa titik. Contoh: 1500000.', group: 'Kuitansi' },
      { key: 'untuk', label: 'Untuk pembayaran', kind: 'textarea', required: true, preset: true, example: 'Honorarium Petugas Pendataan Survei ...', alias: ['untuk_pembayaran', 'kebutuhan'], group: 'Kuitansi' },
      { key: 'penerima_nama', label: 'Nama penerima', kind: 'text', required: true, example: 'Nama Penerima', alias: ['nama', 'nama_petugas'], share: 'petugas_nama', group: 'Penerima' },
      { key: 'penerima_nip', label: 'NIP penerima', kind: 'text', required: false, digits: 18, alias: ['nip'], share: 'petugas_nip', help: 'Pegawai saja. Mitra: kosongkan atau "-" (tercetak "-").', group: 'Penerima' },
      { key: 'gol', label: 'Golongan penerima', kind: 'text', required: false, alias: ['golongan', 'pangkat_golongan'], example: 'III/b', share: 'petugas_gol',
        help: 'Menentukan PPh 21 atas honor: II = 0%, III = 5%, IV = 15%. Mitra/petugas (bukan pegawai): kosongkan atau "-", bebas pajak.', group: 'Penerima' },
    ].concat(BENDAHARA, PPK),
    groupNotes: Object.assign({}, PPK_NOTE, BENDAHARA_NOTE),
    book: { tab: 'Kuitansi', person: { nama: 'penerima_nama', nip: 'penerima_nip', gol: 'gol' }, ignore: ['pembuat_nama', 'pembuat_nip'] },
    previewMap: {},
    checkKeys: ['gol'],
    check(v) { return golCheck('Golongan penerima', v.gol, v.penerima_nip); },
    build(v, st) {
      const ctx = Object.assign(commonCtx(v, st), v);
      ctx.tanggal = W.fmtTanggal(v.tanggal);
      ctx.tahun = v.tahun || v.tanggal.y;
      ctx.kode = kodeGabung(v);
      ctx.jumlah = W.fmtAngka(v.jumlah);
      ctx.terbilang = rupiahKata(v.jumlah);
      ctx.penerima_nip = nipOrDash(v.penerima_nip);
      ctx.ppk_nip = W.fmtNip(v.ppk_nip);
      ctx.bendahara_nip = W.fmtNip(v.bendahara_nip);
      const p = hitungPph(v.gol, v.jumlah);
      ctx.ada_pajak = p.pph > 0;
      ctx.tarif_pph = p.rate; ctx.pph = W.fmtAngka(p.pph); ctx.bersih = W.fmtAngka(p.bersih);
      return ctx;
    },
    summary: (v) => `${v.nomor_bukti || '(tanpa nomor)'} - ${v.penerima_nama || ''}`,
    filename: (v) => `Kuitansi - ${v.penerima_nama}`,
  };

  const SPBY_FIELDS = () => [
    { key: 'nomor', label: 'Nomor SPBy', kind: 'text', required: true, example: '001/SPBy/6211/2026', alias: ['nomor_spby', 'nomor_surat'], help: 'Ketik lengkap persis seperti yang akan tercetak.', group: 'Surat' },
    { key: 'tanggal_surat', label: 'Tanggal surat', kind: 'date', required: true, example: '2026-12-10', alias: ['tanggal'], group: 'Surat' },
    { key: 'untuk', label: 'Untuk keperluan', kind: 'textarea', required: true, preset: true, example: 'Honorarium Petugas Pendataan Survei ...', alias: ['untuk_pembayaran', 'kebutuhan'], group: 'Pembayaran' },
    { key: 'dasar', label: 'Atas dasar (DIPA)', kind: 'textarea', required: true, preset: true, default: 'UU APBN 2026 No. 17 Tahun 2025, Nomor DIPA : DIPA-054.01.2.667350/2026, tanggal 01 Desember 2025',
      help: 'Sudah terisi dengan DIPA 2026; ubah bila berbeda.', group: 'Pembayaran' },
    { key: 'bukti_kuitansi', label: 'Kuitansi/bukti pembelian', kind: 'text', required: false, example: 'Kuitansi No. 001', alias: ['kuitansi_nota', 'kuitansi', 'bukti1'], help: 'Kosong = "-".', group: 'Bukti pendukung' },
    { key: 'bukti_nota', label: 'Nota/bukti penerimaan barang/jasa', kind: 'text', required: false, example: '', alias: ['tanda_bukti', 'nota', 'bukti2'], help: 'Kosong = "-".', group: 'Bukti pendukung' },
    { key: 'kode_kegiatan', label: 'Kegiatan, output, MAK', kind: 'text', required: true, preset: true, example: 'Survei Ekonomi Pertanian / 054.01.GG.2896', alias: ['kegiatan_output'], share: 'kode_kegiatan', group: 'Kode anggaran' },
    { key: 'kode_akun', label: 'Kode', kind: 'text', required: true, preset: true, example: '521213', alias: ['kode', 'mak'], share: 'kode_akun', group: 'Kode anggaran' },
  ];
  const SPBY = {
    code: 'spby',
    name: 'SPBY (Surat Perintah Bayar)',
    desc: 'Surat perintah PPK kepada Bendahara Pengeluaran untuk membayar satu penerima. Terbilang dibuat otomatis dari jumlah.',
    template: 'templates/spby.docx',
    fields: SPBY_FIELDS().concat([
      { key: 'jumlah', label: 'Jumlah (Rp)', kind: 'number', required: true, example: 1500000, alias: ['honor', 'nominal', 'jumlah_uang'], share: 'jumlah', help: 'Angka saja, tanpa titik. Contoh: 1500000.', group: 'Pembayaran' },
      { key: 'penerima_nama', label: 'Dibayarkan kepada', kind: 'text', required: true, example: 'Nama Penerima', alias: ['nama', 'nama_petugas'], share: 'petugas_nama', group: 'Pembayaran' },
      { key: 'penerima_nip', label: 'NIP penerima', kind: 'text', required: false, digits: 18, alias: ['nip'], share: 'petugas_nip', help: 'Pegawai saja. Mitra: kosongkan atau "-" (tercetak "-").', group: 'Pembayaran' },
    ], BENDAHARA, PPK),
    groupNotes: Object.assign({}, PPK_NOTE, BENDAHARA_NOTE),
    book: { tab: 'SPBY', also: ['Kuitansi'], person: { nama: 'penerima_nama', nip: 'penerima_nip' }, ignore: ['nomor_bukti', 'pembuat_nama', 'pembuat_nip'] },
    previewMap: {},
    checkKeys: [],
    check() { return []; },
    build(v, st) {
      const ctx = Object.assign(commonCtx(v, st), v);
      ctx.tanggal_surat = W.fmtTanggal(v.tanggal_surat);
      ctx.kode = v.kode_akun;
      ctx.jumlah = W.fmtAngka(v.jumlah);
      ctx.terbilang = rupiahKata(v.jumlah);
      ctx.penerima_nip = nipOrDash(v.penerima_nip);
      ctx.ppk_nip = W.fmtNip(v.ppk_nip);
      ctx.bendahara_nip = W.fmtNip(v.bendahara_nip);
      ctx.bukti_kuitansi = v.bukti_kuitansi || '-';
      ctx.bukti_nota = v.bukti_nota || '-';
      return ctx;
    },
    summary: (v) => `${v.nomor || '(tanpa nomor)'} - ${v.penerima_nama || ''}`,
    filename: (v) => `SPBY - ${v.penerima_nama}`,
  };

  /* Penerima banyak orang sekaligus: daftar diambil dari tab Petugas (yang dicentang di panel). */
  const SPBYK = {
    code: 'spby_kolektif',
    name: 'SPBY Kolektif (banyak penerima)',
    desc: 'SPBY untuk pembayaran banyak orang sekaligus (mis. honor instruktur): jumlah = total honor semua penerima, penerima tertulis "Nama, DKK".',
    template: 'templates/spby.docx',
    fields: SPBY_FIELDS().concat([
      { key: 'penerima', label: 'Daftar penerima', kind: 'table', required: true, addLabel: 'Tambah penerima', group: 'Penerima',
        columns: [COL_NAMA, { key: 'nip', label: 'NIP', alias: ['penerima_nip'] }, { key: 'honor', label: 'Honor (Rp)', required: true, alias: ['jumlah', 'jumlah_uang', 'nominal'], num: true }] },
    ], BENDAHARA, PPK),
    groupNotes: Object.assign({}, PPK_NOTE, BENDAHARA_NOTE, { Penerima: 'Jumlah SPBY = total semua honor di bawah. Nama penerima di surat = orang pertama + ", DKK".' }),
    book: { tab: 'SPBY', also: ['Kuitansi'], single: true, emptyOk: true, tables: { penerima: 'Petugas' }, ignore: ['nomor_bukti', 'pembuat_nama', 'pembuat_nip'] },
    previewMap: {},
    checkKeys: ['penerima'],
    check(v) { return v.penerima.map((r, i) => (num(r.honor) > 0 ? '' : `Daftar penerima, baris ${i + 1}: honor harus lebih dari 0.`)).filter(Boolean); },
    build(v, st) {
      const ctx = Object.assign(commonCtx(v, st), v);
      const total = v.penerima.reduce((a, r) => a + num(r.honor), 0), first = v.penerima[0];
      ctx.tanggal_surat = W.fmtTanggal(v.tanggal_surat);
      ctx.kode = v.kode_akun;
      ctx.jumlah = W.fmtAngka(total);
      ctx.terbilang = rupiahKata(total);
      ctx.penerima_nama = first.nama + (v.penerima.length > 1 ? ', DKK' : '');
      const n0 = String(first.nip || '').replace(/\D/g, '');
      ctx.penerima_nip = n0 ? W.fmtNip(n0) : '-';
      ctx.ppk_nip = W.fmtNip(v.ppk_nip);
      ctx.bendahara_nip = W.fmtNip(v.bendahara_nip);
      ctx.bukti_kuitansi = v.bukti_kuitansi || '-';
      ctx.bukti_nota = v.bukti_nota || '-';
      return ctx;
    },
    summary: (v) => `${v.nomor || '(tanpa nomor)'} - ${v.penerima ? v.penerima.length : 0} penerima`,
    filename: (v) => `SPBY Kolektif - ${v.nomor}`.replace(/[\\/]/g, '-'),
  };

  const DAFTAR_HONOR = {
    code: 'daftar_honor',
    name: 'Kuitansi + Daftar Pembayaran Honor (kolektif)',
    desc: 'Kuitansi total plus daftar pembayaran per orang: jumlah kotor (volume x upah), PPh 21 menurut golongan, dan jumlah diterima. Pegawai: II = 0%, III = 5%, IV = 15%; mitra bebas pajak.',
    template: 'templates/daftar_honor.docx',
    fields: [
      { key: 'nomor_bukti', label: 'Nomor bukti', kind: 'text', required: false, example: '001', alias: ['nomor'], help: 'Boleh dikosongkan.', group: 'Kuitansi' },
      { key: 'tanggal', label: 'Tanggal', kind: 'date', required: true, example: '2026-12-10', group: 'Kuitansi' },
      { key: 'tahun', label: 'Tahun anggaran', kind: 'number', required: false, example: 2026, alias: ['ta', 'tahun_anggaran'], help: 'Kosong = tahun dari tanggal.', group: 'Kuitansi' },
      { key: 'kode_kegiatan', label: 'Kode program/kegiatan', kind: 'text', required: true, preset: true, example: '054.01.GG.2896.BMA.004.051.A', alias: ['kode'], share: 'kode_kegiatan', group: 'Kuitansi' },
      { key: 'kode_akun', label: 'Kode akun (MAK)', kind: 'text', required: true, preset: true, example: '521213', alias: ['mak'], share: 'kode_akun', group: 'Kuitansi' },
      { key: 'untuk', label: 'Untuk pembayaran', kind: 'textarea', required: true, preset: true, example: 'Honor Pengajar Pelatihan Petugas ...', alias: ['untuk_pembayaran'], group: 'Kuitansi' },
      { key: 'pembuat_nama', label: 'Pembuat daftar (nama)', kind: 'text', required: true, example: 'Nama Pembuat Daftar', group: 'Pembuat daftar' },
      { key: 'pembuat_nip', label: 'Pembuat daftar (NIP)', kind: 'text', required: true, digits: 18, group: 'Pembuat daftar' },
      { key: 'penerima', label: 'Daftar pembayaran', kind: 'table', required: true, addLabel: 'Tambah penerima', group: 'Daftar pembayaran',
        columns: [COL_NAMA, { key: 'gol', label: 'Gol', alias: ['golongan', 'pangkat_golongan'], def: '-' }, { key: 'jadwal', label: 'Jadwal', alias: ['rentang', 'jadwal_mengajar'] },
          { key: 'volume', label: 'Volume (O-J)', required: true, alias: ['oj', 'jumlah_oj'], num: true }, { key: 'honor', label: 'Jumlah kotor / honor (Rp)', required: true, alias: ['jumlah_kotor', 'jumlah', 'nominal'], num: true }] },
    ].concat(BENDAHARA, PPK),
    groupNotes: Object.assign({}, PPK_NOTE, BENDAHARA_NOTE, { 'Daftar pembayaran': 'Honor = jumlah kotor per orang (volume x upah). Upah per O-J = honor / volume. PPh 21 menurut golongan; "-" = bukan pegawai (bebas pajak).' }),
    book: { tab: 'Kuitansi', single: true, emptyOk: true, tables: { penerima: 'Petugas' }, fill: { penerima: { jadwal: 'rentang' } } },
    previewMap: {},
    checkKeys: ['penerima'],
    check(v) {
      const e = [];
      v.penerima.forEach((r, i) => {
        if (!(num(r.volume) > 0)) e.push(`Daftar pembayaran, baris ${i + 1} (${r.nama}): volume harus lebih dari 0.`);
        if (!(num(r.honor) > 0)) e.push(`Daftar pembayaran, baris ${i + 1} (${r.nama}): honor harus lebih dari 0.`);
        golCheck(`Daftar pembayaran, baris ${i + 1} (${r.nama})`, r.gol, '').forEach((m) => e.push(m));
      });
      return e;
    },
    build(v, st) {
      const ctx = Object.assign(commonCtx(v, st), v);
      let kotor = 0, pph = 0, bersih = 0, vol = 0;
      ctx.penerima = v.penerima.map((r, i) => {
        const k = num(r.honor), p = hitungPph(r.gol, k), vv = num(r.volume);
        kotor += k; pph += p.pph; bersih += p.bersih; vol += vv;
        return { no: i + 1, nama: r.nama, gol: r.gol, jadwal: r.jadwal || '', volume: W.fmtAngka(vv), upah: W.fmtAngka(Math.round(k / vv)), kotor: W.fmtAngka(k), pph: W.fmtAngka(p.pph), bersih: W.fmtAngka(p.bersih), nomor: i + 1 };
      });
      ctx.total_volume = W.fmtAngka(vol); ctx.total_kotor = W.fmtAngka(kotor); ctx.total_pph = W.fmtAngka(pph); ctx.total_bersih = W.fmtAngka(bersih);
      ctx.jumlah = W.fmtAngka(kotor);
      ctx.terbilang = rupiahKata(kotor);
      ctx.tanggal = W.fmtTanggal(v.tanggal);
      ctx.tahun = v.tahun || v.tanggal.y;
      ctx.kode = kodeGabung(v);
      ctx.ppk_nip = W.fmtNip(v.ppk_nip);
      ctx.bendahara_nip = W.fmtNip(v.bendahara_nip);
      ctx.pembuat_nip = W.fmtNip(v.pembuat_nip);
      return ctx;
    },
    summary: (v) => `${v.nomor_bukti || '(tanpa nomor)'} - ${v.penerima ? v.penerima.length : 0} penerima`,
    filename: (v) => `Kuitansi dan Daftar Pembayaran - ${v.nomor_bukti || v.untuk}`.replace(/[\\/]/g, '-').slice(0, 90),
  };

  const RILL = {
    code: 'pengeluaran_riil',
    name: 'Daftar Pengeluaran Riil',
    desc: 'Pernyataan pengeluaran riil transport/perjalanan yang tidak ada bukti pengeluarannya, untuk satu pegawai atau mitra.',
    template: 'templates/pengeluaran_riil.docx',
    fields: [
      { key: 'tanggal', label: 'Tanggal surat', kind: 'date', required: true, example: '2026-12-10', alias: ['tanggal_surat'], group: 'Surat' },
      { key: 'dasar_surat', label: 'Berdasarkan (surat dan nomornya)', kind: 'text', required: true, preset: true, example: 'Surat Tugas Nomor B-070/62110/VS.220/2026 tanggal 2 November 2026', alias: ['berdasarkan', 'dasar'],
        help: 'Melanjutkan kalimat "Berdasarkan ___". Tanpa titik di akhir.', group: 'Surat' },
      { key: 'nama', label: 'Nama pegawai/mitra', kind: 'text', required: true, example: 'Nama Petugas', alias: ['nama_petugas'], share: 'petugas_nama', group: 'Yang menyatakan' },
      { key: 'nip', label: 'NIP', kind: 'text', required: false, digits: 18, share: 'petugas_nip', help: 'Pegawai saja. Mitra: kosongkan atau "-" (tercetak "-").', group: 'Yang menyatakan' },
      { key: 'jabatan', label: 'Jabatan', kind: 'text', required: true, example: 'Mitra Statistik', alias: ['sebagai', 'peran'], share: 'petugas_jabatan', group: 'Yang menyatakan' },
      { key: 'alamat_rute', label: 'Dari alamat rumah ke tempat tugas', kind: 'text', required: true, example: 'Jl. Contoh No. 1, Kuala Kurun ke Hotel ... , Kuala Kurun', alias: ['rute'], group: 'Pengeluaran' },
      { key: 'jumlah', label: 'Jumlah pengeluaran / transport (Rp)', kind: 'number', required: true, example: 150000, alias: ['transport', 'nominal'], share: 'transport', help: 'Angka saja, tanpa titik.', group: 'Pengeluaran' },
      { key: 'keterangan_biaya', label: 'Keterangan biaya', kind: 'text', required: false, example: '', help: 'Boleh dikosongkan.', group: 'Pengeluaran' },
    ].concat(PPK),
    groupNotes: PPK_NOTE,
    book: { tab: 'Pengeluaran_Rill', person: { nama: 'nama', nip: 'nip' } },
    previewMap: {},
    checkKeys: [],
    check() { return []; },
    build(v, st) {
      const ctx = Object.assign(commonCtx(v, st), v);
      ctx.tanggal = W.fmtTanggal(v.tanggal);
      ctx.dasar_surat = noEnd(v.dasar_surat);
      ctx.nip = nipOrDash(v.nip);
      ctx.jumlah = W.fmtAngka(v.jumlah);
      ctx.terbilang = rupiahKata(v.jumlah);
      ctx.ppk_nip = W.fmtNip(v.ppk_nip);
      return ctx;
    },
    summary: (v) => `${v.nama || ''} - Rp ${v.jumlah != null && v.jumlah !== '' ? W.fmtAngka(v.jumlah) : ''}`,
    filename: (v) => `Pengeluaran Riil - ${v.nama}`,
  };

  const PERNYATAAN = {
    code: 'surat_pernyataan',
    name: 'Surat Pernyataan (kendaraan dinas / hotel)',
    desc: 'Pernyataan bahwa tidak memakai kendaraan dinas dan/atau tidak menginap di hotel yang disediakan, untuk satu pegawai atau mitra.',
    template: 'templates/surat_pernyataan.docx',
    fields: [
      { key: 'tanggal', label: 'Tanggal surat', kind: 'date', required: true, example: '2026-12-10', alias: ['tanggal_surat'], group: 'Surat' },
      { key: 'nama', label: 'Nama pegawai/mitra', kind: 'text', required: true, example: 'Nama Petugas', alias: ['nama_petugas'], share: 'petugas_nama', group: 'Yang menyatakan' },
      { key: 'nip', label: 'NIP', kind: 'text', required: false, digits: 18, share: 'petugas_nip', help: 'Pegawai saja. Mitra: kosongkan atau "-" (tercetak "-").', group: 'Yang menyatakan' },
      { key: 'pangkat', label: 'Pangkat/Golongan', kind: 'text', required: false, example: 'Penata Muda (III/a)', alias: ['gol', 'golongan', 'pangkat_golongan'], share: 'petugas_gol', help: 'Pegawai saja. Mitra: kosongkan atau "-" (tercetak "-").', group: 'Yang menyatakan' },
      { key: 'jabatan', label: 'Jabatan', kind: 'text', required: true, example: 'Mitra Statistik', alias: ['sebagai', 'peran'], share: 'petugas_jabatan', group: 'Yang menyatakan' },
      { key: 'unit_kerja', label: 'Kantor/instansi tempat bekerja', kind: 'text', required: true, default: (st) => `BPS ${st.wilayah || ''}`.trim(), alias: ['instansi', 'unit'], help: 'Mitra: tulis tempat bekerja/instansi asal.', group: 'Yang menyatakan' },
    ],
    book: { tab: 'S_Dinas', person: { nama: 'nama', nip: 'nip' } },
    previewMap: {},
    checkKeys: [],
    check() { return []; },
    build(v, st) {
      const ctx = Object.assign(commonCtx(v, st), v);
      ctx.tanggal = W.fmtTanggal(v.tanggal);
      ctx.nip = nipOrDash(v.nip);
      ctx.pangkat = v.pangkat && !/^[-–—\s]+$/.test(v.pangkat) ? v.pangkat : '-';
      return ctx;
    },
    summary: (v) => `${v.nama || ''} - ${v.jabatan || ''}`,
    filename: (v) => `Surat Pernyataan - ${v.nama}`,
  };

  const SPK = {
    code: 'spk',
    name: 'Surat Perjanjian Kerja (SPK)',
    desc: 'Perjanjian kerja antara PPK dan satu petugas/mitra, lengkap dengan rincian tugas, volume, harga satuan (honor / volume), dan nilai perjanjian.',
    template: 'templates/spk.docx',
    fields: [
      { key: 'nomor', label: 'Nomor SPK', kind: 'text', required: true, example: 'B-014/6211/PPK/10/2026', alias: ['nomor_spk', 'spk_nomor'], help: 'Ketik lengkap persis seperti yang akan tercetak.', group: 'Surat' },
      { key: 'tanggal', label: 'Tanggal perjanjian', kind: 'date', required: true, example: '2026-10-01', alias: ['tanggal_spk'], help: 'Hari, tanggal, bulan, dan tahun (dengan huruf) dibuat otomatis.', group: 'Surat' },
      { key: 'kegiatan', label: 'Nama kegiatan', kind: 'text', required: true, preset: true, example: 'Survei Ekonomi Pertanian Tahun 2026', share: 'kegiatan', group: 'Kegiatan' },
      { key: 'kegiatan_singkat', label: 'Nama kegiatan (singkat)', kind: 'text', required: false, preset: true, example: 'SEP2026', help: 'Kosong = sama dengan nama kegiatan.', group: 'Kegiatan' },
      { key: 'peran', label: 'Sebutan petugas di judul', kind: 'text', required: true, preset: true, example: 'Petugas Pendataan', alias: ['sebagai'], help: 'Di judul otomatis jadi huruf besar.', group: 'Kegiatan' },
      { key: 'jabatan', label: 'Jabatan Pihak Kedua', kind: 'text', required: false, preset: true, help: 'Kosong = sama dengan sebutan petugas.', group: 'Kegiatan' },
      { key: 'jangka_perjanjian', label: 'Jangka waktu perjanjian (teks)', kind: 'text', required: false, example: '1 s.d. 30 Oktober 2026', help: 'Ketik seperti yang akan tercetak. Kosong = dari tanggal mulai dan selesai di bawah.', group: 'Jangka waktu' },
      { key: 'tgl_mulai', label: 'Jangka waktu: mulai', kind: 'date', required: false, example: '2026-10-01', share: 'tgl_mulai', group: 'Jangka waktu' },
      { key: 'tgl_selesai', label: 'Jangka waktu: selesai', kind: 'date', required: false, example: '2026-10-30', share: 'tgl_selesai', group: 'Jangka waktu' },
      { key: 'batas_penyerahan', label: 'Batas penyerahan hasil pekerjaan', kind: 'date', required: true, example: '2026-11-05', help: 'Pasal 7: hasil diserahkan paling lambat pada tanggal ini.', group: 'Jangka waktu' },
      { key: 'batas_tambahan', label: 'Batas tambahan waktu penyerahan', kind: 'date', required: true, example: '2026-11-12', help: 'Pasal 7: bila ada hambatan, paling lambat tanggal ini.', group: 'Jangka waktu' },
      { key: 'pihak2_nama', label: 'Nama Pihak Kedua', kind: 'text', required: true, example: 'Nama Petugas', alias: ['nama', 'nama_petugas'], share: 'petugas_nama', group: 'Pihak Kedua' },
      { key: 'pihak2_pekerjaan', label: 'Pekerjaan Pihak Kedua', kind: 'text', required: true, example: 'Wiraswasta', alias: ['pekerjaan'], group: 'Pihak Kedua' },
      { key: 'pihak2_alamat', label: 'Alamat Pihak Kedua', kind: 'text', required: true, example: 'Kuala Kurun', alias: ['alamat'], group: 'Pihak Kedua' },
      { key: 'ppk_nama', label: 'Nama Pihak Pertama (PPK)', kind: 'text', required: true, default: s('ppk_nama'), setting: 'ppk_nama', group: 'Pihak Pertama (PPK)' },
      { key: 'honor', label: 'Honor / nilai perjanjian (Rp)', kind: 'number', required: true, example: 1500000, alias: ['nilai_perjanjian', 'jumlah_uang', 'jumlah', 'nominal'], share: 'jumlah', help: 'Total untuk satu orang, angka saja. Harga satuan = honor / volume.', group: 'Rincian tugas' },
      { key: 'volume', label: 'Volume', kind: 'number', required: false, example: 30, share: 'volume', help: 'Wajib bila tugasnya hanya satu.', group: 'Rincian tugas' },
      { key: 'satuan', label: 'Satuan', kind: 'text', required: false, example: 'Dokumen', share: 'satuan', help: 'Wajib bila tugasnya hanya satu.', group: 'Rincian tugas' },
      { key: 'beban', label: 'Beban anggaran', kind: 'text', required: false, example: '054.01.GG.2896', alias: ['beban_anggaran', 'mak'], help: 'Kosong = "-".', group: 'Rincian tugas' },
      { key: 'tugas', label: 'Rincian tugas', kind: 'table', required: true, addLabel: 'Tambah tugas', group: 'Rincian tugas',
        columns: [{ key: 'uraian', label: 'Uraian tugas', required: true, alias: ['uraian_tugas', 'tugas'] }, { key: 'jangka_waktu', label: 'Jangka waktu', alias: ['jangka'] },
          { key: 'volume', label: 'Volume', num: true }, { key: 'satuan', label: 'Satuan' }, { key: 'honor', label: 'Honor tugas ini (Rp)', alias: ['jumlah_tugas', 'jumlah'], num: true }, { key: 'beban', label: 'Beban anggaran' }] },
    ],
    groupNotes: { 'Pihak Pertama (PPK)': 'Sudah terisi dari Data kantor (tombol di pojok kanan atas). Ubah di sana, cukup sekali.',
      'Rincian tugas': 'Satu tugas: volume, satuan, dan honor diambil dari isian di atas. Beberapa tugas: isi volume, satuan, dan honor di tiap baris tugas (jumlahnya harus sama dengan honor total).' },
    book: { tab: 'Spk_Kontrak', person: { nama: 'pihak2_nama', alamat: 'pihak2_alamat', pekerjaan: 'pihak2_pekerjaan' } },
    previewMap: { rentang: 'tgl_mulai' },
    checkKeys: ['tgl_selesai', 'tugas', 'honor'],
    check(v) {
      const e = rangeCheck(v);
      if (!v.jangka_perjanjian && !(v.tgl_mulai && v.tgl_selesai)) e.push('Jangka waktu perjanjian: isi teksnya, atau tanggal mulai dan selesai.');
      if (v.tugas.length > 1) {
        let sum = 0;
        v.tugas.forEach((r, i) => {
          if (!(num(r.volume) > 0) || !r.satuan || !(num(r.honor) > 0)) e.push(`Rincian tugas, baris ${i + 1}: karena tugasnya lebih dari satu, volume, satuan, dan honor di baris ini wajib diisi.`);
          sum += num(r.honor) || 0;
        });
        if (!e.length && sum !== v.honor) e.push(`Rincian tugas: jumlah honor semua tugas (${W.fmtAngka(sum)}) tidak sama dengan honor total (${W.fmtAngka(v.honor)}).`);
      } else {
        if (!(v.volume > 0) && !(num(v.tugas[0].volume) > 0)) e.push('Volume harus lebih dari 0 (harga satuan = honor / volume).');
        if (!v.satuan && !v.tugas[0].satuan) e.push('Satuan wajib diisi.');
      }
      return e;
    },
    build(v, st) {
      const ctx = Object.assign(commonCtx(v, st), v);
      ctx.tanggal = W.fmtTanggal(v.tanggal);
      ctx.hari = W.hariOf(v.tanggal);
      ctx.tgl_kata_title = titleCase(W.terbilang(v.tanggal.d));
      ctx.bulan = W.BULAN[v.tanggal.m - 1];
      ctx.tahun_kata_title = titleCase(W.terbilang(v.tanggal.y));
      ctx.tanggal_angka = dmy(v.tanggal);
      ctx.peran_upper = v.peran.toUpperCase();
      ctx.kegiatan_upper = v.kegiatan.toUpperCase();
      ctx.kegiatan_singkat = v.kegiatan_singkat || v.kegiatan;
      ctx.jabatan = v.jabatan || v.peran;
      ctx.jangka_perjanjian = v.jangka_perjanjian || W.rentang(v.tgl_mulai, v.tgl_selesai);
      ctx.batas_penyerahan = W.fmtTanggal(v.batas_penyerahan);
      ctx.batas_tambahan = W.fmtTanggal(v.batas_tambahan);
      const single = v.tugas.length === 1;
      ctx.tugas = v.tugas.map((r, i) => {
        const vol = single ? (num(r.volume) > 0 ? num(r.volume) : v.volume) : num(r.volume);
        const jml = single ? (num(r.honor) > 0 ? num(r.honor) : v.honor) : num(r.honor);
        return { no: i + 1, uraian: r.uraian, jangka_waktu: r.jangka_waktu || ctx.jangka_perjanjian, volume: W.fmtAngka(vol), satuan: r.satuan || (single ? v.satuan : ''),
          harga: W.fmtAngka(Math.round(jml / vol)), jumlah: W.fmtAngka(jml), beban: r.beban || v.beban || '-' };
      });
      ctx.nilai_perjanjian = W.fmtAngka(v.honor);
      ctx.nilai_terbilang = rupiahKata(v.honor);
      return ctx;
    },
    summary: (v) => `${v.nomor || '(tanpa nomor)'} - ${v.pihak2_nama || ''}`,
    filename: (v) => `SPK - ${v.pihak2_nama}`,
  };

  const KOLEKTIF = {
    code: 'surat_tugas_kolektif',
    name: 'Surat Tugas Kolektif',
    desc: 'Satu Surat Tugas untuk banyak petugas sekaligus (daftar nama di lampiran). Beda dengan Surat Tugas biasa yang satu surat per petugas.',
    template: 'templates/surat_tugas_kolektif.docx',
    needs: ['kepala_nama', 'kepala_nip', 'kota'],
    fields: [
      { key: 'nomor', label: 'Nomor surat', kind: 'text', required: true, example: 'B-070/62110/VS.220/2026', alias: ['nomor_st_kolektif'], help: 'Ketik lengkap persis seperti yang akan tercetak.', group: 'Surat' },
      { key: 'nomor_lampiran', label: 'Nomor surat di lampiran', kind: 'text', required: false, help: 'Kosong = sama dengan nomor surat.', group: 'Surat' },
      { key: 'tanggal_surat', label: 'Tanggal surat', kind: 'date', required: true, example: '2026-11-02', alias: ['Tanggal'], group: 'Surat' },
      { key: 'kota', label: 'Kota tanda tangan', kind: 'text', required: true, default: s('kota'), setting: 'kota', group: 'Surat' },
      { key: 'menimbang', label: 'Menimbang', kind: 'textarea', required: true, preset: true, alias: ['menimbang_st'], example: 'Untuk kelancaran terselenggaranya kegiatan ...', help: 'Tanpa titik koma di akhir; ditambahkan otomatis.', group: 'Isi surat' },
      { key: 'untuk', label: 'Untuk (maksud tugas)', kind: 'textarea', required: true, preset: true, example: 'Melakukan pendataan ...', alias: ['Maksud', 'Maksud Tugas'], group: 'Isi surat' },
      { key: 'peran', label: 'Sebutan petugas (umum)', kind: 'text', required: false, preset: true, example: 'Petugas Pendataan', help: 'Dipakai untuk petugas yang kolom "Sebagai"-nya kosong. Kosong = "Petugas".', group: 'Isi surat' },
      { key: 'tgl_mulai', label: 'Tanggal mulai tugas (umum)', kind: 'date', required: false, share: 'tgl_mulai', help: 'Dipakai untuk petugas yang kolom tanggalnya kosong.', group: 'Isi surat' },
      { key: 'tgl_selesai', label: 'Tanggal selesai tugas (umum)', kind: 'date', required: false, share: 'tgl_selesai', group: 'Isi surat' },
      { key: 'petugas', label: 'Daftar petugas', kind: 'table', required: true, addLabel: 'Tambah petugas', group: 'Lampiran: daftar petugas',
        columns: [COL_NAMA, { key: 'sebagai', label: 'Sebagai', alias: ['peran', 'jabatan'] }, { key: 'rentang', label: 'Tanggal tugas', alias: ['tanggal'] }] },
    ],
    book: { tab: 'Surat_Tugas', single: true, emptyOk: true, tables: { petugas: 'Petugas' } },
    previewMap: {},
    checkKeys: ['tgl_selesai', 'petugas'],
    check(v) {
      const e = rangeCheck(v);
      if (!(v.tgl_mulai && v.tgl_selesai)) v.petugas.forEach((r, i) => { if (!r.rentang) e.push(`Daftar petugas, baris ${i + 1}: isi Tanggal tugas, atau isi tanggal umum di atas.`); });
      return e;
    },
    build(v, st) {
      const ctx = Object.assign(commonCtx(v, st), v);
      ctx.tanggal_surat = W.fmtTanggal(v.tanggal_surat);
      ctx.menimbang = String(v.menimbang).replace(/[;\s]+$/, '');
      ctx.nomor_lampiran = v.nomor_lampiran || v.nomor;
      ctx.kepala_nama = st.kepala_nama;
      ctx.kepala_nip = W.fmtNip(st.kepala_nip);
      const umum = v.tgl_mulai && v.tgl_selesai ? W.rentang(v.tgl_mulai, v.tgl_selesai) : '';
      ctx.petugas = v.petugas.map((r, i) => ({ no: i + 1, nama_upper: r.nama.toUpperCase(), sebagai: r.sebagai || v.peran || 'Petugas', rentang: r.rentang || umum }));
      return ctx;
    },
    summary: (v) => `${v.nomor || '(tanpa nomor)'} - ${v.petugas ? v.petugas.length : 0} petugas`,
    filename: (v) => `Surat Tugas Kolektif - ${v.nomor}`.replace(/[\\/]/g, '-'),
  };

  const UNDANGAN = {
    code: 'undangan',
    name: 'Undangan Pelatihan',
    desc: 'Surat undangan pelatihan untuk calon petugas: jadwal MOOC dan pelatihan, penginapan, daftar peserta (check in/out), dan rundown.',
    template: 'templates/undangan.docx',
    needs: ['kepala_nama'],
    fields: [
      { key: 'nomor', label: 'Nomor surat', kind: 'text', required: true, example: 'B-100/62110/KP.100/2026', alias: ['nomor_surat'], group: 'Surat' },
      { key: 'tanggal_surat', label: 'Tanggal surat', kind: 'date', required: true, example: '2026-05-10', alias: ['tanggal'], group: 'Surat' },
      { key: 'sifat', label: 'Sifat surat', kind: 'text', required: true, default: 'Segera', example: 'Segera', alias: ['tipe_surat'], group: 'Surat' },
      { key: 'nama_kegiatan', label: 'Nama kegiatan / pelatihan', kind: 'text', required: true, preset: true, example: 'Survei Ekonomi Pertanian Tahun 2026', alias: ['kegiatan'], help: 'Dipakai di perihal dan isi surat.', group: 'Kegiatan' },
      { key: 'jadwal_mooc', label: 'Tanggal pembelajaran mandiri (MOOC)', kind: 'text', required: true, preset: true, example: '27 - 28 Mei 2026', alias: ['tgl_online', 'tanggal_mooc', 'mooc'], help: 'Ketik seperti yang akan tercetak.', group: 'Kegiatan' },
      { key: 'grup', label: 'Grup media sosial', kind: 'text', required: true, preset: true, example: 'WhatsApp "Peserta SEP2026"', alias: ['grup_media', 'grup_wa'], group: 'Kegiatan' },
      { key: 'tempat_pelatihan', label: 'Tempat pelatihan', kind: 'text', required: true, preset: true, example: 'Aula Hotel ...', group: 'Pelatihan offline' },
      { key: 'alamat_pelatihan', label: 'Alamat tempat pelatihan', kind: 'text', required: true, preset: true, example: 'Jl. ... Kuala Kurun', group: 'Pelatihan offline' },
      { key: 'jadwal_pelatihan', label: 'Tanggal pelatihan offline', kind: 'text', required: true, example: '30 - 31 Mei 2026', alias: ['tgl_offline', 'tanggal_pelatihan'], help: 'Ketik seperti yang akan tercetak.', group: 'Pelatihan offline' },
      { key: 'penginapan', label: 'Tempat penginapan', kind: 'text', required: true, preset: true, example: 'Hotel Insevas', alias: ['tempat_penginapan'], group: 'Penginapan' },
      { key: 'alamat_penginapan', label: 'Alamat penginapan', kind: 'text', required: true, preset: true, example: 'Jl. ... Kuala Kurun', group: 'Penginapan' },
      { key: 'check_in', label: 'Tanggal masuk penginapan (umum)', kind: 'text', required: false, example: '30 Mei 2026', help: 'Dipakai untuk peserta yang kolom check in-nya kosong.', group: 'Penginapan' },
      { key: 'check_out', label: 'Tanggal keluar penginapan (umum)', kind: 'text', required: false, example: '31 Mei 2026', help: 'Dipakai untuk peserta yang kolom check out-nya kosong.', group: 'Penginapan' },
      { key: 'rundown', label: 'Rundown / jadwal / materi (Lampiran)', kind: 'textarea', required: true, preset: true, alias: ['isi_lampiran3'], example: 'Hari 1: ...', help: 'Satu baris = satu baris di lampiran.', group: 'Lampiran' },
      { key: 'peserta', label: 'Daftar peserta (Lampiran 1)', kind: 'table', required: true, addLabel: 'Tambah peserta', group: 'Lampiran 1: Peserta',
        columns: [COL_NAMA, { key: 'asal', label: 'Asal', alias: ['alamat'], required: true }, { key: 'jabatan', label: 'Posisi', alias: ['sebagai', 'peran', 'posisi'], def: 'Petugas' },
          { key: 'check_in', label: 'Tanggal check in', alias: ['checkin', 'masuk'] }, { key: 'check_out', label: 'Tanggal check out', alias: ['checkout', 'keluar'] }] },
    ],
    book: { tab: 'Undangan', single: true, emptyOk: true, tables: { peserta: 'Petugas' }, fill: { peserta: { check_in: 'check_in', check_out: 'check_out' } } },
    previewMap: {},
    checkKeys: ['peserta'],
    check(v) { return v.peserta.map((r, i) => ((r.check_in || v.check_in) && (r.check_out || v.check_out) ? '' : `Daftar peserta, baris ${i + 1} (${r.nama}): isi tanggal check in dan check out, atau isi tanggal umum di Penginapan.`)).filter(Boolean); },
    build(v, st) {
      const ctx = Object.assign(commonCtx(v, st), v);
      ctx.tanggal_surat = W.fmtTanggal(v.tanggal_surat);
      ctx.kepala_nama = st.kepala_nama;
      ctx.peserta = v.peserta.map((r, i) => Object.assign({ no: i + 1 }, r, { check_in: r.check_in || v.check_in, check_out: r.check_out || v.check_out }));
      return ctx;
    },
    summary: (v) => `${v.nomor || '(tanpa nomor)'} - ${v.nama_kegiatan || ''}`,
    filename: (v) => `Undangan - ${v.nama_kegiatan}`,
  };

  SK.DOCS = { bast: BAST, surat_tugas: SURTUG, sk: SKDOC, spk: SPK, surat_tugas_kolektif: KOLEKTIF, kuitansi: KUITANSI, spby: SPBY, spby_kolektif: SPBYK, daftar_honor: DAFTAR_HONOR, pengeluaran_riil: RILL, surat_pernyataan: PERNYATAAN, undangan: UNDANGAN };

  /* Kategori kelengkapan -> daftar surat. Tiap surat: [nama di layar, keterangan singkat, kode dokumen di SK.DOCS atau null].
     null = template Word belum ada: surat tetap tampil, bertanda "Template menyusul", belum bisa dipilih.
     Surat yang sama boleh muncul di beberapa kategori (mis. SPBY, Kuitansi); kode dokumennya sama bila templatenya sama. */
  SK.CATEGORIES = [
    { id: 'honor-mitra', icon: '\u{1F4B5}', name: 'Kelengkapan Honor Mitra', letters: [
      ['SK', 'Surat keputusan penetapan petugas/mitra', null],
      ['Surat Perjanjian Kerja', 'Kontrak kerja antara PPK dan petugas', 'spk'],
      ['Surat Tugas', 'Penugasan dari Kepala BPS', 'surat_tugas'],
      ['BAST', 'Berita acara serah terima hasil pekerjaan', 'bast'],
      ['Laporan Kegiatan', 'Laporan pelaksanaan kegiatan', null],
      ['SPBY', 'Surat pernyataan belanja', 'spby'],
      ['Kuitansi', 'Bukti pembayaran honor', 'kuitansi'],
      ['Bukti Penerimaan Honor', 'Tanda terima honor oleh petugas', null]] },
    { id: 'pulsa', icon: '\u{1F4F1}', name: 'Kelengkapan Pulsa', letters: [
      ['SPBY', 'Surat pernyataan belanja pulsa', 'spby'],
      ['Kuitansi', 'Bukti pembayaran pulsa', 'kuitansi']] },
    { id: 'bahan-petugas', icon: '\u{1F9F0}', name: 'Kelengkapan Belanja Bahan Perlengkapan Petugas', letters: [
      ['SPBY', 'Surat pernyataan belanja bahan', 'spby'],
      ['Kuitansi', 'Bukti pembayaran perlengkapan', 'kuitansi']] },
    { id: 'bahan-spanduk', icon: '\u{1FAA7}', name: 'Kelengkapan Belanja Bahan (Spanduk)', letters: [
      ['SPBY', 'Surat pernyataan belanja spanduk', 'spby'],
      ['Kuitansi', 'Bukti pembayaran spanduk', 'kuitansi']] },
    { id: 'translok', icon: '\u{1F690}', name: 'Kelengkapan Translok Mitra', letters: [
      ['Surat Tugas', 'Penugasan petugas translok', 'surat_tugas'],
      ['Surat Tugas Kolektif', 'Satu surat tugas untuk banyak petugas', 'surat_tugas_kolektif'],
      ['Daftar Pengeluaran Riil', 'Daftar pengeluaran transportasi', 'pengeluaran_riil'],
      ['Rincian', 'Rincian biaya translok', null],
      ['Surat Pernyataan', 'Pernyataan pelaksanaan translok', 'surat_pernyataan'],
      ['Laporan Kegiatan', 'Laporan pelaksanaan', null],
      ['SPBY', 'Surat pernyataan belanja', 'spby'],
      ['Kuitansi', 'Bukti pembayaran', 'kuitansi']] },
    { id: 'transport-sulit', icon: '\u{1F6F6}', name: 'Kelengkapan Transport Daerah Sulit', letters: [
      ['Nota/Kuitansi Kelotok', 'Bukti sewa kelotok/transportasi daerah sulit', null],
      ['SPBY', 'Surat pernyataan belanja', 'spby'],
      ['Kuitansi', 'Bukti pembayaran transport', 'kuitansi']] },
    { id: 'spj-konsumsi', icon: '\u{1F371}', name: 'Kelengkapan SPJ Konsumsi', letters: [
      ['Undangan Pelatihan', 'Undangan untuk peserta', 'undangan'],
      ['SPBY', 'Surat pernyataan belanja konsumsi', 'spby'],
      ['Kuitansi', 'Bukti pembayaran konsumsi', 'kuitansi']] },
    { id: 'honor-instruktur', icon: '\u{1F393}', name: 'Kelengkapan Honor Instruktur Nasional/Daerah', letters: [
      ['SK Pelatihan', 'Penetapan instruktur', 'sk'],
      ['Surat Tugas', 'Penugasan instruktur', 'surat_tugas'],
      ['Surat Tugas Kolektif', 'Satu surat tugas untuk banyak instruktur', 'surat_tugas_kolektif'],
      ['Laporan Innas/Inda', 'Laporan pelaksanaan pelatihan', null],
      ['SPBY', 'Surat pernyataan belanja (banyak penerima)', 'spby_kolektif'],
      ['Kuitansi', 'Kuitansi total + daftar pembayaran dengan PPh 21', 'daftar_honor']] },
    { id: 'spd-pengawas', icon: '\u{1F9ED}', name: 'Kelengkapan SPD Pengawas', letters: [
      ['Surat Tugas', 'Penugasan pengawas', 'surat_tugas'],
      ['Daftar Pengeluaran Riil', 'Pengeluaran selama perjalanan', 'pengeluaran_riil'],
      ['Perincian Perhitungan Biaya Perjalanan', 'Rincian biaya SPD', null],
      ['Laporan Perjalanan Dinas', 'Laporan hasil perjalanan', null],
      ['SPBY', 'Surat pernyataan belanja', 'spby'],
      ['Kuitansi', 'Bukti pembayaran', 'kuitansi']] },
    { id: 'kirim-dokumen', icon: '\u{1F4E6}', name: 'Kelengkapan Pengiriman Dokumen', letters: [
      ['SPBY', 'Surat pernyataan belanja pengiriman', 'spby'],
      ['Kuitansi', 'Bukti pembayaran pengiriman', 'kuitansi']] },
  ];

  /* ---- validasi -----
     raw: {key: nilai mentah}. Mengembalikan {values, errors}. Isian kosong memakai default (pengaturan). */
  const blank = (x) => x == null || (typeof x === 'string' && x.trim() === '');
  function clean(str) { return String(str).replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').trim(); }
  /* Daftar butir: dari array (formulir) atau teks beberapa baris (sel Excel). Nomor di depan ("1.", "2)", "-") dibuang. */
  function toList(x) {
    const parts = Array.isArray(x) ? x : String(x == null ? '' : x).split(/\r?\n/);
    return parts.map((t) => clean(String(t).replace(/^\s*(?:\d+\s*[.)]|[-\u2022*])\s+/, ''))).filter(Boolean);
  }
  SK.toList = toList;

  /* Baris tabel: array objek -> baris bersih (kunci = kolom). Baris yang semua selnya kosong dibuang; sel kosong memakai `def`. */
  function toRows(f, x) {
    return (Array.isArray(x) ? x : []).map((r) => {
      const o = {}; let any = false;
      f.columns.forEach((c) => {
        let v = r && r[c.key]; v = v == null ? '' : (typeof v === 'number' ? String(v) : clean(v));
        if (v) any = true;
        o[c.key] = v;
      });
      if (!any) return null;
      f.columns.forEach((c) => {
        if (!o[c.key] && c.def) o[c.key] = c.def;
        if (c.num && /^\d+$/.test(o[c.key])) o[c.key] = W.fmtAngka(o[c.key]);
      });
      return o;
    }).filter(Boolean);
  }
  SK.toRows = toRows;

  /* Isian angka dengan panjang tetap (NIK 16, NIP 18). Menangkap angka yang sudah rusak di Excel/Google Sheets:
     sel berformat Angka membulatkan digit di atas 15 dan menampilkannya sebagai 6,21E+15, dan itu tidak bisa dipulihkan.
     -> { value: hanya angka } atau { error } */
  function checkDigits(label, x, n) {
    const fixIt = 'Ubah format kolom jadi "Teks" (Excel: Format Cells > Text; Google Sheets: Format > Angka > Teks biasa), lalu ketik ulang angkanya.';
    if (typeof x === 'number') return { error: `${label}: tersimpan sebagai angka biasa di Excel, sehingga digit di ujungnya bisa sudah berubah. ${fixIt}` };
    const s = String(x).trim();
    if (/^\d+([.,]\d+)?e[+-]?\d+$/i.test(s)) return { error: `${label}: terbaca "${s}" (angka ilmiah), digitnya sudah berubah. ${fixIt}` };
    const d = s.replace(/[\s.\-]/g, '');
    if (!/^\d+$/.test(d)) return { error: `${label}: hanya boleh berisi angka (terbaca "${s}").` };
    if (d.length !== n) return { error: `${label}: harus ${n} angka, yang terbaca ${d.length} angka.` };
    return { value: d };
  }

  /* -> { values, errors: [teks], keys: [kunci isian bermasalah], settingKeys: [kunci pengaturan bermasalah] } */
  SK.validate = function (doc, raw, st) {
    const values = {}; const errors = []; const keys = []; const settingKeys = [];
    const fail = (msg, key, setting) => {
      errors.push(msg);
      if (key && !keys.includes(key)) keys.push(key);
      if (setting && !settingKeys.includes(setting)) settingKeys.push(setting);
    };
    (doc.needs || []).forEach((k) => {
      const label = SK.SETTING_LABELS[k] || k;
      if (blank(st[k])) { fail(`Data kantor "${label}" belum diisi. Isi dulu lewat tombol Data kantor (cukup sekali).`, null, k); return; }
      const n = (SK.SETTING_DIGITS || {})[k];
      if (n) { const r = checkDigits(`Data kantor "${label}"`, st[k], n); if (r.error) fail(r.error, null, k); }
    });
    for (const f of doc.fields) {
      let x = raw[f.key];
      if (f.kind === 'table') {
        const rows = toRows(f, x);
        if (!rows.length && f.required) fail(`${f.label}: isi minimal satu baris.`, f.key);
        rows.forEach((r, i) => f.columns.forEach((c) => { if (c.required && !r[c.key]) fail(`${f.label}, baris ${i + 1}: ${c.label} wajib diisi.`, f.key); }));
        values[f.key] = rows; continue;
      }
      if (f.kind === 'list') {
        const items = toList(x);
        if (!items.length && f.required) fail(`${f.label}: isi minimal satu butir.`, f.key);
        values[f.key] = items; continue;
      }
      if (f.digits && typeof x === 'string' && /^[-\u2013\u2014\s]+$/.test(x)) x = '';        // "-" = kosong (mitra tidak punya NIP)
      if (blank(x) && f.default) x = typeof f.default === 'function' ? f.default(st) : f.default;
      if (blank(x)) {
        if (f.required) fail(f.setting ? `${f.label}: belum diisi di Data kantor. Isi di sana (cukup sekali), atau ketik langsung di kolom ini.` : `${f.label}: wajib diisi.`, f.key, f.setting);
        values[f.key] = f.kind === 'date' ? null : ''; continue;
      }
      if (f.kind === 'date') {
        const t = W.parseDate(x);
        if (!t) fail(`${f.label}: tanggal tidak dikenali ("${x}"). Pakai format 15/03/2026 atau 15 Maret 2026.`, f.key);
        values[f.key] = t;
      } else if (f.kind === 'number') {
        const n = Number(String(x).replace(/\./g, '').replace(/,/g, '.'));
        if (!Number.isInteger(n) || n < 0) fail(`${f.label}: harus bilangan bulat (${x}).`, f.key);
        values[f.key] = n;
      } else if (f.digits) {
        const r = checkDigits(f.label, x, f.digits);
        if (r.error) { fail(r.error, f.key); values[f.key] = clean(x); } else values[f.key] = r.value;
      } else values[f.key] = clean(x);
    }
    if (!errors.length) {
      const more = doc.check(values, st);
      if (more.length) { errors.push(...more); (doc.checkKeys || []).forEach((k) => keys.push(k)); }
    }
    return { values, errors, keys, settingKeys };
  };
})((window.SK = window.SK || {}));
