/* WhatsApp phone renderer for the MahalleCoop demo. Classic script, browser only.
   Creates the shared store/engine (window.MC.store / window.MC.engine) at load
   time so portal.js sees them when its own script runs. */
(function (global) {
  'use strict';
  if (typeof document === 'undefined') return;

  var MC = global.MC = global.MC || {};
  var store = MC.createStore({ persist: true });
  var engine = MC.createEngine(store);
  MC.store = store;
  MC.engine = engine;

  var activeUserId = 'ayse';
  var typingTimer = null;
  var expandedLists = {};
  var chromeTimer = null;

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function $(sel, root) {
    return (root || document).querySelector(sel);
  }

  function $all(sel, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(sel));
  }

  function fmtTime(ts) {
    return new Date(ts).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  }

  function replyRowsHtml(m) {
    return (
      '<div class="wa-reply">' +
      m.buttons
        .map(function (b) {
          return (
            '<button type="button" class="wa-reply-btn" data-id="' + esc(b.id) + '">' +
            esc(b.label) +
            '</button>'
          );
        })
        .join('') +
      '</div>'
    );
  }

  function listHtml(m, index) {
    var expanded = !!expandedLists[index];
    var options = expanded
      ? '<div class="wa-list-options">' +
        m.buttons
          .map(function (b) {
            return (
              '<button type="button" class="wa-reply-btn" data-id="' + esc(b.id) + '">' +
              esc(b.label) +
              '</button>'
            );
          })
          .join('') +
        '</div>'
      : '';
    var toggle = expanded ? 'Menüyü Kapat' : 'Menüyü Görüntüle';
    return (
      '<div class="wa-list">' +
      options +
      '<button type="button" class="wa-list-toggle" data-list="' + index + '">' +
      toggle +
      '</button></div>'
    );
  }

  function messageHtml(m, index, isLast) {
    var side = m.from === 'user' ? 'user' : 'bot';
    var cls = 'wa-row ' + side + (m.from === 'system' ? ' system' : '');
    var body = '<div class="wa-text">' + esc(m.text).replace(/\n/g, '<br>') + '</div>';
    var interactive = '';
    if (isLast && m.buttons && m.buttons.length) {
      if (m.type === 'list') interactive = listHtml(m, index);
      else interactive = replyRowsHtml(m);
    }
    var ticks = side === 'user' ? '<span class="wa-ticks">✓✓</span>' : '';
    var meta =
      '<div class="wa-meta"><span class="wa-time">' + fmtTime(m.ts) + '</span>' + ticks + '</div>';
    return (
      '<div class="' + cls + '" data-index="' + index + '">' +
      '<div class="wa-bubble type-' + esc(m.type || 'text') + '">' +
      body + interactive + meta +
      '</div></div>'
    );
  }

  function typingHtml() {
    return (
      '<div class="wa-row bot typing">' +
      '<div class="wa-bubble wa-typing"><span></span><span></span><span></span></div>' +
      '</div>'
    );
  }

  function render(skipLast) {
    var chat = $('#wa-chat');
    if (!chat) return;
    var msgs = engine.transcript(activeUserId);
    var keep = typeof skipLast === 'number' && skipLast > 0 ? msgs.length - skipLast : msgs.length;
    if (keep < 0) keep = 0;
    var html = '';
    var i;
    for (i = 0; i < keep; i++) {
      html += messageHtml(msgs[i], i, keep === msgs.length && i === msgs.length - 1);
    }
    if (typeof skipLast === 'number' && skipLast > 0) html += typingHtml();
    chat.innerHTML = html;
    chat.scrollTop = chat.scrollHeight;
  }

  function refreshChrome() {
    var state = store.get();
    var open = null;
    state.windows.forEach(function (w) {
      if (w.status === 'OPEN') open = w;
    });
    var cd = $('#countdown');
    if (cd) {
      if (open) {
        var ms = Date.parse(open.closesAt) - Date.now();
        if (ms < 0) ms = 0;
        var days = Math.floor(ms / 86400000);
        var hours = Math.floor((ms % 86400000) / 3600000);
        cd.textContent = 'Pencere kapanışına ' + days + 'g ' + hours + 's';
      } else {
        cd.textContent = 'Pencere kapalı';
      }
    }
    var sv = $('#savings');
    if (sv) sv.textContent = 'Bu hafta ~' + savingsTl(state) + ' TL tasarruf';
    var clock = $('#wa-clock');
    if (clock) clock.textContent = fmtTime(Date.now());
  }

  function savingsTl(state) {
    var total = 0;
    state.orders.forEach(function (o) {
      if (o.status !== 'PAID' && o.status !== 'DELIVERED') return;
      o.items.forEach(function (it) {
        var p = null;
        state.products.forEach(function (x) {
          if (x.id === it.productId) p = x;
        });
        if (!p) return;
        var diff = p.tiers[0] - it.unitPriceKurus;
        if (diff > 0) total += diff * it.qty;
      });
    });
    return Math.round(total / 100);
  }

  function dispatch(type, body) {
    var replies = engine.send(activeUserId, { type: type, body: body });
    if (replies && replies.length) {
      render(replies.length);
      if (typingTimer) clearTimeout(typingTimer);
      typingTimer = setTimeout(function () {
        typingTimer = null;
        render();
      }, 400);
    } else {
      render();
    }
    refreshChrome();
  }

  function onButton(id) {
    if (id === 'PAY') {
      openPayModal();
      return;
    }
    expandedLists = {};
    dispatch('button', id);
  }

  function openPayModal() {
    var modal = $('#pay-modal');
    if (modal) modal.hidden = false;
  }

  function closePayModal() {
    var modal = $('#pay-modal');
    if (modal) modal.hidden = true;
  }

  function wireIdentity() {
    var sel = $('#identity-switcher');
    if (!sel) return;
    sel.addEventListener('change', function () {
      activeUserId = sel.value;
      expandedLists = {};
      if (typingTimer) {
        clearTimeout(typingTimer);
        typingTimer = null;
      }
      render();
    });
  }

  function wireChat() {
    var chat = $('#wa-chat');
    if (chat) {
      chat.addEventListener('click', function (ev) {
        var listBtn = ev.target.closest('[data-list]');
        if (listBtn) {
          var idx = listBtn.getAttribute('data-list');
          expandedLists[idx] = !expandedLists[idx];
          render();
          return;
        }
        var btn = ev.target.closest('[data-id]');
        if (btn) onButton(btn.getAttribute('data-id'));
      });
    }
    var input = $('#wa-input');
    var send = $('#wa-send');
    function submit() {
      if (!input) return;
      var v = input.value.trim();
      if (!v) return;
      input.value = '';
      expandedLists = {};
      dispatch('text', v);
    }
    if (send) send.addEventListener('click', submit);
    if (input) {
      input.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter') {
          ev.preventDefault();
          submit();
        }
      });
    }
  }

  function wirePayModal() {
    var form = $('#pay-form');
    if (form) {
      form.addEventListener('submit', function (ev) {
        ev.preventDefault();
        closePayModal();
        form.reset();
        dispatch('button', 'PAY');
      });
    }
    var cancel = $('#pay-cancel');
    if (cancel) {
      cancel.addEventListener('click', function (ev) {
        ev.preventDefault();
        closePayModal();
      });
    }
  }

  function wireReset() {
    var btn = $('#reset-btn');
    if (!btn) return;
    btn.addEventListener('click', function () {
      var okToReset = global.confirm('Demo verileri sıfırlansın mı?');
      if (!okToReset) return;
      store.reset();
      global.location.reload();
    });
  }

  function wireTabs() {
    $all('.mc-tabs [data-pane]').forEach(function (tab) {
      tab.addEventListener('click', function () {
        var name = tab.getAttribute('data-pane');
        $all('.mc-tabs [data-pane]').forEach(function (t) {
          t.classList.toggle('active', t === tab);
        });
        $all('.mc-pane').forEach(function (pane) {
          var isPhone = pane.id === 'phone-app';
          var isPortal = pane.id === 'portal-app';
          var want =
            (name === 'phone' && isPhone) || (name === 'portal' && isPortal);
          pane.classList.toggle('active', want);
        });
      });
    });
  }

  function wireStoreSync() {
    if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return;
    window.addEventListener('mc:change', function () {
      refreshChrome();
      if (typingTimer) return;
      render();
    });
  }

  function init() {
    wireIdentity();
    wireChat();
    wirePayModal();
    wireReset();
    wireTabs();
    wireStoreSync();
    render();
    refreshChrome();
    chromeTimer = setInterval(refreshChrome, 30000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  MC.ui = {
    init: init,
    render: render,
    getActiveUserId: function () {
      return activeUserId;
    },
    setActiveUserId: function (id) {
      activeUserId = id;
      var sel = $('#identity-switcher');
      if (sel) sel.value = id;
      expandedLists = {};
      render();
    },
    refreshChrome: refreshChrome,
  };
})(typeof window !== 'undefined' ? window : globalThis);
