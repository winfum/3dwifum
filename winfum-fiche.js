/* WINFUM — fiche produit (boutiques) + outils communs avec l'espace admin / manager.
   • WinfumFiche.render(racine, produit, actions) : construit toute la fiche (galerie, prix, notes olfactives, dégustation,
     description mise en forme, avis clients, barre d'achat…).
   • WinfumFiche.clean(html) : nettoie un texte mis en forme (liste blanche stricte) — utilisé à l'enregistrement ET à l'affichage.
   • WinfumFiche.FONTS / tfClass : styles de police du titre d'un produit (choisis dans l'admin).
   • Avis clients : table product_reviews (voir winfum_products_setup.sql.txt). Si elle n'existe pas encore, la section avis est
     simplement masquée et la fiche marche quand même. */
(function () {
  'use strict';
  if (window.WinfumFiche) return;

  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var num = function (v) { var n = parseFloat(v); return isFinite(n) ? n : 0; };
  var safeUrl = function (u) { u = String(u || '').trim(); return /^(https?:\/\/|\/)[^\s"'<>]*$/i.test(u) ? u : ''; };

  /* ---------------------------------------------------------------- polices du titre */
  var FONTS = {
    classic:   { label: 'Classique (italique)',    gf: '',                                 css: "'Cormorant Garamond',serif", st: 'italic' },
    elegant:   { label: 'Élégant',                 gf: 'Playfair+Display:wght@600;700',    css: "'Playfair Display',Georgia,serif" },
    modern:    { label: 'Moderne',                 gf: 'Montserrat:wght@500;600;700',      css: "'Montserrat','Inter',sans-serif" },
    luxe:      { label: 'Luxe (majuscules)',       gf: 'Cinzel:wght@500;600',              css: "'Cinzel',Georgia,serif", tt: 1 },
    signature: { label: 'Signature (manuscrit)',   gf: 'Great+Vibes',                      css: "'Great Vibes',cursive", w: 400 }
  };
  var loaded = {};
  function ensureFont(k) {
    var f = FONTS[k]; if (!f || !f.gf || loaded[k]) return; loaded[k] = 1;
    var l = document.createElement('link'); l.rel = 'stylesheet';
    l.href = 'https://fonts.googleapis.com/css2?family=' + f.gf + '&display=swap'; document.head.appendChild(l);
  }
  function tfClass(p) { var k = p && p.details && p.details.title_font; if (!FONTS[k]) k = 'classic'; ensureFont(k); return 'tf-' + k; }

  /* ---------------------------------------------------------------- texte mis en forme (liste blanche) */
  var COLS = ['c-gold', 'c-wine', 'c-mute'];
  var okHref = function (h) { return !/^\s*(javascript|data|vbscript):/i.test(h) && /^(https?:\/\/[^\s"'<>]+|mailto:[^\s"'<>]+|tel:[+0-9 ()-]+)$/i.test(h); };
  var hasTxt = function (x) { return /<br>|<li>/.test(x) || x.replace(/<[^>]*>/g, '').trim() !== ''; };
  function colClass(v) {
    v = String(v || '').trim().toLowerCase();
    var m = /^rgb\((\d+),\s*(\d+),\s*(\d+)\)/.exec(v);
    if (m) v = '#' + [1, 2, 3].map(function (i) { return ('0' + (+m[i]).toString(16)).slice(-2); }).join('');
    return { '#a9782f': 'c-gold', '#7a1128': 'c-wine', '#8d8a85': 'c-mute' }[v] || '';
  }
  function walk(n) {
    var out = '';
    n.childNodes.forEach(function (c) {
      if (c.nodeType === 3) { out += esc(c.nodeValue); return; }
      if (c.nodeType !== 1) return;
      var t = c.tagName.toLowerCase(), inner = function () { return walk(c); };
      var W = function (tag, x, at) { return hasTxt(x) ? '<' + tag + (at || '') + '>' + x + '</' + tag + '>' : x; };
      if (t === 'br') { out += '<br>'; return; }
      if (t === 'b' || t === 'strong') { out += W('b', inner()); return; }
      if (t === 'i' || t === 'em') { out += W('i', inner()); return; }
      if (t === 'u') { out += W('u', inner()); return; }
      if (t === 's' || t === 'strike' || t === 'del') { out += W('s', inner()); return; }
      if (t === 'h3' || t === 'h4' || t === 'h2') { out += W('h4', inner()); return; }
      if (t === 'blockquote') { out += W('blockquote', inner()); return; }
      if (t === 'ul' || t === 'ol') { out += W(t, inner()); return; }
      if (t === 'li') { out += W('li', inner()); return; }
      if (t === 'a') { var h = (c.getAttribute('href') || '').trim(); out += okHref(h) ? W('a', inner(), ' href="' + esc(h) + '" target="_blank" rel="noopener"') : inner(); return; }
      if (t === 'span' || t === 'font') {
        var cls = [].slice.call(c.classList).filter(function (k) { return COLS.indexOf(k) > -1; }).slice(0, 1), x = inner(), r = x;
        if (!cls.length) { var cc = colClass((c.getAttribute && c.getAttribute('color')) || (c.style && c.style.color) || ''); if (cc) cls = [cc]; }
        if (cls.length) r = W('span', x, ' class="' + cls[0] + '"');
        var st = c.style || {};
        if (st.fontWeight === 'bold' || parseInt(st.fontWeight, 10) >= 600) r = W('b', r);
        if (st.fontStyle === 'italic') r = W('i', r);
        if (/underline/.test(st.textDecorationLine || st.textDecoration || '')) r = W('u', r);
        out += r; return;
      }
      if (t === 'div' || t === 'p') { var x2 = inner(); out += hasTxt(x2) ? '<p>' + x2.replace(/^(<br>)+|(<br>)+$/g, '') + '</p>' : ''; return; }
      out += inner();
    });
    return out;
  }
  function clean(html) {
    var b = new DOMParser().parseFromString('<body>' + String(html || '') + '</body>', 'text/html').body;
    var out = walk(b).replace(/<p><\/p>/g, '').trim();
    /* du texte sans balise de bloc devient des paragraphes (séparés par les retours à la ligne) */
    if (out && !/<(p|h4|ul|ol|blockquote)\b/.test(out)) out = out.split(/(?:<br>\s*){2,}/).map(function (x) { return x.trim(); }).filter(Boolean).map(function (x) { return '<p>' + x + '</p>'; }).join('');
    return out;
  }
  function plain(html) {
    var d = new DOMParser().parseFromString('<body>' + String(html || '').replace(/<\/(p|h4|li|blockquote)>/gi, '\n').replace(/<br\s*\/?>/gi, '\n') + '</body>', 'text/html');
    return (d.body.textContent || '').replace(/\n{3,}/g, '\n\n').trim();
  }
  function paras(text) { return String(text || '').split(/\n{2,}|\r\n\r\n/).map(function (x) { return x.trim(); }).filter(Boolean).map(function (x) { return '<p>' + esc(x).replace(/\n/g, '<br>') + '</p>'; }).join(''); }

  /* ---------------------------------------------------------------- petits éléments */
  var STAR = '<svg viewBox="0 0 24 24"><path d="M12 2.6l2.9 6 6.5.9-4.7 4.6 1.1 6.5L12 17.5l-5.8 3.1 1.1-6.5L2.6 9.5l6.5-.9z"/></svg>';
  function stars(v, big) { var p = Math.max(0, Math.min(5, num(v))) / 5 * 100; return '<span class="fx-stars' + (big ? ' big' : '') + '" role="img" aria-label="' + (Math.round(num(v) * 10) / 10) + ' sur 5" style="--p:' + p + '%"><span class="bg">' + STAR.repeat(5) + '</span><span class="fg">' + STAR.repeat(5) + '</span></span>'; }
  var chip = function (t, on) { return '<span class="fx-chip' + (on ? ' on' : '') + '">' + esc(t) + '</span>'; };
  var list = function (v) { return Array.isArray(v) ? v : String(v || '').split(/[,;\n]+/).map(function (x) { return x.trim(); }).filter(Boolean); };
  var ICON = {
    top: '<svg viewBox="0 0 24 24"><path d="M12 3c3 4 5 6.6 5 9.5A5 5 0 0112 17.5 5 5 0 017 12.5C7 9.600 9 7 12 3z"/></svg>',
    heart: '<svg viewBox="0 0 24 24"><path d="M20.8 4.6a5.5 5.5 0 00-7.8 0L12 5.6l-1-1a5.5 5.5 0 10-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 000-7.8z"/></svg>',
    base: '<svg viewBox="0 0 24 24"><path d="M12 3v11M7 9l5 5 5-5M5 20h14"/></svg>',
    eye: '<svg viewBox="0 0 24 24"><path d="M2 12s3.600-7 10-7 10 7 10 7-3.600 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
    nose: '<svg viewBox="0 0 24 24"><path d="M12 3c0 6-1 8-3 11-1 1.500 0 4 3 4s4-1 4-2.500M9 18c-2 0-3-1-3-2.500"/></svg>',
    mouth: '<svg viewBox="0 0 24 24"><path d="M3 12c3 5 15 5 18 0-3-2.500-15-2.500-18 0zM3 12c3 0 15 0 18 0"/></svg>',
    check: '<svg viewBox="0 0 24 24"><path d="M5 12.500l4.500 4.500L19 7.500"/></svg>',
    share: '<svg viewBox="0 0 24 24"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.600 13.500l6.800 3.900M15.400 6.600L8.600 10.500"/></svg>',
    info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 16v-5M12 8h.01"/></svg>',
    play: '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>'
  };
  var TENUE = ['', 'Légère', 'Modérée', 'Bonne', 'Longue', 'Très longue'], SILLAGE = ['', 'Intime', 'Discret', 'Modéré', 'Marqué', 'Puissant'];
  function gauge(label, v, words) {
    v = Math.max(0, Math.min(5, Math.round(num(v)))); if (!v) return '';
    var segs = ''; for (var i = 1; i <= 5; i++) segs += '<i' + (i <= v ? ' class="on"' : '') + '></i>';
    return '<div class="fx-gauge"><span>' + label + '</span><div class="seg">' + segs + '</div><b>' + words[v] + '</b></div>';
  }
  var SEASONS = ['Printemps', 'Été', 'Automne', 'Hiver'], MOMENTS = ['Journée', 'Soirée', 'Quotidien', 'Bureau', 'Sortie', 'Cadeau'];

  function firstImg(P) { var m = (P.media || []).filter(function (x) { return x.t === 'image' && safeUrl(x.u); }); return m.length ? safeUrl(m[0].u) : ''; }

  /* ---------------------------------------------------------------- construction de la fiche */
  function build(P) {
    var d = P.details || {}, vin = P.type === 'vin', h = '';
    var media = (P.media && P.media.length) ? P.media : [{ t: 'image', u: '' }];
    var rating = num(P.rating), count = parseInt(P.ratingCount, 10) || 0;

    /* galerie */
    var slides = media.map(function (m, i) {
      var u = safeUrl(m.u), inner;
      if (!u) inner = '<span class="fx-ph">' + esc((P.name || '').slice(0, 2).toUpperCase()) + '</span>';
      else if (m.t === 'video') inner = '<video src="' + esc(u) + '" muted playsinline preload="metadata"></video><span class="fx-play">' + ICON.play + '</span>';
      else inner = '<img src="' + esc(u) + '" alt="' + esc(P.name) + '"' + (i ? ' loading="lazy"' : '') + '>';
      return '<div class="fx-slide" data-i="' + i + '">' + inner + '</div>';
    }).join('');
    var thumbs = media.length > 1 ? '<div class="fx-thumbs">' + media.map(function (m, i) {
      var u = safeUrl(m.u);
      return '<button type="button" class="' + (i ? '' : 'on') + '" data-t="' + i + '" aria-label="Média ' + (i + 1) + '">' + (u && m.t !== 'video' ? '<img src="' + esc(u) + '" alt="">' : '<span>' + (m.t === 'video' ? ICON.play : esc((P.name || '').slice(0, 1))) + '</span>') + '</button>';
    }).join('') + '</div>' : '';
    var badge = d.badge ? '<span class="fx-badge">' + esc(d.badge) + '</span>' : '';

    h += '<span class="x pm-x" onclick="closeProduct()" aria-label="Fermer">✕</span>';
    var has3d = !!(window.Winfum3D && Winfum3D.has(d) && (d.model3d !== 'photo' || d.model3d_glb || firstImg(P)));
    var btn3d = has3d ? '<button type="button" class="fx-3d-btn" data-3d aria-pressed="false"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2.5l8.5 4.8v9.4L12 21.5l-8.5-4.8V7.3z"/><path d="M12 12l8.5-4.7M12 12L3.5 7.3M12 12v9.5"/></svg><span>Voir en 3D</span></button><div class="fx-3d" data-3dbox hidden></div>' : '';
    h += '<div class="fx-media' + (has3d ? ' has3d' : '') + '">' + badge + '<div class="fx-scroll" id="pm-scroll">' + slides + '</div>' + (media.length > 1 ? '<span class="fx-count"><b>1</b>/' + media.length + '</span>' : '') + btn3d + '</div>' + thumbs;

    /* en-tête */
    var fam = d.family || (vin ? (P.region || '') : '');
    h += '<div class="fx-head">'
      + '<div class="fx-meta"><a class="fx-brand" href="' + esc(P.brandHref || '#') + '">' + esc(P.brand || '') + '</a>' + (P.catLabel ? '<span class="fx-cat">' + esc((vin ? '' : 'Parfum ') + (vin ? P.catLabel : String(P.catLabel).toLowerCase())) + '</span>' : '') + '</div>'
      + '<h2 class="fx-title ' + tfClass(P) + '" id="pm-title">' + esc(P.name) + '</h2>'
      + (d.tagline ? '<p class="fx-tag">' + esc(d.tagline) + '</p>' : (fam ? '<p class="fx-tag">' + esc(fam) + '</p>' : ''))
      + '<a class="fx-rate" href="#fx-reviews" data-go="rev">' + stars(rating) + '<span class="n">' + (rating ? (Math.round(rating * 10) / 10) : 'Nouveau') + '</span>' + (count ? '<span class="c">' + count + ' avis</span>' : '<span class="c">Soyez le premier à noter</span>') + '</a>'
      + '</div>';

    /* prix */
    h += '<div class="fx-buy"><div class="fx-price"><b id="pm-price">' + esc(P.retail) + '<span>G</span></b><small>Prix unitaire</small></div>'
      + (P.pack ? '<div class="fx-pack">' + esc(P.pack) + '</div>' : '') + '</div>'
      + '<div class="fx-how"><button class="how-link" type="button" onclick="openHow()">' + ICON.info + 'Comment commander ?</button></div>';

    /* points forts */
    var hl = list(d.highlights).slice(0, 6);
    h += '<div class="fx-trust"><span>' + ICON.check + 'Authentique</span><span>' + ICON.check + 'Livraison rapide</span><span>' + ICON.check + 'Vente gros &amp; détail</span></div>';
    if (hl.length) h += '<ul class="fx-hl">' + hl.map(function (x) { return '<li>' + ICON.check + '<span>' + esc(x) + '</span></li>'; }).join('') + '</ul>';

    /* chiffres clés */
    var facts = vin
      ? [[P.abv, 'Alcool'], [P.vol, 'Volume'], [d.serving_temp, 'Service']]
      : [[d.concentration, 'Concentration'], [d.volume_ml ? d.volume_ml + ' ml' : '', 'Contenance'], [d.family, 'Famille']];
    facts = facts.filter(function (f) { return f[0]; });
    if (facts.length) h += '<div class="fx-facts n' + facts.length + '">' + facts.map(function (f) { return '<div><b>' + esc(f[0]) + '</b><small>' + f[1] + '</small></div>'; }).join('') + '</div>';

    /* parfum : pyramide olfactive + tenue/sillage + saisons/moments */
    if (!vin) {
      var tiers = [['top', 'Notes de tête', d.notes_top, 'Première impression'], ['heart', 'Notes de cœur', d.notes_heart, "L'âme du parfum"], ['base', 'Notes de fond', d.notes_base, 'Sillage & persistance']].filter(function (t) { return list(t[2]).length; });
      if (tiers.length) h += '<div class="fx-sec"><div class="fx-sh"><h4 class="serif">Pyramide olfactive</h4></div><div class="fx-pyr">' + tiers.map(function (t) {
        return '<div class="tier"><i class="ic">' + ICON[t[0]] + '</i><div><b>' + t[1] + '</b><small>' + t[3] + '</small><div class="chips">' + list(t[2]).map(function (x) { return chip(x); }).join('') + '</div></div></div>';
      }).join('') + '</div></div>';
      var g = gauge('Tenue', d.longevity, TENUE) + gauge('Sillage', d.sillage, SILLAGE);
      var ss = list(d.seasons), mm = list(d.moments);
      if (g || ss.length || mm.length) {
        h += '<div class="fx-sec"><div class="fx-sh"><h4 class="serif">Personnalité</h4></div>' + (g ? '<div class="fx-gauges">' + g + '</div>' : '')
          + (ss.length ? '<div class="fx-line"><small>Saisons</small><div class="chips">' + SEASONS.map(function (s) { return chip(s, ss.indexOf(s) > -1); }).join('') + '</div></div>' : '')
          + (mm.length ? '<div class="fx-line"><small>Moments</small><div class="chips">' + MOMENTS.map(function (s) { return chip(s, mm.indexOf(s) > -1); }).join('') + '</div></div>' : '') + '</div>';
      }
    } else {
      var ing = P.ing || [];
      if (ing.length) h += '<div class="fx-sec"><div class="fx-sh"><h4 class="serif">Ingrédients &amp; cépage</h4></div><div class="ing">' + ing.map(function (r) { return '<div><span>' + esc(r[0]) + '</span><b>' + esc(r[1]) + '</b></div>'; }).join('') + '</div></div>';
      var tast = [['eye', 'Œil', d.tasting_eye], ['nose', 'Nez', d.tasting_nose], ['mouth', 'Bouche', d.tasting_mouth]].filter(function (t) { return t[2]; });
      if (tast.length) h += '<div class="fx-sec"><div class="fx-sh"><h4 class="serif">Dégustation</h4></div><div class="fx-tast">' + tast.map(function (t) { return '<div><i class="ic">' + ICON[t[0]] + '</i><div><b>' + t[1] + '</b><p>' + esc(t[2]) + '</p></div></div>'; }).join('') + '</div></div>';
      if (d.pairing) h += '<div class="fx-sec"><div class="fx-sh"><h4 class="serif">Accords mets &amp; vin</h4></div><p class="fx-plain">' + esc(d.pairing) + '</p></div>';
    }

    /* description */
    var body = d.desc_html ? clean(d.desc_html) : paras(P.desc);
    if (body) {
      var long = plain(body).length > 400;
      h += '<div class="fx-sec fx-descs"><div class="fx-sh"><h4 class="serif">' + (vin ? 'À propos de ce vin' : "L'histoire du parfum") + '</h4></div><div class="fx-desc' + (long ? ' collapsed' : '') + '" id="pm-desc">' + body + '</div>' + (long ? '<button type="button" class="fx-more" data-more="1">Lire la suite</button>' : '') + '</div>';
    }

    /* avis */
    h += '<div class="fx-sec fx-reviews" id="fx-reviews"><div class="fx-sh"><h4 class="serif">Avis clients</h4></div><div class="fx-rbody"><div class="fx-rload">Chargement des avis…</div></div></div>';

    /* produits liés */
    h += '<div class="fx-sec fx-rel"><div class="fx-sh"><h4 class="serif">Vous aimerez aussi</h4></div><div class="rel-s" id="pm-rel"></div></div>';
    /* barre d'achat (reste visible en bas) */
    h += '<div class="fx-act"><button class="pm-add" id="pm-add" type="button">Ajouter au panier</button>'
      + '<div class="round" id="pm-fav" title="Favori"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.8 4.6a5.5 5.5 0 00-7.8 0L12 5.6l-1-1a5.5 5.5 0 10-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 000-7.8z"/></svg></div>'
      + '<div class="round" onclick="shareProduct()" title="Partager"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 3.9M15.4 6.6L8.6 10.5"/></svg></div></div>';
    return h;
  }

  /* ---------------------------------------------------------------- rendu + interactions */
  function render(root, P, H) {
    H = H || {};
    root.dataset.type = P.type;
    root.innerHTML = build(P);
    var $ = function (s) { return root.querySelector(s); };
    var sc = $('#pm-scroll'), slides = [].slice.call(root.querySelectorAll('.fx-slide')), thumbs = [].slice.call(root.querySelectorAll('.fx-thumbs button')), cnt = $('.fx-count b');
    sc.scrollLeft = 0;
    slides.forEach(function (s, i) { s.onclick = function () { if (H.onViewer) H.onViewer(i); }; });
    var sync = function () { var i = Math.round(sc.scrollLeft / Math.max(1, sc.clientWidth)); thumbs.forEach(function (t, j) { t.classList.toggle('on', i === j); }); if (cnt) cnt.textContent = i + 1; };
    sc.onscroll = sync;
    thumbs.forEach(function (t, i) { t.onclick = function () { sc.scrollTo({ left: i * sc.clientWidth, behavior: 'smooth' }); }; });

    /* vue 3D (si l'admin a choisi un modèle pour ce produit) */
    if (window.__winfum3d) { try { window.__winfum3d.dispose(); } catch (e) {} window.__winfum3d = null; }
    var b3 = $('[data-3d]'), box3 = $('[data-3dbox]'), inst3 = null, on3 = false, token3 = 0;
    function stop3() {
      token3++; on3 = false;
      if (inst3) { try { inst3.dispose(); } catch (e) {} inst3 = null; }
      if (box3) { box3.hidden = true; box3.innerHTML = ''; }
      if (b3) { b3.classList.remove('on'); b3.setAttribute('aria-pressed', 'false'); b3.querySelector('span').textContent = 'Voir en 3D'; }
    }
    if (b3 && box3) b3.onclick = function () {
      if (on3) return stop3();
      var dd = P.details || {}, my = ++token3;
      on3 = true; box3.hidden = false;
      b3.classList.add('on'); b3.setAttribute('aria-pressed', 'true'); b3.querySelector('span').textContent = 'Photos';
      Winfum3D.mount(box3, { model: dd.model3d, photo: firstImg(P), dept: P.type, depth: dd.model3d_depth, labelRect: dd.model3d_label, glb: dd.model3d_glb, liquid: dd.model3d_liquid, cap: dd.model3d_cap, glass: dd.model3d_glass, name: P.name, brand: P.brand, sub: (P.type === 'vin' ? 'Vin ' : 'Parfum ') + String(P.catLabel || '').toLowerCase() })
        .then(function (i) { if (my !== token3) { i && i.dispose(); return; } inst3 = i; })
        .catch(function () { if (my !== token3) return; toast('La vue 3D n\'est pas disponible sur cet appareil.', 1); stop3(); b3.remove(); });
    };

    var fav = $('#pm-fav'); fav.classList.toggle('active', !!H.isFav);
    fav.onclick = function () { if (H.onFav) H.onFav(fav); };
    $('#pm-add').onclick = function () { if (H.onAdd) H.onAdd(); };
    var more = $('[data-more]');
    if (more) more.onclick = function () { var d = $('.fx-desc'), c = d.classList.toggle('collapsed'); more.textContent = c ? 'Lire la suite' : 'Réduire'; };
    var go = $('[data-go="rev"]');
    if (go) go.onclick = function (e) { e.preventDefault(); var r = $('#fx-reviews'); if (r) root.scrollTo({ top: r.offsetTop - 70, behavior: 'smooth' }); };

    var rel = $('#pm-rel'), items = H.related || [];
    if (!items.length) { var rs = $('.fx-rel'); if (rs) rs.remove(); }
    else items.forEach(function (r) {
      var c = document.createElement('div'); c.className = 'rel-c';
      c.innerHTML = r.thumb + '<div class="nm ' + (r.tf || '') + '">' + esc(r.name) + '</div><div class="pr">' + esc(r.retail) + ' G</div>';
      c.onclick = function () { if (H.onOpen) H.onOpen(r.id); }; rel.appendChild(c);
    });
    root.scrollTop = 0;
    initReviews(root, P, H);
  }

  /* ---------------------------------------------------------------- avis clients */
  function toast(m, bad) { if (typeof window.toast === 'function') window.toast(m, bad); }
  function when(iso) { try { return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }); } catch (e) { return ''; } }
  async function initReviews(root, P, H) {
    var sec = root.querySelector('#fx-reviews'), box = root.querySelector('.fx-rbody'); if (!sec || !box) return;
    var sb = window.WINFUM_SB, rows = [], me = null, token = P.id;
    if (!sb) { sec.remove(); return; }
    try {
      var r = await sb.from('product_reviews').select('rating,comment,author,created_at,customer_id').eq('product_id', String(P.id)).eq('is_active', true).order('created_at', { ascending: false }).limit(100);
      if (r.error) throw r.error; rows = r.data || [];
    } catch (e) { sec.remove(); return; }              /* table absente : pas d'avis, la fiche reste complète */
    try {
      var s = (await sb.auth.getSession()).data.session;
      if (s) {
        var c = (await sb.from('customers').select('status,full_name,pseudo').eq('id', s.user.id).maybeSingle()).data;
        me = { id: s.user.id, ok: !!c && c.status === 'approved', status: c ? c.status : 'staff', name: c ? ((c.full_name || '').trim().split(/\s+/)[0] || c.pseudo || 'Client') : 'Client' };
      }
    } catch (e) {}
    if (!root.contains(sec) || (H.current && H.current() !== token)) return;   /* la fiche a changé entre-temps */
    var pick = 0, editing = false;

    function paint() {
      var n = rows.length, avg = n ? rows.reduce(function (a, x) { return a + x.rating; }, 0) / n : 0;
      var mine = me ? rows.filter(function (x) { return x.customer_id === me.id; })[0] : null;
      var dist = [5, 4, 3, 2, 1].map(function (k) { var c = rows.filter(function (x) { return x.rating === k; }).length; return '<div class="row"><span>' + k + '</span><i><u style="width:' + (n ? c / n * 100 : 0) + '%"></u></i><em>' + c + '</em></div>'; }).join('');
      var rate = root.querySelector('.fx-rate');
      if (rate) rate.innerHTML = stars(n ? avg : P.rating) + '<span class="n">' + (n ? (Math.round(avg * 10) / 10) : (num(P.rating) ? Math.round(num(P.rating) * 10) / 10 : 'Nouveau')) + '</span><span class="c">' + (n ? n + ' avis' : 'Soyez le premier à noter') + '</span>';
      if (H.onRated && n) H.onRated(Math.round(avg * 10) / 10, n);

      var form;
      if (!me) form = '<div class="fx-rcta"><p>Vous avez acheté ce produit ? Partagez votre avis avec les autres clients.</p><a class="btn-ghost" href="espace.html">Se connecter pour noter</a></div>';
      else if (!me.ok) form = '<div class="fx-rcta"><p>' + (me.status === 'staff' ? 'Connectez-vous avec un compte client pour donner votre avis.' : 'Votre compte doit être validé pour pouvoir noter un produit.') + '</p></div>';
      else if (mine && !editing) form = '<div class="fx-rcta mine"><p>Votre avis : ' + stars(mine.rating) + '</p><div><button type="button" class="btn-ghost" data-r="edit">Modifier</button><button type="button" class="btn-ghost danger" data-r="del">Supprimer</button></div></div>';
      else form = '<div class="fx-rform"><b class="serif">' + (mine ? 'Modifier mon avis' : 'Donnez votre avis') + '</b>'
        + '<div class="pick" role="radiogroup" aria-label="Votre note">' + [1, 2, 3, 4, 5].map(function (k) { return '<button type="button" data-v="' + k + '" class="' + (k <= pick ? 'on' : '') + '" aria-label="' + k + ' étoile' + (k > 1 ? 's' : '') + '">' + STAR + '</button>'; }).join('') + '</div>'
        + '<textarea maxlength="300" placeholder="Votre commentaire (facultatif)">' + esc(mine ? mine.comment || '' : '') + '</textarea>'
        + '<div class="act"><button type="button" class="pm-send" data-r="send">Publier mon avis</button>' + (mine ? '<button type="button" class="btn-ghost" data-r="cancel">Annuler</button>' : '') + '</div></div>';

      var shown = box.dataset.all === '1' ? rows : rows.slice(0, 3);
      var items = shown.map(function (x) {
        return '<div class="fx-rev"><i class="av">' + esc((x.author || 'C').slice(0, 1).toUpperCase()) + '</i><div><div class="top"><b>' + esc(x.author || 'Client') + '</b>' + stars(x.rating) + '</div><small>' + when(x.created_at) + '</small>' + (x.comment ? '<p>' + esc(x.comment) + '</p>' : '') + '</div></div>';
      }).join('');
      box.innerHTML = (n ? '<div class="fx-rsum"><div class="fx-avg"><b>' + (Math.round(avg * 10) / 10) + '</b>' + stars(avg, true) + '<small>' + n + ' avis</small></div><div class="fx-dist">' + dist + '</div></div>' : '')
        + form + (n ? '<div class="fx-rlist">' + items + '</div>' + (n > 3 && box.dataset.all !== '1' ? '<button type="button" class="fx-more" data-r="all">Voir les ' + n + ' avis</button>' : '') : '');
      if (mine && editing && !pick) { pick = mine.rating; paint(); }
    }
    paint();

    box.onclick = async function (e) {
      var b = e.target.closest('button'); if (!b) return;
      if (b.dataset.v) { pick = +b.dataset.v; box.querySelectorAll('.pick button').forEach(function (x) { x.classList.toggle('on', +x.dataset.v <= pick); }); return; }
      var a = b.dataset.r;
      if (a === 'all') { box.dataset.all = '1'; paint(); }
      else if (a === 'edit') { editing = true; pick = 0; paint(); }
      else if (a === 'cancel') { editing = false; pick = 0; paint(); }
      else if (a === 'del') {
        if (!confirm('Supprimer votre avis ?')) return;
        var d = await sb.from('product_reviews').delete().eq('product_id', String(P.id)).eq('customer_id', me.id);
        if (d.error) return toast('Suppression impossible : ' + d.error.message, 1);
        rows = rows.filter(function (x) { return x.customer_id !== me.id; }); editing = false; pick = 0; paint(); toast('Avis supprimé');
      } else if (a === 'send') {
        if (!pick) return toast('Choisissez une note de 1 à 5 étoiles', 1);
        var txt = (box.querySelector('textarea').value || '').trim().slice(0, 300);
        b.disabled = true; b.textContent = 'Envoi…';
        var row = { product_id: String(P.id), customer_id: me.id, rating: pick, comment: txt || null, author: me.name, is_active: true, updated_at: new Date().toISOString() };
        var u = await sb.from('product_reviews').upsert(row, { onConflict: 'product_id,customer_id' });
        if (u.error) { b.disabled = false; b.textContent = 'Publier mon avis'; return toast(/row-level|policy|permission/i.test(u.error.message) ? 'Votre compte doit être validé pour noter.' : 'Envoi impossible : ' + u.error.message, 1); }
        rows = rows.filter(function (x) { return x.customer_id !== me.id; });
        rows.unshift({ rating: pick, comment: txt || null, author: me.name, created_at: row.updated_at, customer_id: me.id });
        editing = false; pick = 0; paint(); toast('Merci pour votre avis ★');
      }
    };
  }

  window.WinfumFiche = { render: render, clean: clean, plain: plain, FONTS: FONTS, ensureFont: ensureFont, tfClass: tfClass, stars: stars, esc: esc, LISTS: { SEASONS: SEASONS, MOMENTS: MOMENTS } };
})();
