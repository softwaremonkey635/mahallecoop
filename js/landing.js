/* landing.js: landing interactions + service worker registration (S2) */

(function () {
  'use strict';

  function prefersReducedMotion() {
    return window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function revealAll() {
    var nodes = document.querySelectorAll('.reveal, .bubble, .phone-btn');
    for (var i = 0; i < nodes.length; i++) {
      nodes[i].classList.add('is-visible', 'is-in');
    }
  }

  function runReveals() {
    var items = document.querySelectorAll('.reveal');
    if (prefersReducedMotion() || !('IntersectionObserver' in window)) {
      revealAll();
      return;
    }

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.15 });

    for (var i = 0; i < items.length; i++) {
      io.observe(items[i]);
    }
  }

  function runPhoneSequence() {
    var parts = document.querySelectorAll('.bubble, .phone-btn');
    if (prefersReducedMotion()) {
      revealAll();
      return;
    }
    for (var i = 0; i < parts.length; i++) {
      (function (el) {
        var delay = parseInt(el.getAttribute('data-delay') || '0', 10);
        window.setTimeout(function () {
          el.classList.add('is-in');
        }, delay);
      })(parts[i]);
    }
  }

  function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    if (location.protocol !== 'https:' && location.protocol !== 'http:') return;
    try {
      var reg = navigator.serviceWorker.register('./sw.js', { scope: './' });
      if (reg && typeof reg.catch === 'function') {
        reg.catch(function () { /* demo keeps running without SW */ });
      }
    } catch (err) { /* ignore: PWA is optional */ }
  }

  function init() {
    registerServiceWorker();
    runReveals();
    runPhoneSequence();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
