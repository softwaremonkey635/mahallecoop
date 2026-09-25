/* Üye PWA servis çalışanı. Tüm yollar bu dosyaya göreli, dış ağ yok.
   Kabuk önbelleğe alınır: ilk yüklemeden sonra çevrimdışı da açılır. */

var CACHE = 'mahallecoop-member-v3';

var PRECACHE = [
  './',
  './index.html',
  './kvkk.html',
  './manifest.webmanifest',
  './icons/icon.svg',
  './css/app.css',
  './js/cart.js',
  './js/store.js',
  './js/api.js',
  './js/app.js',
  './js/access-gate.js'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE).then(function (cache) {
      return Promise.all(PRECACHE.map(function (url) {
        var req = new Request(url, { cache: 'reload' });
        return fetch(req).then(function (res) {
          if (res && res.ok) return cache.put(url, res);
          return undefined;
        }).catch(function () {
          return undefined;
        });
      }));
    }).then(function () {
      return self.skipWaiting();
    })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (key) {
        if (key !== CACHE) return caches.delete(key);
        return undefined;
      }));
    }).then(function () {
      return self.clients.claim();
    })
  );
});

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET') return;
  if (new URL(req.url).origin !== self.location.origin) return;

  event.respondWith(
    caches.match(req, { ignoreSearch: false }).then(function (hit) {
      if (hit) return hit;
      return fetch(req).then(function (res) {
        if (res && res.ok) {
          var copy = res.clone();
          caches.open(CACHE).then(function (cache) {
            cache.put(req, copy);
          }).catch(function () {
            /* önbellek yazımı zorunlu değil */
          });
        }
        return res;
      }).catch(function () {
        if (req.mode === 'navigate') {
          return caches.match('./index.html');
        }
        return new Response('', { status: 504, statusText: 'offline' });
      });
    })
  );
});
