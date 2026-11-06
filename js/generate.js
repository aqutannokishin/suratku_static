/* Isi template .docx di browser (docxtemplater) dan bungkus banyak file jadi zip (PizZip). */
(function (SK) {
  const cache = {};
  async function loadTemplate(url) {
    if (!cache[url]) {
      const res = await fetch(url, { cache: 'no-cache' });
      if (!res.ok) throw new Error(`Template tidak ditemukan: ${url} (HTTP ${res.status})`);
      cache[url] = await res.arrayBuffer();
    }
    return cache[url];
  }
  const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

  /* ctx -> Uint8Array docx */
  async function renderDocx(doc, ctx) {
    const buf = await loadTemplate(doc.template);
    const zip = new window.PizZip(buf);
    const d = new window.docxtemplater(zip, { paragraphLoop: true, linebreaks: true, nullGetter: () => '' });
    try { d.render(ctx); } catch (e) {
      const sub = e && e.properties && e.properties.errors;
      const msg = sub ? sub.map((x) => x.properties && x.properties.explanation || x.message).join('; ') : (e.message || String(e));
      throw new Error('Gagal mengisi template: ' + msg);
    }
    return d.getZip().generate({ type: 'uint8array', compression: 'DEFLATE' });
  }

  const safeName = (s) => String(s).replace(/[\\/:*?"<>|\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120) || 'dokumen';

  function download(data, filename, mime) {
    const blob = data instanceof Blob ? data : new Blob([data], { type: mime });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }

  /* Teks biasa dari docx yang sudah terisi, untuk halaman "Periksa sebelum unduh": satu baris per paragraf,
     tab jadi spasi, baris kosong beruntun diringkas. Dibaca dari file yang akan diunduh, jadi selalu sama dengan hasil akhirnya. */
  function docxText(bytes) {
    const f = new window.PizZip(bytes).file('word/document.xml');
    if (!f) return '';
    const NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
    const xml = new DOMParser().parseFromString(f.asText(), 'application/xml');
    const SKIP = { pPr: 1, rPr: 1, drawing: 1, pict: 1, AlternateContent: 1 }; // kotak teks dihitung lewat paragrafnya sendiri
    const lines = []; let blank = false;
    Array.from(xml.getElementsByTagNameNS(NS, 'p')).forEach((p) => {
      let line = '';
      const walk = (n) => {
        for (const c of n.childNodes) {
          if (c.nodeType !== 1) continue;
          const ln = c.localName;
          if (ln === 't') line += c.textContent;
          else if (ln === 'tab') line += '    ';
          else if (ln === 'br' || ln === 'cr') line += '\n';
          else if (!SKIP[ln]) walk(c);
        }
      };
      walk(p);
      line = line.replace(/[ \t]+$/g, '');
      if (!line.trim()) { if (!blank && lines.length) lines.push(''); blank = true; } else { lines.push(line); blank = false; }
    });
    while (lines.length && lines[lines.length - 1] === '') lines.pop();
    return lines.join('\n');
  }

  SK.gen = { renderDocx, safeName, download, docxText, DOCX_MIME };
})((window.SK = window.SK || {}));
