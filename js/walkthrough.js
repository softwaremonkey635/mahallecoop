/* Landing walkthrough player (S2/S3). Classic script, browser only.
   Autoplay tour through the 14 scripted scenes in walkthrough-scenes.js:
   per-scene motion (bubble pop, typing, count-up totals, price drop, code +
   QR reveal, vote bars, catalog flip, pano badge, delivery banner), a thin
   progress bar, 14 round scrubber dots, keyboard/swipe control and a
   play/pause button. Autoplay starts when the player scrolls into view and
   steps aside while the visitor hovers or taps, then resumes after idle.
   Scene copy is data driven, so no engine is involved. */
(function () {
  'use strict';

  if (typeof document === 'undefined') return;

  var MIN_MS = 3400;
  var MAX_MS = 7000;
  var HOLD_MS = 1400;
  var STAGGER_MS = 180;
  var SWIPE_PX = 40;
  var HOVER_IDLE_MS = 1500;
  var TAP_IDLE_MS = 3500;
  var NUM_MS = 620;

  var scenes = [];
  var index = 0;
  var timers = [];
  var rafs = [];
  var els = null;
  var bag = {};

  var state = {
    wanted: true,
    visible: false,
    hovering: false,
    playing: false,
    reduced: false,
    elapsed: 0,
    duration: MIN_MS,
    lastTs: 0,
    raf: 0,
    busyUntil: 0,
    busyTimer: 0,
  };

  /* Cart chip steps: item count and running total per scene. */
  var CART_FX = {
    'command-add': [{ at: 1300, items: 2, total: 690 }],
    'tier-price': [
      { at: 1250, items: 3, total: 1005 },
      { at: 2450, items: 6, total: 1950 },
    ],
    'cart-remove': [
      { at: 1000, items: 6, total: 1950 },
      { at: 2600, items: 3, total: 1005 },
    ],
    addons: [{ at: 900, items: 3, total: 1005 }],
    'confirm-note': [{ at: 800, items: 3, total: 1005 }],
    'payment-code': [{ at: 800, items: 3, total: 1005 }],
  };

  var PRICE_STEPS = [
    { at: 1350, tier: '3+ kademesi', from: 345, to: 335 },
    { at: 2850, tier: '6+ kademesi', from: 335, to: 325 },
  ];

  function reducedMotion() {
    return !!(
      window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    );
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function later(fn, ms) {
    var id = window.setTimeout(fn, ms);
    timers.push(id);
    return id;
  }

  function clearTimers() {
    timers.forEach(function (id) {
      window.clearTimeout(id);
    });
    timers = [];
  }

  function clearMotion() {
    rafs.forEach(function (id) {
      window.cancelAnimationFrame(id);
    });
    rafs = [];
  }

  function clamp(v, lo, hi) {
    return v < lo ? lo : v > hi ? hi : v;
  }

  function moneyRe() {
    return /\b\d{1,3}(?:\.\d{3})+,\d{2}\b|\b\d+,\d{2}\b/g;
  }

  function fmtMoney(n) {
    var fixed = (Math.round(n * 100) / 100).toFixed(2).split('.');
    var head = fixed[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return head + ',' + fixed[1];
  }

  function stamp(i) {
    var total = 9 * 60 + 41 + i;
    var h = Math.floor(total / 60) % 24;
    var m = total % 60;
    return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;
  }

  function make(tag, cls, html) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (html) node.innerHTML = html;
    return node;
  }

  function revealNode(node) {
    if (state.reduced) {
      node.classList.add('is-in');
      return;
    }
    window.requestAnimationFrame(function () {
      node.classList.add('is-in');
    });
  }

  function countSpan(from, to) {
    var text = state.reduced ? fmtMoney(to) : fmtMoney(from);
    return (
      '<span class="mc-count" data-from="' +
      from +
      '" data-to="' +
      to +
      '" style="min-width:' +
      fmtMoney(to).length +
      'ch">' +
      text +
      '</span>'
    );
  }

  function intSpan(from, to) {
    var text = state.reduced ? String(to) : String(from);
    return (
      '<span class="mc-count mc-int" data-from="' +
      from +
      '" data-to="' +
      to +
      '" style="min-width:' +
      String(to).length +
      'ch">' +
      text +
      '</span>'
    );
  }

  function countTo(el, from, to, dur) {
    var isInt = el.classList.contains('mc-int');
    var start = null;
    function step(ts) {
      if (start === null) start = ts;
      var p = Math.min(1, (ts - start) / dur);
      var e = 1 - Math.pow(1 - p, 3);
      var v = from + (to - from) * e;
      el.textContent = isInt ? String(Math.round(v)) : fmtMoney(v);
      if (p < 1) rafs.push(window.requestAnimationFrame(step));
    }
    rafs.push(window.requestAnimationFrame(step));
  }

  function runCounts(root) {
    if (state.reduced || !root) return;
    var nodes = root.querySelectorAll('.mc-count');
    for (var i = 0; i < nodes.length; i++) {
      countTo(
        nodes[i],
        Number(nodes[i].getAttribute('data-from')),
        Number(nodes[i].getAttribute('data-to')),
        NUM_MS,
      );
    }
  }

  /* Money totals in cart lines count up (or down) instead of appearing flat. */
  function decorate(html, sceneState) {
    if (state.reduced) return html;
    var lines = html.split('<br>');
    for (var i = 0; i < lines.length; i++) {
      if (!/(Toplam:|sepette:)/.test(lines[i])) continue;
      var tokens = lines[i].match(moneyRe());
      if (!tokens || !tokens.length) continue;
      var last = tokens[tokens.length - 1];
      var to = Number(last.replace(/\./g, '').replace(',', '.'));
      var from = sceneState.total === null ? 0 : sceneState.total;
      var pos = lines[i].lastIndexOf(last);
      lines[i] =
        lines[i].slice(0, pos) + countSpan(from, to) + lines[i].slice(pos + last.length);
      sceneState.total = to;
    }
    return lines.join('<br>');
  }

  /* Long catalog pages arrive line by line so the list reads as a scroll. */
  function catalogHtml(text) {
    var lines = esc(text).split('\n');
    var out = '';
    for (var i = 0; i < lines.length; i++) {
      out +=
        '<span class="cat-line" style="animation-delay:' +
        i * 55 +
        'ms">' +
        lines[i] +
        '</span>';
      if (i < lines.length - 1) out += '<br>';
    }
    return out;
  }

  function messageNode(m, i, sceneState) {
    var side = m.from === 'user' ? 'bubble-out' : 'bubble-in';
    var node = document.createElement('div');
    node.className = 'bubble ' + side;
    if (!state.reduced && /listede yok/.test(m.text)) node.className += ' fx-shake';
    var body;
    if (!state.reduced && m.text.indexOf('🛒 Katalog (sayfa') === 0) {
      body = catalogHtml(m.text);
    } else {
      body = decorate(esc(m.text).replace(/\n/g, '<br>'), sceneState);
    }
    node.innerHTML =
      body + '<span class="bubble-time">' + stamp(i) + (m.from === 'user' ? ' ✓✓' : '') + '</span>';
    return node;
  }

  function buttonsNode(m) {
    var wrap = document.createElement('div');
    wrap.className = 'phone-buttons';
    m.buttons.forEach(function (btn) {
      var row = document.createElement('div');
      row.className = 'phone-btn';
      row.textContent = btn.label;
      wrap.appendChild(row);
    });
    return wrap;
  }

  function typingNode() {
    var node = document.createElement('div');
    node.className = 'bubble bubble-in phone-typing';
    node.setAttribute('data-typing', '1');
    node.innerHTML = '<span></span><span></span><span></span>';
    return node;
  }

  function dropTyping() {
    var old = els.chat.querySelector('[data-typing]');
    if (old && old.parentNode) old.parentNode.removeChild(old);
  }

  function appendMessage(m, i, sceneState) {
    var bubble = messageNode(m, i, sceneState);
    els.chat.appendChild(bubble);
    revealNode(bubble);
    runCounts(bubble);
    if (m.type === 'buttons' && m.buttons && m.buttons.length) {
      var rows = buttonsNode(m);
      els.chat.appendChild(rows);
      revealNode(rows);
    }
    els.chat.scrollTop = els.chat.scrollHeight;
  }

  /* ── Per scene motion widgets ───────────────────────────────────────── */

  function qrMarkup(code) {
    var n = 9;
    var seed = 7;
    var k;
    for (k = 0; k < code.length; k++) seed = (seed * 33 + code.charCodeAt(k)) >>> 0;
    var html = '';
    var idx = 0;
    for (var r = 0; r < n; r++) {
      for (var c = 0; c < n; c++) {
        var on;
        var corner = (r < 3 && c < 3) || (r < 3 && c >= n - 3) || (r >= n - 3 && c < 3);
        if (corner) {
          var rr = r < 3 ? r : r - (n - 3);
          var cc = c < 3 ? c : c - (n - 3);
          on = (rr === 0 || rr === 2 || cc === 0 || cc === 2) && !(rr === 1 && cc === 1);
        } else {
          seed = (seed * 1664525 + 1013904223) >>> 0;
          on = ((seed >>> 16) & 1) === 1;
        }
        html +=
          '<span class="' +
          (on ? 'on' : '') +
          '" style="animation-delay:' +
          idx * 7 +
          'ms"></span>';
        idx++;
      }
    }
    return html;
  }

  function codeChars(code) {
    var html = '';
    for (var i = 0; i < code.length; i++) {
      html += '<i style="animation-delay:' + i * 90 + 'ms">' + esc(code.charAt(i)) + '</i>';
    }
    return html;
  }

  function payCard(code) {
    return make(
      'div',
      'fx-pay',
      '<div class="fx-pay-code" aria-hidden="true">' +
        codeChars(code) +
        '</div>' +
        '<div class="fx-qr" aria-hidden="true">' +
        qrMarkup(code) +
        '</div>' +
        '<p class="fx-pay-cap">kasada okut veya kodu söyle</p>',
    );
  }

  function voteCard() {
    return make(
      'div',
      'fx-vote',
      '<p class="fx-vote-h">🗳️ Oylama · 1 L Ayran</p>' +
        '<div class="fx-vote-bars">' +
        '<span class="fx-thr-label">%60 eşik</span>' +
        '<div class="fx-row"><span class="fx-lab">👍</span><span class="fx-track">' +
        '<i class="fx-fill fx-yes" style="--w:.73"></i><u class="fx-thr-line"></u>' +
        '</span><b>73</b></div>' +
        '<div class="fx-row"><span class="fx-lab">👎</span><span class="fx-track">' +
        '<i class="fx-fill fx-no" style="--w:.18"></i><u class="fx-thr-line"></u>' +
        '</span><b>18</b></div>' +
        '<div class="fx-row"><span class="fx-lab">🤷</span><span class="fx-track">' +
        '<i class="fx-fill fx-pass" style="--w:.09"></i><u class="fx-thr-line"></u>' +
        '</span><b>9</b></div>' +
        '</div>' +
        '<p class="fx-vote-f">11 oy · kabul için en az 3 oy ve en az %60 👍</p>',
    );
  }

  function flipCard() {
    return make(
      'div',
      'fx-flip-wrap',
      '<div class="fx-flip">' +
        '<div class="fx-face fx-front">' +
        '<span class="fx-face-tag">🗳️ kabul edildi</span>' +
        '<b>1 L Ayran</b>' +
        '<span>%73 👍 · 8/11 oy</span>' +
        '</div>' +
        '<div class="fx-face fx-back">' +
        '<span class="fx-face-tag">🛒 kataloğa girdi</span>' +
        '<b>16. Ayran 1 L</b>' +
        '<span>18,50 TL · 3+: 17,50 · 6+: 16,75</span>' +
        '</div>' +
        '</div>',
    );
  }

  function priceTag(step) {
    return make(
      'div',
      'fx-tag',
      '<span class="fx-tag-k">' +
        esc(step.tier) +
        '</span>' +
        '<span class="fx-old">' +
        fmtMoney(step.from) +
        '</span>' +
        '<span class="fx-arrow">↓</span>' +
        '<span class="fx-new">' +
        fmtMoney(step.to) +
        '</span>',
    );
  }

  function noteBanner() {
    return make(
      'div',
      'fx-note',
      '<span class="fx-note-ico">📦</span>' +
        '<span class="fx-note-txt"><b>Siparişiniz teslim edildi</b>' +
        '<small>alış kodu 7QF3RT · Bakkal Hasan Dede</small></span>',
    );
  }

  function matchBadge() {
    return make(
      'div',
      'fx-badge',
      '<span class="fx-badge-ico">🤝</span> Eşleşti · istek sahibiyle buluşturuluyor',
    );
  }

  function lenChip(done, limit) {
    return make('div', 'fx-chip fx-len', '📝 ' + intSpan(0, done) + '/' + limit + ' karakter');
  }

  function bump(node) {
    if (state.reduced) return;
    node.classList.remove('is-bump');
    void node.offsetWidth;
    node.classList.add('is-bump');
  }

  function appendFx(node, where) {
    var host = where === 'layer' && els.layer ? els.layer : els.chat;
    if (where !== 'layer') node.classList.add('fx-item');
    host.appendChild(node);
    revealNode(node);
    runCounts(node);
    if (host === els.chat) els.chat.scrollTop = els.chat.scrollHeight;
  }

  /* Timeline entries for the scene: { at, where, run }. */
  function fxSchedule(scene) {
    var out = [];
    var steps = CART_FX[scene.id];
    if (steps) {
      steps.forEach(function (step, i) {
        out.push({
          at: step.at,
          where: 'layer',
          run: function () {
            if (!bag.cart) {
              bag.cart = make('div', 'fx-chip fx-cart');
              bag.cart.innerHTML =
                '🧺 <b>' + step.items + '</b> ürün · ' + countSpan(0, step.total) + ' TL';
              appendFx(bag.cart, 'layer');
              return;
            }
            bag.cart.innerHTML =
              '🧺 <b>' + step.items + '</b> ürün · ' +
              countSpan(i > 0 ? steps[i - 1].total : 0, step.total) + ' TL';
            bump(bag.cart);
            runCounts(bag.cart);
          },
        });
      });
    }

    if (scene.id === 'tier-price') {
      PRICE_STEPS.forEach(function (step) {
        out.push({
          at: step.at,
          where: 'chat',
          run: function () {
            appendFx(priceTag(step), 'chat');
          },
        });
      });
    }

    if (scene.id === 'payment-code') {
      out.push({
        at: 1750,
        where: 'chat',
        run: function () {
          appendFx(payCard('7QF3RT'), 'chat');
        },
      });
    }

    if (scene.id === 'delivery-notice') {
      out.push({
        at: 400,
        where: 'layer',
        run: function () {
          appendFx(noteBanner(), 'layer');
        },
      });
    }

    if (scene.id === 'suggest-demand') {
      out.push({
        at: 1650,
        where: 'chat',
        run: function () {
          appendFx(lenChip(9, 140), 'chat');
        },
      });
    }

    if (scene.id === 'vote-round') {
      out.push({
        at: 2500,
        where: 'chat',
        run: function () {
          appendFx(voteCard(), 'chat');
        },
      });
    }

    if (scene.id === 'convert-pano') {
      out.push({
        at: 1450,
        where: 'chat',
        run: function () {
          appendFx(flipCard(), 'chat');
        },
      });
      out.push({
        at: 3150,
        where: 'chat',
        run: function () {
          appendFx(matchBadge(), 'chat');
        },
      });
    }

    return out;
  }

  function renderScene(scene) {
    clearTimers();
    clearMotion();
    if (els.layer) els.layer.innerHTML = '';
    bag = {};
    els.chat.innerHTML = '';
    var instant = state.reduced;
    var sceneState = { total: null };
    var clock = 0;
    var lastAt = 0;

    scene.messages.forEach(function (m, i) {
      var start = clock;
      var at;
      if (!instant && m.from === 'bot' && m.delay) {
        at = start + m.delay;
        later(function () {
          els.chat.appendChild(typingNode());
          els.chat.scrollTop = els.chat.scrollHeight;
        }, start);
        later(function () {
          dropTyping();
          appendMessage(m, i, sceneState);
        }, at);
        clock = at + STAGGER_MS;
      } else {
        at = start;
        later(function () {
          dropTyping();
          appendMessage(m, i, sceneState);
        }, at);
        clock = at + STAGGER_MS;
      }
      if (at > lastAt) lastAt = at;
    });

    var fx = instant ? [] : fxSchedule(scene);
    fx.forEach(function (entry) {
      if (entry.at > lastAt) lastAt = entry.at;
      later(entry.run, entry.at);
    });

    state.duration = clamp(lastAt + HOLD_MS, MIN_MS, MAX_MS);
    state.elapsed = 0;
    setProgress(0);
  }

  function setProgress(p) {
    if (!els.fill) return;
    els.fill.style.transform = 'scaleX(' + clamp(p, 0, 1).toFixed(4) + ')';
  }

  function paint() {
    var scene = scenes[index];
    els.count.textContent = 'Adım ' + (index + 1) + '/' + scenes.length;
    els.title.textContent = scene.title;
    els.caption.textContent = scene.caption;
    els.phone.setAttribute(
      'aria-label',
      'Sahne ' + (index + 1) + '/' + scenes.length + ': ' + scene.title,
    );
    els.root.setAttribute('data-scene-index', String(index));
    var dots = els.dots.querySelectorAll('.walk-dot');
    for (var i = 0; i < dots.length; i++) {
      var active = i === index;
      dots[i].classList.toggle('is-active', active);
      dots[i].setAttribute('aria-current', active ? 'true' : 'false');
      if (i < scenes.length) {
        dots[i].setAttribute('aria-label', 'Sahne ' + (i + 1) + ': ' + scenes[i].title);
      }
    }
    renderScene(scene);
  }

  /* ── Playback engine ────────────────────────────────────────────────── */

  function canPlay() {
    return (
      state.wanted &&
      !state.reduced &&
      !state.hovering &&
      state.visible &&
      Date.now() >= state.busyUntil &&
      scenes.length > 1
    );
  }

  function paintPlayButton() {
    els.play.setAttribute('aria-pressed', state.playing ? 'true' : 'false');
    els.play.textContent = state.playing ? '⏸ Duraklat' : '▶ Oynat';
  }

  function startTick() {
    state.playing = true;
    state.lastTs = 0;
    state.raf = window.requestAnimationFrame(tick);
    els.root.setAttribute('data-playing', 'true');
    paintPlayButton();
  }

  function stopTick() {
    if (state.raf) window.cancelAnimationFrame(state.raf);
    state.raf = 0;
    state.playing = false;
    els.root.setAttribute('data-playing', 'false');
    paintPlayButton();
  }

  function tick(ts) {
    if (!state.playing) return;
    if (state.lastTs === 0) state.lastTs = ts;
    state.elapsed += ts - state.lastTs;
    state.lastTs = ts;
    if (state.elapsed >= state.duration) {
      state.elapsed = 0;
      go(index + 1, false);
    } else {
      setProgress(state.elapsed / state.duration);
    }
    state.raf = window.requestAnimationFrame(tick);
  }

  function syncPlayer() {
    var play = canPlay();
    if (play && !state.playing) startTick();
    else if (!play && state.playing) stopTick();
    else paintPlayButton();
  }

  function setBusy(ms) {
    state.busyUntil = Date.now() + ms;
    if (state.busyTimer) window.clearTimeout(state.busyTimer);
    state.busyTimer = window.setTimeout(function () {
      state.busyTimer = 0;
      syncPlayer();
    }, ms + 30);
    syncPlayer();
  }

  function togglePlay() {
    if (state.reduced) return;
    state.wanted = !state.wanted;
    els.root.setAttribute('data-autoplay', state.wanted ? 'true' : 'false');
    if (state.wanted) state.busyUntil = 0;
    syncPlayer();
  }

  function go(next, manual) {
    if (manual) setBusy(TAP_IDLE_MS);
    index = (((next % scenes.length) + scenes.length) % scenes.length);
    paint();
    syncPlayer();
  }

  /* ── Wiring ─────────────────────────────────────────────────────────── */

  function wireControls() {
    els.prev.addEventListener('click', function () {
      go(index - 1, true);
    });
    els.next.addEventListener('click', function () {
      go(index + 1, true);
    });
    els.play.addEventListener('click', togglePlay);
    els.dots.addEventListener('click', function (ev) {
      var dot = ev.target.closest ? ev.target.closest('.walk-dot') : null;
      if (!dot) return;
      go(Number(dot.getAttribute('data-scene')), true);
    });
  }

  function wireKeys() {
    document.addEventListener('keydown', function (ev) {
      if (!state.visible) return;
      var tag = ev.target && ev.target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (ev.key === 'ArrowRight' || ev.key === 'PageDown') {
        ev.preventDefault();
        go(index + 1, true);
      } else if (ev.key === 'ArrowLeft' || ev.key === 'PageUp') {
        ev.preventDefault();
        go(index - 1, true);
      }
    });
  }

  function wireSwipe() {
    var startX = null;
    var startY = null;
    els.phone.addEventListener(
      'touchstart',
      function (ev) {
        if (ev.touches.length !== 1) return;
        startX = ev.touches[0].clientX;
        startY = ev.touches[0].clientY;
        setBusy(TAP_IDLE_MS);
      },
      { passive: true },
    );
    els.phone.addEventListener(
      'touchend',
      function (ev) {
        if (startX === null) return;
        var touch = ev.changedTouches[0];
        var dx = touch.clientX - startX;
        var dy = touch.clientY - startY;
        startX = null;
        startY = null;
        if (Math.abs(dx) < SWIPE_PX || Math.abs(dx) < Math.abs(dy)) return;
        go(index + (dx < 0 ? 1 : -1), true);
      },
      { passive: true },
    );
  }

  function wireHover() {
    els.root.addEventListener('mouseenter', function () {
      state.hovering = true;
      syncPlayer();
    });
    els.root.addEventListener('mouseleave', function () {
      state.hovering = false;
      setBusy(HOVER_IDLE_MS);
    });
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) setBusy(HOVER_IDLE_MS);
    });
  }

  function wireVisibility() {
    if (!('IntersectionObserver' in window)) {
      state.visible = true;
      return;
    }
    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          state.visible = entry.isIntersecting;
        });
        syncPlayer();
      },
      { threshold: 0.2 },
    );
    io.observe(els.root);
  }

  function applyMode() {
    state.reduced = reducedMotion();
    els.root.setAttribute('data-motion', state.reduced ? 'reduced' : 'auto');
    if (state.reduced) {
      state.wanted = false;
      stopTick();
      els.play.disabled = true;
      els.play.title = 'Hareket azaltma açık: otomatik oynatma kapalı';
    } else {
      state.wanted = true;
      els.play.disabled = false;
      els.play.removeAttribute('title');
    }
    els.root.setAttribute('data-autoplay', state.wanted ? 'true' : 'false');
  }

  function wireMotion() {
    if (!window.matchMedia) return;
    var mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    var onChange = function () {
      applyMode();
      if (scenes.length) paint();
      syncPlayer();
    };
    if (typeof mq.addEventListener === 'function') mq.addEventListener('change', onChange);
    else if (typeof mq.addListener === 'function') mq.addListener(onChange);
  }

  function ensureDots() {
    var dots = els.dots.querySelectorAll('.walk-dot');
    if (dots.length === scenes.length) return;
    els.dots.innerHTML = '';
    var frag = document.createDocumentFragment();
    scenes.forEach(function (scene, i) {
      var dot = document.createElement('button');
      dot.type = 'button';
      dot.className = 'walk-dot';
      dot.setAttribute('data-scene', String(i));
      dot.setAttribute('aria-label', 'Sahne ' + (i + 1) + ': ' + scene.title);
      frag.appendChild(dot);
    });
    els.dots.appendChild(frag);
  }

  function init() {
    var root = document.getElementById('walk');
    if (!root) return;
    var picked = {
      root: root,
      phone: document.getElementById('walk-phone'),
      chat: document.getElementById('walk-chat'),
      title: document.getElementById('walk-title'),
      caption: document.getElementById('walk-caption'),
      count: document.getElementById('walk-count'),
      prev: document.getElementById('walk-prev'),
      next: document.getElementById('walk-next'),
      play: document.getElementById('walk-play'),
      dots: document.getElementById('walk-dots'),
      fill: document.getElementById('walk-progress-fill'),
      layer: document.getElementById('walk-fx'),
    };
    for (var key in picked) {
      if (!picked[key]) return;
    }
    els = picked;

    var data = window.MC_WALK;
    if (!data || !Array.isArray(data.scenes) || !data.scenes.length) {
      els.chat.textContent = 'Sahneler yüklenemedi. Tam akış demoda çalışıyor.';
      els.count.textContent = 'Sahne yok';
      els.prev.disabled = true;
      els.next.disabled = true;
      els.play.disabled = true;
      return;
    }
    scenes = data.scenes;
    els.root.setAttribute('data-scene-count', String(scenes.length));

    applyMode();
    ensureDots();
    wireControls();
    wireKeys();
    wireSwipe();
    wireHover();
    wireVisibility();
    wireMotion();
    paint();
    syncPlayer();
  }

  if (document.readyState === 'complete') {
    init();
  } else {
    window.addEventListener('load', init);
  }
})();
