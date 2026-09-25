/* Landing walkthrough scene data for MahalleCoop. UMD: window.MC_WALK in the
   browser, module.exports in Node. Scene ids and their order are frozen by
   site/SPEC.md; dialogue strings are quoted from engine.js where the real app
   has a matching line, so the player reads like the demo itself. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.MC_WALK = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function b(text, buttons, delay) {
    var m = { from: 'bot', type: buttons ? 'buttons' : 'text', text: text };
    if (buttons) m.buttons = buttons;
    if (delay) m.delay = delay;
    return m;
  }

  function u(text) {
    return { from: 'user', type: 'text', text: text };
  }

  var CATALOG_HEADER =
    '🛒 Katalog (sayfa 1/2)\n' +
    'Numara yaz → 1 adet · "3 5" → 5 adet\n' +
    '"-3" → çıkar · "0 0 0" → sepeti boşalt';

  var CATALOG_P1 =
    CATALOG_HEADER + '\n' +
    '1. Sızma Zeytinyağı 5 L · 895,00 TL · 3+: 875,00 · 6+: 855,00\n' +
    '2. Ayçiçek Yağı 5 L · 385,00 TL · 3+: 370,00 · 6+: 355,00\n' +
    '3. Baldo Pirinç 5 kg · 625,00 TL · 3+: 610,00 · 6+: 595,00\n' +
    '4. Rize Çayı 1 kg · 345,00 TL · 3+: 335,00 · 6+: 325,00\n' +
    '5. Kırmızı Mercimek 2 kg · 198,00 TL · 3+: 192,00 · 6+: 186,00\n' +
    '6. Nohut 2 kg · 165,00 TL · 3+: 160,00 · 6+: 155,00\n' +
    '7. Kuru Fasulye 1 kg · 119,00 TL · 3+: 115,00 · 6+: 111,00\n' +
    '8. İnce Bulgur 2 kg · 88,00 TL · 3+: 85,00 · 6+: 82,00';

  var CATALOG_BUTTONS = [
    { id: 'CATALOG_NEXT', label: '➡️ Sonraki' },
    { id: 'CATALOG_EXIT', label: '🚪 Çık' },
  ];

  var MENU_P1_TEXT = "🏪 MahalleCoop'a hoş geldiniz!\nNe yapmak istersiniz?";
  var MENU_P1_BUTTONS = [
    { id: 'BROWSE', label: '🛒 Katalog' },
    { id: 'CART', label: '🧺 Sepetim' },
    { id: 'HELP', label: 'ℹ️ Yardım' },
    { id: 'ORDERS', label: '📦 Siparişlerim' },
    { id: 'PAGE2', label: '🗳️ Topluluk →' },
  ];

  var MENU_P2_TEXT = '🗳️ Topluluk: Talep Turu ve Dayanışma Panosu burada.';
  var MENU_P2_BUTTONS = [
    { id: 'DEMAND', label: '🗳️ Talep Turu' },
    { id: 'DAYANISMA', label: '🤝 Dayanışma' },
    { id: 'PAGE1', label: '⬅️ Ana Menü' },
  ];

  var CART_BUTTONS = [
    { id: 'CHECKOUT', label: '✅ Ödeme' },
    { id: 'BROWSE', label: '➕ Ürün Ekle' },
    { id: 'CLEAR', label: '🗑️ Sepeti Boşalt' },
  ];

  var ADDONS_TEXT =
    '🥖 Günlük bakkal ürünü eklemek ister misin? (Bakkal kasasında ödenir, kart işlemez)';
  var ADDONS_BUTTONS = [
    { id: 'ADDON:BREAD_2X', label: '+2 Ekmek' },
    { id: 'ADDON:MILK_1L', label: '+1 Süt' },
    { id: 'NOTE', label: '📝 Not Yaz' },
  ];

  var VOTE_BUTTONS = [
    { id: 'VOTE:1:AGREE', label: '👍 Katılıyorum' },
    { id: 'VOTE:1:DISAGREE', label: '👎 Katılmıyorum' },
    { id: 'VOTE:1:PASS', label: '🤷 Fark Etmez' },
  ];

  var scenes = [
    {
      id: 'kvkk-gate',
      feature: 'KVKK',
      title: 'KVKK kapısı',
      caption:
        'Sohbet, telefon numarasının yalnızca sipariş bildirimleri için ' +
        'kullanılacağını söyleyerek açılır. Onay vermeden katalog bile görünmez.',
      messages: [
        b(
          '🔐 KVKK Onayı: Kişisel verileriniz (telefon numarası) yalnızca ' +
            'sipariş bildirimleri için işlenir. Devam etmek için onaylayın.',
          [{ id: 'ACCEPT_KVKK', label: 'Onaylıyorum' }],
          600,
        ),
        u('Onaylıyorum'),
        b(MENU_P1_TEXT, MENU_P1_BUTTONS, 450),
      ],
    },
    {
      id: 'menu-pages',
      feature: 'MENU',
      title: 'Menü iki sayfa',
      caption:
        'Alışveriş birinci sayfada, mahalle işleri ikinci sayfada. ' +
        'Topluluk tarafı tek tuşla açılıp geri geliyor.',
      messages: [
        b(MENU_P1_TEXT, MENU_P1_BUTTONS),
        u('🗳️ Topluluk →'),
        b(MENU_P2_TEXT, MENU_P2_BUTTONS, 450),
        u('⬅️ Ana Menü'),
        b(MENU_P1_TEXT, MENU_P1_BUTTONS, 400),
      ],
    },
    {
      id: 'catalog-list',
      feature: 'CATALOG',
      title: 'Numaralı katalog',
      caption:
        'Katalogda 15 ürün var, bir sayfada 8 tanesi. Her satırda liste ' +
        'fiyatı ile 3+ ve 6+ kademeleri birlikte yazıyor.',
      messages: [
        u('🛒 Katalog'),
        b(CATALOG_P1, CATALOG_BUTTONS, 500),
      ],
    },
    {
      id: 'command-add',
      feature: 'COMMAND',
      title: 'Komutla sipariş',
      caption:
        '"4 2" yazmak, 4. üründen 2 adet sepete koymak demek. Bot adedi ve ' +
        'tutarı hemen geri yazıyor, liste tekrar gönderiliyor.',
      messages: [
        u('4 2'),
        b(
          '✔ Eklendi: +2 × Rize Çayı 1 kg (sepette: 2 × 345,00 = 690,00 TL)',
          null,
          550,
        ),
        b(CATALOG_P1, CATALOG_BUTTONS, 350),
      ],
    },
    {
      id: 'not-found',
      feature: 'NOT_FOUND',
      title: 'Olmayan numara',
      caption:
        'Listede olmayan bir numara yazılırsa hata geliyor ve liste tek tuşla ' +
        'geri gönderiliyor. Yazım hatası siparişi bozmuyor.',
      messages: [
        u('99'),
        b('99 listede yok. Listeyi tekrar göndereyim mi?', null, 550),
        b('🛒 Katalog', [{ id: 'RESEND_LIST', label: 'Evet, Göster' }], 300),
        u('Evet, Göster'),
        b(CATALOG_P1, CATALOG_BUTTONS, 450),
      ],
    },
    {
      id: 'tier-price',
      feature: 'TIER_PRICE',
      title: 'Kademe fiyatı',
      caption:
        'Aynı çaydan 3 adet olunca birim 345,00 TL yerine 335,00 TL oluyor, ' +
        '6 adet olunca 325,00 TL. Kademe, mahallenin toplu alımından çıkıyor.',
      messages: [
        u('4 1'),
        b(
          '✔ Eklendi: +1 × Rize Çayı 1 kg (sepette: 3 × 335,00 = 1.005,00 TL)',
          null,
          500,
        ),
        b('3+ kademesi açıldı: liste 345,00 TL yerine birim 335,00 TL.', null, 350),
        u('4 3'),
        b(
          '✔ Eklendi: +3 × Rize Çayı 1 kg (sepette: 6 × 325,00 = 1.950,00 TL)',
          null,
          500,
        ),
        b(
          '6+ kademesi açıldı: birim 325,00 TL. Sepetteki eski adetler de ' +
            'yeni kademeden fiyatlanıyor.',
          null,
          350,
        ),
      ],
    },
    {
      id: 'cart-remove',
      feature: 'CART',
      title: 'Sepet ve çıkarma',
      caption:
        'Tek üründen "-3" ile çıkılıyor, sepet tamamen boşalmak istenirse ' +
        '"0 0 0" yazılıyor. Çıkışta kademeli fiyat yeniden hesaplanıyor.',
      messages: [
        u('sepet'),
        b(
          'Rize Çayı 1 kg × 6 @ 325,00 = 1.950,00 TL\n\nToplam: 1.950,00 TL',
          CART_BUTTONS,
          450,
        ),
        u('➕ Ürün Ekle'),
        b(CATALOG_P1, CATALOG_BUTTONS, 400),
        u('-3'),
        b('✔ Çıkarıldı: 3 × Rize Çayı 1 kg (kalan: 3 × 335,00)', null, 500),
      ],
    },
    {
      id: 'addons',
      feature: 'ADDONS',
      title: 'Günlük ekstralar',
      caption:
        'Ekmek ve süt siparişe girmez, bakkal kasasında ödenir. Tuşların ' +
        'kodları ADDON:BREAD_2X ve ADDON:MILK_1L.',
      messages: [
        u('sepet'),
        b(
          'Rize Çayı 1 kg × 3 @ 335,00 = 1.005,00 TL\n\nToplam: 1.005,00 TL',
          CART_BUTTONS,
          400,
        ),
        u('✅ Ödeme'),
        b(ADDONS_TEXT, ADDONS_BUTTONS, 450),
        u('+2 Ekmek'),
        b('Eklendi: +2 Ekmek', null, 350),
        u('+1 Süt'),
        b('Eklendi: +1 Süt', null, 350),
        b(ADDONS_TEXT + '\n\nSeçili: +2 Ekmek, +1 Süt', ADDONS_BUTTONS, 350),
      ],
    },
    {
      id: 'confirm-note',
      feature: 'CONFIRM',
      title: 'Not ve sipariş özeti',
      caption:
        'Not özetin altına yazılıyor, ekstralar toplamın dışında kalıyor. ' +
        'Onay tuşundan önce her şey tek ekranda duruyor.',
      messages: [
        u('📝 Not Yaz'),
        b('📝 Notunuzu yazın (en fazla 250 karakter):', null, 450),
        u('Çay poşetleri ayrı kolide olursa iyi olur'),
        b('📝 Not kaydedildi ✔', null, 350),
        b('⬇️', [{ id: 'SKIP_ADDONS', label: 'Tamam, Devam' }], 350),
        u('Tamam, Devam'),
        b(
          '📋 Sipariş Özeti\n' +
            'Rize Çayı 1 kg × 3 @ 335,00 = 1.005,00 TL\n' +
            'Toplam: 1.005,00 TL\n\n' +
            '🏪 Bakkal kasasında öde: +2 Ekmek, +1 Süt\n' +
            '📝 Not: Çay poşetleri ayrı kolide olursa iyi olur',
          [
            { id: 'PAY', label: '✅ Onayla ve Öde' },
            { id: 'BACK', label: '⬅️ Geri' },
          ],
          450,
        ),
      ],
    },
    {
      id: 'payment-code',
      feature: 'PAYMENT',
      title: 'Ödeme ve teslim kodu',
      caption:
        'Ödeme demo modunda: kart formu sahte, gerçek çekim yok. Alış kodu ' +
        'altı haneli, kasada kare kod olarak da okunuyor.',
      messages: [
        u('✅ Onayla ve Öde'),
        b('DEMO ödeme: kart formu açılır, hiçbir gerçek çekim yapılmaz.', null, 550),
        b(
          'Sipariş #2 ödendi!\n' +
            'Toplam: 1.005,00 TL\n' +
            '📦 Alış kodu: 7QF3RT\n' +
            'Kodu kasada söyle, paketin hazır beklesin.',
          [{ id: 'HOME', label: '⬅️ Ana Menü' }],
          650,
        ),
        b(
          'Portalda alış kodu kare kod (QR) olarak da görünür; okutmazsan ' +
            'kodu elle yazman yeter.',
          null,
          400,
        ),
      ],
    },
    {
      id: 'delivery-notice',
      feature: 'DELIVERY',
      title: 'Teslim bildirimi',
      caption:
        'Bakkal teslim edince müşteriye haber gidiyor. Kod ve durum ' +
        'sipariş geçmişinde de duruyor.',
      messages: [
        b('Siparişiniz teslim edildi (kod 7QF3RT). İyi günler.', null, 750),
        u('Teşekkürler 🙏'),
        b('Afiyet olsun. Sorun olursa buradan yazabilirsin.', null, 350),
      ],
    },
    {
      id: 'suggest-demand',
      feature: 'SUGGEST',
      title: 'Talep turu önerisi',
      caption:
        'Talep turu açıkken 140 karaktere kadar öneri yazılabiliyor. Bakkal ' +
        'onaylayınca öneri oylamaya giriyor.',
      messages: [
        b(
          '🗳️ Talep Turu: Ekim Talep Turu\nKapanış: 26.09.2026 18:00',
          [
            { id: 'SUGGEST', label: '💡 Öneri Yap' },
            { id: 'VOTE_NEXT', label: '🗳️ Oylamaya Katıl' },
            { id: 'SKIP_DEMAND', label: 'Geç' },
          ],
          550,
        ),
        u('💡 Öneri Yap'),
        b("📝 Önerini yaz (en fazla 140 karakter), örn. '1 L Ayran':", null, 400),
        u('1 L Ayran'),
        b('✔ Önerin alındı! Bakkal onaylayınca oylamaya çıkar.', null, 450),
      ],
    },
    {
      id: 'vote-round',
      feature: 'VOTE',
      title: 'Oylama',
      caption:
        'Her öneri için tek oy veriliyor: 👍, 👎 veya 🤷. Kabul için en az ' +
        '3 oy ve en az %60 👍 payı gerekiyor.',
      messages: [
        b('🗳️ Öneri 1/2: 1 L Ayran', VOTE_BUTTONS, 550),
        u('👍 Katılıyorum'),
        b('🗳️ Öneri 2/2: Tam Yağlı Süt 1 L', VOTE_BUTTONS, 450),
        u('👎 Katılmıyorum'),
        b(
          'Oylama bitti, teşekkürler! Sonuçlar tur kapanınca yayınlanır.',
          [{ id: 'VOTE_RESULTS', label: '📊 Sonuçlar' }],
          450,
        ),
        b(
          'Kabul eşiği: en az 3 oy ve en az %60 👍. 🤷 Fark Etmez de oy ' +
            'sayısına yazılır, kabul payını düşürür.',
          null,
          400,
        ),
      ],
    },
    {
      id: 'convert-pano',
      feature: 'CONVERT_PANO',
      title: 'Ürüne dönüşüm ve pano',
      caption:
        'Kabul edilen öneri kataloğa yeni ürün olarak giriyor, dayanışma ' +
        'panosunda ilk "Ben Yapabilirim" diyen eşleşiyor. Kapanış sahnesi.',
      messages: [
        b(
          '📊 Ekim Talep Turu: 1 kabul edildi:\n' +
            '1 L Ayran · %73 👍 (8/11)\n\n' +
            'Çekimserler dahil 11 oy.',
          null,
          600,
        ),
        b(
          '✔ Kataloğa eklendi: 16. Ayran 1 L · 18,50 TL · 3+: 17,50 · 6+: 16,75',
          null,
          500,
        ),
        b(
          '📖 1.🤲 Fazla domates var, isteyene veririm (0 gün önce)',
          [
            { id: 'PANO_OFFER_MATCH:2', label: '🙋 Ben Yapabilirim' },
            { id: 'PANO_DONE', label: 'Bitir' },
          ],
          500,
        ),
        u('🙋 Ben Yapabilirim'),
        b('✔ Teşekkürler! Bakkal seni istek sahibiyle buluşturacak.', null, 600),
      ],
    },
  ];

  return {
    version: 1,
    scenes: scenes,
  };
});
