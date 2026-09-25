/* Üye PWA sepet deposu. UMD: tarayıcıda window.MCP, Node'de module.exports.
   Öncelik: localStorage, olmazsa IndexedDB, o da yoksa bellek.
   Sentinel anahtarı iOS depolama silmesini yakalar, sunucu kurtarma kancası
   boşta kalan sepeti geri getirir. Tüm yöntemler asenkondur. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.MCP = Object.assign(root.MCP || {}, factory());
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var CART_KEY = 'mc_pwa_cart_v1';
  var SENTINEL_KEY = 'mc_pwa_sentinel_v1';

  function memoryAdapter() {
    var data = {};
    return {
      name: 'memory',
      get: function (key) {
        return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null;
      },
      set: function (key, value) {
        data[key] = value;
      },
      remove: function (key) {
        delete data[key];
      },
    };
  }

  function localStorageAdapter() {
    if (typeof localStorage === 'undefined' || localStorage === null) return null;
    try {
      localStorage.setItem('mc_pwa_probe', '1');
      localStorage.removeItem('mc_pwa_probe');
    } catch (err) {
      return null;
    }
    return {
      name: 'localStorage',
      get: function (key) {
        return localStorage.getItem(key);
      },
      set: function (key, value) {
        localStorage.setItem(key, value);
      },
      remove: function (key) {
        localStorage.removeItem(key);
      },
    };
  }

  /* Basit anahtar/değer IndexedDB kasası. Tarayıcıda vardır, Node'da yok. */
  function indexedDBAdapter() {
    if (typeof indexedDB === 'undefined' || indexedDB === null) return null;
    var DB_NAME = 'mc_pwa_store';
    var STORE = 'kv';
    var dbPromise = null;

    function openDb() {
      if (dbPromise) return dbPromise;
      dbPromise = new Promise(function (resolve, reject) {
        var req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = function () {
          var db = req.result;
          if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
        };
        req.onsuccess = function () {
          resolve(req.result);
        };
        req.onerror = function () {
          reject(req.error || new Error('indexeddb_open_failed'));
        };
      }).catch(function (err) {
        dbPromise = null;
        throw err;
      });
      return dbPromise;
    }

    function run(mode, fn) {
      return openDb().then(function (db) {
        return new Promise(function (resolve, reject) {
          var tx = db.transaction(STORE, mode);
          var store = tx.objectStore(STORE);
          var req = fn(store);
          var value = null;
          if (req) {
            req.onsuccess = function () {
              value = req.result;
            };
            req.onerror = function () {
              reject(req.error || new Error('indexeddb_request_failed'));
            };
          }
          tx.oncomplete = function () {
            resolve(value);
          };
          tx.onerror = function () {
            reject(tx.error || new Error('indexeddb_tx_failed'));
          };
          tx.onabort = function () {
            reject(tx.error || new Error('indexeddb_tx_aborted'));
          };
        });
      });
    }

    return {
      name: 'indexedDB',
      get: function (key) {
        return run('readonly', function (store) {
          return store.get(key);
        }).then(function (value) {
          return typeof value === 'string' ? value : null;
        });
      },
      set: function (key, value) {
        return run('readwrite', function (store) {
          return store.put(value, key);
        }).then(function () {
          return true;
        });
      },
      remove: function (key) {
        return run('readwrite', function (store) {
          return store.delete(key);
        }).then(function () {
          return true;
        });
      },
    };
  }

  function defaultAdapters() {
    return { ls: localStorageAdapter(), idb: indexedDBAdapter() };
  }

  function safeParse(raw) {
    if (typeof raw !== 'string' || !raw) return null;
    try {
      var parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch (err) {
      return null;
    }
  }

  function cartFromPayload(payload) {
    if (!payload) return [];
    var list = Array.isArray(payload) ? payload : payload.cart;
    if (!Array.isArray(list)) return [];
    return list
      .filter(function (line) {
        return line && line.productId != null && Number(line.qty) > 0;
      })
      .map(function (line) {
        return { productId: String(line.productId), qty: Math.trunc(Number(line.qty)) };
      });
  }

  function createCartStore(adapters) {
    var options = adapters || defaultAdapters();
    var mem = options.mem || memoryAdapter();
    var backends = [];
    if (options.ls) backends.push(options.ls);
    if (options.idb) backends.push(options.idb);
    backends.push(mem);

    function toPromise(value) {
      if (value && typeof value.then === 'function') return value;
      return Promise.resolve(value);
    }

    function safeRead(backend, key) {
      try {
        return toPromise(backend.get(key)).then(
          function (value) {
            return value == null ? null : value;
          },
          function () {
            return null;
          },
        );
      } catch (err) {
        return Promise.resolve(null);
      }
    }

    /* Aynı depoda okunan iki anahtar tutarlıdır: sentinel duruyor ama sepet
       yoksa silinme tespiti yapılır, başka depoya göz gezdirilmez. */
    function readState() {
      var index = 0;
      function step() {
        if (index >= backends.length) {
          return Promise.resolve({
            mode: mem.name,
            cart: [],
            hasCart: false,
            hasSentinel: false,
          });
        }
        var backend = backends[index];
        index += 1;
        return Promise.all([
          safeRead(backend, CART_KEY),
          safeRead(backend, SENTINEL_KEY),
        ]).then(function (pair) {
          var cartRaw = pair[0];
          var sentinelRaw = pair[1];
          if (cartRaw == null && sentinelRaw == null) return step();
          return {
            mode: backend.name,
            cart: cartFromPayload(safeParse(cartRaw)),
            hasCart: cartRaw != null,
            hasSentinel: sentinelRaw != null,
          };
        });
      }
      return step();
    }

    function write(backend, key, value) {
      try {
        return toPromise(backend.set(key, value));
      } catch (err) {
        return Promise.reject(err);
      }
    }

    function writePair(backend, cart, sentinel) {
      return write(backend, CART_KEY, JSON.stringify(cart)).then(function () {
        return write(backend, SENTINEL_KEY, JSON.stringify(sentinel));
      }).then(function () {
        return { mode: backend.name };
      });
    }

    function lostState(state) {
      return state.hasSentinel ? 'cart_lost' : 'fresh';
    }

    var store = {
      keys: { cart: CART_KEY, sentinel: SENTINEL_KEY },

      load: function () {
        return readState().then(function (state) {
          return { cart: state.cart, mode: state.mode };
        });
      },

      save: function (cart) {
        var list = cartFromPayload(Array.isArray(cart) ? cart : []);
        var sentinel = { v: 1, at: new Date().toISOString() };
        var attempts = [];

        function attempt(index) {
          if (index >= backends.length) {
            return Promise.reject(new Error('cart_store_unavailable'));
          }
          var backend = backends[index];
          return writePair(backend, list, sentinel).catch(function (err) {
            attempts.push(backend.name + ':' + (err && err.name ? err.name : 'hata'));
            return attempt(index + 1);
          });
        }

        return attempt(0).then(function (saved) {
          saved.attempts = attempts;
          return saved;
        });
      },

      clear: function () {
        backends.forEach(function (backend) {
          try {
            backend.remove(CART_KEY);
            backend.remove(SENTINEL_KEY);
          } catch (err) {
            /* geçmeyen depo yok sayılır */
          }
        });
        return Promise.resolve(true);
      },

      /* ok: veri yerinde. cart_lost: sentinel duruyor, sepet silinmiş.
         fresh: ikisi de yok, yeni kurulum ya da tam temizlik. */
      check: function () {
        return readState().then(function (state) {
          var stateName = 'fresh';
          if (state.hasCart) stateName = 'ok';
          else if (state.hasSentinel) stateName = 'cart_lost';
          return { state: stateName, cart: state.cart, mode: state.mode };
        });
      },

      /* Kancadan gelen sepet sunucudaki hâli sayılır; lokalde silinmişse
         üstüne yazılır. Kancanın kendisi yoksa hiçbir şey olmaz. */
      recover: function (hook) {
        return readState().then(function (state) {
          var current = state.cart;
          var fallback = {
            recovered: false,
            state: lostState(state),
            cart: current,
            mode: state.mode,
          };
          if (state.hasCart && state.hasSentinel) {
            return { recovered: false, state: 'ok', cart: current, mode: state.mode };
          }
          if (typeof hook !== 'function') return fallback;
          return toPromise(hook())
            .then(function (incoming) {
              var remote = cartFromPayload(Array.isArray(incoming) ? incoming : null);
              if (!remote.length) return fallback;
              return store.save(remote).then(function (saved) {
                return {
                  recovered: true,
                  state: lostState(state),
                  cart: remote,
                  mode: saved.mode,
                };
              });
            })
            .catch(function () {
              return fallback;
            });
        });
      },
    };

    return store;
  }

  return {
    createCartStore: createCartStore,
    cartFromPayload: cartFromPayload,
    defaultAdapters: defaultAdapters,
    CART_KEY: CART_KEY,
    SENTINEL_KEY: SENTINEL_KEY,
  };
});
