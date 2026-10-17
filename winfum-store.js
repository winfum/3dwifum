/* WINFUM — stockage unique du panier et des favoris sur l'appareil (à charger dans le <head>, AVANT le reste).
   Un seul endroit pour tout le site :
     winfum_cart  = [{id, qty}]      winfum_favs = [id, id, …]
   Les anciennes clés (une par page : winfum_cart_parfum, winfum_cart_vin, winfum_favs_home, winfum_favs_vin)
   sont fusionnées ici une seule fois, sans rien perdre, puis supprimées. */
(function () {
  try {
    var ls = window.localStorage;
    var rd = function (k) { try { var v = JSON.parse(ls.getItem(k) || '[]'); return Array.isArray(v) ? v : []; } catch (e) { return []; } };
    var idOf = function (i) { return typeof i === 'string' ? i : (i && i.id); };
    var OLD_CART = ['winfum_cart_parfum', 'winfum_cart_vin'], OLD_FAV = ['winfum_favs_home', 'winfum_favs_vin'];
    var touched = false;

    var c = {};
    ['winfum_cart'].concat(OLD_CART).forEach(function (k) {
      if (k !== 'winfum_cart' && ls.getItem(k) !== null) touched = true;
      rd(k).forEach(function (it) { if (it && it.id) c[it.id] = Math.max(c[it.id] || 0, parseInt(it.qty, 10) || 1); });
    });
    var f = [];
    ['winfum_favs'].concat(OLD_FAV).forEach(function (k) {
      if (k !== 'winfum_favs' && ls.getItem(k) !== null) touched = true;
      rd(k).forEach(function (i) { var id = idOf(i); if (id && f.indexOf(String(id)) < 0) f.push(String(id)); });
    });

    if (touched) {
      ls.setItem('winfum_cart', JSON.stringify(Object.keys(c).map(function (id) { return { id: id, qty: c[id] }; })));
      ls.setItem('winfum_favs', JSON.stringify(f));
      OLD_CART.concat(OLD_FAV).forEach(function (k) { ls.removeItem(k); });
      ls.setItem('winfum_dirty', '1'); /* à renvoyer vers le compte au prochain passage connecté */
    }
  } catch (e) { /* stockage indisponible (navigation privée…) : le site fonctionne quand même, sans mémoire */ }
})();
