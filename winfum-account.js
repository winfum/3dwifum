/* WINFUM — mémoire du panier et des favoris : appareil d'abord, compte ensuite.
   • Sans connexion : tout reste dans le navigateur de l'appareil (winfum_cart / winfum_favs, voir winfum-store.js),
     partagé par TOUTES les pages (accueil, parfums, vins, mon espace, contact, à propos).
   • À la connexion (compte approuvé) : ce qui est sur l'appareil est fusionné avec le compte, puis tout est
     enregistré sur le compte automatiquement à chaque changement et retrouvé sur n'importe quel appareil.
   • Rien ne se perd : si l'enregistrement échoue (hors ligne…), les changements sont gardés et renvoyés plus tard.
   Les pages sont prévenues par l'événement « winfum:sync » pour se rafraîchir toutes seules. */
(function () {
  'use strict';
  var URL_ = 'https://cxobpfaffgevxblnbwft.supabase.co';
  var KEY = 'sb_publishable_bA-89TIqjkUhoA5NIlf7uQ_UUbb8oSB';
  var CART = 'winfum_cart', FAV = 'winfum_favs', DIRTY = 'winfum_dirty', SYNCED = 'winfum_synced_uid', TOMB = 'winfum_tomb';
  var WATCH = [CART, FAV];
  var LEGACY = ['winfum_cart_parfum', 'winfum_cart_vin', 'winfum_favs_home', 'winfum_favs_vin'];

  var ls;
  try { ls = window.localStorage; ls.getItem('winfum_probe'); } catch (e) { return; }
  var rawSet = Storage.prototype.setItem, rawDel = Storage.prototype.removeItem;
  var sb = null, uid = null, ok = false, timer = null, pushing = false, again = false, running = null;
  var rev = 0, lastSync = 0, listening = false, lastOpts = {};

  var parse = function (v) { try { var a = JSON.parse(v || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; } };
  var rd = function (k) { return parse(ls.getItem(k)); };
  var wr = function (k, v) { rawSet.call(ls, k, JSON.stringify(v)); };
  var idOf = function (i) { return String(typeof i === 'string' ? i : (i && i.id) || ''); };

  function canon() {
    var f = new Set(), c = {};
    rd(FAV).forEach(function (i) { var id = idOf(i); if (id) f.add(id); });
    rd(CART).forEach(function (it) { if (it && it.id) c[it.id] = Math.max(c[it.id] || 0, parseInt(it.qty, 10) || 1); });
    return { f: f, c: c };
  }
  function writeLocal(t) {
    wr(FAV, Array.from(t.f));
    wr(CART, Object.keys(t.c).map(function (id) { return { id: id, qty: t.c[id] }; }));
  }
  var sig = function (t) { return JSON.stringify([Array.from(t.f).sort(), Object.keys(t.c).sort().map(function (k) { return [k, t.c[k]]; })]); };
  var union = function (a, b) {
    var f = new Set(Array.from(a.f).concat(Array.from(b.f))), c = {};
    [a.c, b.c].forEach(function (m) { Object.keys(m).forEach(function (id) { c[id] = Math.max(c[id] || 0, m[id]); }); });
    return { f: f, c: c };
  };

  async function fetchDB() {
    var r = await Promise.all([
      sb.from('customer_favorites').select('item_id'),
      sb.from('customer_cart').select('item_id,qty')]);
    if (r[0].error || r[1].error) { console.warn('Winfum sync :', (r[0].error || r[1].error).message); return null; }
    var c = {}; r[1].data.forEach(function (x) { c[x.item_id] = x.qty; });
    return { f: new Set(r[0].data.map(function (x) { return x.item_id; })), c: c };
  }

  async function push() {
    if (!ok || !uid) return;
    if (pushing) { again = true; return; }
    pushing = true;
    var myRev = rev;
    try {
      var L = canon(), db = await fetchDB();
      if (!db) throw new Error('lecture du compte impossible');
      var now = new Date().toISOString(), jobs = [];
      var upF = Array.from(L.f).filter(function (id) { return !db.f.has(id); }).map(function (id) { return { customer_id: uid, item_id: id }; });
      var delF = Array.from(db.f).filter(function (id) { return !L.f.has(id); });
      var upC = Object.keys(L.c).filter(function (id) { return db.c[id] !== L.c[id]; }).map(function (id) { return { customer_id: uid, item_id: id, qty: L.c[id], updated_at: now }; });
      var delC = Object.keys(db.c).filter(function (id) { return !(id in L.c); });
      if (upF.length) jobs.push(sb.from('customer_favorites').upsert(upF, { onConflict: 'customer_id,item_id' }));
      if (delF.length) jobs.push(sb.from('customer_favorites').delete().eq('customer_id', uid).in('item_id', delF));
      if (upC.length) jobs.push(sb.from('customer_cart').upsert(upC, { onConflict: 'customer_id,item_id' }));
      if (delC.length) jobs.push(sb.from('customer_cart').delete().eq('customer_id', uid).in('item_id', delC));
      var res = await Promise.all(jobs);
      res.forEach(function (r) { if (r && r.error) throw r.error; });
      if (myRev === rev) { rawDel.call(ls, DIRTY); rawDel.call(ls, TOMB); } /* tout est enregistré : plus rien en attente */
    } catch (e) { console.warn('Winfum sync :', (e && e.message) || e); /* reste « en attente » et sera renvoyé */ }
    pushing = false;
    if (again) { again = false; push(); }
  }
  var schedule = function () { clearTimeout(timer); timer = setTimeout(push, 250); };

  /* « pierres tombales » : on retient ce qui a été SUPPRIMÉ sur cet appareil tant que le compte n'est pas à jour,
     pour qu'un produit retiré ne réapparaisse jamais lors de la fusion. */
  var tomb = function () { try { var t = JSON.parse(ls.getItem(TOMB) || '{}'); return { c: t.c || [], f: t.f || [] }; } catch (e) { return { c: [], f: [] }; } };
  var idsOf = function (k, v) { return parse(v).map(function (i) { return idOf(i); }).filter(Boolean); };
  function track(k, oldV, newV) {
    var o = idsOf(k, oldV), n = idsOf(k, newV), t = tomb(), key = k === CART ? 'c' : 'f';
    o.forEach(function (id) { if (n.indexOf(id) < 0 && t[key].indexOf(id) < 0) t[key].push(id); });
    n.forEach(function (id) { var i = t[key].indexOf(id); if (i > -1) t[key].splice(i, 1); });
    rawSet.call(ls, TOMB, JSON.stringify(t));
  }

  /* chaque changement de panier / favoris, quelle que soit la page : marqué « à enregistrer » */
  Storage.prototype.setItem = function (k, v) {
    var before = (this === ls && WATCH.indexOf(k) > -1) ? ls.getItem(k) : null;
    rawSet.call(this, k, v);
    if (this === ls && WATCH.indexOf(k) > -1) {
      track(k, before, v);
      rev++; rawSet.call(ls, DIRTY, '1');
      if (uid && ok) schedule();
    }
  };

  function ensureClient() {
    return new Promise(function (res, rej) {
      if (window.WINFUM_SB) { sb = window.WINFUM_SB; return res(); }
      var make = function () { sb = window.supabase.createClient(URL_, KEY); window.WINFUM_SB = sb; res(); };
      if (window.supabase) return make();
      var s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js';
      s.onload = make; s.onerror = rej; document.head.appendChild(s);
    });
  }

  async function sync(opts) {
    await ensureClient();
    if (!listening) {
      listening = true;
      sb.auth.onAuthStateChange(function (ev) { if (ev === 'SIGNED_IN') setTimeout(function () { init(lastOpts); }, 0); });
    }
    var s = (await sb.auth.getSession()).data.session;
    if (!s) { uid = null; ok = false; return { synced: false, state: 'anon' }; }
    var u = s.user.id;
    var cu = (await sb.from('customers').select('status').eq('id', u).maybeSingle()).data;
    if (cu && cu.status !== 'approved') { uid = null; ok = false; return { synced: false, state: cu.status }; }
    var db = await fetchDB();
    if (!db) { uid = null; ok = false; return { synced: false, state: 'error' }; }
    uid = u;

    var L = canon(), first = ls.getItem(SYNCED) !== u, dirty = ls.getItem(DIRTY) === '1';
    /* 1re connexion sur cet appareil, ou changements pas encore enregistrés → on FUSIONNE (rien ne se perd).
       Sinon le compte fait foi et l'appareil se met à jour. */
    var t = (first || dirty) ? union(L, db) : db;
    if (dirty && !first) { var tb = tomb(); tb.c.forEach(function (id) { delete t.c[id]; }); tb.f.forEach(function (id) { t.f.delete(id); }); }
    if (first) rawDel.call(ls, TOMB);
    writeLocal(t); rawSet.call(ls, SYNCED, u); ok = true;
    if (sig(t) !== sig(db)) await push(); else { rawDel.call(ls, DIRTY); rawDel.call(ls, TOMB); }

    var changed = sig(L) !== sig(t);
    if (changed) {
      var ev = new CustomEvent('winfum:sync', { detail: { handled: false } });
      window.dispatchEvent(ev);
      if (!ev.detail.handled && opts.reload !== false && !sessionStorage.getItem('wf_rl')) { sessionStorage.setItem('wf_rl', '1'); location.reload(); }
    } else sessionStorage.removeItem('wf_rl');
    return { synced: true, changed: changed, state: 'ok' };
  }

  function init(opts) {
    opts = opts || {}; lastOpts = opts;
    if (running) return running;
    running = sync(opts).catch(function (e) { console.warn('Winfum sync :', (e && e.message) || e); return { synced: false, state: 'error' }; })
      .then(function (r) { running = null; lastSync = Date.now(); return r; });
    return running;
  }
  function clearLocal() {
    WATCH.concat(LEGACY, [SYNCED, DIRTY, TOMB]).forEach(function (k) { rawDel.call(ls, k); });
    uid = null; ok = false; running = null;
  }

  /* retour sur l'onglet / retour du réseau : on se remet à jour */
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible' && ok && Date.now() - lastSync > 30000) init(lastOpts); });
  window.addEventListener('online', function () { if (ok) push(); });
  /* en quittant la page : on tente d'envoyer tout de suite les derniers changements */
  window.addEventListener('pagehide', function () { if (ok && uid && ls.getItem(DIRTY) === '1') push(); });

  window.WinfumAccount = { init: init, clearLocal: clearLocal, canon: canon };
  if (!window.WINFUM_MANUAL) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { init(); });
    else init();
  }
})();
