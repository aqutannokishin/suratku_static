/* Tampilan & alur SuratKu:
   kategori > pilih surat (boleh banyak) > cara isi (formulir / Excel / Google Sheets) > isi data > periksa & buat.
   Definisi surat ada di js/docs.js (SK.DOCS, SK.CATEGORIES); file ini hanya menampilkan dan menghubungkannya. */
(function (SK) {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const tick = () => new Promise((r) => setTimeout(r));
  const lsGet = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } };
  const lsJson = (k) => { try { return JSON.parse(lsGet(k) || '{}') || {}; } catch (e) { return {}; } };
  const docOf = (code) => SK.DOCS[code];
  const isBlankRaw = (v) => v == null || (typeof v === 'string' && v.trim() === '');

  /* ====================================================================== toast & modal */
  function toast(msg) {
    const t = $('#toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), 2800);
  }
  let lastFocus = null;
  function openModal(id) {
    lastFocus = document.activeElement;
    const m = $('#' + id); m.classList.add('show');
    const f = m.querySelector('input:not([hidden]):not([type=file])') || m.querySelector('.btn-primary');
    if (f) f.focus();
  }
  function closeModal(id) {
    $('#' + id).classList.remove('show');
    if (lastFocus && lastFocus.focus) { try { lastFocus.focus(); } catch (e) { /* abaikan */ } }
  }
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') $$('.overlay.show').forEach((o) => closeModal(o.id)); });
  $('#modal-success').addEventListener('click', (e) => { if (e.target.id === 'modal-success') closeModal('modal-success'); });

  /* ====================================================================== Data kantor (pengaturan) */
  const KEY = 'suratku.settings.v1';
  let settings = Object.assign({}, SK.DEFAULTS, lsJson(KEY));
  const SDIG = SK.SETTING_DIGITS || {};
  const FIRST_TIP = $('#kantor-msg').textContent;

  function digitState(k, v) {
    const n = SDIG[k]; const d = String(v || '').replace(/[\s.\-]/g, '');
    if (!n || !d) return { cls: '', text: '' };
    if (!/^\d+$/.test(d)) return { cls: 'bad', text: '✗ Hanya boleh angka.' };
    return d.length === n ? { cls: 'ok', text: `✓ ${n} angka, benar.` } : { cls: 'bad', text: `✗ Harus ${n} angka (sekarang ${d.length}).` };
  }
  const setupNeeded = () => Object.keys(SDIG).some((k) => !String(settings[k] || '').trim());

  function nipPill(k) {
    const v = String(settings[k] || '').trim();
    if (!v) return '<span class="warn-pill">NIP belum diisi</span>';
    return digitState(k, v).cls === 'bad' ? '<span class="warn-pill">NIP belum benar</span>' : '';
  }
  function renderStrip() {
    $('#strip-info').innerHTML =
      `<div class="kv"><b>Kepala BPS</b>${esc(settings.kepala_nama)} ${nipPill('kepala_nip')}</div>` +
      `<div class="kv"><b>PPK</b>${esc(settings.ppk_nama)} ${nipPill('ppk_nip')}</div>` +
      `<div class="kv"><b>Kota surat</b>${esc(settings.kota)}</div>`;
    $('#strip-import').hidden = !setupNeeded();
    $('#logo-sub').textContent = settings.wilayah ? 'BPS ' + settings.wilayah : 'BPS';
  }

  let draft = {};
  function setKantorMsg(text, bad) { const m = $('#kantor-msg'); m.textContent = text; m.className = 'hint' + (bad ? ' bad' : ''); }
  function paintHint(k) { const h = $('#hint-' + k); if (!h) return; const s = digitState(k, draft[k]); h.textContent = s.text; h.className = 'hint ' + s.cls; }
  function renderKantorFields() {
    const box = $('#kantor-fields'); box.innerHTML = '';
    Object.keys(SK.SETTING_LABELS).forEach((k) => {
      const d = document.createElement('div'); d.className = 'field';
      const dig = !!SDIG[k];
      d.innerHTML = `<label for="set-${k}">${esc(SK.SETTING_LABELS[k])}${dig ? ' <span class="req" title="wajib">*</span>' : ''}</label>` +
        `<input class="inp" type="text" id="set-${k}" data-set="${k}" value="${esc(draft[k])}" autocomplete="off">` +
        (dig ? `<div class="hint" id="hint-${k}" aria-live="polite"></div>` : '');
      box.appendChild(d);
      if (dig) paintHint(k);
    });
  }
  function openKantor(focusKey) {
    draft = Object.assign({}, settings);
    renderKantorFields(); setKantorMsg(FIRST_TIP);
    openModal('modal-kantor');
    const k = focusKey || Object.keys(SDIG).find((x) => !String(settings[x] || '').trim());
    const el = k && $('#set-' + k);
    if (el) { el.focus(); el.scrollIntoView({ block: 'center' }); }
  }
  $('#modal-kantor').addEventListener('input', (e) => {
    const k = e.target.dataset && e.target.dataset.set; if (!k) return;
    draft[k] = e.target.value; e.target.removeAttribute('aria-invalid'); paintHint(k);
  });
  $('#btn-kantor').addEventListener('click', () => openKantor());
  $('#strip-edit').addEventListener('click', () => openKantor());
  $('#strip-import').addEventListener('click', () => { openKantor(); $('#kantor-import').click(); });
  $('#kantor-cancel').addEventListener('click', () => closeModal('modal-kantor'));
  $('#kantor-save').addEventListener('click', () => {
    const bad = Object.keys(SDIG).filter((k) => digitState(k, draft[k]).cls === 'bad');
    if (bad.length) {
      setKantorMsg('Perbaiki dulu: ' + bad.map((k) => SK.SETTING_LABELS[k].replace(/\s*\(.*\)/, '')).join(', ') + '.', true);
      bad.forEach((k) => $('#set-' + k).setAttribute('aria-invalid', 'true')); $('#set-' + bad[0]).focus();
      return;
    }
    Object.keys(draft).forEach((k) => { if (typeof draft[k] === 'string') draft[k] = draft[k].trim(); });
    settings = Object.assign({}, SK.DEFAULTS, draft);
    const ok = lsSet(KEY, JSON.stringify(settings));
    closeModal('modal-kantor');
    toast(ok ? 'Data kantor disimpan (di browser ini saja)' : 'Browser tidak mengizinkan penyimpanan; berlaku sampai halaman ditutup.');
    afterSettingsChange();
  });
  $('#kantor-reset').addEventListener('click', () => {
    draft = Object.assign({}, SK.DEFAULTS); renderKantorFields();
    setKantorMsg('Kembali ke nilai bawaan. Klik Simpan untuk memakainya.');
  });
  /* Pengaturan bisa disimpan ke file dan dibuka di komputer lain: satu orang mengisi, yang lain tinggal membuka file-nya. */
  $('#kantor-export').addEventListener('click', () => {
    SK.gen.download(new Blob([JSON.stringify({ suratku: 'pengaturan', settings: draft }, null, 2)], { type: 'application/json' }), 'pengaturan-kantor.json');
    setKantorMsg('File pengaturan-kantor.json sudah diunduh. Kirim ke rekan; mereka tinggal memilih "Buka pengaturan dari file".');
  });
  $('#kantor-import-btn').addEventListener('click', () => $('#kantor-import').click());
  $('#kantor-import').addEventListener('change', async (e) => {
    const file = e.target.files[0]; e.target.value = ''; if (!file) return;
    try {
      if (file.size > 100 * 1024) throw new Error('file terlalu besar untuk file pengaturan.');
      const j = JSON.parse(await file.text());
      const src = j && typeof j.settings === 'object' && j.settings ? j.settings : j;
      let n = 0;
      Object.keys(SK.DEFAULTS).forEach((k) => { if (src && typeof src[k] === 'string') { draft[k] = src[k].slice(0, 300); n++; } });
      if (!n) throw new Error('ini bukan file pengaturan SuratKu.');
      renderKantorFields();
      setKantorMsg(`Pengaturan dari "${file.name}" terisi (${n} isian). Periksa NIP, lalu klik Simpan.`);
    } catch (err) { setKantorMsg('Gagal membuka file pengaturan: ' + err.message, true); }
  });
  function afterSettingsChange() {
    refreshDefaults(); renderStrip();
    if (current === 'form') renderForm();
    if (current === 'review') renderReview();
  }

  /* ====================================================================== state & navigasi */
  const state = {
    category: null,   // kategori yang dibuka
    letters: [],      // kode dokumen yang dicentang (urut seperti di kategori)
    method: null,     // 'form' | 'excel' | 'sheets'  (excel dan sheets sama-sama membaca satu workbook kegiatan)
    active: null,     // tab surat yang sedang diisi (mode formulir)
    data: {},         // per kode dokumen: { form, auto, touched }  (mode formulir)
    wb: newWb(),      // workbook kegiatan (mode excel / sheets)
    issues: {},       // hasil pemeriksaan terakhir: kode -> { keys }
    results: [],      // hasil pemeriksaan terakhir (dipakai tombol Buat)
    pvCode: null,     // surat yang sedang tampil di pratinjau halaman 3
  };
  let current = 'home';
  function newWb() { return { book: null, busy: false, info: null, off: new Set(), url: lsGet('suratku.sheeturl.v1') || '', fileName: '' }; }
  /* Data kantor yang dipakai untuk memeriksa & membuat surat: di mode workbook, isian kantor yang masih kosong diisi dari tab Kegiatan. */
  const activeSettings = () => (state.method !== 'form' && state.wb.book ? SK.wb.kantorFill(state.wb.book, settings).eff : settings);

  const canShow = (p) => p === 'home' || (p === 'letters' && !!state.category) || (p === 'method' && state.letters.length > 0) ||
    ((p === 'form' || p === 'review') && state.letters.length > 0 && !!state.method);

  function renderSteps() {
    const step = ['home', 'letters', 'method'].includes(current) ? 1 : current === 'form' ? 2 : 3;
    const labels = ['Jenis surat', 'Isi data', 'Buat dan unduh'];
    $('#stepbar').innerHTML = labels.map((l, i) => {
      const n = i + 1, cls = n === step ? 'active' : n < step ? 'done' : '';
      return `<div class="step ${cls}"${n === step ? ' aria-current="step"' : ''}><div class="num">${n < step ? '✓' : n}</div><div class="lbl">${n}. ${l}</div></div>`;
    }).join('');
  }
  function show(page, push) {
    current = page;
    $$('.page').forEach((p) => p.classList.toggle('show', p.id === 'page-' + page));
    renderSteps();
    if (push) { try { history.pushState({ page }, '', location.href); } catch (e) { /* abaikan */ } }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  function go(page, opts) {
    if (!canShow(page)) { if (page === 'method') toast('Pilih minimal satu surat dulu'); return; }
    current = page; // dipakai render*/live() di bawah
    if (page === 'home') renderCategories();
    else if (page === 'letters') renderLetters();
    else if (page === 'method') renderMethod();
    else if (page === 'form') { syncShared(); renderForm(); }
    else if (page === 'review') renderReview();
    show(page, !(opts && opts.push === false));
  }
  window.addEventListener('popstate', (e) => { const p = e.state && e.state.page; go(p && canShow(p) ? p : 'home', { push: false }); });
  document.addEventListener('click', (e) => { const b = e.target.closest('[data-go]'); if (b) go(b.dataset.go); });

  /* ---------------------------------------------------------------- halaman 1: kategori */
  const letterList = (cat) => cat.letters.map(([name, desc, doc]) => ({ name, desc, doc: doc && SK.DOCS[doc] ? doc : null }));
  function renderCategories() {
    $('#category-grid').innerHTML = SK.CATEGORIES.map((c) => {
      const L = letterList(c), ready = L.filter((l) => l.doc).length;
      return `<button type="button" class="cat-card" data-cat="${esc(c.id)}"><span class="cat-arrow">›</span>` +
        `<div class="cat-icon">${c.icon}</div><div class="cat-name">${esc(c.name)}</div>` +
        `<div class="cat-count">${L.length} jenis surat · ${ready ? `<b class="ready">${ready} siap dibuat</b>` : 'template menyusul'}</div></button>`;
    }).join('');
  }
  $('#category-grid').addEventListener('click', (e) => {
    const b = e.target.closest('[data-cat]'); if (!b) return;
    state.category = SK.CATEGORIES.find((c) => c.id === b.dataset.cat);
    Object.assign(state, { letters: [], method: null, active: null, data: {}, issues: {}, results: [] });
    go('letters');
  });

  /* ---------------------------------------------------------------- halaman 2: pilih surat */
  const availableDocs = () => Array.from(new Set(letterList(state.category).filter((l) => l.doc).map((l) => l.doc)));
  const setSelected = (set) => { state.letters = availableDocs().filter((c) => set.has(c)); };
  function updateSelCount() {
    const n = state.letters.length;
    $('#sel-count').innerHTML = `<b>${n}</b> surat dipilih`;
    $('#to-method').disabled = n === 0;
    $('#sel-all').disabled = availableDocs().length === 0;
  }
  function renderLetters() {
    const c = state.category;
    $('#letters-title').textContent = c.icon + ' ' + c.name;
    const L = letterList(c);
    $('#letter-grid').innerHTML = L.map((l) => {
      if (!l.doc) {
        return `<div class="letter-card disabled" aria-disabled="true"><input type="checkbox" disabled aria-label="${esc(l.name)} (template menyusul)">` +
          `<div class="ln">${esc(l.name)}</div><div class="ld">${esc(l.desc)}</div><span class="badge-soon">Template menyusul</span></div>`;
      }
      const on = state.letters.includes(l.doc);
      return `<label class="letter-card${on ? ' checked' : ''}"><input type="checkbox" data-doc="${l.doc}"${on ? ' checked' : ''}>` +
        `<div class="ln">${esc(l.name)}</div><div class="ld">${esc(l.desc)}</div></label>`;
    }).join('');
    const soon = L.filter((l) => !l.doc).length, note = $('#letters-note');
    note.hidden = !soon;
    note.textContent = soon === L.length
      ? 'Template Word untuk kategori ini belum tersedia, jadi belum ada surat yang bisa dibuat. Surat akan bisa dipilih setelah templatenya ditambahkan.'
      : 'Surat bertanda "Template menyusul" belum bisa dibuat karena template Word-nya belum ada.';
    updateSelCount();
  }
  $('#letter-grid').addEventListener('change', (e) => {
    const code = e.target.dataset && e.target.dataset.doc; if (!code) return;
    const set = new Set(state.letters); e.target.checked ? set.add(code) : set.delete(code);
    setSelected(set);
    e.target.closest('.letter-card').classList.toggle('checked', e.target.checked);
    updateSelCount();
  });
  $('#sel-all').addEventListener('click', () => {
    const all = availableDocs();
    setSelected(new Set(state.letters.length === all.length ? [] : all)); renderLetters();
  });
  $('#sel-none').addEventListener('click', () => { state.letters = []; renderLetters(); });
  $('#to-method').addEventListener('click', () => go('method'));

  /* ---------------------------------------------------------------- halaman 3: cara isi */
  function renderMethod() {
    $('#method-chips').innerHTML = state.letters.map((c) =>
      `<span class="chip">📄 ${esc(docOf(c).name)} <button type="button" class="rm" data-rm="${c}" aria-label="Hapus ${esc(docOf(c).name)} dari pilihan">✕</button></span>`).join('');
  }
  $('#method-chips').addEventListener('click', (e) => {
    const b = e.target.closest('[data-rm]'); if (!b) return;
    state.letters = state.letters.filter((c) => c !== b.dataset.rm);
    if (!state.letters.length) go('letters'); else renderMethod();
  });
  $('.method-grid').addEventListener('click', (e) => {
    const b = e.target.closest('[data-method]'); if (!b) return;
    state.method = b.dataset.method; go('form');
  });

  /* ====================================================================== data isian per surat */
  const defaultOf = (f) => (f.default ? (typeof f.default === 'function' ? f.default(settings) : f.default) : '');
  const fieldOf = (code, key) => docOf(code).fields.find((f) => f.key === key);

  function ensure(code) {
    if (!state.data[code]) state.data[code] = { form: {}, auto: {}, touched: {} };
    const D = state.data[code];
    docOf(code).fields.forEach((f) => {
      if (f.key in D.form) return;
      if (f.kind === 'list' || f.kind === 'table') D.form[f.key] = [];
      else { D.form[f.key] = defaultOf(f); D.auto[f.key] = !!f.default; }
    });
    return D;
  }
  /* Nilai bawaan dari Data kantor ikut berubah bila isian itu belum diubah sendiri (atau dikosongkan). */
  function refreshDefaults() {
    Object.keys(state.data).forEach((code) => {
      const D = state.data[code];
      docOf(code).fields.forEach((f) => {
        if (f.kind === 'list' || f.kind === 'table' || !f.default) return;
        if (D.auto[f.key] || D.form[f.key] === '') { D.form[f.key] = defaultOf(f); D.auto[f.key] = true; }
      });
    });
  }
  /* Isian bernama `share` yang sama di beberapa surat ikut terisi selama belum diketik sendiri di surat itu. */
  function propagate(code, f) {
    if (!f.share) return;
    const v = state.data[code].form[f.key];
    state.letters.forEach((o) => {
      if (o === code) return;
      const f2 = docOf(o).fields.find((x) => x.share === f.share); if (!f2) return;
      const D2 = ensure(o); if (!D2.touched[f2.key]) D2.form[f2.key] = v;
    });
  }
  function syncShared() {
    state.letters.forEach((c) => {
      const D = ensure(c);
      docOf(c).fields.forEach((f) => {
        if (!f.share || D.touched[f.key] || !isBlankRaw(D.form[f.key])) return;
        for (const o of state.letters) {
          if (o === c) continue;
          const f2 = docOf(o).fields.find((x) => x.share === f.share);
          const v = f2 && state.data[o] && state.data[o].form[f2.key];
          if (v) { D.form[f.key] = v; break; }
        }
      });
    });
  }
  function formRaw(code) {
    const D = ensure(code), raw = {};
    docOf(code).fields.forEach((f) => { raw[f.key] = f.kind === 'list' ? D.form[f.key].slice() : f.kind === 'table' ? D.form[f.key].map((r) => Object.assign({}, r)) : D.form[f.key]; });
    return raw;
  }
  /* ====================================================================== halaman 4: isi data */
  const MODE_LABEL = { form: 'Satu surat — isi lewat formulir', excel: 'Banyak surat — dari workbook Excel', sheets: 'Banyak surat — dari Google Sheets' };

  function renderTabs() {
    $('#form-tabs').innerHTML = state.letters.map((c) =>
      `<button type="button" class="tab${c === state.active ? ' active' : ''}${state.issues[c] ? ' has-error' : ''}" role="tab" aria-selected="${c === state.active}" data-tab="${c}">${esc(docOf(c).name)}${state.issues[c] ? '<span class="sr-only"> (ada yang perlu diperbaiki)</span>' : ''}</button>`).join('');
  }
  $('#form-tabs').addEventListener('click', (e) => {
    const b = e.target.closest('[data-tab]'); if (!b || b.dataset.tab === state.active) return;
    state.active = b.dataset.tab; renderForm();
  });

  function renderForm() {
    $('#form-mode-label').textContent = `· ${MODE_LABEL[state.method]} · ${state.letters.length} surat dipilih`;
    $('#form-tabs').hidden = state.method !== 'form';
    if (state.method !== 'form') { renderWorkbook(); return; }
    if (!state.letters.includes(state.active)) state.active = state.letters[0];
    const code = state.active, d = docOf(code); ensure(code);
    renderTabs();
    $('#form-body').innerHTML = (d.desc ? `<p class="doc-desc">${esc(d.desc)}</p>` : '') + '<div id="fields-host"></div>';
    renderFields(code, $('#fields-host'));
  }

  /* ---------------------------------------------------------------- kolom isian */
  const exampleOf = (f) => { const x = Array.isArray(f.example) ? f.example[0] : f.example; return x !== undefined && x !== null && x !== '' ? 'Contoh: ' + x : ''; };
  const listBox = (f) => $('#f-' + f.key);

  function renumber(f) {
    $$('.list-row', listBox(f)).forEach((row, i) => {
      $('.n', row).textContent = (i + 1) + '.';
      $('textarea', row).setAttribute('aria-label', `${f.itemLabel || 'Butir'} ${i + 1}`);
    });
  }
  function addListRow(f, text, focus) {
    const row = document.createElement('div'); row.className = 'list-row';
    row.innerHTML = `<span class="n"></span><textarea class="inp" rows="2" placeholder="${esc(exampleOf(f))}"></textarea>` +
      '<div class="list-btns"><button type="button" class="btn-mini up" title="Geser ke atas" aria-label="Geser ke atas">&uarr;</button>' +
      '<button type="button" class="btn-mini down" title="Geser ke bawah" aria-label="Geser ke bawah">&darr;</button>' +
      '<button type="button" class="btn-mini rm" title="Hapus butir ini" aria-label="Hapus butir ini">&times;</button></div>';
    $('textarea', row).value = text || '';
    $('.list-rows', listBox(f)).appendChild(row);
    renumber(f);
    if (focus) $('textarea', row).focus();
  }
  function setListDom(f, arr) {
    $('.list-rows', listBox(f)).innerHTML = '';
    const items = (arr && arr.length) ? arr : (f.required ? [''] : []);
    items.forEach((t) => addListRow(f, t));
  }
  const getListDom = (f) => $$('textarea', listBox(f)).map((t) => t.value);
  /* ---- isian bertabel (mis. daftar instruktur/peserta SK) ---- */
  const tableBox = (f) => $('#f-' + f.key);
  function addTableRow(f, row, focus) {
    const tr = document.createElement('tr'), n = $$('tbody tr', tableBox(f)).length + 1;
    tr.innerHTML = f.columns.map((c) => `<td><input class="inp" type="text" data-col="${c.key}" aria-label="${esc(c.label)}, baris ${n}" autocomplete="off"></td>`).join('') +
      '<td class="gt-x"><button type="button" class="btn-mini rm gt-rm" title="Hapus baris ini" aria-label="Hapus baris ini">&times;</button></td>';
    f.columns.forEach((c) => { $(`[data-col="${c.key}"]`, tr).value = row && row[c.key] != null ? row[c.key] : ''; });
    $('tbody', tableBox(f)).appendChild(tr);
    if (focus) $('input', tr).focus();
  }
  function setTableDom(f, arr) {
    $('tbody', tableBox(f)).innerHTML = '';
    const items = (arr && arr.length) ? arr : (f.required ? [{}] : []);
    items.forEach((r) => addTableRow(f, r));
  }
  const getTableDom = (f) => $$('tbody tr', tableBox(f)).map((tr) => { const o = {}; $$('[data-col]', tr).forEach((i) => { o[i.dataset.col] = i.value; }); return o; });
  function renumberTable(f) { $$('tbody tr', tableBox(f)).forEach((tr, i) => $$('[data-col]', tr).forEach((inp) => { inp.setAttribute('aria-label', `${f.columns.find((c) => c.key === inp.dataset.col).label}, baris ${i + 1}`); })); }

  function setValueDom(f, v) { const el = $('#f-' + f.key); if (el) el.value = v == null ? '' : v; }

  function renderFields(code, host) {
    const d = docOf(code), D = ensure(code);
    host.innerHTML = '';
    if (d.fields.some((f) => f.preset)) host.appendChild(presetBar(code));
    let group = null, grid = null;
    d.fields.forEach((f) => {
      if (f.group !== group) {
        group = f.group;
        const g = document.createElement('div'); g.className = 'fgroup';
        const note = d.groupNotes && d.groupNotes[group];
        g.innerHTML = `<div class="fgroup-title">${esc(group)}</div>${note ? `<div class="hint gnote">${esc(note)}</div>` : ''}<div class="fgrid"></div>`;
        host.appendChild(g); grid = $('.fgrid', g);
      }
      const id = 'f-' + f.key;
      const wrap = document.createElement('div');
      wrap.className = 'field' + (f.kind === 'textarea' || f.kind === 'list' || f.kind === 'table' ? ' full' : '');
      const star = f.required && !f.default ? ' <span class="req" title="wajib">*</span>' : '';
      let input;
      if (f.kind === 'list') input = `<div class="list" id="${id}" data-key="${f.key}" role="group" aria-labelledby="lbl-${f.key}"><div class="list-rows"></div><button type="button" class="btn-add list-add">+ ${esc(f.addLabel || 'Tambah butir')}</button></div>`;
      else if (f.kind === 'table') input = `<div class="gtable" id="${id}" data-key="${f.key}" role="group" aria-labelledby="lbl-${f.key}"><div class="gt-scroll"><table><thead><tr>${f.columns.map((c) => `<th>${esc(c.label)}${c.required ? ' <span class="req">*</span>' : ''}</th>`).join('')}<th></th></tr></thead><tbody></tbody></table></div><button type="button" class="btn-add gt-add">+ ${esc(f.addLabel || 'Tambah baris')}</button></div>`;
      else if (f.kind === 'textarea') input = `<textarea class="inp" id="${id}" data-key="${f.key}" placeholder="${esc(exampleOf(f))}"></textarea>`;
      else if (f.kind === 'date') input = `<input type="date" class="inp" id="${id}" data-key="${f.key}">`;
      else if (f.kind === 'number') input = `<input type="number" min="0" step="1" class="inp" id="${id}" data-key="${f.key}" placeholder="${esc(exampleOf(f))}">`;
      else input = `<input type="text" class="inp" id="${id}" data-key="${f.key}" autocomplete="off" placeholder="${esc(exampleOf(f))}">`;
      const grouped = f.kind === 'list' || f.kind === 'table';
      const label = grouped ? `<div class="lbl" id="lbl-${f.key}">` : `<label for="${id}">`;
      wrap.innerHTML = `${label}${esc(f.label)}${star}${grouped ? '</div>' : '</label>'}${input}${f.help ? `<div class="hint">${esc(f.help)}</div>` : ''}`;
      grid.appendChild(wrap);
      if (f.kind === 'list') setListDom(f, D.form[f.key]); else if (f.kind === 'table') setTableDom(f, D.form[f.key]); else setValueDom(f, D.form[f.key]);
    });
  }

  /* beri tanda merah pada kolom yang salah, lalu pindahkan kursor ke yang pertama */
  function markInvalid(keys) {
    $$('#form-body [aria-invalid]').forEach((el) => el.removeAttribute('aria-invalid'));
    (keys || []).forEach((k) => { const el = $('#f-' + k); if (el) el.setAttribute('aria-invalid', 'true'); });
    const first = (keys || []).map((k) => $('#f-' + k)).find(Boolean);
    if (first) { (first.matches('.list, .gtable') ? $('textarea, input', first) || first : first).focus({ preventScroll: true }); first.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
  }

  /* ---------------------------------------------------------------- isian kegiatan tersimpan (preset) */
  const PKEY = 'suratku.presets.v1';
  const loadUserPresets = (code) => lsJson(PKEY)[code] || {};
  function saveUserPresets(code, map) { const all = lsJson(PKEY); all[code] = map; return lsSet(PKEY, JSON.stringify(all)); }
  function applyPreset(code, values) {
    const D = ensure(code);
    docOf(code).fields.filter((f) => f.preset).forEach((f) => {
      if (!(f.key in values)) return;
      if (f.kind === 'list') { D.form[f.key] = SK.toList(values[f.key]); setListDom(f, D.form[f.key]); }
      else { D.form[f.key] = values[f.key] == null ? '' : String(values[f.key]); setValueDom(f, D.form[f.key]); }
      D.auto[f.key] = false; D.touched[f.key] = true; propagate(code, f);
    });
  }
  function presetBar(code) {
    const d = docOf(code);
    const box = document.createElement('div'); box.className = 'presets';
    box.innerHTML = `<div class="fgroup-title">Isian kegiatan tersimpan</div>
      <p class="muted">Pilih untuk mengisi nama kegiatan, hasil, satuan, dan uraian tugas sekaligus. Tersimpan di browser ini saja.</p>
      <div class="row"><select class="inp" id="preset-sel" aria-label="Pilih isian kegiatan"></select>
        <button type="button" class="btn-ghost" id="preset-del">Hapus</button></div>
      <div class="row"><input type="text" class="inp" id="preset-name" placeholder="Nama untuk isian ini, mis. Sensus Pertanian - Pendataan" aria-label="Nama isian kegiatan">
        <button type="button" class="btn-ghost" id="preset-save">Simpan isian kegiatan saat ini</button>
        <span class="muted" id="preset-msg" aria-live="polite"></span></div>`;
    const sel = $('#preset-sel', box), msg = $('#preset-msg', box), del = $('#preset-del', box);
    function fill(selectKey) {
      const user = loadUserPresets(code);
      sel.innerHTML = '<option value="">- pilih -</option>' +
        (d.presets || []).map((p, i) => `<option value="b:${i}">${esc(p.name)}</option>`).join('') +
        Object.keys(user).sort().map((n) => `<option value="u:${esc(n)}">${esc(n)}</option>`).join('');
      sel.value = selectKey || ''; del.disabled = !sel.value.startsWith('u:');
    }
    sel.addEventListener('change', () => {
      del.disabled = !sel.value.startsWith('u:');
      if (!sel.value) return;
      const kind = sel.value.slice(0, 1), rest = sel.value.slice(2);
      const p = kind === 'b' ? d.presets[+rest] : { values: loadUserPresets(code)[rest] };
      if (p && p.values) { applyPreset(code, p.values); msg.textContent = 'Terisi. Periksa lagi sebelum membuat dokumen.'; }
    });
    del.addEventListener('click', () => {
      if (!sel.value.startsWith('u:')) return;
      const user = loadUserPresets(code); delete user[sel.value.slice(2)];
      saveUserPresets(code, user); fill(''); msg.textContent = 'Dihapus.';
    });
    $('#preset-save', box).addEventListener('click', () => {
      const name = $('#preset-name', box).value.trim();
      if (!name) { msg.textContent = 'Isi nama dulu.'; $('#preset-name', box).focus(); return; }
      const raw = formRaw(code), values = {};
      d.fields.filter((f) => f.preset).forEach((f) => { values[f.key] = f.kind === 'list' ? SK.toList(raw[f.key]) : raw[f.key]; });
      const user = loadUserPresets(code); user[name] = values;
      msg.textContent = saveUserPresets(code, user) ? 'Tersimpan di browser ini.' : 'Browser tidak mengizinkan penyimpanan.';
      fill('u:' + name);
    });
    fill('');
    return box;
  }

  /* ---------------------------------------------------------------- penanganan kejadian di #form-body */
  const bodyEl = $('#form-body');
  bodyEl.addEventListener('input', (e) => {
    const el = e.target;
    if (el.closest('.presets')) return; // memilih/menamai isian tersimpan bukan perubahan isi formulir
    if (el.id === 'wb-url') { state.wb.url = el.value; return; }
    if (state.method !== 'form') return;
    const lst = el.closest('.list, .gtable');
    const key = el.dataset.key || (lst && lst.dataset.key);
    if (!key) return;
    const code = state.active, f = fieldOf(code, key); if (!f) return;
    const D = ensure(code);
    D.form[key] = f.kind === 'list' ? getListDom(f) : f.kind === 'table' ? getTableDom(f) : el.value;
    D.auto[key] = false; D.touched[key] = true;
    el.removeAttribute('aria-invalid'); if (lst) lst.removeAttribute('aria-invalid');
    propagate(code, f);
  });
  bodyEl.addEventListener('change', (e) => {
    const el = e.target;
    if (el.id === 'wb-file') { const file = el.files[0]; el.value = ''; if (file) loadWorkbookFile(file); return; }
    if (el.matches('[data-no]')) { el.checked ? state.wb.off.delete(el.dataset.no) : state.wb.off.add(el.dataset.no); paintPeople(); }
  });
  bodyEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.id === 'wb-url') { e.preventDefault(); loadWorkbookSheet(); }
  });
  bodyEl.addEventListener('click', (e) => {
    const btn = e.target.closest('button'); if (!btn) return;
    const code = state.active;
    const box = btn.closest('.list');
    if (box) { // daftar butir: tambah / hapus / geser
      const f = fieldOf(code, box.dataset.key), row = btn.closest('.list-row');
      if (btn.classList.contains('list-add')) addListRow(f, '', true);
      else if (btn.classList.contains('rm')) { row.remove(); renumber(f); $('.list-add', box).focus(); }
      else if (btn.classList.contains('up') && row.previousElementSibling) row.parentNode.insertBefore(row, row.previousElementSibling);
      else if (btn.classList.contains('down') && row.nextElementSibling) row.parentNode.insertBefore(row.nextElementSibling, row);
      else return;
      renumber(f);
      const D = ensure(code); D.form[f.key] = getListDom(f); D.touched[f.key] = true; D.auto[f.key] = false;
      box.removeAttribute('aria-invalid'); propagate(code, f);
      return;
    }
    const tbox = btn.closest('.gtable');
    if (tbox) { // tabel isian: tambah / hapus baris
      const f = fieldOf(code, tbox.dataset.key);
      if (btn.classList.contains('gt-add')) addTableRow(f, null, true);
      else if (btn.classList.contains('gt-rm')) { btn.closest('tr').remove(); renumberTable(f); $('.gt-add', tbox).focus(); }
      else return;
      const D = ensure(code); D.form[f.key] = getTableDom(f); D.touched[f.key] = true; D.auto[f.key] = false;
      tbox.removeAttribute('aria-invalid');
      return;
    }
    if (btn.id === 'wb-template') downloadWbTemplate();
    else if (btn.id === 'wb-pick') $('#wb-file').click();
    else if (btn.id === 'wb-load') loadWorkbookSheet();
    else if (btn.id === 'wb-all') { state.wb.off.clear(); paintPeople(); }
    else if (btn.id === 'wb-none') { SK.wb.peopleOf(state.wb.book, state.letters.map(docOf)).forEach((p) => state.wb.off.add(p.no)); paintPeople(); }
  });
  $('#to-review').addEventListener('click', () => go('review'));

  /* ====================================================================== mode workbook (Excel / Google Sheets) */
  const URLKEY = 'suratku.sheeturl.v1';
  const wbDocs = () => state.letters.map(docOf);

  function wbPanelHtml() {
    const isX = state.method === 'excel', tabs = SK.wb.neededTabs(wbDocs());
    const intro = `<div class="note-box">📎 Satu ${isX ? 'file Excel' : 'Google Sheets'} = data <b>satu kegiatan</b> untuk semua surat yang dipilih. Tab yang dibaca: ${tabs.map((t) => `<b>${esc(t)}</b>`).join(', ')}. ` +
      'Tab <b>Petugas</b> = daftar orang (satu baris = satu surat per orang). Nilai di tab <b>Kegiatan</b> dipakai semua surat; baris ke-2 tab tiap surat berlaku untuk semua orang, dan kolom di tab <b>Petugas</b> menimpanya. Daftar/tabel dalam satu surat ditulis di bawah header berawalan <b>#</b>. ' +
      'Honor: golongan III dipotong PPh 21 5%, IV 15%, II bebas; mitra/petugas (golongan kosong atau "-") bebas pajak. ' +
      'Format kolom NIK/NIP sebagai <b>Teks</b> agar angkanya tidak terpotong.</div>';
    const src = isX
      ? '<button type="button" class="btn btn-primary" id="wb-pick">Unggah workbook .xlsx</button><input type="file" id="wb-file" accept=".xlsx" hidden>'
      : `<div class="field full"><label for="wb-url">Link Google Sheets</label><input class="inp" type="url" id="wb-url" placeholder="https://docs.google.com/spreadsheets/d/…" autocomplete="off" value="${esc(state.wb.url)}">` +
        '<div class="hint">Bagikan dulu: Bagikan &gt; "Siapa saja yang memiliki link" &gt; Pelihat. Nama tab harus sama seperti di template. Klik "Ambil data" lagi setelah mengubah isi sheet.</div></div>' +
        '<button type="button" class="btn btn-primary" id="wb-load">Ambil data</button>';
    return intro + `<div class="actions wb-actions">${src}<button type="button" class="btn btn-outline" id="wb-template">⬇ Unduh template workbook</button></div><div id="wb-status"></div>`;
  }
  function renderWorkbook() {
    $('#form-body').innerHTML = wbPanelHtml();
    paintWb();
  }
  function paintWb() {
    const host = $('#wb-status'); if (!host) return;
    const w = state.wb, isX = state.method === 'excel';
    if (w.busy) { host.innerHTML = `<p class="muted">${isX ? 'Membaca ' + esc(w.fileName) : 'Memuat data dari Google'}...</p>`; return; }
    if (w.info && w.info.err) { host.innerHTML = `<div class="errors">${esc(w.info.text)}</div>`; return; }
    if (!w.book) { host.innerHTML = ''; return; }
    const docs = wbDocs(), st = SK.wb.tabStatus(w.book, docs), fill = SK.wb.kantorFill(w.book, settings);
    const rows = st.map((t) => `<tr><td>${t.found ? '<span class="tag-pill ok">ada</span>' : t.optional ? '<span class="tag-pill warn">tidak ada</span>' : '<span class="tag-pill bad">tidak ada</span>'}</td><td>${esc(t.name)}</td><td>${t.found ? t.count + ' ' + t.unit : esc(t.error || '')}</td></tr>`).join('');
    const keg = SK.wb.kegiatanList(w.book);
    host.innerHTML = `<p class="status-ok">✓ ${isX ? esc(w.fileName) : 'Google Sheets'} dibaca.</p>` +
      `<div class="sheetrows"><table class="rows-table"><thead><tr><th>Tab</th><th>Nama</th><th>Isi</th></tr></thead><tbody>${rows}</tbody></table></div>` +
      (fill.notes.length ? `<div class="note-box">${fill.notes.map(esc).join('<br>')}</div>` : '') +
      (keg.length ? `<details class="shared"><summary>Isi tab Kegiatan (${keg.length} variabel)</summary><div class="sheetrows"><table class="rows-table"><tbody>${keg.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join('')}</tbody></table></div></details>` : '') +
      '<div id="wb-people"></div>';
    paintPeople();
  }
  /* daftar orang di tab surat: hilangkan centang untuk orang yang tidak perlu dibuatkan surat */
  function paintPeople() {
    const host = $('#wb-people'); if (!host || !state.wb.book) return;
    const people = SK.wb.peopleOf(state.wb.book, wbDocs());
    if (!people.length) { host.innerHTML = ''; return; }
    const off = state.wb.off, n = people.filter((p) => !off.has(p.no)).length;
    host.innerHTML = '<div class="caps">SIAPA YANG DIBUATKAN SURAT</div>' +
      '<div class="sel-toolbar"><button type="button" class="btn-ghost" id="wb-all">☑ Pilih semua</button><button type="button" class="btn-ghost" id="wb-none">Hapus pilihan</button>' +
      `<span class="sel-count" aria-live="polite">${n} dari ${people.length} orang dipilih</span></div>` +
      `<div class="people">${people.map((p) => `<label class="person"><input type="checkbox" data-no="${esc(p.no)}"${off.has(p.no) ? '' : ' checked'}> <span class="pn">${esc(p.no)}</span> ${esc(p.nama)}</label>`).join('')}</div>`;
  }

  async function loadWorkbookFile(file) {
    const w = state.wb; w.busy = true; w.info = null; w.fileName = file.name; paintWb();
    try { w.book = await SK.wb.fromXlsx(file); w.off = new Set(); }
    catch (err) { w.book = null; w.info = { text: err.message, err: true }; }
    w.busy = false; paintWb();
  }
  async function loadWorkbookSheet() {
    const w = state.wb; if (w.busy) return;
    const url = String(w.url || '').trim();
    w.busy = true; w.info = null; paintWb();
    try {
      w.book = await SK.wb.fromSheets(url, SK.wb.neededTabs(wbDocs()));
      lsSet(URLKEY, url);
    } catch (err) { w.book = null; w.info = { text: err.message, err: true }; }
    w.busy = false; paintWb();
  }
  async function downloadWbTemplate() {
    try {
      const res = await fetch('templates/workbook.xlsx', { cache: 'no-cache' });
      if (!res.ok) throw new Error('templates/workbook.xlsx tidak ditemukan (HTTP ' + res.status + ')');
      SK.gen.download(await res.blob(), 'Template Workbook Kegiatan.xlsx');
    } catch (err) { toast('Gagal mengunduh template: ' + err.message); }
  }

  /* ====================================================================== halaman 5: periksa & buat */
  /* Satu hasil pemeriksaan per jenis surat: { items: [{ line, values, errors, keys, warnings }], problem, ... } */
  function evaluate(code) {
    const d = docOf(code), res = { code, d, items: [], unknown: [], problem: '', settingKeys: [], formKeys: [], bulk: state.method !== 'form' };
    if (!res.bulk) {
      const r = SK.validate(d, formRaw(code), settings);
      res.items.push({ line: null, values: r.values, errors: r.errors, keys: r.keys, warnings: [] });
      res.settingKeys = r.settingKeys; res.formKeys = r.keys;
      return res;
    }
    const w = state.wb;
    if (!w.book) { res.problem = w.info && w.info.err ? 'Workbook belum bisa dibaca: ' + w.info.text : state.method === 'excel' ? 'Belum ada workbook. Unggah file .xlsx di halaman data.' : 'Data Google Sheets belum dimuat. Tempel link lalu klik "Ambil data" di halaman data.'; return res; }
    const st = activeSettings(), src = SK.wb.rowsFor(d, w.book, { off: w.off, settings: st });
    if (src.problem) { res.problem = src.problem; return res; }
    if (src.rows.length > SK.wb.MAX_ROWS) { res.problem = `Terlalu banyak baris (${src.rows.length}).`; return res; }
    res.unknown = src.unknown || [];
    src.rows.forEach((r) => {
      const v = r.pre ? { values: {}, errors: [], keys: [], settingKeys: [] } : SK.validate(d, r.raw, st);
      const errors = r.errors.concat(r.errors.length ? v.errors.filter((e) => !/^Tanggal (mulai|selesai)/.test(e)) : v.errors);
      res.items.push({ line: r.line, values: v.values, errors, keys: v.keys, warnings: r.warnings.slice() });
      v.settingKeys.forEach((k) => { if (!res.settingKeys.includes(k)) res.settingKeys.push(k); });
    });
    const seen = {};
    res.items.forEach((it) => { const n = it.values.nomor || it.values.nomor_sk; if (n) (seen[n] = seen[n] || []).push(it); });
    Object.values(seen).forEach((arr) => { if (arr.length > 1) arr.forEach((it) => it.warnings.push('Nomor dobel di daftar ini.')); });
    return res;
  }

  function rowsTable(r) {
    const rank = (it) => (it.errors.length ? 0 : it.warnings.length ? 1 : 2);
    const sorted = r.items.slice().sort((a, b) => rank(a) - rank(b) || a.line - b.line);
    const CAP = 40, shown = sorted.slice(0, CAP);
    const trs = shown.map((it) => {
      const tag = it.errors.length ? '<span class="tag-pill bad">Galat</span>' : it.warnings.length ? '<span class="tag-pill warn">Periksa</span>' : '<span class="tag-pill ok">OK</span>';
      const msgs = [...it.errors, ...it.warnings].map(esc).join('<br>');
      const sum = it.errors.length ? '' : esc(r.d.summary(it.values));
      const see = it.errors.length ? '' : `<div><button type="button" class="btn btn-outline btn-sm" data-pv="${r.code}:${it.line}">Lihat surat</button></div>`;
      return `<tr><td>${it.line}</td><td>${tag}</td><td>${sum}${msgs ? `<div class="muted">${msgs}</div>` : ''}${see}</td></tr>`;
    }).join('');
    return `<div class="sheetrows"><table class="rows-table"><thead><tr><th>Baris di tab</th><th>Status</th><th>Surat / catatan</th></tr></thead><tbody>${trs}</tbody></table></div>` +
      (sorted.length > CAP ? `<p class="muted">… dan ${sorted.length - CAP} baris lain (yang bermasalah ditampilkan lebih dulu).</p>` : '');
  }
  function issueGroup(r) {
    const nOk = r.ok.length, nBad = r.items.length - nOk;
    let pills;
    if (r.problem) pills = '<span class="tag-pill bad">Belum ada data</span>';
    else if (!r.bulk) pills = nBad ? `<span class="tag-pill bad">${r.items[0].errors.length} masalah</span>` : '<span class="tag-pill ok">OK</span>';
    else pills = (nOk ? `<span class="tag-pill ok">${nOk} OK</span>` : '') + (nBad ? ` <span class="tag-pill bad">${nBad} galat</span>` : '');
    let bodyHtml = '';
    if (r.problem) bodyHtml = `<div class="val-item">⚠ ${esc(r.problem)}</div>`;
    else if (!r.bulk) bodyHtml = r.items[0].errors.map((e) => `<div class="val-item">⚠ ${esc(e)}</div>`).join('');
    else bodyHtml = rowsTable(r) + (r.unknown.length ? `<div class="note-box" style="margin:10px 0 0">Kolom ini tidak dikenali / tidak dipakai: ${r.unknown.map(esc).join(', ')}</div>` : '');
    const acts = [];
    if (r.nbad) acts.push(`<button type="button" class="btn btn-outline btn-sm" data-fix="${r.code}">‹ ${r.bulk ? 'Kembali ke halaman data' : 'Perbaiki di isian'}</button>`);
    if (r.settingKeys.length) acts.push(`<button type="button" class="btn btn-outline btn-sm" data-kantor="${esc(r.settingKeys[0])}">⚙️ Buka Data kantor</button>`);
    return `<div class="issue-group"><div class="issue-head">📄 ${esc(r.d.name)} ${pills}</div>${bodyHtml}` +
      (acts.length ? `<div class="issue-actions">${acts.join('')}</div>` : '') + '</div>';
  }

  function renderReview(keepScroll) {
    const results = state.letters.map(evaluate);
    state.results = results; state.issues = {};
    let files = 0, probs = 0;
    results.forEach((r) => {
      r.ok = r.items.filter((i) => !i.errors.length);
      r.nbad = r.items.length - r.ok.length + (r.problem ? 1 : 0);
      files += r.ok.length; probs += r.nbad;
      if (r.nbad) state.issues[r.code] = { keys: r.formKeys };
    });
    const bulk = state.method !== 'form';
    const sum = $('#val-summary');
    if (!probs) { sum.className = 'val-ok'; sum.textContent = `✓ Semua isian benar — ${files} surat siap dibuat${results.length > 1 ? ` (${results.length} jenis surat)` : ''}`; }
    else { sum.className = 'val-ok bad'; sum.textContent = `⚠ ${probs} bagian perlu diperbaiki${files ? ` · ${files} surat sudah benar` : ''}`; }
    $('#val-issues').innerHTML = (results.length > 1 || probs || bulk) ? results.map(issueGroup).join('') : '';
    const note = $('#val-note');
    note.hidden = !probs;
    note.textContent = bulk
      ? 'Baris galat tidak ikut dibuat. Perbaiki di workbook lalu unggah / ambil ulang, atau lanjut hanya dengan surat yang sudah benar.'
      : 'Kolom yang salah akan ditandai merah saat Anda kembali ke halaman isian.';

    const cap = results.length > 1 ? 4 : 10; let shown = 0, hidden = 0, list = '';
    results.forEach((r) => {
      r.ok.forEach((it, i) => {
        if (i < cap) { shown++; list += `<div class="file-item"><span class="doc">📄</span><span class="fname">${esc(SK.gen.safeName(r.d.filename(it.values)))}.docx</span><span class="fstat">.docx</span></div>`; }
        else hidden++;
      });
    });
    $('#file-list').innerHTML = list + (hidden ? `<p class="file-more">… dan ${hidden} file lain</p>` : '') + (!files ? '<p class="muted">Belum ada surat yang siap dibuat.</p>' : '');
    const btn = $('#btn-generate'), btn2 = $('#btn-generate-valid');
    btn.textContent = files > 1 ? `⬇ Buat ${files} surat (.zip)` : '⬇ Buat surat (.docx)';
    btn.disabled = probs > 0 || files === 0;
    btn2.hidden = !(probs > 0 && files > 0);
    btn2.textContent = `Buat hanya yang sudah benar (${files} surat)`;
    $('#gen-msg').textContent = ''; $('#gen-msg').className = 'gen-msg';
    paintPreview(keepScroll);
  }
  $('#val-issues').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.fix) { state.active = b.dataset.fix; const keys = (state.issues[b.dataset.fix] || {}).keys; go('form'); markInvalid(keys); }
    else if (b.dataset.kantor) openKantor(b.dataset.kantor);
    else if (b.dataset.pv) { const [code, line] = b.dataset.pv.split(':'); openBulkPreview(code, +line); }
  });
  $('#review-back').addEventListener('click', () => {
    const first = state.letters.find((c) => state.issues[c]);
    if (first) state.active = first;
    go('form'); if (first) markInvalid(state.issues[first].keys);
  });

  /* ---------------------------------------------------------------- pratinjau surat (js/preview.js)
     Mode Satu surat: pratinjau di halaman 3; nilai berwarna kuning bisa diklik dan diubah di tempat (isian di formulir ikut berubah).
     Mode Excel/Sheets: tombol "Lihat surat" pada tiap baris OK membuka jendela pratinjau (hanya dibaca). */
  const pvFail = (err) => 'Pratinjau halaman tidak bisa ditampilkan (' + err.message + '). File tetap bisa dibuat.';
  function closePop() { const p = $('#pv-pop'); if (p) { p.hidden = true; p.innerHTML = ''; } }
  function paintPreview(keepScroll) {
    closePop();
    const card = $('#pv-card'), box = $('#pv-box');
    const okRes = state.method === 'form' ? state.results.filter((r) => r.ok.length) : [];
    card.hidden = !okRes.length;
    if (!okRes.length) { box.textContent = ''; return; }
    if (!okRes.some((r) => r.code === state.pvCode)) state.pvCode = okRes[0].code;
    const tabs = $('#pv-tabs'); tabs.hidden = okRes.length < 2;
    tabs.innerHTML = okRes.map((r) => `<button type="button" class="tab${r.code === state.pvCode ? ' active' : ''}" role="tab" aria-selected="${r.code === state.pvCode}" data-pv-tab="${r.code}">${esc(r.d.name)}</button>`).join('');
    const r = okRes.find((x) => x.code === state.pvCode);
    const keep = keepScroll ? box.scrollTop : 0;
    box.textContent = 'Memuat pratinjau...';
    SK.preview.show(box, r.d, r.ok[0].values, settings, { mark: true })
      .then((done) => { if (done && keep) box.scrollTop = keep; })
      .catch((err) => { box.textContent = pvFail(err); });
    const z = $('#pv-zoom'); z.textContent = box._pvActual ? 'Pas lebar' : 'Ukuran asli'; z.setAttribute('aria-pressed', !!box._pvActual);
  }
  /* ubah satu nilai langsung di pratinjau: kotak kecil di bawah bagian yang diklik */
  function openPop(mk) {
    const [t, key] = mk.dataset.k.split(':'), pop = $('#pv-pop'), code = state.pvCode;
    if (t === 's') {
      pop.innerHTML = `<b>${esc(SK.SETTING_LABELS[key] || key)}</b><p class="muted">Ini berasal dari Data kantor, jadi berlaku untuk semua surat.</p>` +
        `<div class="row"><button type="button" class="btn btn-primary btn-sm" data-pop="settings" data-key="${esc(key)}">Ubah di Data kantor</button><button type="button" class="btn btn-outline btn-sm" data-pop="cancel">Tutup</button></div>`;
    } else {
      const f = fieldOf(code, key); if (!f) return;
      const cur = ensure(code).form[key];
      let ctrl;
      if (f.kind === 'list') ctrl = `<textarea class="inp" id="pop-in" rows="5">${esc(cur.join('\n'))}</textarea>`;
      else if (f.kind === 'textarea') ctrl = `<textarea class="inp" id="pop-in" rows="4">${esc(cur)}</textarea>`;
      else ctrl = `<input class="inp" id="pop-in" type="${f.kind === 'date' ? 'date' : f.kind === 'number' ? 'number' : 'text'}"${f.kind === 'number' ? ' min="0" step="1"' : ''} value="${esc(cur)}" autocomplete="off">`;
      pop.innerHTML = `<label for="pop-in">${esc(f.label)}</label>${ctrl}` +
        (f.kind === 'list' ? '<div class="hint">Satu butir per baris.</div>' : f.help ? `<div class="hint">${esc(f.help)}</div>` : '') +
        `<div class="errors" id="pop-err" role="alert" hidden></div><div class="row"><button type="button" class="btn btn-primary btn-sm" data-pop="apply" data-key="${esc(key)}">Terapkan</button><button type="button" class="btn btn-outline btn-sm" data-pop="cancel">Batal</button></div>`;
    }
    pop.hidden = false;
    const wr = pop.parentElement.getBoundingClientRect(), mr = mk.getBoundingClientRect();
    const w = Math.min(380, wr.width); pop.style.width = w + 'px';
    pop.style.left = Math.max(0, Math.min(mr.left - wr.left, wr.width - w)) + 'px';
    pop.style.top = Math.max(0, mr.bottom - wr.top + 6) + 'px';
    const inp = $('#pop-in'); if (inp) { inp.focus(); if (inp.tagName === 'INPUT' && inp.type === 'text') inp.select(); }
  }
  function applyPop(key) {
    const code = state.pvCode, f = fieldOf(code, key), inp = $('#pop-in'), err = $('#pop-err'), D = ensure(code);
    const old = D.form[key];
    D.form[key] = f.kind === 'list' ? inp.value.split(/\r?\n/) : inp.value;
    const r = SK.validate(docOf(code), formRaw(code), settings);
    if (r.errors.length) { // tidak jadi: kembalikan isian lama, tampilkan alasannya di kotak
      D.form[key] = old; err.hidden = false; err.textContent = r.errors.slice(0, 3).join(' ');
      return;
    }
    D.touched[key] = true; D.auto[key] = false; propagate(code, f);
    renderReview(true); // memeriksa ulang semua surat dan menggambar ulang pratinjau
  }
  $('#pv-card').addEventListener('click', (e) => {
    const mk = e.target.closest('mark.pv-var[data-k]');
    if (mk) { openPop(mk); return; }
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.pvTab) { state.pvCode = b.dataset.pvTab; paintPreview(); }
    else if (b.id === 'pv-zoom') { const on = SK.preview.toggleActual($('#pv-box')); b.textContent = on ? 'Pas lebar' : 'Ukuran asli'; b.setAttribute('aria-pressed', on); }
    else if (b.dataset.pop === 'cancel') closePop();
    else if (b.dataset.pop === 'apply') applyPop(b.dataset.key);
    else if (b.dataset.pop === 'settings') { closePop(); openKantor(b.dataset.key); }
  });
  $('#pv-card').addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('mark.pv-var[data-k]')) { e.preventDefault(); openPop(e.target); }
    else if (e.key === 'Escape') closePop();
    else if (e.key === 'Enter' && e.target.id === 'pop-in' && e.target.tagName === 'INPUT') { e.preventDefault(); const b = $('#pv-pop [data-pop=apply]'); if (b) applyPop(b.dataset.key); }
  });

  /* jendela pratinjau untuk mode Excel/Sheets: Sebelumnya/Berikutnya melewati semua surat OK (semua jenis surat) */
  const pvm = $('#pv-modal'); let pvmState = null; // { list: [{ r, it }], pos }
  async function paintBulkPreview() {
    const { list, pos } = pvmState, { r, it } = list[pos];
    $('#pvm-title').textContent = `${r.d.name} · surat ${pos + 1} dari ${list.length}: ${r.d.summary(it.values)}`;
    $('#pvm-prev').disabled = pos === 0; $('#pvm-next').disabled = pos === list.length - 1;
    const box = $('#pvm-box'); $('#pvm-zoom').textContent = box._pvActual ? 'Pas lebar' : 'Ukuran asli';
    const w = $('#pvm-warn'); w.hidden = !it.warnings.length; w.textContent = it.warnings.join(' ');
    box.textContent = 'Memuat pratinjau...';
    try { await SK.preview.show(box, r.d, it.values, activeSettings(), { mark: false }); }
    catch (err) { box.textContent = pvFail(err); }
  }
  function openBulkPreview(code, line) {
    const list = []; state.results.forEach((r) => r.ok.forEach((it) => list.push({ r, it })));
    const pos = list.findIndex((x) => x.r.code === code && x.it.line === line);
    if (pos < 0) return;
    pvmState = { list, pos };
    if (!pvm.open) pvm.showModal();
    return paintBulkPreview();
  }
  $('#pvm-prev').addEventListener('click', () => { if (pvmState && pvmState.pos > 0) { pvmState.pos--; paintBulkPreview(); } });
  $('#pvm-next').addEventListener('click', () => { if (pvmState && pvmState.pos < pvmState.list.length - 1) { pvmState.pos++; paintBulkPreview(); } });
  $('#pvm-zoom').addEventListener('click', () => { const on = SK.preview.toggleActual($('#pvm-box')); $('#pvm-zoom').textContent = on ? 'Pas lebar' : 'Ukuran asli'; });
  $('#pvm-close').addEventListener('click', () => pvm.close());
  pvm.addEventListener('click', (e) => { if (e.target === pvm) pvm.close(); });
  pvm.addEventListener('close', () => { pvmState = null; });

  /* ---------------------------------------------------------------- membuat file */
  let generating = false;
  async function generate(onlyValid) {
    if (generating) return;
    const results = state.results, total = results.reduce((n, r) => n + r.ok.length, 0);
    if (!total || (!onlyValid && results.some((r) => r.nbad))) return;
    generating = true;
    const msg = $('#gen-msg'), b1 = $('#btn-generate'), b2 = $('#btn-generate-valid');
    b1.disabled = b2.disabled = true; msg.className = 'gen-msg';
    const made = [], failed = []; let k = 0;
    for (const r of results) {
      for (const it of r.ok) {
        k++; msg.textContent = `Membuat ${k} dari ${total}...`;
        await tick(); // beri napas ke UI
        try {
          const bytes = await SK.gen.renderDocx(r.d, r.d.build(it.values, activeSettings()));
          made.push({ r, it, bytes, name: SK.gen.safeName(r.d.filename(it.values)) });
        } catch (err) { failed.push(`${r.d.name}${it.line ? ` (baris ${it.line})` : ''}: ${err.message}`); }
      }
    }
    generating = false; b2.disabled = false; b1.disabled = results.some((r) => r.nbad);
    if (!made.length) { msg.className = 'gen-msg bad'; msg.textContent = 'Tidak ada surat yang berhasil dibuat. ' + (failed[0] || ''); return; }
    let outName, isZip = made.length > 1;
    if (!isZip) { outName = made[0].name + '.docx'; SK.gen.download(made[0].bytes, outName, SK.gen.DOCX_MIME); }
    else {
      const zip = new window.PizZip(), multi = new Set(made.map((m) => m.r.code)).size > 1, used = {}, count = {};
      made.forEach((m) => {
        count[m.r.code] = (count[m.r.code] || 0) + 1;
        let base = (multi ? SK.gen.safeName(m.r.d.name) + '/' : '') + String(count[m.r.code]).padStart(3, '0') + ' - ' + m.name;
        if (used[base]) base += ` (${used[base]++ + 1})`; else used[base] = 1;
        zip.file(base + '.docx', m.bytes);
      });
      const dn = new Date(), p2 = (n) => String(n).padStart(2, '0'), stamp = `${dn.getFullYear()}${p2(dn.getMonth() + 1)}${p2(dn.getDate())}-${p2(dn.getHours())}${p2(dn.getMinutes())}`; // waktu setempat
      outName = multi ? `Surat - ${made.length} file - ${stamp}.zip` : `${made[0].r.d.name} - ${made.length} surat - ${stamp}.zip`;
      SK.gen.download(zip.generate({ type: 'blob', compression: 'DEFLATE' }), outName);
    }
    msg.textContent = '';
    showSuccess(made, outName, isZip, failed);
  }
  function showSuccess(made, outName, isZip, failed) {
    $('#success-text').textContent = isZip
      ? `File "${outName}" (${made.length} surat) sudah diunduh, cek folder Unduhan/Downloads. Klik kanan > Extract/Ekstrak, lalu buka tiap file dengan Word dan periksa isinya sebelum dicetak. Untuk PDF: File → Simpan sebagai → PDF.`
      : `File "${outName}" sudah diunduh, cek folder Unduhan/Downloads. Buka dengan Word, periksa isinya, lalu cetak. Untuk PDF: File → Simpan sebagai → PDF.`;
    $('#success-files').innerHTML = made.slice(0, 8).map((m) => `<div class="file-item"><span class="doc">✅</span><span class="fname">${esc(m.name)}.docx</span></div>`).join('') +
      (made.length > 8 ? `<p class="file-more">… dan ${made.length - 8} file lain di dalam zip</p>` : '') +
      (failed.length ? `<div class="errors"><b>${failed.length} surat gagal dibuat:</b><ul style="margin:4px 0 0 18px">${failed.map((f) => `<li>${esc(f)}</li>`).join('')}</ul></div>` : '');
    openModal('modal-success');
  }
  $('#btn-generate').addEventListener('click', () => generate(false));
  $('#btn-generate-valid').addEventListener('click', () => generate(true));
  $('#success-close').addEventListener('click', () => closeModal('modal-success'));
  $('#success-reset').addEventListener('click', () => {
    closeModal('modal-success');
    Object.assign(state, { category: null, letters: [], method: null, active: null, data: {}, wb: newWb(), issues: {}, results: [] });
    go('home');
  });

  /* ====================================================================== mulai */
  renderStrip(); renderCategories(); show('home', false);
  try { history.replaceState({ page: 'home' }, '', location.href); } catch (e) { /* abaikan */ }
  window.SK_DEBUG = { settings: () => settings, state };
})(window.SK);
