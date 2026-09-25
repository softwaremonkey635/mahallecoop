/* sw.js: cache-first service worker for the static demo (S2).
   All paths relative to this file, so a GitHub Pages subpath works. */

var CACHE = 'mahallecoop-v2';

var PRECACHE = [
  './',
  './index.html',
  './demo.html',
  './manifest.webmanifest',
  './css/site.css',
  './css/phone.css',
  './css/portal.css',
  './js/store.js',
  './js/engine.js',
  './js/ui.js',
  './js/portal.js',
  './js/landing.js',
  './js/access-gate.js',
  './js/walkthrough-scenes.js',
  './js/walkthrough.js',
  './vendor/qrcode.min.js'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE).then(function (cache) {
      /* Cache what exists; S1 files may land later, failures are tolerated. */
      return Promise.all(PRECACHE.map(function (url) {
        var req = new Request(url, { cache: 'reload' });
        return fetch(req).then(function (res) {
          if (res && res.ok) return cache.put(url, res);
        }).catch(function () { return undefined; });
      }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (key) {
        if (key !== CACHE) return caches.delete(key);
        return undefined;
      }));
    }).then(function () { return self.clients.claim(); })
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
          }).catch(function () { /* cache write optional */ });
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
