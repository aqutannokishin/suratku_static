/* Membaca Google Sheets yang bisa dibuka lewat link, langsung dari browser (tanpa server perantara).
   Dua bentuk alamat yang didukung:
   - link biasa  https://docs.google.com/spreadsheets/d/<ID>/edit#gid=0   ("Siapa saja yang memiliki link" = Pelihat)
   - link terbit https://docs.google.com/spreadsheets/d/e/<KUNCI>/pub...    (File > Bagikan > Publikasikan ke web)
   Sheet pribadi tidak bisa dibaca: browser tidak membawa sign-in Google ke permintaan ini.
   Spreadsheet dengan banyak tab: satu tab dibaca per permintaan. Mode workbook membuka tab lewat NAMA (link biasa saja). */
(function (SK) {
  const MAX_BYTES = 5 * 1024 * 1024;
  const MAX_ROWS = 3000;
  const hnorm = (s) => String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9]+/g, '');

  /* alamat yang ditempel -> { kind: 'd' (link biasa) | 'e' (link terbit), id, gid ('' bila link tanpa #gid=) }.
     Menolak alamat di luar docs.google.com/spreadsheets. */
  function parseLink(input) {
    let u;
    try { u = new URL(String(input || '').trim()); } catch (e) { throw new Error('Alamat belum benar. Tempel link Google Sheets (https://docs.google.com/spreadsheets/d/...).'); }
    if (u.protocol !== 'https:' || u.hostname !== 'docs.google.com' || !u.pathname.startsWith('/spreadsheets/')) {
      throw new Error('Hanya link Google Sheets (https://docs.google.com/spreadsheets/...) yang diterima.');
    }
    const g = /(?:[#?&])gid=(\d+)/.exec(u.hash + '&' + u.search);
    const gid = g ? g[1] : '';
    let m;
    if ((m = /^\/spreadsheets\/d\/e\/([\w-]+)/.exec(u.pathname))) return { kind: 'e', id: m[1], gid };
    if ((m = /^\/spreadsheets\/d\/([\w-]+)/.exec(u.pathname))) return { kind: 'd', id: m[1], gid };
    throw new Error('ID spreadsheet tidak ditemukan di link itu.');
  }

  /* alamat yang ditempel -> alamat CSV. tab = { gid } atau { name } untuk membuka tab lain di spreadsheet yang sama;
     tanpa tab dipakai tab di link (#gid=...), atau tab pertama bila link tanpa gid. */
  function toCsvUrl(input, tab) {
    const l = parseLink(input);
    const t = tab && (tab.gid || tab.name) ? tab : (l.gid ? { gid: l.gid } : {});
    if (l.kind === 'e') {
      if (!t.gid && t.name) throw new Error('Link terbitan ("Publikasikan ke web") hanya bisa membuka tab lewat nomor gid (angka setelah #gid= di alamat tab itu), bukan lewat nama tab.');
      return `https://docs.google.com/spreadsheets/d/e/${l.id}/pub?output=csv` + (t.gid ? `&gid=${t.gid}&single=true` : '');
    }
    return `https://docs.google.com/spreadsheets/d/${l.id}/gviz/tq?tqx=out:csv&headers=1` +
      (t.gid ? `&gid=${t.gid}` : t.name ? `&sheet=${encodeURIComponent(t.name)}` : '');
  }

  /* CSV (RFC 4180): kutip ganda, koma dan baris baru di dalam sel, CRLF. -> array of array */
  function parseCsv(text) {
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
    const rows = []; let row = [], cur = '', quoted = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (quoted) {
        if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else quoted = false; } else cur += c;
      } else if (c === '"' && cur === '') quoted = true;
      else if (c === ',') { row.push(cur); cur = ''; }
      else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = ''; }
      else cur += c;
    }
    if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
    return rows;
  }

  /* alamat CSV -> array of array (baris mentah) */
  async function fetchRows(url) {
    let res;
    try { res = await fetch(url, { credentials: 'omit', cache: 'no-store' }); } catch (e) {
      throw new Error('Tidak bisa membaca sheet. Biasanya karena sheet masih pribadi: buka Bagikan > "Siapa saja yang memiliki link" > Pelihat. Periksa juga sambungan internet.');
    }
    if (!res.ok) throw new Error(`Google menolak permintaan (HTTP ${res.status}). Periksa pengaturan berbagi sheet dan link-nya.`);
    const text = await res.text();
    if (text.length > MAX_BYTES) throw new Error('Data terlalu besar (maksimal 5 MB). Gunakan tab/sheet yang lebih kecil.');
    if (/^\s*<(!doctype|html)/i.test(text)) throw new Error('Google mengirim halaman login, bukan data. Sheet belum dibagikan lewat link ("Siapa saja yang memiliki link" > Pelihat).');
    const all = parseCsv(text);
    if (all.length > MAX_ROWS) throw new Error(`Lebih dari ${MAX_ROWS} baris. Pakai tab sheet yang lebih kecil.`);
    return all;
  }
  /* satu tab (lewat nama) apa adanya -> array of array. Dipakai mode workbook (js/workbook.js). */
  const loadTab = (input, name) => fetchRows(toCsvUrl(input, { name }));

  SK.sheets = { parseLink, toCsvUrl, parseCsv, loadTab, hnorm };
})((window.SK = window.SK || {}));
