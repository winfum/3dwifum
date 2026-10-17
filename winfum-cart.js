/* WINFUM — panier léger pour les pages « Contact & Support » et « À propos »
   Ajoute le bouton panier dans l'en-tête + le tiroir du panier, avec le même contenu que sur les boutiques
   (le panier est lu dans le stockage de l'appareil : winfum_cart, winfum_cart_parfum, winfum_cart_vin).
   Le bouton « retour » du téléphone ferme uniquement le panier quand il est ouvert.
   Expose aussi : WinfumSheet (fenêtres + bouton retour), WinfumGetSb (client Supabase), WinfumToast. */
(function () {
  'use strict';
  if (window.__wfCart) return; window.__wfCart = 1;

  var SB_URL = 'https://cxobpfaffgevxblnbwft.supabase.co';
  var SB_KEY = 'sb_publishable_bA-89TIqjkUhoA5NIlf7uQ_UUbb8oSB';
  var WA = 'https://wa.me/50948821521';
  var KEYS = ['winfum_cart'];
  /* produits d'exemple de l'accueil (quand la base est vide) */
  var DEMO = {
    p1: { name: 'Ambre Noir', retail: 65 }, p3: { name: 'Fleur de Lune', retail: 70 }, p5: { name: 'Petit Prince', retail: 35 },
    v1: { name: 'Château Rouge', retail: 233 }, v2: { name: 'Domaine Blanc', retail: 198 }, v3: { name: 'Rosé Éclat', retail: 182 }
  };
  var info = {}; // id -> {name, retail, img}

  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var $ = function (id) { return document.getElementById(id); };

  /* ---------- fenêtres + bouton retour du téléphone ---------- */
  var SHEETS = [], pops = 0;
  window.WinfumSheet = {
    open: function (name, closeFn) {
      SHEETS.push({ name: name, close: closeFn });
      try { history.pushState({ sheet: name }, '', location.href); } catch (e) {}
    },
    closed: function (name) {
      var i = SHEETS.findIndex(function (s) { return s.name === name; });
      if (i < 0) return;
      SHEETS.splice(i, 1); pops++; history.back();
    }
  };
  window.addEventListener('popstate', function () {
    if (pops > 0) { pops--; return; }
    if (SHEETS.length) SHEETS.pop().close();
  });

  /* ---------- Supabase ---------- */
  window.WinfumGetSb = function () {
    return new Promise(function (res, rej) {
      if (window.WINFUM_SB) return res(window.WINFUM_SB);
      var make = function () { window.WINFUM_SB = window.WINFUM_SB || window.supabase.createClient(SB_URL, SB_KEY); res(window.WINFUM_SB); };
      if (window.supabase) return make();
      var s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js';
      s.onload = make; s.onerror = rej; document.head.appendChild(s);
    });
  };

  /* ---------- style ---------- */
  var css = '' +
    '.wf-cartbtn{position:relative;flex:none;width:38px;height:38px;border-radius:50%;border:none;padding:0;display:flex;align-items:center;justify-content:center;cursor:pointer;background:var(--bg);color:var(--ink);box-shadow:3px 3px 7px var(--nm-lo,rgba(112,92,60,.24)),-3px -3px 7px var(--nm-hi,rgba(255,255,255,.95));transition:box-shadow .2s,color .2s}' +
    '.wf-cartbtn:hover{color:var(--wine)}' +
    '.wf-cartbtn:active{box-shadow:inset 2px 2px 5px var(--nm-lo,rgba(112,92,60,.24)),inset -2px -2px 5px var(--nm-hi,rgba(255,255,255,.95))}' +
    '.wf-cartbtn svg{width:17px;height:17px}' +
    '.wf-badge{position:absolute;top:-3px;right:-3px;min-width:16px;height:16px;padding:0 4px;border-radius:9px;background:var(--wine);color:#fff;font:600 9px/16px Inter,system-ui,sans-serif;text-align:center}' +
    '.wf-badge:empty,.wf-badge.zero{display:none}' +
    '@media(max-width:480px){.wf-cartbtn{width:34px;height:34px}}' +
    '#wf-ov{position:fixed;inset:0;z-index:600;background:rgba(20,18,15,.5);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);opacity:0;visibility:hidden;transition:.35s}' +
    '#wf-ov.open{opacity:1;visibility:visible}' +
    '#wf-drawer{position:fixed;top:12px;right:12px;bottom:12px;width:min(390px,92vw);z-index:601;background:var(--bg);color:var(--ink);border-radius:22px;display:flex;flex-direction:column;overflow:hidden;transform:translateX(calc(100% + 24px));transition:transform .5s cubic-bezier(.16,1,.4,1);box-shadow:10px 10px 26px rgba(0,0,0,.28)}' +
    '#wf-drawer.open{transform:none}' +
    '.wf-head{display:flex;justify-content:space-between;align-items:center;padding:18px 20px;border-bottom:1px solid var(--line)}' +
    '.wf-head h3{font:600 24px "Cormorant Garamond",serif;margin:0}' +
    '.wf-x{cursor:pointer;width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;flex:none}' +
    '.wf-x:hover{background:rgba(128,128,128,.14)}' +
    '#wf-items{flex:1;overflow-y:auto;padding:14px 16px}' +
    '.wf-empty{text-align:center;color:var(--muted);font-size:13px;padding:40px 0;line-height:1.7}' +
    '.wf-empty a{display:inline-block;margin:10px 5px 0;padding:8px 14px;border-radius:30px;color:var(--wine);font-size:11px;letter-spacing:.08em;text-transform:uppercase;background:var(--bg);box-shadow:4px 4px 9px var(--nm-lo,rgba(112,92,60,.24)),-3px -3px 8px var(--nm-hi,rgba(255,255,255,.95))}' +
    '.wf-item{display:flex;gap:12px;padding:12px;border-radius:16px;margin-bottom:10px;background:var(--bg);box-shadow:4px 4px 9px var(--nm-lo,rgba(112,92,60,.24)),-3px -3px 8px var(--nm-hi,rgba(255,255,255,.95))}' +
    '.wf-thumb{width:58px;height:58px;border-radius:12px;flex:none;overflow:hidden;background:linear-gradient(155deg,#a9782f,#e6d9bd);display:flex;align-items:center;justify-content:center;color:rgba(28,26,23,.55);font:600 13px "Cormorant Garamond",serif}' +
    '.wf-thumb img{width:100%;height:100%;object-fit:cover}' +
    '.wf-body{flex:1;min-width:0}' +
    '.wf-top{display:flex;justify-content:space-between;gap:8px}' +
    '.wf-nm{font:700 18px "Cormorant Garamond",serif}' +
    '.wf-un{font-size:11.5px;color:var(--muted)}' +
    '.wf-rm{flex:none;width:28px;height:28px;border-radius:50%;border:none;background:none;color:var(--muted);cursor:pointer;display:flex;align-items:center;justify-content:center}' +
    '.wf-rm:hover{color:var(--wine);background:rgba(122,17,40,.08)}.wf-rm svg{width:14px;height:14px}' +
    '.wf-bot{display:flex;justify-content:space-between;align-items:center;margin-top:10px}' +
    '.wf-qty{display:flex;align-items:center;border-radius:30px;padding:3px;background:var(--bg);box-shadow:inset 2px 2px 5px var(--nm-lo,rgba(112,92,60,.24)),inset -2px -2px 5px var(--nm-hi,rgba(255,255,255,.95))}' +
    '.wf-qty button{width:26px;height:26px;border-radius:50%;border:none;background:var(--bg);color:var(--ink);font-size:15px;line-height:1;cursor:pointer;box-shadow:2px 2px 5px var(--nm-lo,rgba(112,92,60,.24)),-2px -2px 5px var(--nm-hi,rgba(255,255,255,.95))}' +
    '.wf-qty button:hover{background:var(--wine);color:#fff}' +
    '.wf-qty span{width:30px;text-align:center;font-size:13px;font-weight:600}' +
    '.wf-line{font-weight:600;font-size:15px}' +
    '.wf-foot{padding:16px 20px;border-top:1px solid var(--line)}' +
    '.wf-sub{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:12px}' +
    '.wf-sub span:first-child{font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted)}' +
    '.wf-sub span:last-child{font-weight:600;font-size:22px}' +
    '.wf-go{width:100%;padding:14px;border:none;border-radius:30px;background:#1c1a17;color:#fff;font:500 11px Inter,system-ui,sans-serif;letter-spacing:.15em;text-transform:uppercase;cursor:pointer;box-shadow:4px 4px 9px var(--nm-lo,rgba(112,92,60,.24)),-3px -3px 8px var(--nm-hi,rgba(255,255,255,.95))}' +
    '.wf-go:hover{background:var(--wine)}.wf-go:disabled{opacity:.45;cursor:default}' +
    '[data-theme="dark"] .wf-go{background:var(--wine)}' +
    '#wf-toast{position:fixed;left:50%;bottom:calc(env(safe-area-inset-bottom,0px) + 90px);transform:translate(-50%,20px);background:#1c1a17;color:#fff;padding:11px 20px;border-radius:30px;font:13px Inter,system-ui,sans-serif;opacity:0;pointer-events:none;transition:.3s;z-index:700;max-width:90vw;text-align:center}' +
    '#wf-toast.on{opacity:1;transform:translate(-50%,0)}#wf-toast.bad{background:#a4262c}';
  var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

  /* ---------- HTML ---------- */
  var CART_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M1 1h4l2.7 13.4a2 2 0 002 1.6h9.6a2 2 0 002-1.6L23 6H6"/></svg>';
  var TRASH = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a1 1 0 011-1h6a1 1 0 011 1v2m2 0l-1 14a1 1 0 01-1 1H7a1 1 0 01-1-1L5 6"/></svg>';

  var right = document.querySelector('.hdr-right');
  if (right) {
    var b = document.createElement('button');
    b.className = 'wf-cartbtn'; b.type = 'button'; b.setAttribute('aria-label', 'Panier');
    b.innerHTML = CART_SVG + '<span class="wf-badge zero" id="wf-count">0</span>';
    b.onclick = openCart;
    right.insertBefore(b, right.firstChild);
  }
  var ov = document.createElement('div'); ov.id = 'wf-ov'; ov.onclick = closeCart;
  var dr = document.createElement('div'); dr.id = 'wf-drawer'; dr.setAttribute('role', 'dialog'); dr.setAttribute('aria-label', 'Votre panier');
  dr.innerHTML = '<div class="wf-head"><h3>Votre panier</h3><span class="wf-x" id="wf-close" aria-label="Fermer">✕</span></div>' +
    '<div id="wf-items"></div>' +
    '<div class="wf-foot"><div class="wf-sub"><span>Total</span><span id="wf-total">0 G</span></div><button class="wf-go" id="wf-go" type="button">Commander sur WhatsApp</button></div>';
  var tt = document.createElement('div'); tt.id = 'wf-toast';
  document.body.appendChild(ov); document.body.appendChild(dr); document.body.appendChild(tt);
  $('wf-close').onclick = closeCart;
  $('wf-go').onclick = checkout;

  window.WinfumToast = function (m, bad) {
    tt.textContent = m; tt.classList.toggle('bad', !!bad); tt.classList.add('on');
    clearTimeout(window.WinfumToast.h); window.WinfumToast.h = setTimeout(function () { tt.classList.remove('on'); }, bad ? 5000 : 2200);
  };

  /* ---------- données du panier ---------- */
  function rd(k) { try { return JSON.parse(localStorage.getItem(k) || '[]') || []; } catch (e) { return []; } }
  function merged() {
    var m = {};
    KEYS.forEach(function (k) { rd(k).forEach(function (it) { if (it && it.id) m[it.id] = Math.max(m[it.id] || 0, it.qty || 1); }); });
    return m;
  }
  function setQty(id, q) {
    KEYS.forEach(function (k) {
      var l = rd(k); if (!l.some(function (x) { return x && x.id === id; })) return;
      var n = q > 0 ? l.map(function (x) { return x.id === id ? { id: x.id, qty: q } : x; }) : l.filter(function (x) { return x.id !== id; });
      try { localStorage.setItem(k, JSON.stringify(n)); } catch (e) {}
    });
    render();
  }
  window.__wfQty = function (id, d) { var m = merged(); setQty(id, (m[id] || 0) + d); };
  window.__wfRm = function (id) { setQty(id, 0); };

  async function loadInfo() {
    var m = merged(), need = Object.keys(m).filter(function (id) { return !info[id]; });
    need.forEach(function (id) { if (DEMO[id]) info[id] = { name: DEMO[id].name, retail: DEMO[id].retail, img: '' }; });
    need = need.filter(function (id) { return !info[id] && /^[0-9a-f-]{32,36}$/i.test(id); }); /* seuls les vrais identifiants de la base */
    if (!need.length) return;
    try {
      var sb = await window.WinfumGetSb();
      var r = await sb.from('products').select('id,name,price_retail,images').in('id', need);
      if (r.error) throw r.error;
      (r.data || []).forEach(function (p) { info[p.id] = { name: p.name || 'Produit', retail: Number(p.price_retail) || 0, img: ((p.images || []).filter(Boolean)[0]) || '' }; });
    } catch (e) { console.warn('Panier :', e.message || e); }
  }

  function render() {
    var m = merged(), ids = Object.keys(m).filter(function (id) { return info[id]; });
    var box = $('wf-items'), total = 0, count = 0;
    if (!ids.length) {
      box.innerHTML = '<div class="wf-empty">Votre panier est vide.<br>Ajoutez un produit pour commencer.<br><a href="jbparfumerie.html">JB Parfumerie</a><a href="funforus.html">Fun For Us</a></div>';
    } else {
      box.innerHTML = ids.map(function (id) {
        var p = info[id], q = m[id], line = p.retail * q; total += line; count += q;
        var ia = esc(id).replace(/'/g, '');
        return '<div class="wf-item"><div class="wf-thumb">' + (p.img ? '<img src="' + esc(p.img) + '" alt="">' : esc((p.name || '').slice(0, 2).toUpperCase())) + '</div>' +
          '<div class="wf-body"><div class="wf-top"><div><div class="wf-nm">' + esc(p.name) + '</div><div class="wf-un">' + p.retail + ' G · l\'unité</div></div>' +
          '<button class="wf-rm" type="button" title="Retirer" onclick="__wfRm(\'' + ia + '\')">' + TRASH + '</button></div>' +
          '<div class="wf-bot"><div class="wf-qty"><button type="button" onclick="__wfQty(\'' + ia + '\',-1)">−</button><span>' + q + '</span><button type="button" onclick="__wfQty(\'' + ia + '\',1)">+</button></div>' +
          '<div class="wf-line">' + line + ' G</div></div></div></div>';
      }).join('');
    }
    $('wf-total').textContent = total + ' G';
    $('wf-go').disabled = !ids.length;
    var all = Object.keys(m).reduce(function (a, id) { return a + m[id]; }, 0);
    var c = $('wf-count'); if (c) { var n = Object.keys(info).length ? count : all; c.textContent = n; c.classList.toggle('zero', !n); }
  }

  function checkout() {
    var m = merged(), ids = Object.keys(m).filter(function (id) { return info[id]; });
    if (!ids.length) return;
    var total = 0, msg = 'Bonjour Winfum, je souhaite commander :\n';
    ids.forEach(function (id) { var p = info[id], q = m[id]; total += p.retail * q; msg += '- ' + p.name + ' x' + q + ' (' + (p.retail * q) + ' G)\n'; });
    msg += 'Total : ' + total + ' G';
    window.open(WA + '?text=' + encodeURIComponent(msg), '_blank');
  }

  /* ---------- ouverture / fermeture ---------- */
  function ui(o) { ov.classList.toggle('open', o); dr.classList.toggle('open', o); }
  async function openCart() {
    if (dr.classList.contains('open')) return;
    render(); ui(true); WinfumSheet.open('cart', function () { ui(false); });
    await loadInfo(); render();
  }
  function closeCart() {
    if (!dr.classList.contains('open')) return;
    ui(false); WinfumSheet.closed('cart');
  }
  window.WinfumCart = { open: openCart, close: closeCart };
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeCart(); });
  window.addEventListener('storage', function (e) { if (!e.key || KEYS.indexOf(e.key) > -1) { loadInfo().then(render); } });

  window.addEventListener('winfum:sync', function (e) { loadInfo().then(render); if (e.detail) e.detail.handled = true; });
  render();
  loadInfo().then(render);
})();
