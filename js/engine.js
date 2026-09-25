/* MahalleCoop static demo chat engine. UMD, DOM-free, runs in Node tests.
   Mirrors src/whatsapp/flow.ts state machine with the demo search fallback
   and mock PAY (PENDING then PAID with a 6-char pickup code).
   Money is integer kurus everywhere. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.MC = Object.assign(root.MC || {}, factory());
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var CATALOG_PAGE_SIZE = 8;
  var MAX_CATALOG_QTY = 10;
  var PROPOSAL_MAX_LEN = 140;
  var AIDPOST_MAX_LEN = 250;
  var AIDPOST_DAILY_LIMIT = 2;
  var NOTE_MAX_LEN = 250;
  var MIN_VOTES = 3;
  var ACCEPT_AGREE_PCT = 0.6;
  var PANO_PER_PAGE = 3;
  var PICKUP_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  var PICKUP_LENGTH = 6;

  var QUICK_ADDONS = [
    { code: 'BREAD_2X', label: '+2 Ekmek' },
    { code: 'MILK_1L', label: '+1 Süt' },
  ];
  var ADDON_MAP = {};
  QUICK_ADDONS.forEach(function (a) {
    ADDON_MAP[a.code] = a.label;
  });

  var KVKK_COPY =
    '🔐 KVKK Onayı: Kişisel verileriniz (telefon numarası) yalnızca sipariş bildirimleri için işlenir. Devam etmek için onaylayın.';
  var ADDONS_COPY =
    '🥖 Günlük bakkal ürünü eklemek ister misin? (Bakkal kasasında ödenir, kart işlemez)';
  var CATALOG_HINT =
    'Anlamadım 🙂 Sipariş için numara yaz: "3" → 1 adet, "3 5" → 5 adet. Çıkarmak için "-3", sepeti boşaltmak için "0 0 0".';

  function fmtKurus(kurus) {
    return (kurus / 100).toLocaleString('tr-TR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }) + ' TL';
  }

  function shortKurus(kurus) {
    return (kurus / 100).toLocaleString('tr-TR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function txt(text) {
    return { from: 'bot', type: 'text', text: text };
  }

  function btns(text, buttons) {
    return { from: 'bot', type: 'buttons', text: text, buttons: buttons };
  }

  function lst(text, buttons) {
    return { from: 'bot', type: 'list', text: text, buttons: buttons };
  }

  function addonLabel(code) {
    return ADDON_MAP[code] || code;
  }

  function isQuickAddonCode(code) {
    return Object.prototype.hasOwnProperty.call(ADDON_MAP, code);
  }

  function resolveTier(p, qty) {
    if (qty >= p.thresholds[1]) return { tier: 3, price: p.tiers[2] };
    if (qty >= p.thresholds[0]) return { tier: 2, price: p.tiers[1] };
    return { tier: 1, price: p.tiers[0] };
  }

  function generatePickupCode() {
    var out = '';
    for (var i = 0; i < PICKUP_LENGTH; i++) {
      out += PICKUP_ALPHABET.charAt(Math.floor(Math.random() * PICKUP_ALPHABET.length));
    }
    return out;
  }

  function normalizeCmd(raw) {
    return String(raw).trim().replace(/\s+/g, ' ').replace(/[.,;:)!?]+$/u, '');
  }

  function parseCatalogCommand(raw) {
    var body = normalizeCmd(raw).toLocaleLowerCase('tr');
    if (body === '0 0 0' || body === 'temizle') return { kind: 'clear' };
    if (body === 'sepet') return { kind: 'cart' };
    if (body === 'menü' || body === 'menu') return { kind: 'menu' };
    var add = body.match(/^(\d{1,3})(?: (\d{1,3}))?$/);
    if (add) {
      return { kind: 'add', index: Number(add[1]), qty: add[2] !== undefined ? Number(add[2]) : 1 };
    }
    var rem = body.match(/^-(\d{1,3})(?: (\d{1,3}))?$/);
    if (rem) {
      return { kind: 'remove', index: Number(rem[1]), qty: rem[2] !== undefined ? Number(rem[2]) : 1 };
    }
    return null;
  }

  function activeProducts(state) {
    return state.products.filter(function (p) {
      return p.active;
    });
  }

  function productById(state, id) {
    var found = null;
    state.products.forEach(function (p) {
      if (p.id === id) found = p;
    });
    return found;
  }

  function findById(list, id) {
    var found = null;
    list.forEach(function (x) {
      if (x.id === id) found = x;
    });
    return found;
  }

  function catalogLine(index, p) {
    var tiers = [shortKurus(p.tiers[0]) + ' TL'];
    if (p.tiers[1] < p.tiers[0]) tiers.push(p.thresholds[0] + '+: ' + shortKurus(p.tiers[1]));
    if (p.tiers[2] < p.tiers[1]) tiers.push(p.thresholds[1] + '+: ' + shortKurus(p.tiers[2]));
    return index + 1 + '. ' + p.name + ' ' + p.unit + ' · ' + tiers.join(' · ');
  }

  function cartView(state, session) {
    return session.cart.map(function (line) {
      var p = productById(state, line.productId);
      var r = resolveTier(p, line.qty);
      return {
        name: p.name,
        qty: line.qty,
        unitPriceKurus: r.price,
        lineTotalKurus: r.price * line.qty,
        tier: r.tier,
      };
    });
  }

  function cartTotalKurus(state, session) {
    return cartView(state, session).reduce(function (s, l) {
      return s + l.lineTotalKurus;
    }, 0);
  }

  function cartLineText(l) {
    return l.name + ' × ' + l.qty + ' @ ' + shortKurus(l.unitPriceKurus) + ' = ' + fmtKurus(l.lineTotalKurus);
  }

  function pushEvent(state, text) {
    var maxId = 0;
    state.events.forEach(function (e) {
      if (e.id > maxId) maxId = e.id;
    });
    state.events.push({ id: maxId + 1, ts: nowIso(), text: text });
  }

  function defaultSession() {
    return {
      state: 'KVKK_GATE',
      catalogPage: 0,
      cart: [],
      addons: [],
      note: null,
      voteQueue: [],
      voteIndex: 0,
      voteRoundId: null,
      panoKind: null,
      panoPage: 0,
      skipAddonsLabel: 'Geç',
    };
  }

  function ensureSession(state, userId) {
    if (!state.sessions[userId]) state.sessions[userId] = defaultSession();
    if (!state.transcripts[userId]) state.transcripts[userId] = [];
    return state.sessions[userId];
  }

  function buttonLabel(state, userId, body) {
    var tr = state.transcripts[userId] || [];
    for (var i = tr.length - 1; i >= 0; i--) {
      var m = tr[i];
      if (m.buttons) {
        for (var j = 0; j < m.buttons.length; j++) {
          if (m.buttons[j].id === body) return m.buttons[j].label;
        }
      }
    }
    return body;
  }

  function kvkkGateMessages() {
    return [btns(KVKK_COPY, [{ id: 'ACCEPT_KVKK', label: 'Onaylıyorum' }])];
  }

  function menuMessages() {
    return [
      lst("🏪 MahalleCoop'a hoş geldiniz!\nNe yapmak istersiniz?", [
        { id: 'BROWSE', label: '🛒 Katalog' },
        { id: 'CART', label: '🧺 Sepetim' },
        { id: 'HELP', label: 'ℹ️ Yardım' },
        { id: 'ORDERS', label: '📦 Siparişlerim' },
        { id: 'PAGE2', label: '🗳️ Topluluk →' },
      ]),
    ];
  }

  function menuPage2Messages() {
    return [
      lst('🗳️ Topluluk: Talep Turu ve Dayanışma Panosu burada.', [
        { id: 'DEMAND', label: '🗳️ Talep Turu' },
        { id: 'DAYANISMA', label: '🤝 Dayanışma' },
        { id: 'PAGE1', label: '⬅️ Ana Menü' },
      ]),
    ];
  }

  function catalogPage(state, session) {
    var products = activeProducts(state);
    if (products.length === 0) {
      session.state = 'MENU';
      return [txt('Henüz ürün yok.')].concat(menuMessages());
    }
    var pages = Math.ceil(products.length / CATALOG_PAGE_SIZE);
    var page = session.catalogPage;
    if (page < 0 || page >= pages) page = 0;
    session.catalogPage = page;

    var start = page * CATALOG_PAGE_SIZE;
    var slice = products.slice(start, start + CATALOG_PAGE_SIZE);
    var header = [
      '🛒 Katalog' + (pages > 1 ? ' (sayfa ' + (page + 1) + '/' + pages + ')' : ''),
      'Numara yaz → 1 adet · "3 5" → 5 adet',
      '"-3" → çıkar · "0 0 0" → sepeti boşalt',
    ].join('\n');
    var lines = slice.map(function (p, i) {
      return catalogLine(start + i, p);
    });
    var body = [header].concat(lines).join('\n');

    var buttons = [];
    if (page > 0) buttons.push({ id: 'CATALOG_PREV', label: '⬅️ Önceki' });
    if (page < pages - 1) buttons.push({ id: 'CATALOG_NEXT', label: '➡️ Sonraki' });
    buttons.push({ id: 'CATALOG_EXIT', label: '🚪 Çık' });

    session.state = 'CATALOG';
    return [btns(body, buttons)];
  }

  function searchProducts(state, raw) {
    var q = String(raw).trim().toLocaleLowerCase('tr');
    if (!q || !/[^\d\s]/.test(q)) return [];
    if (!/[\p{L}]/u.test(q)) return [];
    var words = q.split(/\s+/).filter(Boolean);
    var hits = [];
    activeProducts(state).forEach(function (p, i) {
      var hay = (p.name + ' ' + p.unit).toLocaleLowerCase('tr');
      var all = words.every(function (w) {
        return hay.indexOf(w) !== -1;
      });
      if (all) hits.push({ index: i, product: p });
    });
    return hits;
  }

  function addToCart(state, session, p, qty) {
    var line = null;
    session.cart.forEach(function (l) {
      if (l.productId === p.id) line = l;
    });
    var newQty = (line ? line.qty : 0) + qty;
    if (line) {
      line.qty = newQty;
    } else {
      session.cart.push({ productId: p.id, qty: newQty });
    }
    var r = resolveTier(p, newQty);
    return { qty: newQty, price: r.price, total: r.price * newQty };
  }

  function handleCatalog(state, session, input) {
    var body = String(input.body);
    switch (body) {
      case 'CATALOG_NEXT':
        session.catalogPage += 1;
        return catalogPage(state, session);
      case 'CATALOG_PREV':
        session.catalogPage = Math.max(0, session.catalogPage - 1);
        return catalogPage(state, session);
      case 'CATALOG_EXIT':
        session.state = 'MENU';
        return menuMessages();
      case 'RESEND_LIST':
        return catalogPage(state, session);
    }
    if (input.type !== 'button') {
      var cmd = parseCatalogCommand(body);
      if (!cmd) {
        var hits = searchProducts(state, body);
        if (hits.length > 0) {
          var found = hits.slice(0, 5).map(function (h) {
            return catalogLine(h.index, h.product);
          });
          return [txt('Bulunanlar: ' + found.join(' · '))].concat(catalogPage(state, session));
        }
        return [txt(CATALOG_HINT)].concat(catalogPage(state, session));
      }
      if (cmd.kind === 'cart') {
        session.state = 'CART';
        return cartMessages(state, session);
      }
      if (cmd.kind === 'menu') {
        session.state = 'MENU';
        return menuMessages();
      }
      if (cmd.kind === 'clear') {
        if (session.cart.length === 0) {
          return [txt('Sepet zaten boş 😄')].concat(catalogPage(state, session));
        }
        session.cart = [];
        return [txt('🗑️ Sepet boşaltıldı.')].concat(catalogPage(state, session));
      }

      var products = activeProducts(state);
      var p = cmd.index >= 1 && cmd.index <= products.length ? products[cmd.index - 1] : null;
      if (!p) {
        return [
          txt(cmd.index + ' listede yok. Listeyi tekrar göndereyim mi?'),
          btns('🛒 Katalog', [{ id: 'RESEND_LIST', label: 'Evet, Göster' }]),
        ];
      }
      if (cmd.qty === 0) {
        return [txt('Adet sıfır olamaz 🙂')].concat(catalogPage(state, session));
      }
      if (cmd.qty > MAX_CATALOG_QTY) {
        return [txt('Tek komutta en fazla ' + MAX_CATALOG_QTY + ' adet yazabilirsin.')].concat(
          catalogPage(state, session),
        );
      }

      if (cmd.kind === 'add') {
        var added = addToCart(state, session, p, cmd.qty);
        var addedText =
          '✔ Eklendi: +' + cmd.qty + ' × ' + p.name +
          ' (sepette: ' + added.qty + ' × ' + shortKurus(added.price) +
          ' = ' + fmtKurus(added.total) + ')';
        return [txt(addedText)].concat(catalogPage(state, session));
      }

      var existing = null;
      session.cart.forEach(function (l) {
        if (l.productId === p.id) existing = l;
      });
      if (!existing) {
        return [txt(cmd.index + ' sepette yok zaten 😄')].concat(catalogPage(state, session));
      }
      var removed = Math.min(cmd.qty, existing.qty);
      var remaining = existing.qty - removed;
      var leftText;
      if (remaining === 0) {
        session.cart = session.cart.filter(function (l) {
          return l.productId !== p.id;
        });
        leftText = '✔ Çıkarıldı: ' + removed + ' × ' + p.name + ' (sepette kalmadı)';
      } else {
        existing.qty = remaining;
        var r = resolveTier(p, remaining);
        leftText =
          '✔ Çıkarıldı: ' + removed + ' × ' + p.name +
          ' (kalan: ' + remaining + ' × ' + shortKurus(r.price) + ')';
      }
      return [txt(leftText)].concat(catalogPage(state, session));
    }
    return catalogPage(state, session);
  }

  function cartMessages(state, session) {
    if (session.cart.length === 0) {
      return [btns('🧺 Sepetiniz boş.', [{ id: 'BROWSE', label: '🛒 Ürünlere Göz At' }])];
    }
    var lines = cartView(state, session).map(cartLineText);
    var total = cartTotalKurus(state, session);
    var mainText = lines.concat(['', 'Toplam: ' + fmtKurus(total)]).join('\n');
    return [
      btns(mainText, [
        { id: 'CHECKOUT', label: '✅ Ödeme' },
        { id: 'BROWSE', label: '➕ Ürün Ekle' },
        { id: 'CLEAR', label: '🗑️ Sepeti Boşalt' },
      ]),
    ];
  }

  function handleCart(state, session, input) {
    switch (String(input.body)) {
      case 'CHECKOUT':
        if (session.cart.length === 0) return cartMessages(state, session);
        session.state = 'ADDONS';
        session.skipAddonsLabel = 'Geç';
        return addonsMessages(session);
      case 'BROWSE':
        session.catalogPage = 0;
        return catalogPage(state, session);
      case 'CLEAR':
        session.cart = [];
        session.state = 'MENU';
        return menuMessages();
      default:
        return cartMessages(state, session);
    }
  }

  function addonsMessages(session) {
    var selected = session.addons.length
      ? '\n\nSeçili: ' + session.addons.map(addonLabel).join(', ')
      : '';
    var primary = QUICK_ADDONS.map(function (a) {
      return { id: 'ADDON:' + a.code, label: a.label };
    }).concat([{ id: 'NOTE', label: '📝 Not Yaz' }]);
    var trailing = [{ id: 'SKIP_ADDONS', label: session.skipAddonsLabel }];
    var groups = [];
    var i;
    for (i = 0; i < primary.length; i += 3) groups.push(primary.slice(i, i + 3));
    if (groups.length === 0) groups.push(trailing);
    else if (groups[groups.length - 1].length + trailing.length <= 3) {
      groups[groups.length - 1] = groups[groups.length - 1].concat(trailing);
    } else {
      groups.push(trailing);
    }
    return groups.map(function (g, idx) {
      return btns(idx === 0 ? ADDONS_COPY + selected : '⬇️', g);
    });
  }

  function handleAddons(state, session, input) {
    var body = String(input.body);
    if (body.indexOf('ADDON:') === 0) {
      var code = body.slice('ADDON:'.length);
      if (isQuickAddonCode(code)) {
        if (session.addons.indexOf(code) !== -1) {
          return [txt('Zaten eklendi: ' + addonLabel(code))].concat(addonsMessages(session));
        }
        session.addons.push(code);
        return [txt('Eklendi: ' + addonLabel(code))].concat(addonsMessages(session));
      }
      return addonsMessages(session);
    }
    if (body === 'NOTE') {
      session.state = 'NOTE';
      return [txt('📝 Notunuzu yazın (en fazla 250 karakter):')];
    }
    if (body === 'SKIP_ADDONS') {
      session.state = 'CONFIRM';
      return confirmMessages(state, session);
    }
    return addonsMessages(session);
  }

  function handleNote(state, session, input) {
    if (input.type === 'text') {
      var raw = String(input.body).trim();
      if (raw === '') return [txt('📝 Not boş olamaz. Lütfen tekrar yazın.')];
      session.note = raw.length > NOTE_MAX_LEN ? raw.slice(0, NOTE_MAX_LEN) + '…' : raw;
      session.state = 'ADDONS';
      session.skipAddonsLabel = 'Tamam, Devam';
      return [txt('📝 Not kaydedildi ✔')].concat(addonsMessages(session));
    }
    return [txt('📝 Notunuzu yazın (en fazla 250 karakter):')];
  }

  function confirmMessages(state, session) {
    var lines = cartView(state, session).map(cartLineText);
    var total = cartTotalKurus(state, session);
    var parts = ['📋 Sipariş Özeti'].concat(lines, ['Toplam: ' + fmtKurus(total), '']);
    if (session.addons.length > 0) {
      parts.push('🏪 Bakkal kasasında öde: ' + session.addons.map(addonLabel).join(', '));
    }
    if (session.note) parts.push('📝 Not: ' + session.note);
    return [
      btns(parts.join('\n'), [
        { id: 'PAY', label: '✅ Onayla ve Öde' },
        { id: 'BACK', label: '⬅️ Geri' },
      ]),
    ];
  }

  function handleConfirm(state, session, user, input) {
    var body = String(input.body);
    if (body === 'PAY') return placeOrder(state, session, user);
    if (body === 'BACK') {
      session.state = 'ADDONS';
      session.skipAddonsLabel = 'Tamam, Devam';
      return addonsMessages(session);
    }
    return confirmMessages(state, session);
  }

  function placeOrder(state, session, user) {
    if (session.cart.length === 0) {
      session.state = 'MENU';
      return [txt('🧺 Sepetiniz boş. Önce ürün ekleyin.')].concat(menuMessages());
    }
    var windowOpen = null;
    state.windows.forEach(function (w) {
      if (w.status === 'OPEN') windowOpen = w;
    });
    if (!windowOpen) {
      session.state = 'MENU';
      return [txt('Şu an aktif sipariş penceresi yok 😔')].concat(menuMessages());
    }

    var views = cartView(state, session);
    var items = session.cart.map(function (line, idx) {
      var v = views[idx];
      return {
        productId: line.productId,
        qty: v.qty,
        unitPriceKurus: v.unitPriceKurus,
        lineTotalKurus: v.lineTotalKurus,
        tier: v.tier,
      };
    });
    var totalKurus = views.reduce(function (s, l) {
      return s + l.lineTotalKurus;
    }, 0);
    var maxId = 0;
    state.orders.forEach(function (o) {
      if (o.id > maxId) maxId = o.id;
    });
    var order = {
      id: maxId + 1,
      userId: user.id,
      items: items,
      totalKurus: totalKurus,
      addons: session.addons.slice(),
      note: session.note,
      status: 'PENDING',
      pickupCode: null,
      createdAt: nowIso(),
    };
    state.orders.push(order);

    /* Mock checkout already ran in the demo card modal, so the order flips
       from PENDING to PAID here and gets its pickup code. */
    order.status = 'PAID';
    order.pickupCode = generatePickupCode();

    session.cart = [];
    session.addons = [];
    session.note = null;
    session.state = 'DONE';
    pushEvent(state, 'Sipariş #' + order.id + ' ödendi');

    var reply =
      'Sipariş #' + order.id + ' ödendi!\n' +
      'Toplam: ' + fmtKurus(totalKurus) + '\n' +
      '📦 Alış kodu: ' + order.pickupCode + '\n' +
      'Kodu kasada söyle, paketin hazır beklesin.';
    return [btns(reply, [{ id: 'HOME', label: '⬅️ Ana Menü' }])];
  }

  function ordersMessages(state, session, user) {
    var mine = state.orders
      .filter(function (o) {
        return o.userId === user.id;
      })
      .sort(function (a, b) {
        return b.id - a.id;
      });
    if (mine.length === 0) {
      session.state = 'HISTORY';
      return [btns('📦 Henüz siparişin yok.', [{ id: 'PAGE1', label: '⬅️ Ana Menü' }])];
    }
    var statusLabel = { PENDING: '⏳ Bekliyor', PAID: '💳 Ödendi', DELIVERED: '✅ Teslim edildi' };
    var lines = mine.map(function (o) {
      var when = new Date(o.createdAt).toLocaleDateString('tr-TR');
      var itemsText = o.items
        .map(function (it) {
          var p = productById(state, it.productId);
          return (p ? p.name : '#' + it.productId) + '×' + it.qty;
        })
        .join(', ');
      return (
        '#' + o.id + ' · ' + when + ' · ' + fmtKurus(o.totalKurus) + ' · ' +
        (statusLabel[o.status] || o.status) + '\n' + itemsText
      );
    });
    var buttons = mine.slice(0, 3).map(function (o) {
      return { id: 'REORDER:' + o.id, label: '🔁 Tekrar #' + o.id };
    });
    buttons.push({ id: 'PAGE1', label: '⬅️ Ana Menü' });
    session.state = 'HISTORY';
    return [btns('📦 Siparişlerim\n\n' + lines.join('\n\n'), buttons)];
  }

  function handleOrders(state, session, user, input) {
    var body = String(input.body);
    var reorder = body.match(/^REORDER:(\d+)$/);
    if (reorder) {
      var wanted = Number(reorder[1]);
      var order = null;
      state.orders.forEach(function (o) {
        if (o.id === wanted && o.userId === user.id) order = o;
      });
      if (!order) {
        session.state = 'MENU';
        return [txt('Sipariş bulunamadı.')].concat(menuMessages());
      }
      session.cart = order.items.map(function (it) {
        return { productId: it.productId, qty: it.qty };
      });
      session.state = 'CART';
      return [txt('🔁 Sipariş #' + order.id + ' sepete yüklendi.')].concat(
        cartMessages(state, session),
      );
    }
    if (body === 'PAGE1' || body === 'HOME') {
      session.state = 'MENU';
      return menuMessages();
    }
    return ordersMessages(state, session, user);
  }

  function findOpenRound(state, kind) {
    var found = null;
    var now = Date.now();
    state.rounds.forEach(function (r) {
      if (r.kind === kind && r.status === 'OPEN' && Date.parse(r.closesAt) > now) found = r;
    });
    return found;
  }

  function findRound(state, id) {
    var found = null;
    state.rounds.forEach(function (r) {
      if (r.id === id) found = r;
    });
    return found;
  }

  function tallyProposal(p) {
    var choices = Object.keys(p.votes).map(function (k) {
      return p.votes[k];
    });
    var agree = choices.filter(function (c) {
      return c === 'AGREE';
    }).length;
    var voteCount = choices.length;
    var pct = voteCount > 0 ? agree / voteCount : 0;
    return {
      id: p.id,
      text: p.text,
      voteCount: voteCount,
      agree: agree,
      agreementPct: pct,
      accepted: voteCount >= MIN_VOTES && pct >= ACCEPT_AGREE_PCT,
    };
  }

  function demandMenuMessage(round) {
    var closes = new Date(round.closesAt).toLocaleString('tr-TR');
    return btns('🗳️ Talep Turu: ' + round.title + '\nKapanış: ' + closes, [
      { id: 'SUGGEST', label: '💡 Öneri Yap' },
      { id: 'VOTE_NEXT', label: '🗳️ Oylamaya Katıl' },
      { id: 'SKIP_DEMAND', label: 'Geç' },
    ]);
  }

  function enterDemand(state, session) {
    var round = findOpenRound(state, 'DEMAND');
    if (!round) {
      session.state = 'MENU';
      return [txt('Şu an açık talep turu yok. Bakkal yeni tur açınca haber vereceğiz.')].concat(
        menuMessages(),
      );
    }
    session.state = 'MENU';
    return [demandMenuMessage(round)];
  }

  function suggestPrompt() {
    return "📝 Önerini yaz (en fazla 140 karakter), örn. '1 L Ayran':";
  }

  function enterSuggest(state, session) {
    var round = findOpenRound(state, 'DEMAND');
    if (!round) {
      session.state = 'MENU';
      return [txt('Şu an açık talep turu yok. Öneri alınamıyor.')].concat(menuMessages());
    }
    session.state = 'SUGGEST';
    return [txt(suggestPrompt())];
  }

  function handleSuggest(state, session, user, input) {
    if (input.type !== 'text') return [txt(suggestPrompt())];
    var raw = String(input.body).trim();
    if (!raw) return [txt('📝 Öneri boş olamaz. Lütfen tekrar yazın.')];
    var text = raw.length > PROPOSAL_MAX_LEN ? raw.slice(0, PROPOSAL_MAX_LEN) + '…' : raw;

    var round = findOpenRound(state, 'DEMAND');
    if (!round) {
      session.state = 'MENU';
      return [txt('Şu an açık talep turu yok. Önerin alınamadı.')].concat(menuMessages());
    }
    var maxId = 0;
    state.rounds.forEach(function (r) {
      r.proposals.forEach(function (p) {
        if (p.id > maxId) maxId = p.id;
      });
    });
    round.proposals.push({
      id: maxId + 1,
      authorId: user.id,
      text: text,
      status: 'PENDING',
      convertedProductId: null,
      votes: {},
    });
    pushEvent(state, 'Yeni öneri alındı (uzunluk ' + text.length + ')');
    session.state = 'MENU';
    return [
      txt('✔ Önerin alındı! Bakkal onaylayınca oylamaya çıkar.'),
      demandMenuMessage(round),
    ];
  }

  function enterVote(state, session, user, kind) {
    var round = findOpenRound(state, kind);
    if (!round) {
      session.state = 'MENU';
      var noRound =
        kind === 'DEMAND'
          ? 'Şu an açık talep turu yok. Bakkal yeni tur açınca haber vereceğiz.'
          : 'Şu an açık bir surplus oylaması yok. Bakkal yeni tur açınca haber vereceğiz.';
      return [txt(noRound)].concat(menuMessages());
    }
    var queue = [];
    round.proposals.forEach(function (p) {
      if (p.status === 'PUBLISHED' && !Object.prototype.hasOwnProperty.call(p.votes, user.id)) {
        queue.push(p.id);
      }
    });
    session.state = 'VOTE';
    session.voteRoundId = round.id;
    session.voteQueue = queue;
    session.voteIndex = 0;
    if (queue.length === 0) return voteDoneMessage();
    return [voteQuestionMessage(state, session)];
  }

  function voteQuestionMessage(state, session) {
    var round = findRound(state, session.voteRoundId);
    var id = session.voteQueue[session.voteIndex];
    var proposal = null;
    if (round) {
      round.proposals.forEach(function (p) {
        if (p.id === id) proposal = p;
      });
    }
    var label =
      '🗳️ Öneri ' + (session.voteIndex + 1) + '/' + session.voteQueue.length + ': ' +
      (proposal ? proposal.text : '');
    return btns(label, [
      { id: 'VOTE:' + id + ':AGREE', label: '👍 Katılıyorum' },
      { id: 'VOTE:' + id + ':DISAGREE', label: '👎 Katılmıyorum' },
      { id: 'VOTE:' + id + ':PASS', label: '🤷 Fark Etmez' },
    ]);
  }

  function voteDoneMessage() {
    return [
      btns('Oylama bitti, teşekkürler! Sonuçlar tur kapanınca yayınlanır.', [
        { id: 'VOTE_RESULTS', label: '📊 Sonuçlar' },
      ]),
    ];
  }

  function handleVote(state, session, user, input) {
    var body = String(input.body);
    if (body === 'VOTE_RESULTS') return voteResults(state, session);
    var match = body.match(/^VOTE:(\d+):(AGREE|DISAGREE|PASS)$/);
    if (match) {
      var proposalId = Number(match[1]);
      var choice = match[2];
      var round = findRound(state, session.voteRoundId);
      var proposal = null;
      if (round) {
        round.proposals.forEach(function (p) {
          if (p.id === proposalId) proposal = p;
        });
      }
      if (!round || round.status !== 'OPEN' || Date.parse(round.closesAt) <= Date.now()) {
        session.state = 'MENU';
        session.voteQueue = [];
        session.voteIndex = 0;
        session.voteRoundId = null;
        return [txt('Tur kapandı, oy alınamadı 😔')].concat(menuMessages());
      }
      if (proposal && proposal.status === 'PUBLISHED') {
        proposal.votes[user.id] = choice;
        pushEvent(state, 'Oy kullanıldı');
      }
      session.voteIndex += 1;
      if (session.voteIndex >= session.voteQueue.length) {
        session.voteQueue = [];
        session.voteIndex = 0;
        return voteDoneMessage();
      }
      return [voteQuestionMessage(state, session)];
    }
    if (session.voteQueue.length === 0) return voteDoneMessage();
    return [voteQuestionMessage(state, session)];
  }

  function voteResults(state, session) {
    var round = null;
    if (session.voteRoundId != null) {
      round = findRound(state, session.voteRoundId);
    }
    if (!round) {
      state.rounds.forEach(function (r) {
        if (r.kind === 'DEMAND' && (!round || r.id > round.id)) round = r;
      });
    }
    if (!round) {
      session.state = 'MENU';
      return [txt('Bu mahallede sonuç bulunamadı.')].concat(menuMessages());
    }
    if (round.status === 'OPEN') {
      session.state = 'MENU';
      return [txt('Tur henüz açık, sonuçlar kapanışta yayınlanır.')].concat(menuMessages());
    }
    var tallies = round.proposals
      .filter(function (p) {
        return p.status === 'PUBLISHED' || p.status === 'REJECTED';
      })
      .map(tallyProposal);
    var accepted = tallies.filter(function (t) {
      return t.accepted;
    });
    var lines = tallies
      .filter(function (t) {
        return t.voteCount >= MIN_VOTES;
      })
      .map(function (t) {
        return (
          t.text + ' · %' + Math.round(t.agreementPct * 100) +
          ' 👍 (' + t.agree + '/' + t.voteCount + ')'
        );
      });
    var totalVotes = tallies.reduce(function (s, t) {
      return s + t.voteCount;
    }, 0);
    var body = [
      '📊 ' + round.title + ': ' + accepted.length + ' kabul edildi:',
    ].concat(lines, ['', 'Çekimserler dahil ' + totalVotes + ' oy.']);
    session.state = 'MENU';
    session.voteQueue = [];
    session.voteIndex = 0;
    session.voteRoundId = null;
    return [txt(body.join('\n'))].concat(menuMessages());
  }

  function panoMenuMessages() {
    return [
      btns(
        '📖 Pano: ücretsiz mahalle yardımlaşması. Ürün, kıyafet, hizmet, her şey. Bakkal onaylar; telefon/adres YAZMA, bakkal buluşturur. Günde en fazla 2 ilan.',
        [
          { id: 'PANO_REQUEST', label: '🙏 İstiyorum' },
          { id: 'PANO_OFFER', label: '🤝 Verebilirim' },
          { id: 'PANO_LIST', label: '📖 Panoya Bak' },
        ],
      ),
    ];
  }

  function enterPano(state, session) {
    session.state = 'PANO';
    return panoMenuMessages();
  }

  function panoPostPrompt(kind) {
    return kind === 'OFFER'
      ? '🤝 Ne verebilirsin? (en fazla 250 karakter), telefon/adres yazma, bakkal buluşturur.'
      : '🙏 Ne istiyorsun? (en fazla 250 karakter), telefon/adres yazma, bakkal buluşturur.';
  }

  function enterPanoPost(session, kind) {
    session.panoKind = kind;
    session.state = 'PANO_POST';
    return [txt(panoPostPrompt(kind))];
  }

  function aidCountToday(state, userId) {
    var start = new Date();
    start.setHours(0, 0, 0, 0);
    return state.aidPosts.filter(function (p) {
      return p.userId === userId && Date.parse(p.createdAt) >= start.getTime();
    }).length;
  }

  function handlePano(state, session, input) {
    switch (String(input.body)) {
      case 'PANO_REQUEST':
        return enterPanoPost(session, 'REQUEST');
      case 'PANO_OFFER':
        return enterPanoPost(session, 'OFFER');
      case 'PANO_LIST':
        return panoListMessages(state, session, 0);
      default:
        return enterPano(state, session);
    }
  }

  function handlePanoPost(state, session, user, input) {
    if (input.type !== 'text') return [txt(panoPostPrompt(session.panoKind))];
    var raw = String(input.body).trim();
    if (!raw) return [txt('📝 İlan boş olamaz. Lütfen tekrar yazın.')];
    var text = raw.length > AIDPOST_MAX_LEN ? raw.slice(0, AIDPOST_MAX_LEN) + '…' : raw;

    if (aidCountToday(state, user.id) >= AIDPOST_DAILY_LIMIT) {
      session.panoKind = null;
      session.state = 'PANO';
      return [txt('Bugünlük 2 ilan limitine ulaştın, yarın tekrar.')].concat(panoMenuMessages());
    }
    var maxId = 0;
    state.aidPosts.forEach(function (p) {
      if (p.id > maxId) maxId = p.id;
    });
    state.aidPosts.push({
      id: maxId + 1,
      userId: user.id,
      kind: session.panoKind || 'REQUEST',
      text: text,
      status: 'PENDING',
      responderId: null,
      createdAt: nowIso(),
    });
    pushEvent(state, 'Yeni dayanışma ilanı (uzunluk ' + text.length + ')');
    session.panoKind = null;
    session.state = 'PANO';
    return [txt('✔ İlanın bakkala iletildi, onaylanınca panoda yayınlanır.')].concat(
      panoMenuMessages(),
    );
  }

  function panoListMessages(state, session, page) {
    var posts = state.aidPosts.filter(function (p) {
      return p.status === 'PUBLISHED' && p.responderId === null;
    });
    if (posts.length === 0) {
      session.state = 'PANO';
      return [txt('Panoda bekleyen ilan yok 🎉')].concat(panoMenuMessages());
    }
    session.state = 'PANO_LIST';
    session.panoPage = page;
    var start = page * PANO_PER_PAGE;
    if (start >= posts.length) start = 0;
    session.panoPage = start / PANO_PER_PAGE;
    var slice = posts.slice(start, start + PANO_PER_PAGE);

    var lines = slice.map(function (p, i) {
      var idx = start + i + 1;
      var icon = p.kind === 'OFFER' ? '🤲' : '🙏';
      var daysAgo = Math.max(0, Math.floor((Date.now() - Date.parse(p.createdAt)) / 86400000));
      return '📖 ' + idx + '.' + icon + ' ' + p.text + ' (' + daysAgo + ' gün önce)';
    });
    var primary = slice.map(function (p) {
      return { id: 'PANO_OFFER_MATCH:' + p.id, label: '🙋 Ben Yapabilirim' };
    });
    var trailing = [];
    if (start + PANO_PER_PAGE < posts.length) trailing.push({ id: 'PANO_NEXT', label: 'Sonraki' });
    trailing.push({ id: 'PANO_DONE', label: 'Bitir' });

    var groups = [];
    var i;
    for (i = 0; i < primary.length; i += 3) groups.push(primary.slice(i, i + 3));
    if (groups.length === 0) groups.push(trailing);
    else if (groups[groups.length - 1].length + trailing.length <= 3) {
      groups[groups.length - 1] = groups[groups.length - 1].concat(trailing);
    } else {
      groups.push(trailing);
    }
    return groups.map(function (g, idx) {
      return btns(idx === 0 ? lines.join('\n') : '⬇️', g);
    });
  }

  function handlePanoList(state, session, user, input) {
    var body = String(input.body);
    if (body.indexOf('PANO_OFFER_MATCH:') === 0) {
      var postId = Number(body.slice('PANO_OFFER_MATCH:'.length));
      var post = null;
      state.aidPosts.forEach(function (p) {
        if (p.id === postId) post = p;
      });
      var msg;
      if (!post || post.status === 'REJECTED' || post.status === 'PENDING') {
        msg = 'İlan yayından kalkmış.';
      } else if (post.responderId !== null) {
        msg = 'Bu ilan zaten eşleşti 😔';
      } else {
        post.responderId = user.id;
        post.status = 'MATCHED';
        pushEvent(state, 'Dayanışma ilanı eşleşti');
        msg = '✔ Teşekkürler! Bakkal seni istek sahibiyle buluşturacak.';
      }
      return [txt(msg)].concat(panoListMessages(state, session, session.panoPage));
    }
    if (body === 'PANO_NEXT') {
      return panoListMessages(state, session, session.panoPage + 1);
    }
    if (body === 'PANO_DONE') {
      session.state = 'PANO';
      return panoMenuMessages();
    }
    return panoListMessages(state, session, session.panoPage);
  }

  function handleMenu(state, session, user, input) {
    switch (String(input.body)) {
      case 'BROWSE':
        session.catalogPage = 0;
        return catalogPage(state, session);
      case 'CART':
        session.state = 'CART';
        return cartMessages(state, session);
      case 'HELP':
        return [
          txt(
            'ℹ️ Yardım\nSiparişlerinizi WhatsApp üzerinden verirsiniz: Katalog → numara yaz (örn. "3 5" → 3. üründen 5 adet) → sepet → ödeme. Bakkal kasasında ödenen günlük ürünler için siparişinizi onaylarken ekleme yapabilirsin.\n\n🗳️ Talep turu ve dayanışma panosu menünün 2. sayfasında.',
          ),
        ].concat(menuMessages());
      case 'ORDERS':
        return ordersMessages(state, session, user);
      case 'PAGE2':
        return menuPage2Messages();
      case 'PAGE1':
        return menuMessages();
      case 'DEMAND':
        return enterDemand(state, session);
      case 'DAYANISMA':
        return enterPano(state, session);
      case 'SUGGEST':
        return enterSuggest(state, session);
      case 'VOTE_NEXT':
        return enterVote(state, session, user, 'DEMAND');
      case 'VOTE_RESULTS':
        return voteResults(state, session);
      case 'SKIP_DEMAND':
        return menuMessages();
      default:
        return menuMessages();
    }
  }

  function dispatch(state, session, user, input) {
    if (session.state === 'KVKK_GATE') {
      if (String(input.body) === 'ACCEPT_KVKK') {
        session.state = 'MENU';
        pushEvent(state, user.name + ' KVKK onayı verdi');
        return menuMessages();
      }
      return kvkkGateMessages();
    }

    /* Surplus invites arrive via portal broadcast and can be tapped from any state. */
    if (String(input.body) === 'VOTE_SURPLUS') {
      return enterVote(state, session, user, 'SURPLUS');
    }

    if (session.state === 'DONE') {
      session.state = 'MENU';
      return menuMessages();
    }

    switch (session.state) {
      case 'MENU':
        return handleMenu(state, session, user, input);
      case 'CATALOG':
        return handleCatalog(state, session, input);
      case 'CART':
        return handleCart(state, session, input);
      case 'ADDONS':
        return handleAddons(state, session, input);
      case 'NOTE':
        return handleNote(state, session, input);
      case 'CONFIRM':
        return handleConfirm(state, session, user, input);
      case 'HISTORY':
        return handleOrders(state, session, user, input);
      case 'SUGGEST':
        return handleSuggest(state, session, user, input);
      case 'VOTE':
        return handleVote(state, session, user, input);
      case 'PANO':
        return handlePano(state, session, input);
      case 'PANO_POST':
        return handlePanoPost(state, session, user, input);
      case 'PANO_LIST':
        return handlePanoList(state, session, user, input);
      default:
        session.state = 'MENU';
        return menuMessages();
    }
  }

  /* ---------- portal analytics (pure, mirrors src/operations/portal.ts) ----
     Counts, sums and ratios only: no names, phones or notes leave here.
     `nowMs` is injectable so Node tests pin the 30 day windows. Empty
     denominators return 0 and are listed under `noData`, letting the renderer
     print "veri yok" instead of a ratio the demo data cannot support. */

  var ANALYTICS_WINDOW_DAYS = 30;
  var DAILY_ORDER_GOAL = 20;
  var DELIVERY_COST_KURUS = 3000;
  var ANALYTICS_RETAIL_PROXY_RATE = 0.15;
  var DAY_MS = 86400000;

  function roundTo(value, digits) {
    var factor = Math.pow(10, digits);
    return Math.round(value * factor) / factor;
  }

  function tsOf(iso) {
    var ts = Date.parse(String(iso == null ? '' : iso));
    return isFinite(ts) ? ts : null;
  }

  function portalAnalytics(state, nowMs) {
    var now = typeof nowMs === 'number' && isFinite(nowMs) ? nowMs : Date.now();
    var since = now - ANALYTICS_WINDOW_DAYS * DAY_MS;
    var prevSince = now - 2 * ANALYTICS_WINDOW_DAYS * DAY_MS;
    var users = (state && state.users) || [];
    var orders = (state && state.orders) || [];
    var products = (state && state.products) || [];
    var roleById = {};
    users.forEach(function (u) {
      roleById[String(u.id)] = u.role;
    });

    /* Same three filters as the app: not cancelled, CUSTOMER role, parseable
       timestamp. An unknown userId is dropped, which is what the app's join
       against the user table does. */
    function counted(order) {
      if (!order || order.status === 'CANCELLED') return false;
      if (roleById[String(order.userId)] !== 'CUSTOMER') return false;
      return tsOf(order.createdAt) !== null;
    }

    var recent = [];
    var previous = [];
    var allCounted = [];
    orders.forEach(function (order) {
      if (!counted(order)) return;
      allCounted.push(order);
      var ts = tsOf(order.createdAt);
      if (ts >= since) recent.push({ order: order, ts: ts });
      else if (ts >= prevSince) previous.push({ order: order, ts: ts });
    });
    recent.sort(function (a, b) {
      if (b.ts !== a.ts) return b.ts - a.ts;
      var ai = Number(a.order.id);
      var bi = Number(b.order.id);
      if (isFinite(ai) && isFinite(bi) && ai !== bi) return bi - ai;
      return String(b.order.id).localeCompare(String(a.order.id));
    });

    var activeIds = {};
    var activeCount = 0;
    var orderCount = recent.length;
    var basketTotalKurus = 0;
    var savingsTotalKurus = 0;

    function tier1Of(productId) {
      for (var i = 0; i < products.length; i++) {
        if (String(products[i].id) !== String(productId)) continue;
        var t1 = products[i].tiers && products[i].tiers[0];
        return typeof t1 === 'number' && t1 > 0 ? t1 : null;
      }
      return null;
    }

    recent.forEach(function (entry) {
      var order = entry.order;
      var key = String(order.userId);
      if (!activeIds[key]) {
        activeIds[key] = true;
        activeCount += 1;
      }
      basketTotalKurus += Number(order.totalKurus) || 0;
      (order.items || []).forEach(function (item) {
        var t1 = tier1Of(item.productId);
        if (t1 === null) return;
        savingsTotalKurus += (Number(item.qty) || 0) * t1 * ANALYTICS_RETAIL_PROXY_RATE;
      });
    });

    /* Tekrar alım: per member, does the latest order share a product with the
       one before it? Only members with two or more recent orders are eligible,
       which is why a thin demo can honestly report "veri yok". */
    var ordersByMember = {};
    recent.forEach(function (entry) {
      var order = entry.order;
      var key = String(order.userId);
      if (!ordersByMember[key]) ordersByMember[key] = [];
      var set = {};
      (order.items || []).forEach(function (item) {
        set[String(item.productId)] = true;
      });
      ordersByMember[key].push(set);
    });

    var repeatEligible = 0;
    var repeatMatched = 0;
    Object.keys(ordersByMember).forEach(function (key) {
      var sets = ordersByMember[key];
      if (sets.length < 2) return;
      repeatEligible += 1;
      var latest = sets[0];
      var beforeLatest = sets[1];
      var shared = Object.keys(latest).some(function (pid) {
        return beforeLatest[pid] === true;
      });
      if (shared) repeatMatched += 1;
    });

    var previousIds = {};
    previous.forEach(function (entry) {
      previousIds[String(entry.order.userId)] = true;
    });
    var previousCount = Object.keys(previousIds).length;
    var lostCount = 0;
    Object.keys(previousIds).forEach(function (id) {
      if (!activeIds[id]) lostCount += 1;
    });

    /* Demo orders carry no windowId, so while any window is OPEN the counted
       orders are the current window's book; with no open window the fill is 0,
       exactly what the app reports for an empty open-window set. */
    var windows = (state && state.windows) || [];
    var openWindow = windows.some(function (w) {
      return !!w && w.status === 'OPEN';
    });
    var openOrderCount = openWindow ? allCounted.length : 0;

    var noData = [];
    if (activeCount === 0) {
      noData.push('siparisSikligi');
      noData.push('kisiBasiTasarruf');
    }
    if (orderCount === 0) {
      noData.push('ortalamaSepet');
      noData.push('teslimMaliyet');
    }
    if (previousCount === 0) noData.push('aylikKayip');
    if (repeatEligible === 0) noData.push('tekrarAlim');

    return {
      aktifUye: activeCount,
      siparisSikligi: activeCount > 0 ? roundTo(orderCount / activeCount, 2) : 0,
      ortalamaSepetKurus: orderCount > 0 ? Math.round(basketTotalKurus / orderCount) : 0,
      kisiBasiTasarrufKurus: activeCount > 0 ? Math.round(savingsTotalKurus / activeCount) : 0,
      pencereDoluluk: Math.min(1, roundTo(openOrderCount / DAILY_ORDER_GOAL, 4)),
      pencereDolulukAdet: openOrderCount,
      aylikKayipOrani: previousCount > 0 ? roundTo(lostCount / previousCount, 4) : 0,
      teslimMaliyetKurus: orderCount > 0 ? DELIVERY_COST_KURUS : 0,
      tekrarAlimOrani: repeatEligible > 0 ? roundTo(repeatMatched / repeatEligible, 4) : 0,
      noData: noData,
    };
  }

  function createEngine(store) {
    function send(actorId, input) {
      var state = store.get();
      var user = findById(state.users, actorId);
      if (!user) return [];
      var session = ensureSession(state, actorId);
      var type = input && input.type === 'button' ? 'button' : 'text';
      var body = String(input && input.body != null ? input.body : '');
      var display = type === 'button' ? buttonLabel(state, actorId, body) : body;
      var transcript = state.transcripts[actorId];
      transcript.push({
        from: 'user',
        type: 'text',
        text: display,
        ts: Date.now(),
      });

      var replies = dispatch(state, session, user, { type: type, body: body });
      var ts = Date.now();
      replies.forEach(function (m) {
        m.ts = ts;
        transcript.push(m);
      });
      store.set(state);
      return replies;
    }

    function transcript(actorId) {
      var state = store.get();
      return state.transcripts[actorId] || [];
    }

    function broadcast(userIdsOrNull, messages) {
      var state = store.get();
      var targets =
        userIdsOrNull == null
          ? state.users
              .filter(function (u) {
                return u.role === 'CUSTOMER';
              })
              .map(function (u) {
                return u.id;
              })
          : userIdsOrNull.slice();
      var ts = Date.now();
      var stamped = (messages || []).map(function (m) {
        return {
          from: m.from || 'bot',
          type: m.type || 'text',
          text: String(m.text == null ? '' : m.text),
          buttons: m.buttons ? m.buttons.slice() : undefined,
          ts: ts,
        };
      });
      targets.forEach(function (id) {
        if (!state.transcripts[id]) state.transcripts[id] = [];
        stamped.forEach(function (m) {
          state.transcripts[id].push(Object.assign({}, m));
        });
      });
      pushEvent(state, 'Duyuru gönderildi (' + targets.length + ' kişi)');
      store.set(state);
      return stamped;
    }

    return {
      send: send,
      transcript: transcript,
      broadcast: broadcast,
    };
  }

  return {
    createEngine: createEngine,
    parseCatalogCommand: parseCatalogCommand,
    resolveTier: resolveTier,
    portalAnalytics: portalAnalytics,
    ANALYTICS_WINDOW_DAYS: ANALYTICS_WINDOW_DAYS,
    DAILY_ORDER_GOAL: DAILY_ORDER_GOAL,
    DELIVERY_COST_KURUS: DELIVERY_COST_KURUS,
    ANALYTICS_RETAIL_PROXY_RATE: ANALYTICS_RETAIL_PROXY_RATE,
  };
});
