/* portal.js: bakkal portal renderer (S2).
   Classic script. Reads/writes the shared store via window.MC.createStore().
   Defensive: S1 owns store/engine/ui; helpers are discovered at runtime. */

(function () {
  'use strict';

  var LS_KEY = (window.MC && window.MC.STORAGE_KEY) || 'mc_demo_v1';
  var SYNC_MS = 2000;
  var BAKKAL_SHARE = 0.05;
  /* Engine dispatch: body 'VOTE_SURPLUS' enters the surplus vote machine. */
  var SURPLUS_BUTTON_ID = 'VOTE_SURPLUS';
  var SURPLUS_BUTTON_LABEL = '🗳️ Oyla';
  var CATEGORIES = [
    'Yağlar', 'Pirinç & Bulgur', 'Çay & Kahvaltılık',
    'Bakliyat', 'Temel Gıda', 'Diğer'
  ];
  var ADDON_LABELS = { BREAD_2X: '+2 Ekmek', MILK_1L: '+1 Süt' };
  var STATUS_LABELS = {
    PENDING: 'Bekliyor', PAID: 'Ödendi', DELIVERED: 'Teslim Edildi',
    OPEN: 'Açık', CLOSED: 'Kapandı',
    PUBLISHED: 'Yayında', REJECTED: 'Red', MATCHED: 'Eşleşti'
  };

  var root = document.getElementById('portal-app');
  if (!root) return;

  var store = null;
  var engine = null;
  var engineResolved = false;
  var lastRaw = null;
  var qrReady = false;
  var qrLoading = false;
  var timer = null;

  /* ---------- tiny helpers ---------- */

  function htmlEsc(v) {
    return String(v === null || v === undefined ? '' : v)
      .replace(/[&<>"']/g, function (ch) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
      });
  }

  function tl(kurus) {
    var n = Number(kurus) || 0;
    if (window.MC && typeof window.MC.fmtKurus === 'function') {
      try { return window.MC.fmtKurus(n); } catch (e) { /* fallback below */ }
    }
    return (n / 100).toLocaleString('tr-TR', {
      minimumFractionDigits: 2, maximumFractionDigits: 2
    }) + ' TL';
  }

  function nextId(list) {
    var max = 0;
    var arr = list || [];
    for (var i = 0; i < arr.length; i++) {
      var n = Number(arr[i].id);
      if (isFinite(n) && n > max) max = n;
    }
    return max + 1;
  }

  function fmtDate(iso) {
    if (!iso) return '';
    try {
      return new Date(iso).toLocaleString('tr-TR', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
      });
    } catch (e) { return String(iso); }
  }

  function nowIso() { return new Date().toISOString(); }

  function makeBotMsg(text) {
    return { from: 'bot', type: 'text', text: String(text), ts: Date.now() };
  }

  function chip(kind, label) {
    var text = label || STATUS_LABELS[kind] || kind;
    return '<span class="p-chip p-chip-' + htmlEsc(kind) + '">' +
      htmlEsc(text) + '</span>';
  }

  function toast(text) {
    var el = root.querySelector('.p-toast');
    if (!el) {
      el = document.createElement('div');
      el.className = 'p-toast';
      root.appendChild(el);
    }
    el.textContent = text;
    el.classList.add('is-on');
    window.clearTimeout(el._t);
    el._t = window.setTimeout(function () {
      el.classList.remove('is-on');
    }, 2600);
  }

  function setMsg(el, text, ok) {
    if (!el) return;
    el.className = 'p-msg ' + (ok ? 'p-msg-ok' : 'p-msg-err');
    el.textContent = text;
  }

  function emitChange() {
    var detail = { source: 'portal' };
    try {
      document.dispatchEvent(new CustomEvent('mc:change', { detail: detail }));
      window.dispatchEvent(new CustomEvent('mc:change', { detail: detail }));
    } catch (e) { /* CustomEvent missing: demo still works */ }
  }

  /* ---------- store access (same store S1 uses) ---------- */

  function ensureStore() {
    if (store) return store;
    if (!window.MC || typeof window.MC.createStore !== 'function') return null;
    try {
      /* ui.js creates the shared instance before this script runs. */
      if (window.MC.store && typeof window.MC.store.get === 'function') {
        store = window.MC.store;
      } else {
        store = window.MC.createStore({ persist: true });
      }
    } catch (e) {
      store = null;
    }
    return store;
  }

  function readRaw() {
    try { return window.localStorage.getItem(LS_KEY); } catch (e) { return null; }
  }

  function parseRaw() {
    var raw = readRaw();
    if (!raw) return null;
    try { return JSON.parse(raw); } catch (e) { return null; }
  }

  /* Read via store.get(); heal if localStorage moved ahead of this instance
     (S1 writes through its own store instance in the same tab). */
  function readState() {
    var s = ensureStore();
    var fromStore = null;
    if (s) {
      try { fromStore = s.get(); } catch (e) { fromStore = null; }
    }
    var fromRaw = parseRaw();
    if (fromRaw && (!fromStore || JSON.stringify(fromStore) !== JSON.stringify(fromRaw))) {
      try {
        var s2 = window.MC.createStore({ persist: true });
        var g = s2.get();
        if (g && JSON.stringify(g) === JSON.stringify(fromRaw)) {
          store = s2;
          return g;
        }
      } catch (e) { /* keep going with raw snapshot */ }
      return fromRaw;
    }
    return fromStore || fromRaw || {};
  }

  function persist(st) {
    var s = ensureStore();
    if (s) {
      try { s.set(st); } catch (e) {
        try { window.localStorage.setItem(LS_KEY, JSON.stringify(st)); } catch (e2) { /* private mode */ }
      }
    } else {
      try { window.localStorage.setItem(LS_KEY, JSON.stringify(st)); } catch (e) { /* ignore */ }
    }
    lastRaw = readRaw();
  }

  function update(fn, after) {
    var st = readState();
    fn(st);
    persist(st);
    if (typeof after === 'function') after(st);
    lastRaw = readRaw();
    render(readState());
    emitChange();
  }

  function pushEvent(st, text) {
    if (!st.events) st.events = [];
    st.events.push({ id: nextId(st.events), ts: nowIso(), text: String(text) });
  }

  /* ---------- messaging (engine first, manual fallback) ---------- */

  function resolveEngine() {
    if (engineResolved) return engine;
    engineResolved = true;
    engine = null;
    try {
      if (window.mcEngine && typeof window.mcEngine.broadcast === 'function') {
        engine = window.mcEngine;
      } else if (window.MC && window.MC.engine &&
        typeof window.MC.engine.broadcast === 'function') {
        engine = window.MC.engine;
      } else if (window.MC && typeof window.MC.createEngine === 'function' && store) {
        engine = window.MC.createEngine(store);
      }
    } catch (e) { engine = null; }
    return engine;
  }

  function manualAppend(st, userIdsOrNull, msgs) {
    var targets = userIdsOrNull;
    if (!targets) {
      targets = [];
      var users = st.users || [];
      for (var i = 0; i < users.length; i++) {
        if (users[i].role === 'CUSTOMER') targets.push(users[i].id);
      }
    }
    if (!st.transcripts) st.transcripts = {};
    for (var j = 0; j < targets.length; j++) {
      var id = targets[j];
      var arr = st.transcripts[id] || [];
      st.transcripts[id] = arr.concat(msgs);
    }
  }

  function broadcastTo(userIdsOrNull, msgs) {
    var s = ensureStore();
    var handled = false;
    try {
      if (window.MC && typeof window.MC.broadcast === 'function') {
        window.MC.broadcast(userIdsOrNull, msgs);
        handled = true;
      }
    } catch (e) { handled = false; }

    if (!handled) {
      var e2 = resolveEngine();
      if (e2 && typeof e2.broadcast === 'function') {
        try { e2.broadcast(userIdsOrNull, msgs); handled = true; } catch (err) { handled = false; }
      }
    }

    if (!handled) {
      var st = readState();
      manualAppend(st, userIdsOrNull, msgs);
      persist(st);
    }
    lastRaw = readRaw();
    emitChange();
  }

  /* ---------- QR (lazy vendored qrcode-generator) ---------- */

  function ensureQrLib() {
    if (qrReady || qrLoading) return;
    if (window.qrcode) { qrReady = true; return; }
    qrLoading = true;
    var el = document.createElement('script');
    el.src = './vendor/qrcode.min.js';
    el.onload = function () {
      qrLoading = false;
      qrReady = !!window.qrcode;
      if (qrReady) render(readState());
    };
    el.onerror = function () { qrLoading = false; };
    document.head.appendChild(el);
  }

  function qrSvg(text) {
    if (!window.qrcode) return '';
    try {
      var q = window.qrcode(0, 'M');
      q.addData(text);
      q.make();
      return q.createSvgTag({ cellSize: 3, margin: 1, scalable: true });
    } catch (e) { return ''; }
  }

  function qrBox(code) {
    var svg = qrSvg(code || '');
    var inner = svg ? svg : '<div class="p-qr-code">' + htmlEsc(code || '') + '</div>';
    return '<div class="p-qr" aria-label="Teslim kodu QR">' + inner +
      '<div class="p-qr-code">' + htmlEsc(code || '') + '</div></div>';
  }

  /* ---------- shell (built once; lists re-render) ---------- */

  function buildShell() {
    root.innerHTML =
      '<div class="portal-head">' +
        '<h1>Bakkal Portalı</h1>' +
        '<span class="who">Hasan · demo</span>' +
      '</div>' +

      '<section class="p-card" aria-label="Kazanç">' +
        '<h2>Kazanç</h2>' +
        '<div class="p-strip" id="p-comm"></div>' +
        '<p class="p-hint">Bakkal payı %5 (pay modeli: 90 / 5 / 5).</p>' +
      '</section>' +

      '<section class="p-card" aria-label="Minimum Hedef">' +
        '<h2>Minimum Hedef</h2>' +
        '<div id="p-goal"></div>' +
      '</section>' +

      '<section class="p-card" id="p-metrics-card" aria-label="Panel Metrikleri">' +
        '<h2>Panel Metrikleri</h2>' +
        '<p class="p-metrics-sub" id="p-metrics-sub">' +
          'Son 30 gün · yalnız sayı ve oran, üye bilgisi yok</p>' +
        '<div class="p-metric-grid" id="p-metrics"></div>' +
      '</section>' +

      '<section class="p-card" aria-label="Teslim">' +
        '<h2>Teslim Et</h2>' +
        '<div class="p-form-row">' +
          '<input class="p-input p-input-code" id="p-deliver-code" maxlength="8" ' +
            'placeholder="örn. A3KZ9P" autocomplete="off" ' +
            'aria-label="Teslim kodu">' +
          '<button type="button" class="p-btn" data-action="deliver">Teslim Et</button>' +
        '</div>' +
        '<p class="p-msg" id="p-deliver-msg" role="status" aria-live="polite"></p>' +
        '<p class="p-hint">Kod, ödeme sonrası müşteriye gider. QR ile de okunur.</p>' +
      '</section>' +

      '<section class="p-card" aria-label="Siparişler">' +
        '<h2>Siparişler <span id="p-orders-count" class="p-round-meta"></span></h2>' +
        '<div id="p-orders"></div>' +
      '</section>' +

      '<section class="p-card" aria-label="Karar turları">' +
        '<h2>Karar Turları</h2>' +
        '<div class="p-form-row">' +
          '<input class="p-input" id="p-round-title" placeholder="Tur başlığı (ör. yerli muz)" ' +
            'maxlength="80" autocomplete="off" aria-label="Tur başlığı">' +
          '<input class="p-input" id="p-round-hours" type="number" min="1" max="720" ' +
            'value="72" style="flex:0 1 70px" aria-label="Saat">' +
          '<button type="button" class="p-btn" data-action="round-create">Talep Turu Aç</button>' +
        '</div>' +
        '<p class="p-msg" id="p-round-msg" role="status" aria-live="polite"></p>' +
        '<div id="p-rounds" style="margin-top:10px"></div>' +
      '</section>' +

      '<section class="p-card" aria-label="Pano">' +
        '<h2>Pano Moderasyonu</h2>' +
        '<div id="p-pano"></div>' +
      '</section>' +

      '<section class="p-card" aria-label="Fazla ürün turu">' +
        '<h2>Fazla Ürün Turu</h2>' +
        '<div class="p-form-row">' +
          '<input class="p-input" id="p-surplus-title" maxlength="80" ' +
            'placeholder="Ne fazla? (ör. 10 kg domates)" autocomplete="off" ' +
            'aria-label="Fazla ürün başlığı">' +
          '<button type="button" class="p-btn p-btn-amber" data-action="surplus-start">Tur Başlat</button>' +
        '</div>' +
        '<p class="p-msg" id="p-surplus-msg" role="status" aria-live="polite"></p>' +
        '<p class="p-hint">Müşterilere ' + htmlEsc(SURPLUS_BUTTON_LABEL) +
          ' düğmeli bir oylama mesajı gider.</p>' +
      '</section>' +

      '<section class="p-card" aria-label="Duyuru">' +
        '<h2>Duyuru Gönder</h2>' +
        '<textarea class="p-textarea" id="p-announce" maxlength="300" ' +
          'placeholder="Tüm müşterilere gidecek kısa duyuru" ' +
          'aria-label="Duyuru metni"></textarea>' +
        '<div class="p-form-row">' +
          '<button type="button" class="p-btn" data-action="announce">Duyuru Gönder</button>' +
        '</div>' +
        '<p class="p-msg" id="p-announce-msg" role="status" aria-live="polite"></p>' +
      '</section>' +

      '<section class="p-card" id="p-bulletin-card" aria-label="Bülten">' +
        '<h2>Bülten Önizleme ' +
          '<button type="button" class="p-btn p-btn-ghost" data-action="print">Yazdır</button>' +
        '</h2>' +
        '<div class="p-bulletin" id="p-bulletin"></div>' +
      '</section>';

    lastRaw = readRaw();
  }

  /* ---------- state slices ---------- */

  function nameOf(st, id) {
    var users = st.users || [];
    for (var i = 0; i < users.length; i++) {
      if (String(users[i].id) === String(id)) return users[i].name || id;
    }
    return id;
  }

  function productOf(st, id) {
    var ps = st.products || [];
    for (var i = 0; i < ps.length; i++) {
      if (String(ps[i].id) === String(id)) return ps[i];
    }
    return null;
  }

  function orderOfCode(st, code) {
    var orders = st.orders || [];
    for (var i = 0; i < orders.length; i++) {
      if (String(orders[i].pickupCode || '').toUpperCase() === code) return orders[i];
    }
    return null;
  }

  function tally(votes) {
    var t = { AGREE: 0, DISAGREE: 0, PASS: 0, total: 0 };
    if (votes) {
      for (var k in votes) {
        if (!Object.prototype.hasOwnProperty.call(votes, k)) continue;
        var v = votes[k];
        if (v === 'AGREE' || v === 'DISAGREE' || v === 'PASS') {
          t[v] += 1;
          t.total += 1;
        }
      }
    }
    return t;
  }

  /* SPEC gate: at least 3 votes and at least 60% agree. */
  function accepted(t) {
    if (t.total < 3) return false;
    return (t.AGREE / t.total) >= 0.6;
  }

  /* ---------- renderers ---------- */

  function renderComm(st) {
    var el = document.getElementById('p-comm');
    if (!el) return;
    var orders = st.orders || [];
    var ciro = 0;
    var count = 0;
    for (var i = 0; i < orders.length; i++) {
      var o = orders[i];
      if (o.status === 'PAID' || o.status === 'DELIVERED') {
        ciro += Number(o.totalKurus) || 0;
        count += 1;
      }
    }
    var commission = 0;
    if (st.meta && typeof st.meta.commissionKurus === 'number') {
      commission = st.meta.commissionKurus;
    }
    el.innerHTML =
      '<div class="p-stat"><b>' + tl(commission) + '</b>' +
        '<span>toplam komisyon</span></div>' +
      '<div class="p-stat"><b>' + tl(ciro) + '</b><span>ödenen ciro</span></div>' +
      '<div class="p-stat"><b>' + count + '</b><span>işlem</span></div>';
  }

  var GOAL_TARGET = 20;

  function renderGoal(st) {
    var el = document.getElementById('p-goal');
    if (!el) return;
    var orders = st.orders || [];
    var count = 0;
    for (var i = 0; i < orders.length; i++) {
      if (orders[i].status === 'PAID' || orders[i].status === 'DELIVERED') count += 1;
    }
    var done = count >= GOAL_TARGET;
    var pct = Math.min(100, Math.round((count / GOAL_TARGET) * 100));
    var copy = done
      ? 'Hedef doldu 🎉'
      : 'Hedefe ' + (GOAL_TARGET - count) + ' sipariş kaldı';
    el.innerHTML =
      '<div class="p-goal-bar' + (done ? ' is-done' : '') + '" role="progressbar" ' +
        'aria-valuemin="0" aria-valuemax="' + GOAL_TARGET + '" aria-valuenow="' + count + '">' +
        '<div class="p-goal-fill" style="width:' + pct + '%"></div>' +
      '</div>' +
      '<div class="p-goal-meta">' +
        '<span class="p-goal-count">' + count + ' / ' + GOAL_TARGET + ' sipariş</span>' +
        '<span class="p-goal-copy">' + htmlEsc(copy) + '</span>' +
      '</div>';
  }

  /* ---------- panel metrikleri: 8 ops metrics; engine.js owns the math ---- */

  function trNum(value) {
    return (Number(value) || 0).toLocaleString('tr-TR', {
      minimumFractionDigits: 1, maximumFractionDigits: 1
    });
  }

  function trPct(value) {
    return '%' + (Math.max(0, Number(value) || 0) * 100).toLocaleString('tr-TR', {
      minimumFractionDigits: 1, maximumFractionDigits: 1
    });
  }

  function renderMetrics(st) {
    var el = document.getElementById('p-metrics');
    if (!el) return;
    var sub = document.getElementById('p-metrics-sub');
    var ns = window.MC || {};
    if (typeof ns.portalAnalytics !== 'function') {
      el.innerHTML = '<p class="p-empty">Metrik motoru yüklenemedi. Sayfayı yenileyin.</p>';
      return;
    }
    var a = ns.portalAnalytics(st);
    var days = ns.ANALYTICS_WINDOW_DAYS || 30;
    var goal = ns.DAILY_ORDER_GOAL || 20;
    var cost = tl(ns.DELIVERY_COST_KURUS || 0);
    var rate = Math.round((ns.ANALYTICS_RETAIL_PROXY_RATE || 0.15) * 100);
    var missing = a.noData || [];
    var recentEmpty = 'son ' + days + ' günde sipariş yok';

    var tiles = [
      { key: 'aktifUye', label: 'Aktif üye', value: String(a.aktifUye),
        note: 'son ' + days + ' günde sipariş veren üye' },
      { key: 'siparisSikligi', label: 'Sipariş sıklığı', value: trNum(a.siparisSikligi),
        note: 'aktif üye başına, ayda', empty: recentEmpty },
      { key: 'ortalamaSepet', label: 'Ortalama sepet', value: tl(a.ortalamaSepetKurus),
        note: 'son ' + days + ' günde', empty: recentEmpty },
      { key: 'kisiBasiTasarruf', label: 'Kişi başı tasarruf', value: tl(a.kisiBasiTasarrufKurus),
        note: 'tahmini: perakende vekili %' + rate, empty: recentEmpty, est: true },
      { key: 'pencereDoluluk', label: 'Pencere doluluk', value: trPct(a.pencereDoluluk),
        note: a.pencereDolulukAdet + ' / ' + goal + ' hedef' },
      { key: 'aylikKayip', label: 'Aylık kayıp vekili', value: trPct(a.aylikKayipOrani),
        note: 'önceki ' + days + ' günden ayrılan üye',
        empty: 'önceki ' + days + ' günde sipariş yok' },
      { key: 'teslimMaliyet', label: 'Teslim / pickup maliyeti', value: tl(a.teslimMaliyetKurus),
        note: 'tahmini: sabit ' + cost + ', sipariş başına', empty: recentEmpty, est: true },
      { key: 'tekrarAlim', label: 'Tekrar alım oranı', value: trPct(a.tekrarAlimOrani),
        note: 'son iki siparişinde ortak ürün', empty: 'iki siparişi olan üye yok' }
    ];

    el.innerHTML = tiles.map(function (tile) {
      var veriYok = missing.indexOf(tile.key) !== -1;
      var value = veriYok ? 'veri yok' : tile.value;
      var note = veriYok && tile.empty ? tile.empty : tile.note;
      return '<div class="p-metric' + (tile.est ? ' is-est' : '') +
        (veriYok ? ' is-nodata' : '') + '">' +
        '<span class="p-metric-label">' + htmlEsc(tile.label) + '</span>' +
        '<span class="p-metric-value">' + htmlEsc(value) + '</span>' +
        '<span class="p-metric-note">' + htmlEsc(note) + '</span>' +
        '</div>';
    }).join('');

    if (sub) {
      sub.textContent = 'Son ' + days + ' gün · yalnız sayı ve oran, üye bilgisi yok · amber çizgi: tahmini değer';
    }
  }

  function renderOrders(st) {
    var wrap = document.getElementById('p-orders');
    var counter = document.getElementById('p-orders-count');
    if (!wrap) return;
    var orders = (st.orders || []).slice().sort(function (a, b) {
      return String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
    });
    if (counter) counter.textContent = orders.length + ' kayıt';

    if (!orders.length) {
      wrap.innerHTML = '<p class="p-empty">Sipariş yok. Sohbetten bir sepet onaylayın, buraya düşer.</p>';
      return;
    }

    var out = [];
    for (var i = 0; i < orders.length; i++) {
      var o = orders[i];
      var lines = [];
      var items = o.items || [];
      for (var j = 0; j < items.length; j++) {
        var p = productOf(st, items[j].productId);
        var nm = p ? p.name : items[j].productId;
        var unit = p ? ' ' + p.unit : '';
        lines.push('<li>' + htmlEsc(nm + unit) + ' ×' + items[j].qty +
          ' · ' + tl(items[j].lineTotalKurus) + '</li>');
      }
      var addons = [];
      var ad = o.addons || [];
      for (var a = 0; a < ad.length; a++) {
        addons.push(htmlEsc(ADDON_LABELS[ad[a]] || ad[a]));
      }
      var kasa = '';
      if (addons.length || o.note) {
        kasa = '<div class="p-kasa">Kasada: ' +
          (addons.length ? addons.join(' · ') : 'yok') +
          (o.note ? ' · not: ' + htmlEsc(o.note) : '') + '</div>';
      }
      out.push(
        '<article class="p-order">' +
          '<div class="p-order-top">' +
            chip(o.status) +
            '<span class="p-order-name">' + htmlEsc(nameOf(st, o.userId)) + '</span>' +
            '<span class="p-order-id">#' + htmlEsc(String(o.id)) + ' · ' +
              htmlEsc(o.pickupCode || '') + '</span>' +
            '<span class="p-order-total">' + tl(o.totalKurus) + '</span>' +
          '</div>' +
          '<div class="p-order-body">' +
            '<div class="p-order-items"><ul>' + lines.join('') + '</ul>' + kasa + '</div>' +
            qrBox(o.pickupCode || '') +
          '</div>' +
        '</article>'
      );
    }
    wrap.innerHTML = out.join('');
  }

  function proposalHtml(st, round, prop) {
    var t = tally(prop.votes);
    var pct = t.total ? Math.round((t.AGREE / t.total) * 100) : 0;
    var html =
      '<div class="p-proposal">' +
        '<div class="p-round-top">' +
          chip(prop.status) +
          '<span class="p-round-meta">' + htmlEsc(nameOf(st, prop.authorId)) + '</span>' +
        '</div>' +
        '<p class="p-proposal-text">' + htmlEsc(prop.text) + '</p>' +
        '<div class="p-votes">' +
          '<span>👍 <b>' + t.AGREE + '</b></span>' +
          '<span>👎 <b>' + t.DISAGREE + '</b></span>' +
          '<span>🤷 <b>' + t.PASS + '</b></span>' +
          '<span>' + t.total + ' oy · %' + pct + '</span>' +
        '</div>';

    if (round.status === 'OPEN') {
      if (prop.status === 'PENDING') {
        html += '<div class="p-btn-row">' +
          '<button type="button" class="p-btn" data-action="prop-publish" ' +
            'data-round="' + htmlEsc(round.id) + '" data-prop="' + htmlEsc(prop.id) + '">' +
            'Yayınla</button>' +
          '<button type="button" class="p-btn p-btn-danger" data-action="prop-reject" ' +
            'data-round="' + htmlEsc(round.id) + '" data-prop="' + htmlEsc(prop.id) + '">' +
            'Reddet</button>' +
          '</div>';
      }
    }

    if (round.status === 'CLOSED') {
      var ok = accepted(t) && prop.status === 'PUBLISHED';
      html += '<p class="p-verdict ' + (ok ? 'p-verdict-accept' : 'p-verdict-reject') + '">' +
        (ok ? 'KABUL (%' + pct + ', ' + t.total + ' oy)' :
          (prop.status === 'PUBLISHED' ?
            'KAPANDI, EŞİK TUTMADI (%' + pct + ', ' + t.total + ' oy)' :
            'KABUL EDİLMEDİ')) +
        '</p>';

      if (ok && !prop.convertedProductId) {
        html += convertFormHtml(round, prop);
      } else if (prop.convertedProductId) {
        var cp = productOf(st, prop.convertedProductId);
        html += '<p class="p-msg p-msg-ok">Kataloğa eklendi: ' +
          htmlEsc(cp ? cp.name : prop.convertedProductId) + '</p>';
      }
    }

    return html + '</div>';
  }

  function convertFormHtml(round, prop) {
    var cid = 'cv-' + prop.id;
    var opts = [];
    for (var i = 0; i < CATEGORIES.length; i++) {
      opts.push('<option value="' + htmlEsc(CATEGORIES[i]) + '">' +
        htmlEsc(CATEGORIES[i]) + '</option>');
    }
    return '<div class="p-convert" id="' + htmlEsc(cid) + '">' +
      '<strong>Ürüne çevir</strong>' +
      '<div class="p-convert-grid">' +
        '<label><span class="p-field-label">Ürün adı</span>' +
          '<input class="p-input" data-draft="' + htmlEsc(cid) + '-name" ' +
            'data-f="name" maxlength="60" placeholder="ör. yerli muz"></label>' +
        '<label><span class="p-field-label">Birim</span>' +
          '<input class="p-input" data-draft="' + htmlEsc(cid) + '-unit" ' +
            'data-f="unit" maxlength="20" placeholder="ör. 1 kg"></label>' +
        '<label><span class="p-field-label">Kategori</span>' +
          '<select class="p-select" data-draft="' + htmlEsc(cid) + '-cat" data-f="cat">' +
            opts.join('') + '</select></label>' +
        '<label><span class="p-field-label">1. fiyat (TL)</span>' +
          '<input class="p-input" data-draft="' + htmlEsc(cid) + '-t1" data-f="t1" ' +
            'inputmode="decimal" placeholder="45,00"></label>' +
        '<label><span class="p-field-label">3+ fiyat (TL)</span>' +
          '<input class="p-input" data-draft="' + htmlEsc(cid) + '-t2" data-f="t2" ' +
            'inputmode="decimal" placeholder="43,00"></label>' +
        '<label><span class="p-field-label">6+ fiyat (TL)</span>' +
          '<input class="p-input" data-draft="' + htmlEsc(cid) + '-t3" data-f="t3" ' +
            'inputmode="decimal" placeholder="41,00"></label>' +
      '</div>' +
      '<div class="p-btn-row">' +
        '<button type="button" class="p-btn" data-action="convert" ' +
          'data-round="' + htmlEsc(round.id) + '" data-prop="' + htmlEsc(prop.id) + '">' +
          'Kataloğa Ekle</button>' +
      '</div>' +
      '<p class="p-msg" data-convert-msg="' + htmlEsc(prop.id) + '" role="status"></p>' +
      '</div>';
  }

  function roundHtml(st, round) {
    var props = round.proposals || [];
    var html =
      '<div class="p-round" data-round-card="' + htmlEsc(round.id) + '">' +
        '<div class="p-round-top">' +
          chip(round.kind, round.kind === 'SURPLUS' ? 'FAZLA ÜRÜN' : 'TALEP') +
          chip(round.status) +
          '<span class="p-round-title">' + htmlEsc(round.title || '') + '</span>' +
          '<span class="p-round-meta">' + props.length + ' öneri · kapanış ' +
            htmlEsc(fmtDate(round.closesAt)) + '</span>' +
        '</div>';

    if (round.status === 'OPEN') {
      html += '<div class="p-btn-row">' +
        '<button type="button" class="p-btn" data-action="round-close" ' +
          'data-round="' + htmlEsc(round.id) + '">Turu Kapat ve Sonuçları Gönder</button>' +
        '</div>';
    }

    if (!props.length) {
      html += '<p class="p-empty">Henüz öneri yok.</p>';
    } else {
      for (var i = 0; i < props.length; i++) {
        html += proposalHtml(st, round, props[i]);
      }
    }
    return html + '</div>';
  }

  function renderRounds(st) {
    var el = document.getElementById('p-rounds');
    if (!el) return;
    var drafts = captureDrafts(el);
    var rounds = st.rounds || [];
    if (!rounds.length) {
      el.innerHTML = '<p class="p-empty">Tur yok. Yukarıdan bir talep turu açın.</p>';
      return;
    }
    var out = [];
    for (var i = 0; i < rounds.length; i++) out.push(roundHtml(st, rounds[i]));
    el.innerHTML = out.join('');
    restoreDrafts(el, drafts);
  }

  function renderPano(st) {
    var el = document.getElementById('p-pano');
    if (!el) return;
    var posts = st.aidPosts || [];
    if (!posts.length) {
      el.innerHTML = '<p class="p-empty">İlan yok. Sohbetten gelen dayanışma istekleri burada.</p>';
      return;
    }
    var out = [];
    for (var i = 0; i < posts.length; i++) {
      var p = posts[i];
      var btns = '';
      if (p.status === 'PENDING') {
        btns = '<div class="p-btn-row">' +
          '<button type="button" class="p-btn" data-action="pano-publish" ' +
            'data-post="' + htmlEsc(p.id) + '">Onayla</button>' +
          '<button type="button" class="p-btn p-btn-danger" data-action="pano-reject" ' +
            'data-post="' + htmlEsc(p.id) + '">Reddet</button>' +
          '<button type="button" class="p-btn p-btn-ghost" data-action="pano-redact" ' +
            'data-post="' + htmlEsc(p.id) + '">Sansürle</button>' +
          '</div>';
      } else if (p.status === 'PUBLISHED') {
        btns = '<div class="p-btn-row">' +
          '<button type="button" class="p-btn p-btn-ghost" data-action="pano-redact" ' +
            'data-post="' + htmlEsc(p.id) + '">Sansürle</button>' +
          '</div>';
      }
      out.push(
        '<article class="p-post">' +
          '<div class="p-round-top">' +
            chip(p.kind, p.kind === 'REQUEST' ? 'İSTEK' : 'TEKLİF') +
            chip(p.status) +
            '<span class="p-round-meta">' + htmlEsc(nameOf(st, p.userId)) +
              (p.responderId ? ' · eşleşme: ' + htmlEsc(nameOf(st, p.responderId)) : '') +
            '</span>' +
          '</div>' +
          '<p class="p-post-text">' + htmlEsc(p.text) + '</p>' +
          btns +
        '</article>'
      );
    }
    el.innerHTML = out.join('');
  }

  function renderBulletin(st) {
    var el = document.getElementById('p-bulletin');
    if (!el) return;
    var products = st.products || [];
    var rounds = st.rounds || [];
    var posts = st.aidPosts || [];
    var orders = st.orders || [];
    var windows = st.windows || [];

    var openRoundCount = 0;
    var openRoundBits = [];
    for (var i = 0; i < rounds.length; i++) {
      if (rounds[i].status === 'OPEN') {
        openRoundCount += 1;
        openRoundBits.push('<li>' + htmlEsc(rounds[i].title || '') + ' · ' +
          (rounds[i].proposals || []).length + ' öneri</li>');
      }
    }

    var publishedPosts = [];
    for (var j = 0; j < posts.length; j++) {
      if (posts[j].status === 'PUBLISHED') {
        publishedPosts.push('<li>' + htmlEsc(posts[j].text) + '</li>');
      }
    }

    var qty = {};
    for (var k = 0; k < orders.length; k++) {
      var o = orders[k];
      if (o.status !== 'PAID' && o.status !== 'DELIVERED') continue;
      var items = o.items || [];
      for (var m = 0; m < items.length; m++) {
        qty[items[m].productId] = (qty[items[m].productId] || 0) + Number(items[m].qty || 0);
      }
    }
    var ranked = [];
    for (var id in qty) {
      if (Object.prototype.hasOwnProperty.call(qty, id)) ranked.push({ id: id, q: qty[id] });
    }
    ranked.sort(function (a, b) { return b.q - a.q; });
    var topBits = [];
    for (var r = 0; r < ranked.length && r < 3; r++) {
      var pr = productOf(st, ranked[r].id);
      topBits.push('<li>' + htmlEsc(pr ? pr.name : ranked[r].id) + ' ×' + ranked[r].q + '</li>');
    }

    var windowLine = 'Açık pencere yok.';
    for (var w = 0; w < windows.length; w++) {
      if (windows[w].status === 'OPEN') {
        windowLine = 'Sipariş penceresi kapanışı: ' + fmtDate(windows[w].closesAt);
        break;
      }
    }

    var delivered = 0;
    for (var d = 0; d < orders.length; d++) {
      if (orders[d].status === 'DELIVERED') delivered += 1;
    }

    el.innerHTML =
      '<h3>MahalleCoop Bülteni</h3>' +
      '<p class="p-bul-sub">' + htmlEsc(new Date().toLocaleDateString('tr-TR', {
        day: '2-digit', month: 'long', year: 'numeric'
      })) + ' · MOCK demo</p>' +
      '<p>' + htmlEsc(windowLine) + '</p>' +
      '<p>' + products.length + ' ürün · ' + openRoundCount + ' açık tur · ' +
        publishedPosts.length + ' pano ilanı · ' + delivered + ' teslim</p>' +
      '<div class="p-bul-sec"><strong>Çok satanlar (ödenen + teslim)</strong>' +
        (topBits.length ? '<ul>' + topBits.join('') + '</ul>' :
          '<p class="p-empty">Bu oturumda henüz sipariş yok.</p>') +
      '</div>' +
      '<div class="p-bul-sec"><strong>Açık turlar</strong>' +
        (openRoundBits.length ? '<ul>' + openRoundBits.join('') + '</ul>' :
          '<p class="p-empty">Açık tur yok.</p>') +
      '</div>' +
      '<div class="p-bul-sec"><strong>Pano</strong>' +
        (publishedPosts.length ? '<ul>' + publishedPosts.slice(0, 5).join('') + '</ul>' :
          '<p class="p-empty">Yayında ilan yok.</p>') +
      '</div>';
  }

  function captureDrafts(scope) {
    var map = {};
    var els = scope.querySelectorAll('[data-draft]');
    for (var i = 0; i < els.length; i++) {
      map[els[i].getAttribute('data-draft')] = els[i].value;
    }
    return map;
  }

  function restoreDrafts(scope, map) {
    var els = scope.querySelectorAll('[data-draft]');
    for (var i = 0; i < els.length; i++) {
      var key = els[i].getAttribute('data-draft');
      if (Object.prototype.hasOwnProperty.call(map, key)) els[i].value = map[key];
    }
  }

  function render(st) {
    if (!st) st = {};
    renderComm(st);
    renderGoal(st);
    renderMetrics(st);
    renderOrders(st);
    renderRounds(st);
    renderPano(st);
    renderBulletin(st);
  }

  /* ---------- actions ---------- */

  function doDeliver() {
    var input = document.getElementById('p-deliver-code');
    var msg = document.getElementById('p-deliver-msg');
    var code = String(input && input.value ? input.value : '')
      .trim().toLocaleUpperCase('tr');
    if (!code) {
      setMsg(msg, 'Teslim kodu yazın.', false);
      return;
    }
    var st = readState();
    var order = orderOfCode(st, code);
    if (!order) {
      setMsg(msg, 'Kod bulunamadı: ' + code, false);
      return;
    }
    if (order.status === 'DELIVERED') {
      setMsg(msg, 'Bu sipariş zaten teslim edildi.', true);
      return;
    }
    if (order.status !== 'PAID') {
      setMsg(msg, 'Sipariş henüz ödenmedi.', false);
      return;
    }

    var gain = Math.round((Number(order.totalKurus) || 0) * BAKKAL_SHARE);
    var userId = order.userId;
    var orderRef = String(order.id);
    var pickup = String(order.pickupCode || code);

    update(function (s) {
      var target = orderOfCode(s, code);
      if (target) target.status = 'DELIVERED';
      if (!s.meta) s.meta = { commissionKurus: 0 };
      s.meta.commissionKurus = (Number(s.meta.commissionKurus) || 0) + gain;
      pushEvent(s, 'sipariş ' + orderRef + ' teslim edildi (kod ' + pickup + ')');
    }, function () {
      broadcastTo(
        [userId],
        [makeBotMsg('Siparişiniz teslim edildi (kod ' + pickup + '). İyi günler.')]
      );
    });

    setMsg(msg, 'Teslim edildi. Komisyon: ' + tl(gain), true);
    if (input) input.value = '';
    toast('Sipariş teslim edildi');
  }

  function findRound(st, id) {
    var rounds = st.rounds || [];
    for (var i = 0; i < rounds.length; i++) {
      if (String(rounds[i].id) === String(id)) return rounds[i];
    }
    return null;
  }

  function findProposal(round, id) {
    var props = round.proposals || [];
    for (var i = 0; i < props.length; i++) {
      if (String(props[i].id) === String(id)) return props[i];
    }
    return null;
  }

  function doRoundCreate() {
    var titleEl = document.getElementById('p-round-title');
    var hoursEl = document.getElementById('p-round-hours');
    var msg = document.getElementById('p-round-msg');
    var title = String(titleEl && titleEl.value ? titleEl.value : '').trim();
    if (!title) {
      setMsg(msg, 'Tur başlığı yazın.', false);
      return;
    }
    var hours = Number(hoursEl && hoursEl.value ? hoursEl.value : 72);
    if (!(hours >= 1)) hours = 72;
    var closesAt = new Date(Date.now() + hours * 3600 * 1000).toISOString();

    update(function (s) {
      if (!s.rounds) s.rounds = [];
      s.rounds.unshift({
        id: nextId(s.rounds),
        kind: 'DEMAND',
        title: title,
        status: 'OPEN',
        closesAt: closesAt,
        proposals: []
      });
      pushEvent(s, 'talep turu açıldı: ' + title);
    });

    if (titleEl) titleEl.value = '';
    setMsg(msg, 'Tur açıldı: ' + title, true);
    toast('Talep turu açıldı');
  }

  function doProposalPublish(roundId, propId) {
    update(function (s) {
      var round = findRound(s, roundId);
      if (!round) return;
      var prop = findProposal(round, propId);
      if (!prop) return;
      prop.status = 'PUBLISHED';
      pushEvent(s, 'öneri yayınlandı: ' + prop.text);
    });
    toast('Öneri yayınlandı');
  }

  function doProposalReject(roundId, propId) {
    update(function (s) {
      var round = findRound(s, roundId);
      if (!round) return;
      var prop = findProposal(round, propId);
      if (!prop) return;
      prop.status = 'REJECTED';
      pushEvent(s, 'öneri reddedildi');
    });
    toast('Öneri reddedildi');
  }

  function resultsText(round) {
    var props = round.proposals || [];
    var lines = ['“' + (round.title || '') + '” turu kapandı.'];
    for (var i = 0; i < props.length; i++) {
      var p = props[i];
      var t = tally(p.votes);
      var pct = t.total ? Math.round((t.AGREE / t.total) * 100) : 0;
      var verdict;
      if (p.status !== 'PUBLISHED') {
        verdict = 'yayınlanmadı';
      } else if (accepted(t)) {
        verdict = 'KABUL (%' + pct + ', ' + t.total + ' oy)';
      } else {
        verdict = 'eşik tutmadı (%' + pct + ', ' + t.total + ' oy)';
      }
      lines.push('• ' + p.text + ' → ' + verdict);
    }
    return lines.join('\n');
  }

  function doRoundClose(roundId) {
    var st = readState();
    var round = findRound(st, roundId);
    if (!round) return;
    if (round.status !== 'OPEN') {
      toast('Tur zaten kapalı');
      return;
    }
    var text = resultsText(round);

    update(function (s) {
      var r = findRound(s, roundId);
      if (!r) return;
      r.status = 'CLOSED';
      r.closesAt = nowIso();
      pushEvent(s, 'tur kapandı: ' + r.title);
    }, function () {
      broadcastTo(null, [makeBotMsg(text)]);
    });

    toast('Tur kapandı, sonuç gönderildi');
  }

  function parseTlInput(v) {
    var s = String(v || '').trim().replace(/\s/g, '').replace(',', '.');
    if (!s) return NaN;
    var n = Number(s);
    if (!isFinite(n) || n <= 0) return NaN;
    return Math.round(n * 100);
  }

  function doConvert(roundId, propId) {
    var box = document.querySelector('[data-convert-msg="' +
      propId.replace(/[^\w-]/g, '') + '"]');
    var container = document.getElementById('cv-' + propId);
    if (!container) return;

    function field(f) {
      var el = container.querySelector('[data-f="' + f + '"]');
      return el ? el.value : '';
    }

    var name = field('name').trim();
    var unit = field('unit').trim();
    var cat = field('cat');
    var t1 = parseTlInput(field('t1'));
    var t2 = parseTlInput(field('t2'));
    var t3 = parseTlInput(field('t3'));

    if (!name || !unit) {
      setMsg(box, 'Ürün adı ve birim gerekli.', false);
      return;
    }
    if (isNaN(t1) || isNaN(t2) || isNaN(t3)) {
      setMsg(box, 'Üç fiyat da TL olarak girilmeli (ör. 45,00).', false);
      return;
    }
    if (t1 < t2 || t2 < t3) {
      setMsg(box, 'Kademeli fiyat düşmeli: 1. fiyat ≥ 3+ ≥ 6+.', false);
      return;
    }

    var newId = null;
    update(function (s) {
      var round = findRound(s, roundId);
      if (!round) return;
      var prop = findProposal(round, propId);
      if (!prop || prop.convertedProductId) return;
      if (!s.products) s.products = [];
      newId = nextId(s.products);
      s.products.push({
        id: newId,
        name: name,
        unit: unit,
        category: cat || 'Diğer',
        tiers: [t1, t2, t3],
        thresholds: [3, 6],
        active: true
      });
      prop.convertedProductId = newId;
      pushEvent(s, 'öneri ürüne çevrildi: ' + name);
    });

    toast(name + ' kataloğa eklendi');
  }

  function doPanoPublish(postId) {
    update(function (s) {
      var posts = s.aidPosts || [];
      for (var i = 0; i < posts.length; i++) {
        if (String(posts[i].id) === String(postId)) {
          posts[i].status = 'PUBLISHED';
          pushEvent(s, 'pano ilanı onaylandı');
          break;
        }
      }
    });
    toast('İlan yayınlandı');
  }

  function doPanoReject(postId) {
    update(function (s) {
      var posts = s.aidPosts || [];
      for (var i = 0; i < posts.length; i++) {
        if (String(posts[i].id) === String(postId)) {
          posts[i].status = 'REJECTED';
          pushEvent(s, 'pano ilanı reddedildi');
          break;
        }
      }
    });
    toast('İlan reddedildi');
  }

  function redactText(text) {
    return String(text || '')
      .replace(/(\+?90[\s-]?)?(\d[\d\s().-]{7,}\d)/g, '[sansürlendi]')
      .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[sansürlendi]');
  }

  function doPanoRedact(postId) {
    update(function (s) {
      var posts = s.aidPosts || [];
      for (var i = 0; i < posts.length; i++) {
        if (String(posts[i].id) === String(postId)) {
          posts[i].text = redactText(posts[i].text);
          pushEvent(s, 'pano ilanı sansürlendi');
          break;
        }
      }
    });
    toast('Sansür uygulandı');
  }

  function doSurplusStart() {
    var titleEl = document.getElementById('p-surplus-title');
    var msg = document.getElementById('p-surplus-msg');
    var title = String(titleEl && titleEl.value ? titleEl.value : '').trim();
    if (!title) {
      setMsg(msg, 'Fazla ürünün adını yazın.', false);
      return;
    }
    var closesAt = new Date(Date.now() + 72 * 3600 * 1000).toISOString();

    update(function (s) {
      if (!s.rounds) s.rounds = [];
      s.rounds.unshift({
        id: nextId(s.rounds),
        kind: 'SURPLUS',
        title: title,
        status: 'OPEN',
        closesAt: closesAt,
        proposals: []
      });
      pushEvent(s, 'fazla ürün turu açıldı: ' + title);
    }, function () {
      var msg1 = makeBotMsg('Fazla ürün turu: ' + title +
        '. Oylamaya katılın, sonuç 3 oy ve %60 eşiğinde belli olacak.');
      msg1.type = 'buttons';
      msg1.buttons = [{ id: SURPLUS_BUTTON_ID, label: SURPLUS_BUTTON_LABEL }];
      broadcastTo(null, [msg1]);
    });

    if (titleEl) titleEl.value = '';
    setMsg(msg, 'Tur başladı, duyuru gönderildi.', true);
    toast('Fazla ürün turu başladı');
  }

  function doAnnounce() {
    var el = document.getElementById('p-announce');
    var msg = document.getElementById('p-announce-msg');
    var text = String(el && el.value ? el.value : '').trim();
    if (!text) {
      setMsg(msg, 'Duyuru metni yazın.', false);
      return;
    }
    update(function (s) {
      pushEvent(s, 'duyuru: ' + text);
    }, function () {
      broadcastTo(null, [makeBotMsg(text)]);
    });
    if (el) el.value = '';
    setMsg(msg, 'Duyuru tüm müşterilere gönderildi.', true);
    toast('Duyuru gönderildi');
  }

  function doPrint() {
    try { window.print(); } catch (e) { /* print unavailable */ }
  }

  /* ---------- events ---------- */

  function onClick(ev) {
    var t = ev.target;
    while (t && t !== root && !(t.getAttribute && t.getAttribute('data-action'))) {
      t = t.parentNode;
    }
    if (!t || t === root) return;
    var action = t.getAttribute('data-action');
    if (action === 'deliver') doDeliver();
    else if (action === 'round-create') doRoundCreate();
    else if (action === 'prop-publish') doProposalPublish(t.getAttribute('data-round'), t.getAttribute('data-prop'));
    else if (action === 'prop-reject') doProposalReject(t.getAttribute('data-round'), t.getAttribute('data-prop'));
    else if (action === 'round-close') doRoundClose(t.getAttribute('data-round'));
    else if (action === 'convert') doConvert(t.getAttribute('data-round'), t.getAttribute('data-prop'));
    else if (action === 'pano-publish') doPanoPublish(t.getAttribute('data-post'));
    else if (action === 'pano-reject') doPanoReject(t.getAttribute('data-post'));
    else if (action === 'pano-redact') doPanoRedact(t.getAttribute('data-post'));
    else if (action === 'surplus-start') doSurplusStart();
    else if (action === 'announce') doAnnounce();
    else if (action === 'print') doPrint();
  }

  function onKeydown(ev) {
    if (ev.key !== 'Enter') return;
    var id = ev.target && ev.target.id;
    if (id === 'p-deliver-code') {
      ev.preventDefault();
      doDeliver();
    } else if (id === 'p-round-title') {
      ev.preventDefault();
      doRoundCreate();
    }
  }

  function syncTick() {
    var raw = readRaw();
    if (raw === lastRaw) return;
    lastRaw = raw;
    render(readState());
    emitChange();
  }

  function registerSw() {
    if (!('serviceWorker' in navigator)) return;
    if (location.protocol !== 'https:' && location.protocol !== 'http:') return;
    try {
      var reg = navigator.serviceWorker.register('./sw.js', { scope: './' });
      if (reg && typeof reg.catch === 'function') reg.catch(function () {});
    } catch (e) { /* PWA optional */ }
  }

  function init() {
    if (!window.MC || typeof window.MC.createStore !== 'function') {
      root.innerHTML = '<p class="p-empty">Mağaza yüklenemedi. Sayfayı yenileyin.</p>';
      return;
    }
    buildShell();
    ensureQrLib();
    render(readState());
    root.addEventListener('click', onClick);
    root.addEventListener('keydown', onKeydown);
    window.addEventListener('storage', function (e) {
      if (e.key === LS_KEY) syncTick();
    });
    document.addEventListener('mc:change', function (ev) {
      if (ev.detail && ev.detail.source === 'portal') return;
      syncTick();
    });
    timer = window.setInterval(syncTick, SYNC_MS);
    registerSw();
  }

  init();
})();
