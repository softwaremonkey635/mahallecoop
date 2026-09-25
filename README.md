# MahalleCoop statik demo

100% statik, framework'süz bir vitrin: mahalle bakkalı siparişlerini WhatsApp
sohbetinde toplar, bakkal portalı teslimatı, karar turlarını, pano ilanlarını
ve duyuruları yönetir. Veriler tarayıcının `localStorage` alanında (`mc_demo_v1`)
durur; sunucuya hiçbir şey gitmez. Ödeme ve WhatsApp MOCK.

## Dosyalar

| Dosya | İçerik |
| --- | --- |
| `index.html` | açılış sayfası (hero, örnek fiş, özellik ızgarası) |
| `demo.html` | etkileşimli kabuk (telefon + portal; S1) |
| `js/store.js`, `js/engine.js`, `js/ui.js` | mağaza, sohbet motoru, telefon arayüzü (S1) |
| `js/portal.js` | bakkal portalı (S2, bu depo) |
| `vendor/qrcode.min.js` | teslim kodu QR üretimi (S2, MIT) |
| `manifest.webmanifest`, `sw.js` | PWA, göreli yollar, cache-first (S2) |

## Yerel çalıştırma

1. `site/` klasörüne girin.
2. `python3 -m http.server 8000`
3. Tarayıcıda `http://localhost:8000/` açın.

`file://` ile çift tıklama da çalışır (classic script etiketleri, modül yok).
Service worker yalnızca `http(s)` altında kaydolur; `file://` sessizce geçer.

## Yayınlama (GitHub Pages)

- Canlı site: <https://softwaremonkey635.github.io/mahallecoop/>
- Genel (herkese açık) depo: `softwaremonkey635/mahallecoop`
- Pages kaynağı: `main` dalının kökü (`/ (root)`).
- Uygulama kodu ayrı ve özel bir depoda durur
  (`softwaremonkey635/mahallecoop-demo`); bu sayfadaki "GitHub" bağlantıları
  genel depoyu gösterir.

### Güncelleme

1. `site/` içeriğini genel deponun köküne kopyalayın (taze bir anlık görüntü
   çekmek için `/tmp` altında yeni bir klon kurup `git push --force origin main`
   da kullanabilirsiniz).
2. GitHub Pages birkaç saniye içinde yeniden derler.
3. Canlı adreste bağlantıları kontrol edin.

Tüm yollar göreli olduğu için alt dizin yayınında (`/mahallecoop/`) da çalışır;
service worker kapsamı `./`.

## Test

`node site/test/engine.test.mjs` (S1 motoru, bağımlılıksız). Bu depodaki
JS dosyaları `node --check` ile sözdizimi denetiminden geçer.

## Gizlilik / paylaşım

Bu site yalnızca bağlantı ile paylaşılır: adresi bilmeyen sayfayı bulamaz.

- `index.html` ve `demo.html` iki meta etiketi taşır:
  `<meta name="robots" content="noindex, nofollow, noarchive">` arama
  motorlarına indekslememesini söyler, `<meta name="referrer" content="no-referrer">`
  ise sayfadan tıklanan bağlantılarda hedef siteye yönlendirici bilgisi
  göndermez.
- `robots.txt` tüm robotlara `Disallow: /` der. Bu iki katman da naif bir
  ricadır; asıl koruma bilinmeyen bağlantı adresidir.
- `js/access-gate.js` ilk ziyarette yumuşak bir erişim kodu ister. Kodu
  döndürmek için dosyanın en üstündeki `ACCESS_CODE` sabitini değiştirin,
  tek satır, başka yer yok. Doğru kod `localStorage`'a `mc_access='ok'`
  olarak yazılır ve kapı bir daha çıkmaz. Yanlış kodda kart üzerinde yumuşak
  bir satır belirir, sayfa çalışmaya devam eder.
- Dürüst not: bu kod tarayıcıda duran bir perdedir, gerçek kimlik doğrulama
  değildir. Sayfa kaynağını açan herkes kodu görebilir. Ciddi koruma için iki
  seçenek var: sunucu tarafında PIN (yerel demoda `DEMO_GATE` /
  `DEMO_PIN`, bkz. `src/server.ts`) ya da şifre korumalı ücretli bir
  barındırma.
- Kapı tamamen istemci tarafındadır: `file://` ile açılışta ve çevrimdışı
  PWA önbelleğinde sayfayı bozmaz. `js/access-gate.js` artık `sw.js` ön bellek
  listesindedir, yani ilk çevrimdışı açılışta da kapı görünür.

## Lisans notları

- `vendor/qrcode.min.js`: QR Code Generator for JavaScript, Copyright (c) 2009
  Kazuhiko Arase, MIT lisansı. Lisans başlığı dosyanın başında korunuyor.
  "QR Code" kaydı DENSO WAVE INCORPORATED markasıdır.
- Kod deposunun geri kalanı: depo sahibinin lisansına tabidir.
- MOCK modda gerçek kart veya WhatsApp çağrısı yapılmaz.
