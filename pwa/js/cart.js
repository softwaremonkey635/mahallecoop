/* Üye PWA sepet çekirdeği. UMD: tarayıcıda window.MCP, Node'de module.exports.
   DOM ve depolama yok. Para birimi kuruş (TL x 100), tam sayı. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.MCP = Object.assign(root.MCP || {}, factory());
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function toInt(value, fallback) {
    var n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.trunc(n);
  }

  function fmtKurus(kurus) {
    return (toInt(kurus, 0) / 100).toLocaleString('tr-TR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }) + ' TL';
  }

  function shortKurus(kurus) {
    return (toInt(kurus, 0) / 100).toLocaleString('tr-TR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  /* Sunucudaki resolveTier ile aynı sıra: önce 3. kademe, sonra 2., sonra 1. */
  function tierFor(product, qty) {
    if (!product) return { tier: 1, price: 0 };
    var q = toInt(qty, 0);
    var t3 = toInt(product.threshold3, 6);
    var t2 = toInt(product.threshold2, 3);
    if (q >= t3 && t3 > 0) return { tier: 3, price: toInt(product.tier3, 0) };
    if (q >= t2 && t2 > 0) return { tier: 2, price: toInt(product.tier2, 0) };
    return { tier: 1, price: toInt(product.tier1, 0) };
  }

  function normalizeQuery(query) {
    return String(query == null ? '' : query)
      .trim()
      .toLocaleLowerCase('tr');
  }

  /* Türkçe küçük harf, arama için. */
  function searchProducts(products, query) {
    var q = normalizeQuery(query);
    var list = Array.isArray(products) ? products : [];
    if (!q) return list.slice();
    return list.filter(function (p) {
      var hay = normalizeQuery(p.name) + ' ' + normalizeQuery(p.category) + ' ' + normalizeQuery(p.unit);
      return hay.indexOf(q) !== -1;
    });
  }

  function groupByCategory(products) {
    var order = [];
    var map = {};
    (Array.isArray(products) ? products : []).forEach(function (p) {
      var key = p.category || 'Diğer';
      if (!map[key]) {
        map[key] = [];
        order.push(key);
      }
      map[key].push(p);
    });
    return order.map(function (name) {
      return { name: name, items: map[name] };
    });
  }

  function productIndex(products) {
    var map = {};
    (Array.isArray(products) ? products : []).forEach(function (p) {
      map[String(p.id)] = p;
    });
    return map;
  }

  function clampQty(value) {
    var q = toInt(value, 0);
    if (q < 0) q = 0;
    if (q > 999) q = 999;
    return q;
  }

  function setQty(cart, productId, qty) {
    var id = String(productId);
    var next = clampQty(qty);
    var out = [];
    (Array.isArray(cart) ? cart : []).forEach(function (line) {
      if (String(line.productId) !== id) out.push({ productId: line.productId, qty: clampQty(line.qty) });
    });
    if (next > 0) out.push({ productId: id, qty: next });
    return out;
  }

  function addQty(cart, productId, delta) {
    var id = String(productId);
    var current = 0;
    (Array.isArray(cart) ? cart : []).forEach(function (line) {
      if (String(line.productId) === id) current = clampQty(line.qty);
    });
    return setQty(cart, id, current + toInt(delta, 0));
  }

  function clearCart() {
    return [];
  }

  /* Sepet satırları + kademe fiyatından toplam ve tahmini tasarruf.
     Tasarruf, 1. kademe fiyata göre hesaplanır. */
  function cartTotals(cart, products) {
    var index = productIndex(products);
    var lines = [];
    var missing = [];
    var subtotalKurus = 0;
    var savingsKurus = 0;
    var count = 0;

    (Array.isArray(cart) ? cart : []).forEach(function (item) {
      var id = String(item.productId);
      var product = index[id];
      var qty = clampQty(item.qty);
      if (qty <= 0) return;
      if (!product) {
        missing.push(id);
        return;
      }
      var resolved = tierFor(product, qty);
      var lineTotalKurus = resolved.price * qty;
      var baseTotalKurus = toInt(product.tier1, 0) * qty;
      lines.push({
        productId: id,
        name: product.name,
        unit: product.unit,
        category: product.category,
        qty: qty,
        tier: resolved.tier,
        unitPriceKurus: resolved.price,
        lineTotalKurus: lineTotalKurus,
        savingsKurus: baseTotalKurus - lineTotalKurus,
      });
      subtotalKurus += lineTotalKurus;
      savingsKurus += baseTotalKurus - lineTotalKurus;
      count += qty;
    });

    return {
      lines: lines,
      missing: missing,
      count: count,
      subtotalKurus: subtotalKurus,
      savingsKurus: savingsKurus,
    };
  }

  /* Tekrar sipariş: geçmiş sipariş satırlarını güncel katalogla sepete doldurur.
     Katalogdan düşen ürün atlanır ve skipped listesine yazılır. */
  function refillFromOrder(order, products) {
    var index = productIndex(products);
    var raw = [];
    if (order && Array.isArray(order.lines)) raw = order.lines;
    else if (order && Array.isArray(order.items)) raw = order.items;
    else if (order && Array.isArray(order.cart)) raw = order.cart;

    var cart = [];
    var skipped = [];
    raw.forEach(function (line) {
      var id = String(line.productId);
      var qty = clampQty(line.qty);
      if (qty <= 0) return;
      if (!index[id]) {
        skipped.push(id);
        return;
      }
      cart = setQty(cart, id, qty);
    });
    return { cart: cart, skipped: skipped };
  }

  /* Sipariş geçmişi biçimi: sunucudan ve yerel kayıttan gelen veriyi
     aynı görünüme indirger. */
  function normalizeOrder(raw, products) {
    if (!raw || typeof raw !== 'object') return null;
    var index = productIndex(products);
    var source = [];
    if (Array.isArray(raw.lines)) source = raw.lines;
    else if (Array.isArray(raw.items)) source = raw.items;
    else if (Array.isArray(raw.cart)) source = raw.cart;

    var lines = [];
    var totalKurus = toInt(raw.totalKurus, NaN);
    var computed = 0;
    var itemCount = 0;

    source.forEach(function (line) {
      if (!line || line.productId == null) return;
      var id = String(line.productId);
      var qty = clampQty(line.qty);
      if (qty <= 0) return;
      var product = index[id];
      var resolved = product ? tierFor(product, qty) : null;
      var unitPriceKurus = line.unitPriceKurus != null
        ? toInt(line.unitPriceKurus, 0)
        : resolved
          ? resolved.price
          : 0;
      var lineTotalKurus = line.lineTotalKurus != null
        ? toInt(line.lineTotalKurus, 0)
        : unitPriceKurus * qty;
      lines.push({
        productId: id,
        name: line.name || (product ? product.name : 'Ürün ' + id),
        unit: line.unit || (product ? product.unit : ''),
        qty: qty,
        tier: line.tier != null ? toInt(line.tier, 1) : resolved ? resolved.tier : 1,
        unitPriceKurus: unitPriceKurus,
        lineTotalKurus: lineTotalKurus,
      });
      computed += lineTotalKurus;
      itemCount += qty;
    });

    return {
      id: String(raw.id != null ? raw.id : ''),
      status: String(raw.status || 'PENDING').toUpperCase(),
      createdAt: String(raw.createdAt || ''),
      pickupCode: String(raw.pickupCode || ''),
      note: String(raw.note || raw.bakkalNote || ''),
      payment: String(raw.payment || ''),
      source: String(raw.source || 'local'),
      lines: lines,
      itemCount: itemCount,
      totalKurus: Number.isFinite(totalKurus) ? totalKurus : computed,
    };
  }

  function normalizeOrders(orders, products) {
    return (Array.isArray(orders) ? orders : [])
      .map(function (raw) {
        return normalizeOrder(raw, products);
      })
      .filter(function (order) {
        return order !== null;
      });
  }

  var CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

  function randomPickupCode(random) {
    var rnd = typeof random === 'function' ? random : Math.random;
    var out = '';
    for (var i = 0; i < 6; i += 1) {
      out += CODE_ALPHABET.charAt(Math.floor(rnd() * CODE_ALPHABET.length));
    }
    return out;
  }

  /* Onay ekranı için yerel sipariş kaydı (bağlantı yokken kullanılır). */
  function orderFromCart(cart, totals, meta) {
    var options = meta || {};
    return {
      id: String(options.id != null ? options.id : ''),
      status: String(options.status || 'PENDING').toUpperCase(),
      createdAt: String(options.createdAt || new Date().toISOString()),
      pickupCode: String(options.pickupCode || ''),
      note: String(options.note || ''),
      payment: String(options.payment || ''),
      address: String(options.address || ''),
      source: String(options.source || 'local'),
      lines: (totals && totals.lines ? totals.lines : []).map(function (line) {
        return {
          productId: line.productId,
          name: line.name,
          unit: line.unit,
          qty: line.qty,
          tier: line.tier,
          unitPriceKurus: line.unitPriceKurus,
          lineTotalKurus: line.lineTotalKurus,
        };
      }),
      itemCount: totals ? totals.count : 0,
      totalKurus: totals ? totals.subtotalKurus : 0,
      cart: (Array.isArray(cart) ? cart : []).map(function (line) {
        return { productId: String(line.productId), qty: clampQty(line.qty) };
      }),
    };
  }

  return {
    fmtKurus: fmtKurus,
    shortKurus: shortKurus,
    tierFor: tierFor,
    searchProducts: searchProducts,
    groupByCategory: groupByCategory,
    productIndex: productIndex,
    setQty: setQty,
    addQty: addQty,
    clearCart: clearCart,
    cartTotals: cartTotals,
    refillFromOrder: refillFromOrder,
    normalizeOrder: normalizeOrder,
    normalizeOrders: normalizeOrders,
    randomPickupCode: randomPickupCode,
    orderFromCart: orderFromCart,
  };
});
