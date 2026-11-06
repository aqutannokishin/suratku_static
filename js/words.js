/* Pembantu bahasa Indonesia: terbilang, tanggal, rentang, NIP. Tanpa dependensi. */
(function (SK) {
  const BULAN = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
  const HARI = ['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'];
  const SAT = ['','satu','dua','tiga','empat','lima','enam','tujuh','delapan','sembilan','sepuluh','sebelas'];

  function spell(n) {
    if (n < 12) return SAT[n];
    if (n < 20) return spell(n - 10) + ' belas';
    if (n < 100) return spell(Math.floor(n / 10)) + ' puluh ' + spell(n % 10);
    if (n < 200) return 'seratus ' + spell(n - 100);
    if (n < 1000) return spell(Math.floor(n / 100)) + ' ratus ' + spell(n % 100);
    if (n < 2000) return 'seribu ' + spell(n - 1000);
    if (n < 1e6) return spell(Math.floor(n / 1000)) + ' ribu ' + spell(n % 1000);
    if (n < 1e9) return spell(Math.floor(n / 1e6)) + ' juta ' + spell(n % 1e6);
    return spell(Math.floor(n / 1e9)) + ' miliar ' + spell(n % 1e9);
  }
  function terbilang(n) {
    n = Math.floor(Number(n));
    if (!isFinite(n)) return '';
    if (n < 0) return 'minus ' + terbilang(-n);
    if (n === 0) return 'nol';
    return spell(n).replace(/\s+/g, ' ').trim();
  }

  const MON_LOOKUP = {};
  BULAN.forEach((b, i) => { MON_LOOKUP[b.toLowerCase()] = i + 1; MON_LOOKUP[b.slice(0, 3).toLowerCase()] = i + 1; });
  MON_LOOKUP['agu'] = 8; MON_LOOKUP['agt'] = 8; MON_LOOKUP['des'] = 12; MON_LOOKUP['okt'] = 10; MON_LOOKUP['sept'] = 9; MON_LOOKUP['juni'] = 6; MON_LOOKUP['juli'] = 7;

  function valid(y, m, d) {
    const t = new Date(Date.UTC(y, m - 1, d));
    return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d ? { y, m, d } : null;
  }
  /* Menerima: Date (UTC), 2026-03-15, 15/03/2026, 15.3.2026, "15 Maret 2026". Hasil {y,m,d} atau null. */
  function parseDate(v) {
    if (v == null || v === '') return null;
    if (v instanceof Date) return isNaN(v) ? null : { y: v.getUTCFullYear(), m: v.getUTCMonth() + 1, d: v.getUTCDate() };
    const s = String(v).trim();
    let m;
    if ((m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s))) return valid(+m[1], +m[2], +m[3]);
    if ((m = /^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})$/.exec(s))) return valid(+m[3], +m[2], +m[1]);
    if ((m = /^(\d{1,2})\s+([A-Za-z]+)\.?\s+(\d{4})$/.exec(s))) {
      const mon = MON_LOOKUP[m[2].toLowerCase()];
      return mon ? valid(+m[3], mon, +m[1]) : null;
    }
    return null;
  }
  const fmtTanggal = (t) => `${t.d} ${BULAN[t.m - 1]} ${t.y}`;
  const hariOf = (t) => HARI[new Date(Date.UTC(t.y, t.m - 1, t.d)).getUTCDay()];
  const cmp = (a, b) => (a.y - b.y) || (a.m - b.m) || (a.d - b.d);

  /* "22 - 24 September 2026", "27 Juni - 6 Juli 2026", "28 Desember 2026 - 3 Januari 2027" */
  function rentang(a, b) {
    if (cmp(a, b) === 0) return fmtTanggal(a);
    if (a.y === b.y && a.m === b.m) return `${a.d} - ${b.d} ${BULAN[b.m - 1]} ${b.y}`;
    if (a.y === b.y) return `${a.d} ${BULAN[a.m - 1]} - ${b.d} ${BULAN[b.m - 1]} ${b.y}`;
    return `${fmtTanggal(a)} - ${fmtTanggal(b)}`;
  }
  /* 18 digit -> "19800106 200212 1 003"; selain itu apa adanya. */
  function fmtNip(s) {
    const d = String(s || '').replace(/\D/g, '');
    if (d.length === 18) return `${d.slice(0, 8)} ${d.slice(8, 14)} ${d.slice(14, 15)} ${d.slice(15)}`;
    return String(s || '').trim();
  }
  /* Kebalikan rentang(): "27 - 31 Mei 2024", "27-31 Mei 2024", "29 Mei - 2 Juni 2024", "28 Desember 2026 - 3 Januari 2027",
     "27 Mei 2024" (satu hari), 15/03/2026 - 17/03/2026. -> { mulai, selesai } atau null bila tidak dikenali. */
  function parseRentang(v) {
    if (v == null || v === '') return null;
    const s = String(v).trim().replace(/\s+/g, ' ');
    const parts = /\s(?:s\/d|s\.d\.?|sampai|hingga)\s/i.test(s) ? s.split(/\s+(?:s\/d|s\.d\.?|sampai|hingga)\s+/i) : s.split(/\s*[-\u2013\u2014]\s*/);
    if (parts.length !== 2 || !parts[0] || !parts[1]) { const one = parseDate(s); return one && /^\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{4}$|^\d{4}-\d{1,2}-\d{1,2}$|^\d{1,2}\s+[A-Za-z]+\.?\s+\d{4}$/.test(s) ? { mulai: one, selesai: one } : null; }
    const b = parseDate(parts[1]); if (!b) return null;
    let a = parseDate(parts[0]);
    if (!a) {
      let m;
      if ((m = /^(\d{1,2})$/.exec(parts[0]))) a = valid(b.y, b.m, +m[1]);                       // "27 - 31 Mei 2024"
      else if ((m = /^(\d{1,2})\s+([A-Za-z]+)\.?$/.exec(parts[0])) && MON_LOOKUP[m[2].toLowerCase()]) a = valid(b.y, MON_LOOKUP[m[2].toLowerCase()], +m[1]); // "29 Mei - 2 Juni 2024"
    }
    return a && cmp(a, b) <= 0 ? { mulai: a, selesai: b } : null;
  }
  const isoOf = (t) => `${t.y}-${String(t.m).padStart(2, '0')}-${String(t.d).padStart(2, '0')}`;
  /* 1250 -> "1.250" (pemisah ribuan titik, gaya Indonesia) */
  const fmtAngka = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');

  SK.words = { BULAN, HARI, terbilang, parseDate, fmtTanggal, hariOf, rentang, parseRentang, fmtNip, cmp, isoOf, fmtAngka };
})((window.SK = window.SK || {}));
