/* MahalleCoop static demo store. UMD: window.MC in browser, module.exports in Node.
   localStorage key mc_demo_v1. {persist:false} = in-memory mode for Node tests. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.MC = Object.assign(root.MC || {}, factory());
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var STORAGE_KEY = 'mc_demo_v1';

  function clone(value) {
    if (value === null || typeof value !== 'object') return value;
    return JSON.parse(JSON.stringify(value));
  }

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

  function product(id, name, unit, category, t1, t2, t3) {
    return {
      id: id,
      name: name,
      unit: unit,
      category: category,
      tiers: [t1, t2, t3],
      thresholds: [3, 6],
      active: true,
    };
  }

  function emptySession() {
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

  function kvkkGateMessage() {
    return {
      from: 'bot',
      type: 'buttons',
      text: '🔐 KVKK Onayı: Kişisel verileriniz (telefon numarası) yalnızca sipariş bildirimleri için işlenir. Devam etmek için onaylayın.',
      buttons: [{ id: 'ACCEPT_KVKK', label: 'Onaylıyorum' }],
      ts: Date.now(),
    };
  }

  function seed() {
    var now = Date.now();
    var day = 86400000;
    function iso(offsetMs) {
      return new Date(now + offsetMs).toISOString();
    }

    var products = [
      product(1, 'Sızma Zeytinyağı', '5 L', 'Yağlar', 89500, 87500, 85500),
      product(2, 'Ayçiçek Yağı', '5 L', 'Yağlar', 38500, 37000, 35500),
      product(3, 'Baldo Pirinç', '5 kg', 'Pirinç & Bulgur', 62500, 61000, 59500),
      product(4, 'Rize Çayı', '1 kg', 'Çay & Kahvaltılık', 34500, 33500, 32500),
      product(5, 'Kırmızı Mercimek', '2 kg', 'Bakliyat', 19800, 19200, 18600),
      product(6, 'Nohut', '2 kg', 'Bakliyat', 16500, 16000, 15500),
      product(7, 'Kuru Fasulye', '1 kg', 'Bakliyat', 11900, 11500, 11100),
      product(8, 'İnce Bulgur', '2 kg', 'Pirinç & Bulgur', 8800, 8500, 8200),
      product(9, 'Toz Şeker', '5 kg', 'Temel Gıda', 29500, 28500, 27500),
      product(10, 'Un', '5 kg', 'Temel Gıda', 14200, 13800, 13400),
      product(11, 'Makarna', '500 g', 'Temel Gıda', 1850, 1750, 1650),
      product(12, 'Domates Salçası', '830 g', 'Temel Gıda', 14500, 14000, 13500),
      product(13, 'Gemlik Zeytin', '1 kg', 'Çay & Kahvaltılık', 21500, 20500, 19500),
      product(14, "Yumurta (30'lu)", '30 adet', 'Çay & Kahvaltılık', 21000, 20000, 19000),
      product(15, 'Sofra Tuzu', '1 kg', 'Temel Gıda', 750, 700, 650),
    ];

    var users = [
      { id: 'ayse', name: 'Ayşe', role: 'CUSTOMER' },
      { id: 'mehmet', name: 'Mehmet', role: 'CUSTOMER' },
      { id: 'fatma', name: 'Fatma', role: 'CUSTOMER' },
      { id: 'hasan', name: 'Hasan', role: 'BAKKAL' },
    ];

    var transcripts = {};
    var sessions = {};
    users.forEach(function (u) {
      transcripts[u.id] = [kvkkGateMessage()];
      sessions[u.id] = emptySession();
    });

    var state = {
      meta: {
        resetAt: iso(7 * day),
        version: 1,
        commissionKurus: 0,
      },
      products: products,
      users: users,
      transcripts: transcripts,
      sessions: sessions,
      orders: [
        {
          id: 1,
          userId: 'ayse',
          items: [
            { productId: 4, qty: 6, unitPriceKurus: 32500, lineTotalKurus: 195000, tier: 3 },
          ],
          totalKurus: 195000,
          addons: ['BREAD_2X', 'MILK_1L'],
          note: 'Çay poşetleri ayrı kolide olursa iyi olur',
          status: 'DELIVERED',
          pickupCode: 'K7H2MN',
          createdAt: iso(-2 * day),
        },
      ],
      windows: [
        { id: 1, status: 'OPEN', closesAt: iso(3 * day) },
      ],
      rounds: [
        {
          id: 1,
          kind: 'DEMAND',
          title: 'Ekim Talep Turu',
          status: 'OPEN',
          closesAt: iso(2 * day),
          proposals: [
            {
              id: 1,
              authorId: 'ayse',
              text: '1 L Ayran',
              status: 'PUBLISHED',
              convertedProductId: null,
              votes: { ayse: 'AGREE' },
            },
            {
              id: 2,
              authorId: 'mehmet',
              text: 'Tam Yağlı Süt 1 L',
              status: 'PUBLISHED',
              convertedProductId: null,
              votes: { mehmet: 'DISAGREE', fatma: 'DISAGREE' },
            },
          ],
        },
      ],
      aidPosts: [
        {
          id: 1,
          userId: 'ayse',
          kind: 'REQUEST',
          text: 'Bebek bezi lazım, acil durum için',
          status: 'PUBLISHED',
          responderId: null,
          createdAt: iso(-6 * 3600000),
        },
        {
          id: 2,
          userId: 'mehmet',
          kind: 'OFFER',
          text: 'Fazla domates var, isteyene veririm',
          status: 'PUBLISHED',
          responderId: null,
          createdAt: iso(-3 * 3600000),
        },
      ],
      events: [
        { id: 1, ts: iso(-2 * day), text: 'Ayşe siparişini teslim aldı' },
        { id: 2, ts: iso(-1 * day), text: 'Ekim Talep Turu açıldı' },
        { id: 3, ts: iso(-3600000), text: '2 dayanışma ilanı yayınlandı' },
        { id: 4, ts: iso(-1800000), text: 'Sipariş penceresi açıldı (3 gün)' },
      ],
    };
    return state;
  }

  function createStore(options) {
    var persist = !!(options && options.persist);
    var mem = null;

    function hasLocalStorage() {
      return typeof localStorage !== 'undefined' && localStorage !== null;
    }

    function load() {
      if (persist && hasLocalStorage()) {
        try {
          var raw = localStorage.getItem(STORAGE_KEY);
          if (raw) {
            var parsed = JSON.parse(raw);
            if (parsed && parsed.meta && parsed.meta.version === 1) return parsed;
          }
        } catch (err) {
          /* corrupted payload falls through to a fresh seed */
        }
      }
      if (mem) return mem;
      mem = seed();
      if (persist && hasLocalStorage()) {
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(mem));
        } catch (err) {
          /* quota or private mode: memory copy still works */
        }
      }
      return mem;
    }

    function persistState(state) {
      mem = state;
      if (persist && hasLocalStorage()) {
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        } catch (err) {
          /* keep serving from mem when storage rejects the write */
        }
      }
    }

    return {
      get: function () {
        return clone(load());
      },
      set: function (next) {
        if (!next || typeof next !== 'object') throw new Error('store.set expects a state object');
        persistState(clone(next));
      },
      reset: function () {
        mem = seed();
        if (persist && hasLocalStorage()) {
          try {
            localStorage.removeItem(STORAGE_KEY);
            localStorage.setItem(STORAGE_KEY, JSON.stringify(mem));
          } catch (err) {
            /* memory reset still applied */
          }
        }
      },
    };
  }

  return {
    createStore: createStore,
    fmtKurus: fmtKurus,
    shortKurus: shortKurus,
    STORAGE_KEY: STORAGE_KEY,
  };
});
