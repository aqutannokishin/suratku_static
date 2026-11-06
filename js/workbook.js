/* Workbook kegiatan: satu file Excel / satu Google Sheets berisi data SATU kegiatan untuk semua surat.
   Strukturnya mengikuti Honor_mitra.xlsx. Nama tab dan judul kolom tidak peduli huruf besar/kecil, spasi, atau garis bawah.

     Kegiatan      tabel 2 kolom "variabel | nilai": nilai yang sama untuk semua surat (kegiatan, kota, tanggal, rentang, kepala, PPK, ...)
     Petugas       TABEL INDUK ORANG, satu baris per orang (kolom A "#petugas" = nomor otomatis):
                   nama, nik, nip, alamat, asal, pekerjaan, gol, sebagai, keterangan, volume, satuan, honor,
                   nomor_st, nomor_spk, nomor_bast, nomor_spby, nomor_bukti, ... Tiap baris = satu surat untuk tiap jenis surat per orang.
     Tab surat     (Surat_Tugas, BAST, Spk_Kontrak, SPBY, Kuitansi, Pengeluaran_Rill, S_Dinas, Undangan, ...):
                   baris 1 = judul kolom, baris 2 = isinya (berlaku untuk semua orang). Kolom berjudul "#nama" dan kolom
                   sesudahnya (sampai "#" berikutnya) berisi DAFTAR yang ditulis ke bawah, satu butir/baris per baris.
     SK            baris 1 = judul kolom, satu baris = satu SK
     Instruktur    daftar baris untuk Lampiran I SK
   Urutan pengambilan nilai untuk satu surat (yang kemudian menimpa yang lebih dulu):
     Kegiatan  <  tab surat  <  baris orang di tab Petugas
   Nama kolom/variabel dicocokkan ke isian lewat key, label, dan `alias` di js/docs.js.
   Nilai di tab Kegiatan untuk data kantor (kepala, PPK, kota, wilayah) hanya dipakai bila Data kantor di aplikasi masih kosong. */
(function (SK) {
  const W = SK.words;
  const MAX_ROWS = 3000, MAX_BYTES = 5 * 1024 * 1024;
  const norm = (s) => String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9]+/g, '');
  const blank = (x) => x == null || (typeof x === 'string' && x.trim() === '');
  const cs = (v) => (v instanceof Date ? (W.parseDate(v) ? W.isoOf(W.parseDate(v)) : '') : v == null ? '' : String(v));
  /* nama di tab Kegiatan -> kunci Data kantor */
  const KANTOR = { wilayah: 'wilayah', kota: 'kota', kepala_nama: 'kepala_nama', kepala_nip: 'kepala_nip', ppk_nama: 'ppk_nama', ppk_nip: 'ppk_nip', ppk_jabatan: 'ppk_jabatan', ppk_alamat: 'alamat_kantor', alamat_kantor: 'alamat_kantor' };
  /* nama tab lain yang diterima (ternormalisasi): tab "kanonik" -> nama lama */
  const ALT = { spkkontrak: ['sperjanjian', 'spk'], sdinas: ['pernyataan', 'suratpernyataan'], pengeluaranrill: ['pengeluaranriil', 'rill'] };

  const trimRows = (rows) => { while (rows.length && !rows[rows.length - 1].some((c) => !blank(c))) rows.pop(); return rows; };

  /* ------------------------------------------------------------------ membaca sumber -> book
     book = { source: 'excel' | 'sheets', name, tabs: { [nama ternormalisasi]: { name, rows: [[sel]], error? } } } */
  function cellVal(v) {
    if (v == null) return '';
    if (v instanceof Date) return v;
    if (typeof v === 'object') {
      if (v.richText) return v.richText.map((r) => r.text).join('');
      if ('result' in v) return cellVal(v.result);
      if ('text' in v) return cellVal(v.text);
      return '';                       // rumus tanpa hasil tersimpan, sel galat, dst.
    }
    return typeof v === 'number' ? v : String(v);
  }
  async function fromXlsx(file) {
    if (!/\.xlsx$/i.test(file.name)) throw new Error('Hanya file .xlsx yang diterima.');
    if (file.size > MAX_BYTES) throw new Error('File terlalu besar (maksimal 5 MB).');
    const wb = new window.ExcelJS.Workbook();
    try { await wb.xlsx.load(await file.arrayBuffer()); } catch (e) {  throw new Error('File Excel tidak bisa dibuka (rusak, atau bukan .xlsx).'); }
    const tabs = {};
    wb.worksheets.forEach((ws) => {
      const rows = [], nr = Math.min(ws.rowCount, MAX_ROWS + 50), nc = Math.min(ws.columnCount, 40);
      for (let r = 1; r <= nr; r++) {
        const row = ws.getRow(r), arr = [];
        for (let c = 1; c <= nc; c++) arr.push(cellVal(row.getCell(c).value));
        rows.push(arr);
      }
      tabs[norm(ws.name)] = { name: ws.name, rows: trimRows(rows) };
    });
    if (!Object.keys(tabs).length) throw new Error('File Excel kosong.');
    return { source: 'excel', name: file.name, tabs };
  }
  /* names: nama tab yang dibutuhkan. Tiap tab diambil lewat namanya (link biasa saja; link terbitan hanya bisa lewat gid). */
  async function fromSheets(url, names) {
    const link = SK.sheets.parseLink(url);
    if (link.kind === 'e') throw new Error('Link terbitan ("Publikasikan ke web") tidak bisa dipakai untuk workbook karena tab hanya bisa dibuka lewat nama. Pakai link biasa: Bagikan > "Siapa saja yang memiliki link" > Pelihat.');
    const tabs = {};
    await Promise.all(names.map(async (name) => {
      try { tabs[norm(name)] = { name, rows: trimRows(await SK.sheets.loadTab(url, name)) }; }
      catch (e) { tabs[norm(name)] = { name, rows: null, error: e.message }; }
    }));
    const all = names.map((n) => tabs[norm(n)]);
    if (all.every((t) => t.error)) throw new Error(all[0].error);
    return { source: 'sheets', name: url, tabs };
  }

  /* ------------------------------------------------------------------ bentuk tab */
  const tabOf = (book, name) => {
    const k = norm(name);
    if (book.tabs[k]) return book.tabs[k];
    const alt = (ALT[k] || []).find((a) => book.tabs[a]);
    return alt ? book.tabs[alt] : null;
  };
  /* tabel biasa: baris pertama = judul kolom -> [{ line, cells: { judulTernormalisasi: nilai } }] */
  function plainTable(rows, from) {
    const h = from || 0; if (!rows[h]) return { headers: [], recs: [] };
    const headers = rows[h].map(cs).map((x) => x.replace(/\s+/g, ' ').trim());
    const recs = [];
    for (let i = h + 1; i < rows.length; i++) {
      if (!rows[i].some((c) => !blank(c))) continue;
      const cells = {};
      headers.forEach((hd, j) => { const k = norm(hd); if (k && !(k in cells)) cells[k] = rows[i][j] == null ? '' : rows[i][j]; });
      recs.push({ line: i + 1, cells });
    }
    return { headers, recs };
  }
  /* tab Kegiatan "variabel | nilai" -> { kunciTernormalisasi: nilai } */
  function kvOf(rows) {
    const obj = {};
    rows.forEach((r) => {
      const name = cs(r[0]).trim(); if (!name || norm(name) === 'variabel') return;
      const k = norm(name);
      if (!(k in obj) || blank(obj[k])) obj[k] = r[1] == null ? '' : r[1];
    });
    return obj;
  }
  const kegiatanOf = (book) => { const T = tabOf(book, 'Kegiatan'); return T && T.rows ? kvOf(T.rows) : {}; };
  const noOf = (v) => { const s = cs(v).trim(); return /^\d+(\.0+)?$/.test(s) ? String(parseInt(s, 10)) : s; };

  /* tab surat: baris 1 = judul, baris 2 = isi. "#nama" + kolom sesudahnya = daftar vertikal.
     -> { scal: { nama: nilai }, names: [judul], groups: [{ name, raw, cols, items }] }
     items: butir teks (kolom "#" tanpa kolom sesudahnya) atau objek { kolom: nilai } (dengan kolom sesudahnya) */
  function hTab(rows) {
    const head = rows[0] || [], scal = {}, names = [], groups = [];
    let g = null;
    head.forEach((h, j) => {
      const raw = cs(h).replace(/\s+/g, ' ').trim(); if (!raw) return;
      if (raw[0] === '#') { g = { name: norm(raw), raw, j, cols: [] }; groups.push(g); return; }
      const c = { name: norm(raw), raw, j };
      if (g) g.cols.push(c);
      else { names.push(raw); const v = rows[1] ? rows[1][j] : ''; if (!blank(v)) scal[c.name] = v; }
    });
    groups.forEach((gr) => {
      gr.items = [];
      rows.slice(1).forEach((r) => {
        if (gr.cols.length) {
          const o = {}; let any = false;
          gr.cols.forEach((c) => { const v = r[c.j]; if (v !== undefined && !blank(v)) { o[c.name] = v; any = true; } });
          if (any) gr.items.push(o);
        } else if (!blank(r[gr.j])) gr.items.push(r[gr.j]);
      });
    });
    return { scal, names, groups };
  }

  /* tab Petugas: semua baris yang berisi -> [{ no, line, nama, cells }]. Kolom A "#petugas" (nomor otomatis) tidak dibaca;
     nomor = urutan baris (1, 2, 3, ...) kecuali ada kolom "no" yang diisi. */
  function petugasList(book) {
    const T = tabOf(book, 'Petugas'); if (!T || !T.rows || !T.rows.length) return [];
    const head = (T.rows[0] || []).map(cs).map((h) => h.replace(/\s+/g, ' ').trim()), out = [];
    let n = 0;
    for (let i = 1; i < T.rows.length; i++) {
      const r = T.rows[i], cells = {}; let any = false;
      head.forEach((h, j) => {
        const k = norm(h); if (!k || k === 'petugas') return;
        const v = r[j]; if (v === undefined || blank(v)) return;
        if (!(k in cells)) cells[k] = v;
        any = true;
      });
      if (!any) continue;
      n++;
      out.push({ no: !blank(cells.no) ? noOf(cells.no) : String(n), line: i + 1, cells, nama: blank(cells.nama) ? '' : cs(cells.nama).trim() });
    }
    return out;
  }

  /* ------------------------------------------------------------------ nilai untuk satu surat */
  function fieldMap(doc) {
    const m = {};
    doc.fields.forEach((f) => { if (f.kind !== 'table') [f.key, f.label, ...(f.alias || [])].forEach((n) => { m[norm(n)] = f.key; }); });
    return m;
  }
  /* kolom "#daftar": nama -> isian berjenis list / table */
  function groupMap(doc) {
    const m = {};
    doc.fields.forEach((f) => { if (f.kind === 'list' || f.kind === 'table') [f.key, f.label, ...(f.alias || [])].forEach((n) => { m[norm(n)] = f; }); });
    return m;
  }
  /* terapkan satu sumber (objek nama-ternormalisasi -> nilai) ke raw; yang kosong tidak menimpa */
  function apply(ctx, src) {
    const { doc, map, st, raw } = ctx;
    Object.keys(src).forEach((name) => {
      const v = src[name]; if (blank(v)) return;
      if (name === 'rentang') {
        if (!doc.fields.some((f) => f.key === 'tgl_mulai')) return;
        const r = W.parseRentang(cs(v));
        if (r) { raw.tgl_mulai = W.isoOf(r.mulai); raw.tgl_selesai = W.isoOf(r.selesai); ctx.rentangErr = null; }
        else { raw.tgl_mulai = raw.tgl_selesai = ''; ctx.rentangErr = `Rentang tanggal tidak dikenali ("${cs(v)}"). Contoh yang benar: 27 - 31 Mei 2024 atau 29 Mei - 2 Juni 2024.`; }
        return;
      }
      const key = map[name]; if (!key) return;
      const f = ctx.byKey[key];
      if (f.setting && !blank(st[f.setting])) return;       // Data kantor di aplikasi menang atas workbook
      raw[key] = v;
    });
  }
  function newCtx(doc, st) {
    const byKey = {}; doc.fields.forEach((f) => { byKey[f.key] = f; });
    return { doc, st, map: fieldMap(doc), gmap: groupMap(doc), byKey, raw: {}, rentangErr: null };
  }
  /* daftar "#nama" dari tab surat -> isian list / table */
  function applyGroups(ctx, groups) {
    groups.forEach((g) => {
      const f = ctx.gmap[g.name]; if (!f || !g.items.length) return;
      if (f.kind === 'list') { ctx.raw[f.key] = g.items.map((x) => (typeof x === 'object' ? Object.values(x).map(cs).join(' ') : cs(x))); return; }
      const colOf = {};
      f.columns.forEach((c) => { [c.key, c.label, ...(c.alias || [])].forEach((n) => { colOf[norm(n)] = c.key; }); });
      ctx.raw[f.key] = g.items.map((it) => {
        const o = {};
        if (typeof it !== 'object') { o[f.columns[0].key] = it; return o; }
        Object.keys(it).forEach((n) => { if (colOf[n] && blank(o[colOf[n]])) o[colOf[n]] = it[n]; });
        return o;
      });
    });
  }
  const EXAMPLE = /\(contoh\)|contoh-nip/i;
  function finish(ctx, errors, warnings) {
    const { doc, raw } = ctx;
    if (ctx.rentangErr && (blank(raw.tgl_mulai) || blank(raw.tgl_selesai))) errors.push(ctx.rentangErr);
    const hit = [];
    doc.fields.forEach((f) => {
      const v = raw[f.key];
      if (typeof v === 'string' ? EXAMPLE.test(v) : Array.isArray(v) && EXAMPLE.test(JSON.stringify(v))) hit.push(f.label);
    });
    if (hit.length) warnings.push(`Masih ada tulisan "(CONTOH)" atau NIP contoh pada: ${hit.join(', ')}.`);
  }

  /* daftar baris dari tab lain (Instruktur) atau dari tab Petugas (peserta, petugas) -> array objek menurut kolom field.
     off = nomor orang yang tidak dipilih (hanya untuk tab Petugas). */
  function tableFrom(book, tabName, f, off) {
    const T = tabOf(book, tabName);
    if (!T) return { error: `Tab "${tabName}" tidak ditemukan.` };
    if (T.error) return { error: `Tab "${tabName}" gagal dibaca: ${T.error}` };
    if (!T.rows || !T.rows.length) return { rows: [], unknown: [] };
    const colOf = {};
    f.columns.forEach((c) => { [c.key, c.label, ...(c.alias || [])].forEach((n) => { colOf[norm(n)] = c.key; }); });
    const toObj = (cells) => {
      const o = {};
      Object.keys(colOf).forEach((n) => {
        let v = cells[n]; if (v === undefined || blank(v) || !blank(o[colOf[n]])) return;
        if (v instanceof Date) { const d = W.parseDate(v); v = d ? W.fmtTanggal(d) : ''; }
        o[colOf[n]] = v;
      });
      return o;
    };
    if (norm(tabName) === 'petugas') {
      const rows = petugasList(book).filter((p) => p.nama && !(off && off.has(p.no))).map((p) => toObj(p.cells));
      return { rows, unknown: [] };
    }
    const { headers, recs } = plainTable(T.rows);
    const known = new Set(Object.keys(colOf)); known.add('no');
    const unknown = headers.filter((h) => h && !known.has(norm(h))).map((h) => `${tabName}: ${h}`);
    return { rows: recs.map((r) => toObj(r.cells)), unknown };
  }
  /* kolom tabel yang kosong diisi dari nilai tingkat surat/kegiatan: fill = { kolom: 'nama_variabel' } */
  function fillRows(rows, fill, scal) {
    Object.keys(fill || {}).forEach((col) => {
      let v = scal[norm(fill[col])]; if (blank(v)) return;
      if (v instanceof Date) v = W.fmtTanggal(W.parseDate(v));
      rows.forEach((r) => { if (blank(r[col])) r[col] = v; });
    });
  }

  /* -> { rows: [{ line, raw, errors: [teks], warnings: [teks], pre }], unknown: [teks], problem: teks }
     pre = true: baris sudah pasti galat (jangan diperiksa lagi); errors sudah berisi alasannya.
     opts: { off: Set nomor orang yang tidak dipilih, settings: Data kantor (sesudah diisi dari Kegiatan) } */
  function rowsFor(doc, book, opts) {
    opts = opts || {}; const off = opts.off || new Set(), st = opts.settings || {};
    const spec = doc.book; if (!spec) return { rows: [], unknown: [], problem: 'Surat ini belum bisa dibuat dari workbook.' };
    const where = book.source === 'excel' ? 'file Excel' : 'spreadsheet';
    const keg = kegiatanOf(book), out = [], unknown = [];
    const ign = (spec.ignore || []).map(norm);
    const tabs = [spec.tab].concat(spec.also || []).map((nm) => ({ nm, T: tabOf(book, nm) }));
    const main = tabs[0].T;
    const have = () => Object.values(book.tabs).map((t) => t.name).join(', ');
    const skipName = (k, ctx, extra) => !k || ctx.map[k] || k === 'rentang' || ign.includes(k) || ['no', 'catatan'].includes(k) || (extra && extra[k]);

    if (spec.single) {
      if (!main && !spec.emptyOk) return { rows: [], unknown: [], problem: `Tab "${spec.tab}" tidak ditemukan di ${where}. Tab yang ada: ${have()}.` };
      if (main && main.error) return { rows: [], unknown: [], problem: `Tab "${spec.tab}" gagal dibaca: ${main.error}` };
      if ((!main || !main.rows || !main.rows.length) && !spec.emptyOk) return { rows: [], unknown: [], problem: `Tab "${spec.tab}" kosong atau tidak ditemukan di ${where}. Periksa nama tabnya (tab yang ada: ${have()}).` };
      const pt = plainTable(main && main.rows ? main.rows : []), headers = pt.headers;
      let recs = pt.recs;
      if (!recs.length) {
        if (!spec.emptyOk) return { rows: [], unknown: [], problem: `Tab "${spec.tab}" belum berisi data. Baris 1 = judul kolom, isi data di baris 2.` };
        recs = [{ line: 2, cells: {} }];             // tab surat boleh kosong: nilai dari Kegiatan, tab tambahan, dan daftar orang
      }
      const alsoScal = {};                          // tab tambahan (mis. Kuitansi untuk SPBY): nilainya lebih rendah dari tab utama
      tabs.slice(1).reverse().forEach(({ nm, T }) => {
        if (!T) { unknown.push(`Tab "${nm}" tidak ditemukan (dilewati)`); return; }
        if (T.error || !T.rows || !T.rows.length) return;
        Object.assign(alsoScal, hTab(T.rows).scal);
      });
      const c0 = newCtx(doc, st);
      headers.forEach((n) => { if (!skipName(norm(n), c0, spec.person)) unknown.push(`${spec.tab}: ${n}`); });
      const tbl = {};
      Object.keys(spec.tables || {}).forEach((fk) => { tbl[fk] = tableFrom(book, spec.tables[fk], c0.byKey[fk], off); (tbl[fk].unknown || []).forEach((u) => unknown.push(u)); });
      recs.forEach((rec) => {
        const ctx = newCtx(doc, st), errors = [], warnings = [];
        apply(ctx, keg); apply(ctx, alsoScal); apply(ctx, rec.cells);
        const scal = Object.assign({}, keg, alsoScal, rec.cells);
        Object.keys(tbl).forEach((fk) => {
          if (tbl[fk].error) { errors.push(tbl[fk].error); return; }
          const rows = tbl[fk].rows.map((r) => Object.assign({}, r));
          fillRows(rows, (spec.fill || {})[fk], scal);
          ctx.raw[fk] = rows;
        });
        finish(ctx, errors, warnings);
        out.push({ line: rec.line, raw: ctx.raw, errors, warnings, pre: false });
      });
      return { rows: out, unknown: Array.from(new Set(unknown)) };
    }

    // surat per orang: tiap orang di tab Petugas = satu surat
    if (main && main.error) return { rows: [], unknown: [], problem: `Tab "${spec.tab}" gagal dibaca: ${main.error}` };
    const pT = tabOf(book, 'Petugas');
    if (!pT) return { rows: [], unknown: [], problem: `Tab "Petugas" tidak ditemukan di ${where}. Tab yang ada: ${have()}.` };
    if (pT.error) return { rows: [], unknown: [], problem: `Tab "Petugas" gagal dibaca: ${pT.error}` };
    const people = petugasList(book);
    if (!people.length) return { rows: [], unknown: [], problem: 'Tab "Petugas" belum berisi orang. Isi nama (dan kolom lain) mulai baris 2.' };

    const c0 = newCtx(doc, st), scal = {}, groups = [], person = spec.person || {};
    tabs.slice().reverse().forEach(({ nm, T }) => {       // tab tambahan dulu, tab utama terakhir (menang)
      if (!T) { unknown.push(`Tab "${nm}" tidak ditemukan (dilewati)`); return; }
      if (T.error) { unknown.push(`Tab "${nm}" gagal dibaca (dilewati)`); return; }
      if (!T.rows || !T.rows.length) return;
      const H = hTab(T.rows);
      Object.assign(scal, H.scal); H.groups.forEach((g) => groups.push(g));
      H.names.forEach((n) => { if (!skipName(norm(n), c0, person)) unknown.push(`${T.name}: ${n}`); });
      H.groups.forEach((g) => { if (!c0.gmap[g.name]) unknown.push(`${T.name}: ${g.raw}`); });
    });
    people.forEach((p) => {
      if (!p.nama) { out.push({ line: p.line, raw: {}, errors: ['Kolom "nama" kosong pada baris ini di tab Petugas.'], warnings: [], pre: true }); return; }
      if (off.has(p.no)) return;
      const ctx = newCtx(doc, st), errors = [], warnings = [];
      apply(ctx, keg); apply(ctx, scal); apply(ctx, p.cells);
      applyGroups(ctx, groups);
      Object.keys(person).forEach((col) => {
        const key = person[col]; if (!blank(ctx.raw[key])) return;
        if (!blank(p.cells[col])) ctx.raw[key] = p.cells[col];
      });
      finish(ctx, errors, warnings);
      out.push({ line: p.line, raw: ctx.raw, errors, warnings, pre: false });
    });
    return { rows: out, unknown: Array.from(new Set(unknown)) };
  }

  /* ------------------------------------------------------------------ pembantu untuk tampilan */
  const usesPetugas = (d) => !!(d.book && (d.book.person || Object.values(d.book.tables || {}).some((t) => norm(t) === 'petugas')));
  /* nama tab yang perlu dibaca untuk surat-surat yang dipilih */
  function neededTabs(docs) {
    const set = ['Kegiatan'];
    if (docs.some(usesPetugas)) set.push('Petugas');
    docs.forEach((d) => { if (!d.book) return; set.push(d.book.tab); (d.book.also || []).forEach((t) => set.push(t)); Object.values(d.book.tables || {}).forEach((t) => set.push(t)); });
    const seen = new Set();
    return set.filter((n) => { const k = norm(n); if (seen.has(k)) return false; seen.add(k); return true; });
  }
  /* status tiap tab: [{ name, found, count, unit, error, optional }] */
  function tabStatus(book, docs) {
    const letterTabs = new Set(), singleTabs = new Set();
    docs.forEach((d) => { if (!d.book) return; [d.book.tab].concat(d.book.also || []).forEach((t) => { (d.book.single ? singleTabs : letterTabs).add(norm(t)); }); });
    return neededTabs(docs).map((name) => {
      const T = tabOf(book, name), found = !!(T && !T.error && T.rows), k = norm(name);
      let count = 0, unit = 'baris';
      if (found) {
        if (k === 'kegiatan') { count = kegiatanList(book).length; unit = 'variabel'; }
        else if (k === 'petugas') { count = petugasList(book).filter((p) => p.nama).length; unit = 'orang'; }
        else if (letterTabs.has(k) && !singleTabs.has(k)) { count = hTab(T.rows).names.length; unit = 'kolom'; }
        else count = plainTable(T.rows).recs.length;
      }
      return { name, found, count, unit, error: T && T.error ? T.error : '', optional: k === 'kegiatan' || (letterTabs.has(k) && !singleTabs.has(k)) };
    });
  }
  /* orang di tab Petugas (untuk daftar centang): [{ no, nama }] */
  function peopleOf(book, docs) {
    if (!docs.some(usesPetugas)) return [];
    return petugasList(book).filter((p) => p.nama).map((p) => ({ no: p.no, nama: p.nama }));
  }
  /* Data kantor efektif: yang kosong diisi dari tab Kegiatan. notes = perbedaan yang diabaikan (Data kantor menang). */
  function kantorFill(book, st) {
    const keg = kegiatanOf(book), eff = Object.assign({}, st), notes = [];
    Object.keys(KANTOR).forEach((name) => {
      const v = keg[norm(name)]; if (blank(v)) return;
      const key = KANTOR[name];
      if (blank(st[key])) eff[key] = cs(v).trim();
      else if (norm(st[key]) !== norm(v)) notes.push(`Tab Kegiatan: ${name} = "${cs(v).trim()}" berbeda dari Data kantor ("${String(st[key]).trim()}"). Yang dipakai: Data kantor.`);
    });
    return { eff, notes };
  }
  /* isi tab Kegiatan untuk ditampilkan: [[variabel, nilai]] */
  function kegiatanList(book) {
    const T = tabOf(book, 'Kegiatan'); if (!T || !T.rows) return [];
    return T.rows.map((r) => [cs(r[0]).trim(), cs(r[1]).trim()]).filter((r) => r[0] && norm(r[0]) !== 'variabel');
  }

  SK.wb = { norm, fromXlsx, fromSheets, rowsFor, neededTabs, tabStatus, peopleOf, kantorFill, kegiatanList, MAX_ROWS };
})((window.SK = window.SK || {}));
