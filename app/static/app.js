/* SuratKu — perilaku halaman. Tanpa framework; hanya Tom Select (dropdown) yang dipakai. */
(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  function jget(url) {
    return fetch(url, { credentials: 'same-origin' }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    });
  }
  function jpost(url, body) {
    return fetch(url, {
      method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    }).then(function (r) { return r.json().then(function (j) { return { ok: r.ok, data: j }; }); });
  }

  /* ---------- dropdown "pilih atau ketik sendiri" (golongan, jabatan, peran) ---------- */
  function initFree(sel) {
    if (sel.tomselect) return;
    new TomSelect(sel, {
      create: true, createOnBlur: true, persist: false, allowEmptyOption: true,
      maxOptions: 300, openOnFocus: true, placeholder: sel.dataset.ph || '',
      createFilter: function (v) { return v.trim().length > 0; },
      render: {
        option_create: function (d, esc) { return '<div class="create">Pakai “' + esc(d.input) + '” (baru)</div>'; },
        no_results: function () { return '<div class="no-results" hidden></div>'; }   // opsi "Pakai … (baru)" sudah cukup
      }
    });
  }

  function setFree(row, suffix, value) {
    var el = row.querySelector('select[name$="__' + suffix + '"]');
    if (!el) return;
    value = value || '';
    var ts = el.tomselect;
    if (ts) {
      if (value && !ts.options[value]) ts.addOption({ value: value, text: value });
      ts.setValue(value, true);
    } else { el.value = value; }
  }

  function fillRow(row, p) {
    row.querySelector('[name$="__id"]').value = p.id;
    row.querySelector('[name$="__name"]').value = p.name;
    row.querySelector('[name$="__nip"]').value = p.nip || '';
    setFree(row, 'golongan', p.golongan);
    setFree(row, 'jabatan', p.jabatan);
    setFree(row, 'role', p.role || 'Pegawai');
  }

  /* ---------- pencarian orang di data master ---------- */
  function initPick(sel) {
    if (sel.tomselect) return;
    var row = sel.closest('.person-row');
    new TomSelect(sel, {
      valueField: 'id', labelField: 'label', searchField: ['name', 'nip', 'label'],
      maxOptions: 20, preload: 'focus', placeholder: 'Ketik nama atau NIP…',
      load: function (q, cb) {
        jget('/api/persons/search?q=' + encodeURIComponent(q)).then(cb).catch(function () { cb(); });
      },
      onChange: function (id) {
        if (!id) return;
        var p = this.options[id];
        if (!p) return;
        fillRow(row, p);
        this.clear(true);
      },
      render: {
        no_results: function () {
          return '<div class="no-results">Tidak ada di data master. Ketik nama langsung di kolom Nama di bawah; orang baru akan tersimpan otomatis.</div>';
        }
      }
    });
    // kalau nama diketik ulang, lepaskan hubungan ke data master lama
    var nameInput = row.querySelector('[name$="__name"]');
    nameInput.addEventListener('input', function () { row.querySelector('[name$="__id"]').value = ''; });
  }

  function initRow(row) {
    $$('select.tom-free', row).forEach(initFree);
    $$('select.person-pick', row).forEach(initPick);
  }

  /* ---------- tambah / hapus baris orang ---------- */
  document.addEventListener('click', function (e) {
    var add = e.target.closest('.add-row');
    if (add) {
      var key = add.dataset.key, list = $('#rows-' + key), tpl = $('#tpl-' + key);
      var idxs = $$('.person-row', list).map(function (r) { return +r.dataset.idx; });
      var idx = (idxs.length ? Math.max.apply(null, idxs) : -1) + 1;
      var wrap = document.createElement('div');
      wrap.innerHTML = tpl.innerHTML.replace(/__IDX__/g, idx).trim();
      var row = wrap.firstElementChild;
      list.appendChild(row);
      initRow(row);
      row.querySelector('[name$="__name"]').focus();
      return;
    }
    var rm = e.target.closest('.rm-row');
    if (rm) {
      var r = rm.closest('.person-row'), l = r.parentNode;
      if ($$('.person-row', l).length > 1) { r.remove(); }
      else {
        r.querySelector('[name$="__id"]').value = '';
        r.querySelector('[name$="__name"]').value = '';
        r.querySelector('[name$="__nip"]').value = '';
      }
      return;
    }
    var cp = e.target.closest('[data-copy]');
    if (cp) {
      var src = $(cp.dataset.copy), text = src ? src.textContent.trim() : '';
      var done = function () { var old = cp.textContent; cp.textContent = 'Tersalin ✓'; setTimeout(function () { cp.textContent = old; }, 1500); };
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(text).then(done);
      } else {                                   // alamat http di jaringan kantor bukan "secure context"
        var ta = document.createElement('textarea');
        ta.value = text; document.body.appendChild(ta); ta.select();
        try { document.execCommand('copy'); done(); } catch (err) { /* abaikan */ }
        ta.remove();
      }
    }
  });

  /* ---------- konfirmasi untuk form berbahaya ---------- */
  document.addEventListener('submit', function (e) {
    var msg = e.target.dataset && e.target.dataset.confirm;
    if (msg && !window.confirm(msg)) e.preventDefault();
  });

  /* ---------- blok nomor surat ---------- */
  function initNomor() {
    var form = $('#docform');
    if (!form || form.dataset.hasSeries !== '1') return;
    var code = form.dataset.code;
    var dateEl = form.querySelector('[name=tanggal]');
    var preview = $('#next-preview'), pick = $('#nomor-pick'), manual = $('#nomor-manual');
    var mprev = $('#manual-preview'), msg = $('#reserve-msg');
    var state = { nextSeq: 1 };
    var saved = pick.dataset.saved || '';

    function mode() { var c = form.querySelector('[name=nomor_mode]:checked'); return c ? c.value : 'auto'; }
    function dateVal() { return dateEl && dateEl.value ? dateEl.value : ''; }

    function toggle() {
      var m = mode();
      $$('.mode-body', form).forEach(function (b) { b.classList.toggle('show', b.dataset.for === m); });
    }

    function refresh() {
      var seq = parseInt(manual.value, 10) || 0;
      var url = '/api/numbers/' + code + '?d=' + encodeURIComponent(dateVal()) + (seq > 0 ? '&seq=' + seq : '');
      jget(url).then(function (j) {
        state.nextSeq = j.next_seq;
        preview.textContent = j.next;
        var keep = pick.value || saved;
        pick.innerHTML = '';
        if (!j.available.length) {
          pick.add(new Option('— belum ada nomor tersedia —', ''));
        } else {
          pick.add(new Option('— pilih nomor —', ''));
          j.available.forEach(function (a) { pick.add(new Option(a.formatted + '   (' + a.why + ')', a.seq)); });
          if (keep) pick.value = keep;
        }
        saved = '';
        if (seq > 0) {
          var gap = seq > j.next_seq ? '  ⚠ melompati nomor ' + j.next_seq + (seq - 1 > j.next_seq ? '–' + (seq - 1) : '') : '';
          mprev.textContent = '→ ' + (j.formatted || '') + gap;
        } else { mprev.textContent = ''; }
      }).catch(function () { preview.textContent = '(gagal memuat nomor)'; });
    }

    $$('[name=nomor_mode]', form).forEach(function (r) { r.addEventListener('change', toggle); });
    if (dateEl) dateEl.addEventListener('change', refresh);
    var t;
    manual.addEventListener('input', function () { clearTimeout(t); t = setTimeout(refresh, 250); });
    toggle(); refresh();

    $('#reserve-only').addEventListener('click', function () {
      var m = mode(), value = m === 'pick' ? pick.value : (m === 'manual' ? manual.value : '');
      var gap = form.querySelector('[name=confirm_gap]');
      msg.textContent = 'Memproses…'; msg.style.color = '';
      jpost('/api/numbers/' + code + '/reserve', { date: dateVal(), mode: m, value: value, confirm_gap: gap && gap.checked })
        .then(function (res) {
          if (res.ok) {
            msg.style.color = 'var(--ok)';
            msg.textContent = 'Nomor ' + res.data.nomor + ' sudah Anda ambil. Pilih lewat "nomor tersedia" saat surat siap dibuat.';
            refresh();
          } else { msg.style.color = 'var(--danger)'; msg.textContent = res.data.error || 'Gagal mengambil nomor.'; }
        }).catch(function () { msg.style.color = 'var(--danger)'; msg.textContent = 'Gagal menghubungi server.'; });
    });
  }

  /* ---------- cegah klik ganda saat membuat dokumen ---------- */
  function initSubmitGuard() {
    var form = $('#docform');
    if (!form) return;
    form.addEventListener('submit', function (e) {
      if (e.defaultPrevented) return;
      var btn = $('#submit-btn'), busy = $('#busy-msg');
      setTimeout(function () { btn.disabled = true; btn.textContent = 'Membuat…'; if (busy) busy.hidden = false; }, 0);
    });
    window.addEventListener('pageshow', function () {           // tombol "kembali" di browser
      var btn = $('#submit-btn'); if (btn) { btn.disabled = false; btn.textContent = 'Buat dokumen'; }
    });
  }

  /* ---------- pilih dua orang untuk digabung (admin) ---------- */
  function initMerge(sel) {
    new TomSelect(sel, {
      valueField: 'id', labelField: 'label', searchField: ['label'], maxOptions: 20, preload: 'focus',
      placeholder: sel.dataset.ph || '',
      load: function (q, cb) { jget('/api/persons/search?q=' + encodeURIComponent(q)).then(cb).catch(function () { cb(); }); }
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    if (typeof TomSelect === 'undefined') return;
    $$('.person-row').forEach(initRow);
    $$('select.tom-free').forEach(initFree);
    $$('select.people-merge').forEach(initMerge);
    initNomor();
    initSubmitGuard();
  });
})();
