/* Üye PWA arayüzü. Klasik script, derleme adımı yok.
   Yönlendirme hash tabanlı: #/katalog #/sepet #/odeme #/siparisler #/profil
   #/bildirimler. Bölümler cart.js, store.js ve api.js üzerine kurulur. */
(function () {
  'use strict';

  var M = window.MCP;
  var PROFILE_KEY = 'mc_pwa_profile_v1';
  var ORDERS_KEY = 'mc_pwa_orders_v1';
  var NOTIF_KEY = 'mc_pwa_notif_v1';
  var ROUTES = ['katalog', 'sepet', 'odeme', 'siparisler', 'profil', 'bildirimler'];

  var STATUS_LABEL = {
    PENDING: 'Bekliyor',
    PAID: 'Ödendi',
    DELIVERED: 'Teslim edildi',
    CANCELLED: 'İptal',
  };

  var PAYMENT_LABEL = {
    COD: 'Kapıda ödeme',
    TRANSFER: 'Havale / EFT',
    CARD: 'Kart (3D Secure)',
  };

  var state = {
    route: 'katalog',
    query: '',
    category: 'Tümü',
    products: [],
    mode: 'demo',
    reason: '',
    cart: [],
    orders: [],
    profile: { name: '', phone: '', address: '' },
    notifications: [],
    payment: 'COD',
    note: '',
    confirmation: null,
    storageMode: '',
    serverCart: 'bilinmiyor',
    booting: true,
    odakAdim: '',
    closesAt: Date.now() + 2 * 86400000 + 14 * 3600000,
    odakArama: false,
  };

  var cartStore = null;

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function readJSON(key, fallback) {
    try {
      var raw = window.localStorage.getItem(key);
      if (!raw) return fallback;
      var parsed = JSON.parse(raw);
      return parsed == null ? fallback : parsed;
    } catch (err) {
      return fallback;
    }
  }

  function writeJSON(key, value) {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (err) {
      return false;
    }
  }

  function route() {
    var raw = String(window.location.hash || '').replace(/^#\/?/, '');
    var clean = raw.split('?')[0];
    return ROUTES.indexOf(clean) !== -1 ? clean : 'katalog';
  }

  function go(name) {
    if (ROUTES.indexOf(name) === -1) name = 'katalog';
    if (name !== 'odeme') state.confirmation = null;
    if (window.location.hash === '#/' + name) {
      state.route = name;
      render();
    } else {
      window.location.hash = '#/' + name;
    }
  }

  function qtyOf(id) {
    var found = 0;
    state.cart.forEach(function (line) {
      if (String(line.productId) === String(id)) found = line.qty;
    });
    return found;
  }

  function totals() {
    return M.cartTotals(state.cart, state.products);
  }

  function unreadCount() {
    return state.notifications.filter(function (n) {
      return !n.read;
    }).length;
  }

  function toast(message) {
    var el = document.getElementById('bilgi');
    if (!el) return;
    el.textContent = message;
    el.hidden = false;
    window.clearTimeout(toast._t);
    toast._t = window.setTimeout(function () {
      el.hidden = true;
    }, 2600);
  }

  function notify(title, body) {
    state.notifications.unshift({
      id: 'N' + Date.now() + Math.floor(Math.random() * 1000),
      title: title,
      body: body,
      ts: new Date().toISOString(),
      read: false,
    });
    writeJSON(NOTIF_KEY, state.notifications);
  }

  function saveCart() {
    state.storageMode = '';
    cartStore.save(state.cart).then(function (saved) {
      state.storageMode = saved.mode;
      updateChrome();
    });
  }

  function updateChrome() {
    var t = totals();
    var sepetSayi = document.getElementById('sepet-sayi');
    if (sepetSayi) {
      sepetSayi.textContent = String(t.count);
      sepetSayi.hidden = t.count === 0;
    }
    var unread = unreadCount();
    var zilSayi = document.getElementById('zil-sayi');
    if (zilSayi) {
      zilSayi.textContent = String(unread);
      zilSayi.hidden = unread === 0;
    }
    var etiket = document.getElementById('mod-etiketi');
    if (etiket) {
      etiket.hidden = false;
      etiket.textContent = state.mode === 'live' ? 'Canlı' : 'Demo';
      etiket.className = 'etiket' + (state.mode === 'live' ? ' canli' : '');
    }
    var seri = document.getElementById('uyari-seridi');
    if (seri) {
      if (state.mode === 'live') {
        seri.hidden = true;
      } else {
        seri.hidden = false;
        seri.textContent =
          'Demo modu: katalog bu cihazdaki örnek veriden geliyor. Sunucuya bağlanılamadı (' +
          (state.reason || 'bilinmiyor') +
          ').';
      }
    }
    var aktif = state.route === 'odeme' ? 'sepet' : state.route;
    Array.prototype.forEach.call(document.querySelectorAll('.sekmeler button'), function (btn) {
      if (btn.getAttribute('data-yon') === aktif) btn.setAttribute('aria-current', 'page');
      else btn.removeAttribute('aria-current');
    });
  }

  function countdownText(ms) {
    if (ms <= 0) return 'Pencere kapandı';
    var dakika = Math.floor(ms / 60000);
    var gun = Math.floor(dakika / 1440);
    var saat = Math.floor((dakika % 1440) / 60);
    var dk = dakika % 60;
    var parcalar = [];
    if (gun > 0) parcalar.push(gun + ' gün');
    if (saat > 0) parcalar.push(saat + ' saat');
    if (gun === 0) parcalar.push(dk + ' dk');
    return parcalar.join(' ');
  }

  function dateLabel(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (Number.isNaN(d.getTime())) return String(iso);
    return d.toLocaleString('tr-TR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  /* ---------- Ekranlar ---------- */

  function kategoriCipleri() {
    var names = ['Tümü'];
    M.groupByCategory(state.products).forEach(function (group) {
      names.push(group.name);
    });
    return names
      .map(function (name) {
        return (
          '<button type="button" class="cip" data-eylem="kategori" data-ad="' +
          esc(name) +
          '" aria-pressed="' +
          (state.category === name ? 'true' : 'false') +
          '">' +
          esc(name) +
          '</button>'
        );
      })
      .join('');
  }

  function kademeHtml(product, qty) {
    var steps = [
      { esik: '1+', fiyat: product.tier1, tier: 1 },
      { esik: product.threshold2 + '+', fiyat: product.tier2, tier: 2 },
      { esik: product.threshold3 + '+', fiyat: product.tier3, tier: 3 },
    ];
    var aktif = M.tierFor(product, qty).tier;
    return (
      '<div class="kademe" aria-label="Kademe fiyatları">' +
      steps
        .map(function (step) {
          return (
            '<div class="kademe-adim' +
            (step.tier === aktif ? ' aktif' : '') +
            '">' +
            '<span class="esik">' +
            esc(step.esik) +
            '</span>' +
            '<span class="fiyat">' +
            esc(M.shortKurus(step.fiyat)) +
            '</span></div>'
          );
        })
        .join('') +
      '</div>'
    );
  }

  function urunKart(product) {
    var qty = qtyOf(product.id);
    var resolved = M.tierFor(product, qty || 1);
    var fark = qty > 0 ? (product.tier1 - resolved.price) * qty : 0;
    return (
      '<article class="kart">' +
      '<div class="kart-ust">' +
      '<h3 class="kart-ad">' +
      esc(product.name) +
      '</h3>' +
      '<span class="kart-birim">' +
      esc(product.unit) +
      '</span>' +
      '</div>' +
      '<p class="kart-kategori">' +
      esc(product.category) +
      '</p>' +
      kademeHtml(product, qty) +
      '<div class="kart-alt">' +
      '<div class="adim">' +
      '<button type="button" id="adim-' +
      esc(product.id) +
      '--1" data-eylem="adim" data-id="' +
      esc(product.id) +
      '" data-delta="-1" aria-label="' +
      esc(product.name) +
      ' azalt">−</button>' +
      '<span class="sayi" aria-live="polite">' +
      qty +
      '</span>' +
      '<button type="button" id="adim-' +
      esc(product.id) +
      '-1" data-eylem="adim" data-id="' +
      esc(product.id) +
      '" data-delta="1" aria-label="' +
      esc(product.name) +
      ' artır">+</button>' +
      '</div>' +
      '<div class="fiyat-satir">' +
      '<div class="fiyat-buyuk">' +
      esc(M.shortKurus(resolved.price)) +
      ' TL</div>' +
      '<div class="fiyat-not">' +
      (fark > 0
        ? '<span class="tasarruf">' + esc(M.shortKurus(fark)) + ' TL tasarruf</span>'
        : resolved.tier > 1
          ? esc(resolved.tier) + '. kademe'
          : 'Bu adette 1. kademe') +
      '</div>' +
      '</div></div></article>'
    );
  }

  function katalogListesiHtml() {
    var filtreli = M.searchProducts(state.products, state.query);
    if (state.category !== 'Tümü') {
      filtreli = filtreli.filter(function (p) {
        return p.category === state.category;
      });
    }
    if (!state.products.length) {
      return state.booting
        ? '<div class="bos"><h3>Katalog yükleniyor</h3><p>Sunucuya bakılıyor, kısa süre sürecek.</p></div>'
        : '<div class="bos"><h3>Katalog yüklenemedi</h3>' +
          '<p>Sunucuya ve örnek veriye ulaşılamadı. Sayfayı yenileyip tekrar dene.</p></div>';
    }
    if (!filtreli.length) {
      return (
        '<div class="bos"><h3>Eşleşen ürün yok</h3>' +
        '<p>“' +
        esc(state.query) +
        '” için sonuç bulunamadı. Ürün adının bir parçasını yazmayı dene.</p></div>'
      );
    }
    return filtreli.map(urunKart).join('');
  }

  function katalogEkrani() {
    return (
      '<h1 class="bolum-baslik">Katalog</h1>' +
      '<p class="bolum-aciklama">Kademe fiyatları toplu alıma göre düşer. 3 adet ve üzeri ikinci kademe, 6 adet ve üzeri üçüncü kademe.</p>' +
      '<div class="arama-kutu">' +
      '<span class="arama-ikon" aria-hidden="true">🔎</span>' +
      '<label class="alan-etiket" for="arama">Ürün ara</label>' +
      '<input class="arama" id="arama" type="search" placeholder="Örnek: çay, mercimek" value="' +
      esc(state.query) +
      '" autocomplete="off"/>' +
      '</div>' +
      '<div class="cips">' +
      kategoriCipleri() +
      '</div>' +
      '<div id="katalog-liste">' +
      katalogListesiHtml() +
      '</div>'
    );
  }

  function sepetEkrani() {
    var t = totals();
    if (!t.lines.length) {
      return (
        '<h1 class="bolum-baslik">Sepetim</h1>' +
        '<div class="bos"><h3>Sepetin boş</h3>' +
        '<p>Katalogdan ürün ekleyerek başlayabilirsin. Sepet bu cihazda saklanır, uygulama kapansa da durur.</p></div>' +
        '<button type="button" class="buton birincil" data-yon="katalog">Kataloga dön</button>'
      );
    }
    var satirlar = t.lines
      .map(function (line) {
        return (
          '<div class="satir">' +
          '<div class="satir-bilgi">' +
          '<div class="satir-ad">' +
          esc(line.name) +
          '</div>' +
          '<div class="satir-alt">' +
          esc(line.unit) +
          ' · ' +
          line.tier +
          '. kademe · ' +
          esc(M.shortKurus(line.unitPriceKurus)) +
          ' TL</div>' +
          '</div>' +
          '<div class="adim">' +
          '<button type="button" id="adim-' +
          esc(line.productId) +
          '--1" data-eylem="adim" data-id="' +
          esc(line.productId) +
          '" data-delta="-1" aria-label="' +
          esc(line.name) +
          ' azalt">−</button>' +
          '<span class="sayi">' +
          line.qty +
          '</span>' +
          '<button type="button" id="adim-' +
          esc(line.productId) +
          '-1" data-eylem="adim" data-id="' +
          esc(line.productId) +
          '" data-delta="1" aria-label="' +
          esc(line.name) +
          ' artır">+</button>' +
          '</div>' +
          '<div class="satir-tutar">' +
          esc(M.shortKurus(line.lineTotalKurus)) +
          ' TL</div>' +
          '</div>'
        );
      })
      .join('');

    return (
      '<h1 class="bolum-baslik">Sepetim</h1>' +
      '<p class="bolum-aciklama">' +
      t.count +
      ' ürün, ' +
      t.lines.length +
      ' kalem</p>' +
      satirlar +
      '<div class="serit"><span>Tahmini tasarruf (1. kademeye göre)</span>' +
      '<strong class="tasarruf">' +
      esc(M.shortKurus(t.savingsKurus)) +
      ' TL</strong></div>' +
      '<div class="toplam-kutu"><span class="toplam-etiket">Sepet toplamı</span>' +
      '<span class="toplam-tutar">' +
      esc(M.shortKurus(t.subtotalKurus)) +
      ' TL</span></div>' +
      '<button type="button" class="buton birincil" data-yon="odeme">Ödemeye geç</button>' +
      '<button type="button" class="buton tehlike" data-eylem="sepeti-bosalt">Sepeti boşalt</button>'
    );
  }

  function odemeEkrani() {
    if (state.confirmation) {
      var c = state.confirmation;
      var payUrl = M.paymentLink(c.paymentUrl);
      return (
        '<div class="onay">' +
        '<div class="onay-ikon" aria-hidden="true">✅</div>' +
        '<h2>Siparişin alındı</h2>' +
        '<p>' +
        esc(PAYMENT_LABEL[c.payment] || '') +
        ' · ' +
        esc(M.shortKurus(c.totalKurus)) +
        ' TL</p>' +
        '<div class="kod" aria-label="Teslim kodu">' +
        esc(c.pickupCode) +
        '</div>' +
        '<p>Teslimat sırasında bu kodu söyle. Durumu Siparişlerim bölümünden izleyebilirsin.</p>' +
        '<p><strong>' +
        esc(c.source === 'server' ? 'Sunucuya kaydedildi' : 'Bu cihazda kaydedildi (demo)') +
        '</strong></p>' +
        '</div>' +
        (payUrl
          ? '<button type="button" class="buton birincil ust-dugme" data-eylem="odeme-link">Ödemeye devam et</button>'
          : '') +
        '<button type="button" class="buton birincil ust-dugme" data-yon="siparisler">Siparişlerim</button>' +
        '<button type="button" class="buton ikincil" data-eylem="yeni-alisveris">Yeni alışveriş</button>'
      );
    }

    var t = totals();
    if (!t.lines.length) {
      return (
        '<h1 class="bolum-baslik">Ödeme</h1>' +
        '<div class="bos"><h3>Ödeme için ürün yok</h3>' +
        '<p>Sepetin boş. Katalogdan ürün ekledikten sonra buraya dön.</p></div>' +
        '<button type="button" class="buton birincil" data-yon="katalog">Kataloga git</button>'
      );
    }

    var ozet = t.lines
      .map(function (line) {
        return (
          '<li><span>' +
          esc(line.name) +
          ' × ' +
          line.qty +
          '</span><span class="gecmis-tutar">' +
          esc(M.shortKurus(line.lineTotalKurus)) +
          ' TL</span></li>'
        );
      })
      .join('');

    function secenek(id, ad, alt) {
      return (
        '<label class="secenek">' +
        '<input type="radio" name="odeme" value="' +
        id +
        '"' +
        (state.payment === id ? ' checked' : '') +
        '/>' +
        '<span class="metin"><span class="ad">' +
        esc(ad) +
        '</span><br/><span class="alt">' +
        esc(alt) +
        '</span></span></label>'
      );
    }

    return (
      '<h1 class="bolum-baslik">Ödeme</h1>' +
      '<p class="bolum-aciklama">Her şeyi tek ekranda tamamla: kesim saati, adres ve ödeme yöntemi.</p>' +
      '<div class="kutu"><h3>Sipariş özeti</h3><ul class="gecmis-liste">' +
      ozet +
      '</ul><div class="toplam-kutu"><span class="toplam-etiket">Toplam</span>' +
      '<span class="toplam-tutar">' +
      esc(M.shortKurus(t.subtotalKurus)) +
      ' TL</span></div>' +
      (t.savingsKurus > 0
        ? '<p class="fiyat-not">Kademe indirimiyle <span class="tasarruf">' +
          esc(M.shortKurus(t.savingsKurus)) +
          ' TL</span> kazandın.</p>'
        : '') +
      '</div>' +
      '<div class="kutu"><h3>Pencere kesim saati</h3>' +
      '<div class="geri-sayim" id="geri-sayim">' +
      esc(countdownText(state.closesAt - Date.now())) +
      '</div>' +
      '<p class="fiyat-not">Kesimden sonra sipariş bir sonraki toplu alım turuna girer.</p></div>' +
      '<div class="kutu"><h3>Teslimat adresi</h3>' +
      '<label class="alan-etiket" for="adres">Adres</label>' +
      '<textarea class="alan" id="adres" rows="2" placeholder="Mahalle, sokak, kat">' +
      esc(state.profile.address) +
      '</textarea>' +
      '<button type="button" class="satir-dugme" data-yon="profil">Profili düzenle</button></div>' +
      '<div class="kutu"><h3>Ödeme yöntemi</h3>' +
      secenek('COD', 'Kapıda ödeme', 'Paket teslim edilirken nakit veya kart') +
      secenek('TRANSFER', 'Havale / EFT', 'IBAN bilgisi sipariş onayında gelir') +
      secenek('CARD', 'Kart (3D Secure)', 'Banka onaylı ödeme, kart bilgisi bu uygulamada saklanmaz') +
      '</div>' +
      '<div class="kutu"><h3>Sipariş notu</h3>' +
      '<label class="alan-etiket" for="not">Not (isteğe bağlı)</label>' +
      '<textarea class="alan" id="not" rows="2" placeholder="Örnek: zeytinyağı ayrı kolide">' +
      esc(state.note) +
      '</textarea></div>' +
      '<div class="kutu"><h3>KVKK onayı</h3>' +
      '<label class="kvkk-onay"><input type="checkbox" id="kvkk-onay" />' +
      '<a href="../kvkk.html">KVKK aydınlatmasını okudum, onaylıyorum</a>' +
      '</label>' +
      '<p class="fiyat-not">Onaylamadan sipariş sunucuya gitmez, yalnız bu cihazda saklanır.</p>' +
      '</div>' +
      '<button type="button" class="buton birincil" data-eylem="siparis-onayla">Siparişi onayla ve öde</button>'
    );
  }

  function siparislerEkrani() {
    var list = M.normalizeOrders(state.orders, state.products);
    if (!list.length) {
      return (
        '<h1 class="bolum-baslik">Siparişlerim</h1>' +
        '<div class="bos"><h3>Henüz siparişin yok</h3>' +
        '<p>İlk siparişini katalogdan verebilirsin. Geçmiş siparişlerin burada listelenir.</p></div>' +
        '<button type="button" class="buton birincil" data-yon="katalog">Kataloga git</button>'
      );
    }
    var kartlar = list
      .map(function (order) {
        var satirlar = order.lines
          .map(function (line) {
            return (
              '<li><span>' +
              esc(line.name) +
              ' × ' +
              line.qty +
              '</span><span class="gecmis-tutar">' +
              esc(M.shortKurus(line.lineTotalKurus)) +
              ' TL</span></li>'
            );
          })
          .join('');
        return (
          '<article class="gecmis">' +
          '<div class="gecmis-ust">' +
          '<span class="gecmis-tarih">' +
          esc(dateLabel(order.createdAt) || 'Tarih yok') +
          '</span>' +
          '<span class="rozet ' +
          (order.status === 'DELIVERED'
            ? 'teslim'
            : order.status === 'PAID'
              ? 'odendi'
              : order.status === 'CANCELLED'
                ? 'iptal'
                : 'bekliyor') +
          '">' +
          esc(STATUS_LABEL[order.status] || order.status) +
          '</span></div>' +
          '<ul class="gecmis-liste">' +
          satirlar +
          '</ul>' +
          '<div class="toplam-kutu">' +
          '<span class="toplam-etiket">' +
          order.itemCount +
          ' ürün</span>' +
          '<span class="fiyat-buyuk">' +
          esc(M.shortKurus(order.totalKurus)) +
          ' TL</span></div>' +
          (order.pickupCode
            ? '<p class="fiyat-not">Teslim kodu: <strong>' + esc(order.pickupCode) + '</strong></p>'
            : '') +
          '<button type="button" class="satir-dugme" data-eylem="tekrar" data-id="' +
          esc(order.id) +
          '">🔁 Tekrar sipariş</button>' +
          '</article>'
        );
      })
      .join('');
    return (
      '<h1 class="bolum-baslik">Siparişlerim</h1>' +
      '<p class="bolum-aciklama">Tekrar sipariş, eski sepetini güncel fiyatlarla yeniden doldurur.</p>' +
      kartlar
    );
  }

  function profilEkrani() {
    return (
      '<h1 class="bolum-baslik">Profil</h1>' +
      '<p class="bolum-aciklama">Bilgiler bu cihazda saklanır. Sunucuya gönderilen tek şey, sipariş verdiğinde telefon numaran olur.</p>' +
      '<div class="kutu">' +
      '<label class="alan-etiket" for="ad">Ad soyad</label>' +
      '<input class="alan" id="ad" type="text" value="' +
      esc(state.profile.name) +
      '" placeholder="Örnek: Ayşe Kaya" autocomplete="name"/>' +
      '<label class="alan-etiket" for="telefon">Telefon</label>' +
      '<input class="alan" id="telefon" type="tel" value="' +
      esc(state.profile.phone) +
      '" placeholder="05xx xxx xx xx" autocomplete="tel"/>' +
      '<label class="alan-etiket" for="profil-adres">Teslimat adresi</label>' +
      '<textarea class="alan" id="profil-adres" rows="3" placeholder="Mahalle, sokak, kat">' +
      esc(state.profile.address) +
      '</textarea>' +
      '<button type="button" class="buton birincil" data-eylem="profil-kaydet">Kaydet</button>' +
      '</div>' +
      '<div class="kutu"><h3>Uygulama durumu</h3>' +
      '<p class="fiyat-not">Katalog: ' +
      (state.mode === 'live' ? 'sunucudan' : 'örnek veri (demo)') +
      '</p>' +
      '<p class="fiyat-not">Depolama: ' +
      esc(state.storageMode || 'başlatılıyor') +
      '</p>' +
      '<p class="fiyat-not">Sunucu sepeti kurtarma: ' +
      esc(state.serverCart) +
      '</p>' +
      '<p class="fiyat-not">Ürün sayısı: ' +
      state.products.length +
      '</p></div>'
    );
  }

  function bildirimEkrani() {
    if (!state.notifications.length) {
      return (
        '<h1 class="bolum-baslik">Bildirimler</h1>' +
        '<div class="bos"><h3>Yeni bildirim yok</h3>' +
        '<p>Sipariş onayı ve teslim durumu burada birikir. Uygulama içi liste birincil kanaldır, WhatsApp ayrıca mesaj atar.</p></div>'
      );
    }
    var items = state.notifications
      .map(function (n) {
        return (
          '<article class="bildirim' +
          (n.read ? '' : ' okunmadi') +
          '">' +
          '<h3 class="bildirim-baslik">' +
          esc(n.title) +
          '</h3>' +
          '<p class="bildirim-govde">' +
          esc(n.body) +
          '</p>' +
          '<div class="bildirim-zaman">' +
          esc(dateLabel(n.ts)) +
          '</div></article>'
        );
      })
      .join('');
    return (
      '<h1 class="bolum-baslik">Bildirimler</h1>' +
      '<p class="bolum-aciklama">' +
      unreadCount() +
      ' okunmamış</p>' +
      items +
      '<button type="button" class="buton ikincil" data-eylem="hepsi-okundu">Tümünü okundu işaretle</button>'
    );
  }

  var SCREENS = {
    katalog: katalogEkrani,
    sepet: sepetEkrani,
    odeme: odemeEkrani,
    siparisler: siparislerEkrani,
    profil: profilEkrani,
    bildirimler: bildirimEkrani,
  };

  function restoreAdimFocus() {
    if (!state.odakAdim) return;
    var btn = document.getElementById(state.odakAdim);
    state.odakAdim = '';
    if (btn && typeof btn.focus === 'function') btn.focus({ preventScroll: true });
  }

  function render() {
    var view = document.getElementById('icerik');
    if (!view) return;
    view.innerHTML = (SCREENS[state.route] || katalogEkrani)();
    updateChrome();
    restoreAdimFocus();
    if (state.route === 'katalog' && state.odakArama) {
      var input = document.getElementById('arama');
      if (input) {
        input.focus();
        var len = input.value.length;
        try {
          input.setSelectionRange(len, len);
        } catch (err) {
          /* search alanı bazı tarayıcılarda seçim desteklemez */
        }
      }
      state.odakArama = false;
    }
  }

  function renderKatalogListesi() {
    var box = document.getElementById('katalog-liste');
    if (box) box.innerHTML = katalogListesiHtml();
    updateChrome();
    restoreAdimFocus();
  }

  /* ---------- Eylemler ---------- */

  function setQty(id, delta) {
    state.cart = M.addQty(state.cart, id, delta);
    state.odakAdim = 'adim-' + id + '-' + delta;
    saveCart();
    if (state.route === 'katalog') renderKatalogListesi();
    else render();
  }

  /* api.js gövdesi {phone, items}. Gövdeye kırpılmış telefon gider; api.js bu
     değeri olduğu gibi yazar, boşsa sunucu 400 döner ve yol yerel/demo kalır.
     Ham telefon hiçbir yere loglanmaz. */
  function profilePhone() {
    var raw = state.profile && state.profile.phone;
    return typeof raw === 'string' ? raw.trim() : '';
  }

  /* paymentLink taşındı: api.js. KVKK onayı işaretli değilse sipariş sunucuya gitmez, yerel/demo yolunda kalır. */
  function placeOrder() {
    var adresEl = document.getElementById('adres');
    var notEl = document.getElementById('not');
    if (adresEl) state.profile.address = adresEl.value.trim();
    if (notEl) state.note = notEl.value.trim();
    var kvkkEl = document.getElementById('kvkk-onay');
    var consent = !!(kvkkEl && kvkkEl.checked);
    if (!state.profile.address) {
      toast('Teslimat adresi boş. Profilden adres yaz.');
      go('profil');
      return;
    }
    var t = totals();
    if (!t.lines.length) {
      toast('Sepetin boş.');
      go('sepet');
      return;
    }
    var id = 'Y' + Date.now();
    var order = M.orderFromCart(state.cart, t, {
      id: id,
      createdAt: new Date().toISOString(),
      status: 'PENDING',
      pickupCode: M.randomPickupCode(),
      note: state.note,
      payment: state.payment,
      address: state.profile.address,
      source: 'local',
    });

    /* Onay yoksa istemci ağa hiç çıkmaz: sonuç yerelde, aynı Türkçe notla
       üretilir. api.js içindeki consent kapısı da ikinci bir kalemdir. */
    var gonderim = consent
      ? M.submitOrder({ phone: profilePhone(), consent: true, order: order })
      : Promise.resolve({
          ok: true,
          source: 'local',
          id: String(order.id),
          reason: 'consent_required',
          totalKurus: null,
          paymentUrl: '',
        });
    gonderim.then(function (result) {
      if (!consent) {
        toast('KVKK aydınlatma metnini onaylamadığın için sipariş yalnız bu cihazda kaydedildi.');
      }
      if (result.source === 'server') {
        order.source = 'server';
        order.id = String(result.id);
        if (result.paymentUrl) order.paymentUrl = result.paymentUrl;
      }
      state.orders.unshift(order);
      writeJSON(ORDERS_KEY, state.orders);
      writeJSON(PROFILE_KEY, state.profile);
      notify(
        'Siparişin alındı',
        'Teslim kodu ' + order.pickupCode + '. Tutar ' + M.shortKurus(order.totalKurus) + ' TL.',
      );
      state.confirmation = order;
      state.note = '';
      state.cart = [];
      saveCart();
      render();
      toast('Sipariş kaydedildi.');
      if (order.source === 'server') {
        M.fetchOrderStatus({ orderId: order.id }).then(function (status) {
          if (status.ok && status.status) {
            order.status = status.status;
            if (status.pickupCode) order.pickupCode = status.pickupCode;
            writeJSON(ORDERS_KEY, state.orders);
          }
        });
      }
    });
  }

  function reorder(orderId) {
    var raw = null;
    state.orders.forEach(function (o) {
      if (String(o.id) === String(orderId)) raw = o;
    });
    if (!raw) {
      toast('Sipariş bulunamadı.');
      return;
    }
    var refill = M.refillFromOrder(raw, state.products);
    if (!refill.cart.length) {
      toast('Bu siparişteki ürünler artık katalogda yok.');
      return;
    }
    state.cart = refill.cart;
    saveCart();
    if (refill.skipped.length) {
      toast(refill.skipped.length + ' ürün katalogdan düştü, kalanlar sepete eklendi.');
    } else {
      toast('Sepet eski siparişle dolduruldu.');
    }
    go('sepet');
  }

  function saveProfile() {
    var ad = document.getElementById('ad');
    var telefon = document.getElementById('telefon');
    var adres = document.getElementById('profil-adres');
    state.profile = {
      name: ad ? ad.value.trim() : '',
      phone: telefon ? telefon.value.trim() : '',
      address: adres ? adres.value.trim() : '',
    };
    writeJSON(PROFILE_KEY, state.profile);
    toast('Profil kaydedildi.');
    render();
  }

  document.addEventListener('click', function (event) {
    if (!event.target || typeof event.target.closest !== 'function') return;
    var yon = event.target.closest('[data-yon]');
    if (yon) {
      go(yon.getAttribute('data-yon'));
      return;
    }
    var el = event.target.closest('[data-eylem]');
    if (!el) return;
    var eylem = el.getAttribute('data-eylem');
    if (eylem === 'adim') {
      setQty(el.getAttribute('data-id'), Number(el.getAttribute('data-delta')));
    } else if (eylem === 'kategori') {
      state.category = el.getAttribute('data-ad');
      render();
    } else if (eylem === 'sepeti-bosalt') {
      state.cart = M.clearCart();
      saveCart();
      render();
      toast('Sepet boşaltıldı.');
    } else if (eylem === 'siparis-onayla') {
      placeOrder();
    } else if (eylem === 'tekrar') {
      reorder(el.getAttribute('data-id'));
    } else if (eylem === 'profil-kaydet') {
      saveProfile();
    } else if (eylem === 'hepsi-okundu') {
      state.notifications.forEach(function (n) {
        n.read = true;
      });
      writeJSON(NOTIF_KEY, state.notifications);
      render();
    } else if (eylem === 'odeme-link') {
      var payHedef = state.confirmation ? M.paymentLink(state.confirmation.paymentUrl) : '';
      if (payHedef) window.location.assign(payHedef);
    } else if (eylem === 'yeni-alisveris') {
      state.confirmation = null;
      go('katalog');
    }
  });

  document.addEventListener('input', function (event) {
    if (event.target && event.target.id === 'arama') {
      state.query = event.target.value;
      renderKatalogListesi();
    }
  });

  document.addEventListener('change', function (event) {
    if (event.target && event.target.name === 'odeme') {
      state.payment = event.target.value;
    }
  });

  window.addEventListener('hashchange', function () {
    var raw = String(window.location.hash || '');
    if (raw === '#icerik') {
      var hedef = document.getElementById('icerik');
      if (hedef) hedef.focus({ preventScroll: true });
      return;
    }
    state.route = route();
    if (state.route !== 'odeme') state.confirmation = null;
    if (state.route === 'katalog' && state.query) state.odakArama = true;
    render();
    var view = document.getElementById('icerik');
    if (view) view.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  });

  /* ---------- Açılış ---------- */

  function refreshServerStatuses() {
    state.orders.slice(0, 3).forEach(function (order) {
      if (order.source !== 'server') return;
      M.fetchOrderStatus({ orderId: order.id }).then(function (status) {
        if (!status.ok) return;
        if (status.status && status.status !== order.status) {
          order.status = status.status;
          if (status.pickupCode) order.pickupCode = status.pickupCode;
          writeJSON(ORDERS_KEY, state.orders);
          if (state.route === 'siparisler') render();
        }
      });
    });
  }

  function boot() {
    state.profile = Object.assign({ name: '', phone: '', address: '' }, readJSON(PROFILE_KEY, {}));
    state.orders = readJSON(ORDERS_KEY, []);
    state.notifications = readJSON(NOTIF_KEY, []);
    state.route = route();

    cartStore = M.createCartStore();

    cartStore
      .check()
      .then(function (check) {
        if (check.state === 'ok') {
          state.cart = check.cart;
          state.storageMode = check.mode;
          state.serverCart = 'sepette veri var';
          return null;
        }
        return cartStore.recover().then(function (result) {
          state.cart = result.cart;
          state.storageMode = result.mode;
          state.serverCart = result.recovered ? 'geri getirildi' : 'kurtarma yok';
          if (result.recovered) toast('Sunucudaki sepet geri getirildi.');
        });
      })
      .then(function () {
        return M.loadCatalog({});
      })
      .then(function (catalog) {
        state.products = catalog.products;
        state.mode = catalog.mode;
        state.reason = catalog.reason;
        state.booting = false;
        render();
        refreshServerStatuses();
      })
      .catch(function () {
        state.products = M.DEMO_CATALOG;
        state.mode = 'demo';
        state.reason = 'unreachable';
        state.booting = false;
        render();
      });

    render();

    if (navigator.storage && typeof navigator.storage.persist === 'function') {
      navigator.storage.persist().catch(function () {
        /* tarayıcı izni yoksa sessizce geç */
      });
    }

    if ('serviceWorker' in navigator && window.location.protocol !== 'file:') {
      navigator.serviceWorker.register('./sw.js').catch(function () {
        /* dosya olarak açıldığında ya da destek yoksa yok say */
      });
    }

    window.setInterval(function () {
      var el = document.getElementById('geri-sayim');
      if (el) el.textContent = countdownText(state.closesAt - Date.now());
    }, 30000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
