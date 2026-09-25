/* access-gate.js: link-only paylaşım için yumuşak erişim kapısı.
   Kodu döndürmek isteyen tek satır aşağıdadır (ayrıca site/README.md, Gizlilik bölümü). */
var ACCESS_CODE = 'mahalle';

(function () {
  'use strict';

  var STORAGE_KEY = 'mc_access';
  var STYLE_ID = 'mc-gate-style';
  var granted = false;

  function alreadyGranted() {
    if (granted) return true;
    try {
      granted = window.localStorage.getItem(STORAGE_KEY) === 'ok';
    } catch (err) {
      granted = false;
    }
    return granted;
  }

  function grant() {
    granted = true;
    try {
      window.localStorage.setItem(STORAGE_KEY, 'ok');
    } catch (err) {
      /* Depolama kapalıysa kapı yine de bu oturum için açılır. */
    }
  }

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = [
      '.mc-gate{position:fixed;inset:0;z-index:1000;display:flex;align-items:center;',
      'justify-content:center;padding:20px;background:rgba(11,20,26,.72);',
      'font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;}',
      '.mc-gate-card{width:100%;max-width:340px;background:#ffffff;color:#111b21;',
      'border-radius:14px;padding:22px;box-shadow:0 18px 44px rgba(0,0,0,.35);}',
      '.mc-gate-mark{margin:0 0 10px;font-size:12px;letter-spacing:.08em;',
      'text-transform:uppercase;color:#008069;font-weight:700;}',
      '.mc-gate-text{margin:0 0 16px;font-size:15px;line-height:1.5;color:#111b21;}',
      '.mc-gate-label{display:block;margin-bottom:6px;font-size:12px;color:#3b4a54;}',
      '.mc-gate-input{display:block;width:100%;box-sizing:border-box;padding:10px 11px;',
      'border:1px solid #ccd5db;border-radius:8px;font:inherit;font-size:15px;}',
      '.mc-gate-input:focus{outline:2px solid #008069;outline-offset:1px;border-color:#008069;}',
      '.mc-gate-hint{min-height:18px;margin:8px 0 0;font-size:13px;color:#b3591f;}',
      '.mc-gate-btn{display:block;width:100%;margin-top:12px;padding:11px;border:0;',
      'border-radius:8px;background:#008069;color:#ffffff;font:inherit;font-size:15px;',
      'font-weight:600;cursor:pointer;}',
      '.mc-gate-btn:hover{background:#00725a;}',
      '@media (prefers-reduced-motion: no-preference){',
      '.mc-gate-card{animation:mc-gate-in .18s ease-out;}',
      '@keyframes mc-gate-in{from{opacity:0;transform:translateY(6px);}',
      'to{opacity:1;transform:none;}}}',
    ].join('');
    document.head.appendChild(style);
  }

  function mount() {
    if (alreadyGranted()) return;
    if (document.getElementById('mc-gate')) return;

    injectStyles();

    var previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    var gate = document.createElement('div');
    gate.className = 'mc-gate';
    gate.id = 'mc-gate';
    gate.setAttribute('role', 'dialog');
    gate.setAttribute('aria-modal', 'true');
    gate.setAttribute('aria-labelledby', 'mc-gate-title');

    var form = document.createElement('form');
    form.className = 'mc-gate-card';
    form.setAttribute('novalidate', 'novalidate');

    var mark = document.createElement('p');
    mark.className = 'mc-gate-mark';
    mark.id = 'mc-gate-title';
    mark.textContent = 'MahalleCoop';

    var text = document.createElement('p');
    text.className = 'mc-gate-text';
    text.textContent =
      'Bu demo bağlantıyla paylaşılır. Devam için erişim kodunu gir.';

    var label = document.createElement('label');
    label.className = 'mc-gate-label';
    label.setAttribute('for', 'mc-gate-input');
    label.textContent = 'Erişim kodu';

    var input = document.createElement('input');
    input.className = 'mc-gate-input';
    input.id = 'mc-gate-input';
    input.type = 'text';
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.setAttribute('autocapitalize', 'off');

    var hint = document.createElement('p');
    hint.className = 'mc-gate-hint';
    hint.id = 'mc-gate-hint';
    hint.setAttribute('role', 'status');
    hint.setAttribute('aria-live', 'polite');

    var button = document.createElement('button');
    button.className = 'mc-gate-btn';
    button.type = 'submit';
    button.textContent = 'Devam et';

    form.appendChild(mark);
    form.appendChild(text);
    form.appendChild(label);
    form.appendChild(input);
    form.appendChild(hint);
    form.appendChild(button);
    gate.appendChild(form);
    document.body.appendChild(gate);

    function pass() {
      grant();
      document.body.style.overflow = previousOverflow;
      if (gate.parentNode) gate.parentNode.removeChild(gate);
    }

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      var typed = String(input.value || '').trim().toLowerCase();
      if (typed === String(ACCESS_CODE).trim().toLowerCase()) {
        pass();
        return;
      }
      hint.textContent = 'Kod eşleşmedi, bir daha deneyin.';
      input.select();
      input.focus();
    });

    input.focus();
  }

  if (document.body) {
    mount();
  } else {
    document.addEventListener('DOMContentLoaded', mount);
  }
})();
