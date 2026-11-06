/* Nilai awal kantor. Bisa diubah di panel "Pengaturan" pada aplikasi (tersimpan di browser),
   atau ubah file ini supaya jadi nilai awal untuk semua orang.
   CATATAN: file ini ikut diunggah ke hosting dan bisa dibaca siapa pun yang punya alamat situs.
   NIP sengaja dikosongkan - isi lewat panel Pengaturan. */
(function (SK) {
  SK.DEFAULTS = {
    wilayah: 'Kabupaten Gunung Mas',
    kota: 'Kurun',
    alamat_kantor: 'Jl. Brigjend Katamso No. 97 Kel. Tampang Tumbang Anjir Kec. Kurun Kab. Gunung Mas',
    kepala_nama: 'Mulya Setiawan',
    kepala_nip: '',
    ppk_nama: 'Rose Betsheba Purba, S.Tr.Stat.',
    ppk_nip: '',
    ppk_jabatan: 'Pejabat Pembuat Komitmen',
  };
  SK.SETTING_LABELS = {
    wilayah: 'Wilayah kantor (mis. Kabupaten Gunung Mas)',
    kota: 'Kota pada tanda tangan surat (mis. Kurun)',
    alamat_kantor: 'Alamat kantor',
    kepala_nama: 'Nama Kepala BPS',
    kepala_nip: 'NIP Kepala BPS (18 angka)',
    ppk_nama: 'Nama PPK',
    ppk_nip: 'NIP PPK (18 angka)',
    ppk_jabatan: 'Jabatan PPK',
  };
  /* Pengaturan yang berupa angka dengan panjang tetap: dicek saat diketik dan saat surat dibuat. */
  SK.SETTING_DIGITS = { kepala_nip: 18, ppk_nip: 18 };
})((window.SK = window.SK || {}));
