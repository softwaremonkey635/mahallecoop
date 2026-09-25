/* Üye PWA API istemcisi. UMD: tarayıcıda window.MCP, Node'de module.exports.
   Bağlantı yoksa, uç nokta yoksa ya da cevap bozuksa yerel tohum kataloğa
   döner ve arayüz "demo modu" etiketini gösterir. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.MCP = Object.assign(root.MCP || {}, factory());
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /* prisma/seed.ts ile aynı adlar, birimler, kademeler ve eşikler. */
  var DEMO_CATALOG = [
    { id: 1, name: 'Sızma Zeytinyağı', unit: '5 L', category: 'Yağlar', tier1: 89500, tier2: 87500, tier3: 85500, threshold2: 3, threshold3: 6 },
    { id: 2, name: 'Ayçiçek Yağı', unit: '5 L', category: 'Yağlar', tier1: 38500, tier2: 37000, tier3: 35500, threshold2: 3, threshold3: 6 },
    { id: 3, name: 'Baldo Pirinç', unit: '5 kg', category: 'Pirinç & Bulgur', tier1: 62500, tier2: 61000, tier3: 59500, threshold2: 3, threshold3: 6 },
    { id: 4, name: 'Rize Çayı', unit: '1 kg', category: 'Çay & Kahvaltılık', tier1: 34500, tier2: 33500, tier3: 32500, threshold2: 3, threshold3: 6 },
    { id: 5, name: 'Kırmızı Mercimek', unit: '2 kg', category: 'Bakliyat', tier1: 19800, tier2: 19200, tier3: 18600, threshold2: 3, threshold3: 6 },
    { id: 6, name: 'Nohut', unit: '2 kg', category: 'Bakliyat', tier1: 16500, tier2: 16000, tier3: 15500, threshold2: 3, threshold3: 6 },
    { id: 7, name: 'Kuru Fasulye', unit: '1 kg', category: 'Bakliyat', tier1: 11900, tier2: 11500, tier3: 11100, threshold2: 3, threshold3: 6 },
    { id: 8, name: 'İnce Bulgur', unit: '2 kg', category: 'Pirinç & Bulgur', tier1: 8800, tier2: 8500, tier3: 8200, threshold2: 3, threshold3: 6 },
    { id: 9, name: 'Toz Şeker', unit: '5 kg', category: 'Temel Gıda', tier1: 29500, tier2: 28500, tier3: 27500, threshold2: 3, threshold3: 6 },
    { id: 10, name: 'Un', unit: '5 kg', category: 'Temel Gıda', tier1: 14200, tier2: 13800, tier3: 13400, threshold2: 3, threshold3: 6 },
    { id: 11, name: 'Makarna', unit: '500 g', category: 'Temel Gıda', tier1: 1850, tier2: 1750, tier3: 1650, threshold2: 3, threshold3: 6 },
    { id: 12, name: 'Domates Salçası', unit: '830 g', category: 'Temel Gıda', tier1: 14500, tier2: 14000, tier3: 13500, threshold2: 3, threshold3: 6 },
    { id: 13, name: 'Gemlik Zeytin', unit: '1 kg', category: 'Çay & Kahvaltılık', tier1: 21500, tier2: 20500, tier3: 19500, threshold2: 3, threshold3: 6 },
    { id: 14, name: "Yumurta (30'lu)", unit: '30 adet', category: 'Çay & Kahvaltılık', tier1: 21000, tier2: 20000, tier3: 19000, threshold2: 3, threshold3: 6 },
    { id: 15, name: 'Sofra Tuzu', unit: '1 kg', category: 'Temel Gıda', tier1: 750, tier2: 700, tier3: 650, threshold2: 3, threshold3: 6 },
  ];

  function apiUrl(baseUrl, path) {
    var base = typeof baseUrl === 'string' ? baseUrl.replace(/\/$/, '') : '';
    return base + path;
  }

  function defaultFetch() {
    if (typeof fetch === 'function') return fetch.bind(typeof globalThis !== 'undefined' ? globalThis : null);
    return null;
  }

  function isFiniteNumber(value) {
    return typeof value === 'number' && Number.isFinite(value);
  }

  /* Sunucu sözleşmesi: {ok:true, products:[{id,name,unit,category,
     tier1,tier2,tier3,threshold2,threshold3}]} */
  function validateCatalog(payload) {
    if (!payload || typeof payload !== 'object') return null;
    if (payload.ok !== true) return null;
    if (!Array.isArray(payload.products) || payload.products.length === 0) return null;
    var seen = {};
    var out = [];
    for (var i = 0; i < payload.products.length; i += 1) {
      var p = payload.products[i];
      if (!p || typeof p !== 'object') return null;
      if (p.id == null || typeof p.name !== 'string' || !p.name.trim()) return null;
      if (typeof p.unit !== 'string' || typeof p.category !== 'string') return null;
      if (!isFiniteNumber(p.tier1) || !isFiniteNumber(p.tier2) || !isFiniteNumber(p.tier3)) return null;
      if (!isFiniteNumber(p.threshold2) || !isFiniteNumber(p.threshold3)) return null;
      if (p.tier1 < 0 || p.tier2 < 0 || p.tier3 < 0) return null;
      if (p.threshold2 <= 0 || p.threshold3 <= 0) return null;
      var key = String(p.id);
      if (seen[key]) return null;
      seen[key] = true;
      out.push({
        id: p.id,
        name: p.name,
        unit: p.unit,
        category: p.category,
        tier1: Math.trunc(p.tier1),
        tier2: Math.trunc(p.tier2),
        tier3: Math.trunc(p.tier3),
        threshold2: Math.trunc(p.threshold2),
        threshold3: Math.trunc(p.threshold3),
      });
    }
    return out;
  }

  /* Tek karar noktası: cevap geçerliyse canlı, değilse tohum katalog. */
  function selectCatalogResult(payload, error, fallback) {
    var seed = Array.isArray(fallback) && fallback.length ? fallback : DEMO_CATALOG;
    var products = validateCatalog(payload);
    if (products) return { products: products, mode: 'live', reason: '' };
    var reason = 'unreachable';
    if (error && error.reason) reason = error.reason;
    else if (error) reason = 'unreachable';
    else if (payload && payload.ok === true) {
      reason = Array.isArray(payload.products) && payload.products.length === 0 ? 'empty' : 'bad_shape';
    } else if (payload) reason = 'bad_shape';
    return { products: seed, mode: 'demo', reason: reason };
  }

  function requestJson(fetchFn, url, options, timeoutMs) {
    if (typeof fetchFn !== 'function') {
      return Promise.reject({ reason: 'no_fetch' });
    }
    var opts = options || {};
    var controller = typeof AbortController === 'function' ? new AbortController() : null;
    var timer = null;
    if (controller && timeoutMs > 0) {
      opts.signal = controller.signal;
      timer = setTimeout(function () {
        controller.abort();
      }, timeoutMs);
    }
    return Promise.resolve()
      .then(function () {
        return fetchFn(url, opts);
      })
      .then(function (res) {
        if (timer) clearTimeout(timer);
        if (!res || res.ok === false) {
          var err = { reason: 'http' };
          err.status = res ? res.status : 0;
          if (res && res.status === 404) err.reason = 'not_found';
          return Promise.reject(err);
        }
        if (typeof res.json !== 'function') return Promise.reject({ reason: 'bad_shape' });
        return res.json();
      })
      .catch(function (err) {
        if (timer) clearTimeout(timer);
        if (err && err.reason) return Promise.reject(err);
        if (err && err.name === 'AbortError') return Promise.reject({ reason: 'timeout' });
        return Promise.reject({ reason: 'unreachable' });
      });
  }

  function loadCatalog(settings) {
    var options = settings || {};
    var fallback = Array.isArray(options.fallback) ? options.fallback : DEMO_CATALOG;
    return requestJson(
      options.fetchFn || defaultFetch(),
      apiUrl(options.baseUrl, '/api/catalog'),
      { method: 'GET', headers: { accept: 'application/json' } },
      options.timeoutMs == null ? 3000 : options.timeoutMs,
    ).then(
      function (payload) {
        return selectCatalogResult(payload, null, fallback);
      },
      function (error) {
        return selectCatalogResult(null, error, fallback);
      },
    );
  }

  /* API kökeni: mutlak bağlantılar yalnız bu kökenle birebir eşleşirse geçer.
     Kaynak verilmezse tarayıcıda sayfanın kökeni, Node'de boş köken alınır.
     Boş köken hiçbir mutlak bağlantıyı geçirmez, yani hata yönü kapalıdır. */
  function apiOrigin(baseUrl) {
    var pageOrigin = '';
    if (typeof location !== 'undefined' && location && typeof location.origin === 'string') {
      pageOrigin = location.origin;
    }
    var base = typeof baseUrl === 'string' ? baseUrl.trim() : '';
    if (!base) return pageOrigin;
    try {
      return new URL(base, pageOrigin || undefined).origin;
    } catch (err) {
      return '';
    }
  }

  /* Ödeme bağlantısı yalnız iki biçimde geçer: tek '/' ile başlayan, '//' ile
     başlamayan ve ters eğik çizgi içermeyen göreli yol, ya da API kökeniyle
     eşleşen mutlak http(s) bağlantısı. javascript:, //site, ters eğik çizgi
     (WHATWG onu //site'ye çözer), boşluk ve boş değeri burada reddedilir. */
  function paymentLink(url, baseUrl) {
    if (typeof url !== 'string') return '';
    var value = url.trim();
    if (!value) return '';
    for (var i = 0; i < value.length; i += 1) {
      var code = value.charCodeAt(i);
      if (code <= 32 || code === 127 || code === 92) return '';
    }
    if (value.charAt(0) === '/') return value.charAt(1) === '/' ? '' : value;
    if (!/^https?:\/\//i.test(value)) return '';
    var origin = apiOrigin(baseUrl);
    if (!origin) return '';
    try {
      return new URL(value).origin === origin ? value : '';
    } catch (err) {
      return '';
    }
  }

  /* Sunucu sözleşmesi: POST { phone, items: [{ productId, qty }], consent }.
     Yalnız kimlik, adet ve KVKK onayı gider; fiyat SUNUCUDA resolveTier ile
     çözülür, istemciden gelen fiyat alanları hiç gönderilmez (güvenilmeyen
     veri). consent yalnız sunucunun beklediği doğru/yanlış biçiminde gider. */
  function toServerOrder(order, phone, consent) {
    var source = [];
    if (Array.isArray(order && order.items)) source = order.items;
    else if (Array.isArray(order && order.cart)) source = order.cart;
    else if (Array.isArray(order && order.lines)) source = order.lines;
    var items = [];
    for (var i = 0; i < source.length; i += 1) {
      var line = source[i];
      if (!line || line.productId == null) continue;
      var productId = Number(line.productId);
      if (!isFiniteNumber(productId)) continue;
      var qty = Number(line.qty);
      items.push({
        productId: Math.trunc(productId),
        qty: isFiniteNumber(qty) ? Math.trunc(qty) : 0,
      });
    }
    var from = typeof phone === 'string' && phone.trim() ? phone : '';
    if (!from && typeof (order && order.phone) === 'string') from = order.phone;
    return { phone: from, items: items, consent: consent === true };
  }

  /* Sipariş gönderimi: sunucu yoksa kayıt yerelde kalır, kullanıcıya
     bunu açıkça söyleriz. */
  function submitOrder(settings) {
    var options = settings || {};
    var order = options.order || {};
    /* KVKK onayı işaretli değilse paket hiç kurulmaz ve ağa tek istek bile
       gitmez. Telefon gibi kişisel veri onaysız olarak cihazdan çıkmaz. */
    if (options.consent !== true) {
      return Promise.resolve({
        ok: true,
        source: 'local',
        id: String(order.id || ''),
        reason: 'consent_required',
        totalKurus: null,
        paymentUrl: '',
      });
    }
    var payload = toServerOrder(order, options.phone, options.consent);
    return requestJson(
      options.fetchFn || defaultFetch(),
      apiUrl(options.baseUrl, '/api/orders'),
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify(payload),
      },
      options.timeoutMs == null ? 5000 : options.timeoutMs,
    ).then(
      function (body) {
        var id = body && (body.orderId != null ? body.orderId : body.id);
        if (body && body.ok === true && id != null) {
          return {
            ok: true,
            source: 'server',
            id: String(id),
            reason: '',
            totalKurus: isFiniteNumber(body.totalKurus) ? body.totalKurus : null,
            paymentUrl: typeof body.paymentUrl === 'string' ? body.paymentUrl : '',
          };
        }
        return {
          ok: true,
          source: 'local',
          id: String(order.id || ''),
          reason: 'bad_shape',
          totalKurus: null,
          paymentUrl: '',
        };
      },
      function (error) {
        return {
          ok: true,
          source: 'local',
          id: String(order.id || ''),
          reason: (error && error.reason) || 'unreachable',
          totalKurus: null,
          paymentUrl: '',
        };
      },
    );
  }

  function fetchOrderStatus(settings) {
    var options = settings || {};
    var id = options.orderId;
    return requestJson(
      options.fetchFn || defaultFetch(),
      apiUrl(options.baseUrl, '/api/orders/' + encodeURIComponent(String(id)) + '/payment'),
      { method: 'GET', headers: { accept: 'application/json' } },
      options.timeoutMs == null ? 3000 : options.timeoutMs,
    ).then(
      function (payload) {
        if (payload && typeof payload.status === 'string') {
          return {
            ok: true,
            source: 'server',
            status: String(payload.status).toUpperCase(),
            pickupCode: String(payload.pickupCode || ''),
            reason: '',
          };
        }
        return { ok: false, source: 'local', status: '', pickupCode: '', reason: 'bad_shape' };
      },
      function (error) {
        return {
          ok: false,
          source: 'local',
          status: '',
          pickupCode: '',
          reason: (error && error.reason) || 'unreachable',
        };
      },
    );
  }

  return {
    DEMO_CATALOG: DEMO_CATALOG,
    validateCatalog: validateCatalog,
    selectCatalogResult: selectCatalogResult,
    loadCatalog: loadCatalog,
    submitOrder: submitOrder,
    fetchOrderStatus: fetchOrderStatus,
    paymentLink: paymentLink,
    apiUrl: apiUrl,
  };
});
