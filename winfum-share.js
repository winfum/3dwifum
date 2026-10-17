/* WINFUM — partage d'un produit : l'IMAGE du produit + un LIEN UNIQUE qui ramène directement au produit.
   • Sur téléphone : la feuille de partage s'ouvre avec la photo et le lien (WhatsApp, Messenger, SMS…).
   • Le lien (…/p/ID) affiche un aperçu avec la photo dans WhatsApp & co (fonction api/p.js), puis fait défiler
     la page jusqu'au produit, le met en évidence et ouvre sa fiche.
   • Si l'image ne peut pas être jointe (ou sur ordinateur) : on partage / copie le lien seul. */
(function () {
  'use strict';
  var imgCache = {};

  /* lien unique du produit : …/p/<id>. Les applications (WhatsApp, Messenger…) y lisent la photo, le nom et le prix
     pour afficher l'aperçu ; une personne qui l'ouvre arrive directement sur le produit (défilement + fiche). */
  function link(p) {
    if (!/^https?:$/.test(location.protocol)) { /* ouverture en local : lien direct vers la page */
      var vin = p.type === 'vin', dir = location.href.split('#')[0].split('?')[0].replace(/[^\/]*$/, '');
      return dir + (vin ? 'funforus' : 'jbparfumerie') + '.html#' + (vin ? 'v' : 'p') + '-' + encodeURIComponent(p.id);
    }
    return location.origin + '/p/' + encodeURIComponent(p.id);
  }
  function imageOf(p) {
    var m = (p.media || []).filter(function (x) { return x && x.t === 'image' && x.u; })[0];
    return m ? m.u : '';
  }
  /* l'image est préparée dès l'ouverture de la fiche, pour que le partage soit instantané */
  function prepare(p) {
    var u = p && imageOf(p);
    if (!u || imgCache[u]) return;
    imgCache[u] = fetch(u, { mode: 'cors' }).then(function (r) { if (!r.ok) throw 0; return r.blob(); })
      .then(function (b) { return /^image\//.test(b.type) ? b : null; }).catch(function () { return null; });
  }
  var slug = function (s) { return String(s || 'produit').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'produit'; };
  function say(m) { if (typeof window.toast === 'function') window.toast(m); }

  async function product(p) {
    if (!p) return;
    var url = link(p), brand = p.type === 'vin' ? 'Fun For Us' : 'JB Parfumerie';
    var title = p.name + ' — ' + brand + ' · Winfum';
    var text = 'Découvrez ' + p.name + (p.retail ? ' (' + p.retail + ' G)' : '') + ' sur Winfum :\n' + url;
    if (navigator.share) {
      try {
        var u = imageOf(p), blob = null;
        if (u) { prepare(p); blob = await imgCache[u]; }
        if (blob) {
          var type = blob.type || 'image/jpeg', file = new File([blob], slug(p.name) + '.' + (type.split('/')[1] || 'jpg').replace('jpeg', 'jpg'), { type: type });
          if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: title, text: text }); return; }
        }
        await navigator.share({ title: title, text: 'Découvrez ' + p.name + ' sur Winfum', url: url });
        return;
      } catch (e) { if (e && e.name === 'AbortError') return; /* sinon : on retombe sur la copie du lien */ }
    }
    try { await navigator.clipboard.writeText(url); say('Lien du produit copié ✓'); }
    catch (e) { window.prompt('Copiez le lien du produit :', url); }
  }

  /* arrivée par un lien partagé : défile jusqu'au produit, le met en évidence, puis ouvre sa fiche */
  function reveal(id, openFn) {
    var card = null;
    document.querySelectorAll('[data-pid]').forEach(function (c) { if (c.getAttribute('data-pid') === String(id)) card = c; });
    if (!card) return openFn(id, true);
    card.classList.add('in');
    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    card.classList.add('wf-pulse');
    setTimeout(function () { card.classList.remove('wf-pulse'); openFn(id, true); }, 1300);
  }

  var st = document.createElement('style');
  st.textContent = '.wf-pulse{animation:wfPulse 1.3s ease}@keyframes wfPulse{0%{box-shadow:0 0 0 0 rgba(169,120,47,.0)}25%{box-shadow:0 0 0 5px rgba(169,120,47,.65),0 18px 40px rgba(169,120,47,.35);transform:translateY(-6px) scale(1.02)}100%{box-shadow:0 0 0 0 rgba(169,120,47,0)}}';
  document.head.appendChild(st);

  window.WinfumShare = { link: link, product: product, prepare: prepare, reveal: reveal };
})();
