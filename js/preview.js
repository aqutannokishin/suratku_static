/* Pratinjau surat seperti halaman, langsung di browser (pustaka docx-preview + JSZip, tanpa server).
   Surat diisi dulu seperti biasa; untuk pratinjau, tiap nilai isian diberi penanda tak terlihat (karakter privat U+E000..U+E002)
   supaya setelah digambar bisa diberi warna dan diklik untuk diubah. File yang diunduh TIDAK memakai penanda ini.
   Tampilannya mendekati Word, bukan sama persis: huruf, jarak, dan pemisahan halaman bisa berbeda. */
(function (SK) {
  const OPEN = '', MID = '', CLOSE = '';
  const strip = (t) => t.replace(/[^]*/g, '').replace(/[]/g, '');

  /* kunci variabel template -> "f:kunciIsian" (isian di formulir) | "s:kunciPengaturan" | null (tidak diberi warna) */
  function targetOf(doc, key, values) {
    if (doc.fields.some((f) => f.key === key)) return 'f:' + key;
    let m = (doc.previewMap || {})[key];
    if (typeof m === 'function') m = m(values);
    if (m) return doc.fields.some((f) => f.key === m) ? 'f:' + m : (SK.SETTING_LABELS[m] ? 's:' + m : null);
    return SK.SETTING_LABELS[key] ? 's:' + key : null;
  }

  function markCtx(doc, ctx, values) {
    const out = {};
    Object.keys(ctx).forEach((k) => {
      const v = ctx[k]; const t = targetOf(doc, k, values);
      const wrap = (x) => (t && x !== '' && x != null ? OPEN + t + MID + String(x) + CLOSE : x);
      if (Array.isArray(v)) out[k] = v.map((it) => (it && typeof it === 'object' ? ('t' in it ? Object.assign({}, it, { t: wrap(it.t) }) : it) : wrap(it)));
      else if (typeof v === 'string' || typeof v === 'number') out[k] = wrap(v);
      else out[k] = v;
    });
    return out;
  }

  /* ganti penanda di teks yang sudah tergambar dengan <mark class="pv-var" data-k="..."> */
  function decorate(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = []; while (walker.nextNode()) nodes.push(walker.currentNode);
    const re = /([^]*)([\s\S]*?)/g;
    nodes.forEach((n) => {
      const s = n.nodeValue; if (!/[-]/.test(s)) return;
      const frag = document.createDocumentFragment(); let last = 0, m; re.lastIndex = 0;
      while ((m = re.exec(s))) {
        if (m.index > last) frag.appendChild(document.createTextNode(strip(s.slice(last, m.index))));
        const mk = document.createElement('mark');
        mk.className = 'pv-var'; mk.dataset.k = m[1]; mk.textContent = m[2];
        mk.tabIndex = 0; mk.setAttribute('role', 'button'); mk.title = 'Klik untuk mengubah';
        frag.appendChild(mk); last = re.lastIndex;
      }
      if (last < s.length) frag.appendChild(document.createTextNode(strip(s.slice(last))));
      n.parentNode.replaceChild(frag, n);
    });
  }

  /* kecilkan halaman supaya pas dengan lebar kotak (HP, jendela sempit); skala tidak pernah lebih dari 100% */
  function fit(box) {
    const hold = box.querySelector('.pv-hold'), pages = box.querySelector('.pv-pages'); if (!hold || !pages) return;
    pages.style.transform = 'none';
    const w = pages.offsetWidth, h = pages.offsetHeight; if (!w) return;
    const s = box._pvActual ? 1 : Math.min(1, Math.max(0.2, (box.clientWidth - 24) / w));
    pages.style.transformOrigin = '0 0'; pages.style.transform = `scale(${s})`;
    hold.style.width = Math.ceil(w * s) + 'px'; hold.style.height = Math.ceil(h * s) + 'px';
  }

  /* Gambar surat ke dalam `box`. opts.mark = beri warna & penanda pada nilai isian.
     -> true bila selesai, false bila ada pratinjau yang lebih baru di kotak yang sama. */
  async function show(box, doc, values, settings, opts) {
    opts = opts || {};
    const my = (box._pvToken = (box._pvToken || 0) + 1);
    if (!window.docx || !window.docx.renderAsync || !window.JSZip) throw new Error('pustaka pratinjau belum termuat');
    const ctx = doc.build(values, settings);
    const bytes = await SK.gen.renderDocx(doc, opts.mark ? markCtx(doc, ctx, values) : ctx);
    if (my !== box._pvToken) return false;
    const hold = document.createElement('div'); hold.className = 'pv-hold';
    const pages = document.createElement('div'); pages.className = 'pv-pages'; hold.appendChild(pages);
    box.replaceChildren(hold);
    await window.docx.renderAsync(bytes, pages, null, { className: 'docx', inWrapper: true, breakPages: true, ignoreLastRenderedPageBreak: true });
    if (my !== box._pvToken) return false;
    if (opts.mark) decorate(pages);
    fit(box);
    if (!box._pvRO && window.ResizeObserver) { box._pvRO = new ResizeObserver(() => fit(box)); box._pvRO.observe(box); }
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (my === box._pvToken) fit(box); });
    box.scrollTop = 0;
    return true;
  }

  /* ukuran asli (100%, geser di dalam kotak) <-> pas lebar kotak. -> true bila sekarang ukuran asli */
  function toggleActual(box) { box._pvActual = !box._pvActual; fit(box); return !!box._pvActual; }

  SK.preview = { show, markCtx, targetOf, toggleActual };
})((window.SK = window.SK || {}));
