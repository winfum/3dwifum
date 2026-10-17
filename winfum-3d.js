/* WINFUM — visionneuse 3D tactile des produits (flacons de parfum, bouteilles de vin).
   • Winfum3D.PRESETS  : liste des modèles disponibles (id unique + libellé + boutique) — utilisée par l'admin.
   • Winfum3D.GLASS / CAPS : teintes du verre et finitions du bouchon proposées dans l'admin.
   • Winfum3D.has(details) : true si l'admin a choisi un modèle 3D (ou fourni un fichier .glb) pour ce produit.
   • Winfum3D.mount(element, config) : Promise → { dispose() }. Charge three.js à la demande (seulement au 1er clic),
     construit le modèle, le rend en temps réel (verre transparent, reflets de studio) et le laisse tourner au doigt.
   Tout est stocké dans la colonne « details » du produit (aucune modification Supabase) :
     model3d (id du modèle) · model3d_glb (lien .glb facultatif) · model3d_liquid (#couleur) · model3d_cap · model3d_glass */
(function () {
  'use strict';
  if (window.Winfum3D) return;

  var THREE_URL = 'https://cdn.jsdelivr.net/npm/three@0.147.0/build/three.min.js';
  var GLTF_URL = 'https://cdn.jsdelivr.net/npm/three@0.147.0/examples/js/loaders/GLTFLoader.js';

  /* ------------------------------------------------------------ styles */
  (function () {
    var st = document.createElement('style');
    st.textContent = '.w3d{position:relative;width:100%;height:100%;background:#fff;overflow:hidden;border-radius:inherit}'
      + '.w3d-load{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;color:#8d8a85;font:500 12px/1 Inter,system-ui,sans-serif;letter-spacing:.12em;text-transform:uppercase}'
      + '.w3d-load i{width:26px;height:26px;border-radius:50%;border:2px solid rgba(169,120,47,.25);border-top-color:#a9782f;animation:w3dspin .8s linear infinite}'
      + '@keyframes w3dspin{to{transform:rotate(360deg)}}'
      + '.w3d-hint{position:absolute;left:0;right:0;bottom:14px;display:flex;justify-content:center;pointer-events:none;transition:opacity .6s}'
      + '.w3d-hint.off{opacity:0}'
      + '.w3d-hint span{padding:7px 14px;border-radius:20px;background:rgba(28,26,23,.58);color:#fff;font:500 11px/1 Inter,system-ui,sans-serif;letter-spacing:.08em;backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px)}';
    document.head.appendChild(st);
  })();

  /* ------------------------------------------------------------ catalogue */
  var PRESETS = [
    { id: 'parfum-carre',    label: 'Flacon carré (verre épais)',   dept: 'parfum', liquid: '#e6bf72', cap: 'or',     glass: 'clair' },
    { id: 'parfum-rond',     label: 'Flacon rond (bouchon haut)',   dept: 'parfum', liquid: '#f0c9c0', cap: 'or',     glass: 'clair' },
    { id: 'parfum-cylindre', label: 'Flacon cylindre moderne',      dept: 'parfum', liquid: '#9fc4d6', cap: 'argent', glass: 'clair' },
    { id: 'parfum-facette',  label: 'Flacon facetté (6 faces)',     dept: 'parfum', liquid: '#caa35a', cap: 'noir',   glass: 'clair' },
    { id: 'vin-bordeaux',    label: 'Bouteille Bordeaux',           dept: 'vin',    liquid: '#7a1228', cap: 'bordeaux', glass: 'vertclair' },
    { id: 'vin-bourgogne',   label: 'Bouteille Bourgogne',          dept: 'vin',    liquid: '#7a1228', cap: 'noir',   glass: 'vertclair' },
    { id: 'vin-flute',       label: 'Bouteille flûte (blanc / rosé)', dept: 'vin',  liquid: '#e9d88a', cap: 'or',     glass: 'clair' },
    { id: 'parfum-flacon-plat', label: 'Flacon plat rectangulaire', dept: 'parfum', liquid: '#f0d29a', cap: 'or', glass: 'clair' },
    { id: 'parfum-amphore', label: 'Flacon amphore', dept: 'parfum', liquid: '#e6bf72', cap: 'or', glass: 'clair' },
    { id: 'parfum-coeur', label: 'Flacon galbé cœur (approximation)', dept: 'parfum', liquid: '#ef9caa', cap: 'or', glass: 'clair' },
    { id: 'parfum-vaporisateur', label: 'Flacon vaporisateur avec pompe', dept: 'parfum', liquid: '#b8dfe8', cap: 'argent', glass: 'clair' },
    { id: 'parfum-mini', label: 'Mini flacon 30 ml', dept: 'parfum', liquid: '#e6bf72', cap: 'or', glass: 'clair' },
    { id: 'vin-champagne', label: 'Bouteille champagne avec muselet', dept: 'vin', liquid: '#e9d88a', cap: 'or', glass: 'vertclair' },
    { id: 'vin-rose-provence', label: 'Bouteille rosé de Provence', dept: 'vin', liquid: '#e9a6a7', cap: 'or', glass: 'clair' },
    { id: 'vin-magnum', label: 'Bouteille magnum', dept: 'vin', liquid: '#7a1228', cap: 'bordeaux', glass: 'vert' },
    { id: 'vin-demi', label: 'Demi-bouteille', dept: 'vin', liquid: '#7a1228', cap: 'noir', glass: 'vertclair' },
    { id: 'vin-alsace', label: 'Bouteille alsacienne élancée', dept: 'vin', liquid: '#e9d88a', cap: 'or', glass: 'vertclair' }
  ];
  var GLASS = {
    clair:     { label: 'Transparent',  color: '#ffffff', dist: 1e9 },
    vertclair: { label: 'Vert clair',   color: '#b9d9b4', dist: 3.5 },
    vert:      { label: 'Vert foncé',   color: '#274b2f', dist: 0.55 },
    ambre:     { label: 'Ambré',        color: '#c47a1c', dist: 1.0 },
    noir:      { label: 'Noir',         color: '#16181b', dist: 0.25 }
  };
  var CAPS = {
    or:       { label: 'Or',        color: '#cfa64b', metal: 1 },
    argent:   { label: 'Argent',    color: '#d4d7db', metal: 1 },
    cuivre:   { label: 'Cuivre',    color: '#b9683f', metal: 1 },
    noir:     { label: 'Noir laqué', color: '#141316', metal: 0 },
    bordeaux: { label: 'Bordeaux laqué', color: '#6a0f22', metal: 0 },
    blanc:    { label: 'Blanc laqué', color: '#f1eee8', metal: 0 }
  };
  function preset(id) { for (var i = 0; i < PRESETS.length; i++) if (PRESETS[i].id === id) return PRESETS[i]; return null; }
  function has(d) { d = d || {}; return !!(preset(d.model3d) || (d.model3d_glb && /^https?:\/\//i.test(d.model3d_glb))); }

  /* ------------------------------------------------------------ chargement des scripts */
  var pending = {};
  function loadScript(src) {
    if (pending[src]) return pending[src];
    pending[src] = new Promise(function (ok, ko) {
      var s = document.createElement('script');
      s.src = src; s.async = true; s.crossOrigin = 'anonymous';
      s.onload = ok; s.onerror = function () { delete pending[src]; ko(new Error('Chargement 3D impossible')); };
      document.head.appendChild(s);
    });
    return pending[src];
  }
  function loadThree() { return window.THREE ? Promise.resolve() : loadScript(THREE_URL); }
  function webgl() {
    try { var c = document.createElement('canvas'); return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl'))); } catch (e) { return false; }
  }

  /* ------------------------------------------------------------ textures (étiquettes, fond, ombre) */
  function canvasTex(T, w, h, draw, srgb) {
    var c = document.createElement('canvas'); c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    var t = new T.CanvasTexture(c);
    if (srgb !== false) t.encoding = T.sRGBEncoding;
    t.anisotropy = 8;
    return t;
  }
  function wrap(ctx, text, maxW) {
    var words = String(text).split(/\s+/), lines = [], cur = '';
    words.forEach(function (w) {
      var t = cur ? cur + ' ' + w : w;
      if (ctx.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t;
    });
    if (cur) lines.push(cur);
    return lines;
  }
  /* étiquette papier crème (vin) */
  function wineLabel(T, o) {
    return canvasTex(T, 1024, 760, function (g, w, h) {
      var gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, '#f7f1e3'); gr.addColorStop(1, '#eadfc7');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
      g.strokeStyle = '#a9782f'; g.lineWidth = 5; g.strokeRect(34, 34, w - 68, h - 68);
      g.lineWidth = 2; g.strokeRect(50, 50, w - 100, h - 100);
      g.textAlign = 'center'; g.fillStyle = '#a9782f';
      g.font = '600 38px "Cinzel","Cormorant Garamond",serif';
      if (g.letterSpacing !== undefined) g.letterSpacing = '8px';
      g.fillText(String(o.brand || '').toUpperCase(), w / 2, 140);
      if (g.letterSpacing !== undefined) g.letterSpacing = '0px';
      g.fillRect(w / 2 - 60, 175, 120, 3);
      g.fillStyle = '#2a2420';
      var font = 'italic 600 %spx "Cormorant Garamond",Georgia,serif', size = 112;
      var name = String(o.name || ''), lines;
      do { g.font = font.replace('%s', size); lines = wrap(g, name, w - 190); size -= 6; } while ((lines.length > 3 || lines.some(function (l) { return g.measureText(l).width > w - 190; })) && size > 40);
      size += 6; g.font = font.replace('%s', size);
      var lh = size * 1.05, y0 = h / 2 + 20 - ((lines.length - 1) * lh) / 2;
      lines.forEach(function (l, i) { g.fillText(l, w / 2, y0 + i * lh); });
      g.fillStyle = '#a9782f'; g.font = '500 34px "Cormorant Garamond",serif';
      if (g.letterSpacing !== undefined) g.letterSpacing = '5px';
      g.fillText(String(o.sub || 'Vin').toUpperCase(), w / 2, h - 120);
      if (g.letterSpacing !== undefined) g.letterSpacing = '0px';
    });
  }
  /* inscription dorée posée directement sur le verre (parfum) */
  function perfumeLabel(T, o) {
    return canvasTex(T, 768, 512, function (g, w, h) {
      g.clearRect(0, 0, w, h); g.textAlign = 'center';
      var gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, '#e9c988'); gr.addColorStop(.5, '#b98a3e'); gr.addColorStop(1, '#e3bf78');
      g.fillStyle = gr;
      g.font = '600 30px "Cinzel","Cormorant Garamond",serif';
      if (g.letterSpacing !== undefined) g.letterSpacing = '9px';
      g.fillText(String(o.brand || '').toUpperCase(), w / 2, 120);
      if (g.letterSpacing !== undefined) g.letterSpacing = '0px';
      g.fillRect(w / 2 - 44, 150, 88, 3);
      var font = 'italic 600 %spx "Cormorant Garamond",Georgia,serif', size = 92, lines;
      do { g.font = font.replace('%s', size); lines = wrap(g, String(o.name || ''), w - 110); size -= 5; } while ((lines.length > 3 || lines.some(function (l) { return g.measureText(l).width > w - 110; })) && size > 36);
      size += 5; g.font = font.replace('%s', size);
      var lh = size * 1.05, y0 = h / 2 + 50 - ((lines.length - 1) * lh) / 2;
      lines.forEach(function (l, i) { g.fillText(l, w / 2, y0 + i * lh); });
    });
  }
  function bgTex(T) {
    return canvasTex(T, 512, 512, function (g, w, h) {
      var gr = g.createRadialGradient(w / 2, h * 0.5, 10, w / 2, h * 0.5, w * 0.78);
      gr.addColorStop(0, '#ffffff'); gr.addColorStop(.6, '#ffffff'); gr.addColorStop(1, '#ffffff');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
    });
  }
  function shadowTex(T) {
    return canvasTex(T, 256, 256, function (g, w, h) {
      var gr = g.createRadialGradient(w / 2, h / 2, 4, w / 2, h / 2, w / 2);
      gr.addColorStop(0, 'rgba(40,28,14,.55)'); gr.addColorStop(.5, 'rgba(40,28,14,.22)'); gr.addColorStop(1, 'rgba(40,28,14,0)');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
    }, false);
  }

  /* ------------------------------------------------------------ environnement « studio » (reflets du verre) */
  function studioEnv(T, renderer) {
    var s = new T.Scene();
    var room = new T.Mesh(new T.BoxGeometry(30, 30, 30), new T.MeshBasicMaterial({ color: new T.Color(0.34, 0.33, 0.32), side: T.BackSide }));
    s.add(room);
    function box(w, h, x, y, z, k) {
      var m = new T.Mesh(new T.PlaneGeometry(w, h), new T.MeshBasicMaterial({ color: new T.Color(k, k, k * 0.97), side: T.DoubleSide }));
      m.position.set(x, y, z); m.lookAt(0, 0, 0); s.add(m);
    }
    box(14, 14, 0, 13, 0, 7);        // plafond
    box(5, 16, -11, 2, 5, 9);        // bande gauche
    box(5, 16, 11, 2, 5, 9);         // bande droite
    box(16, 6, 0, 3, -12, 5);        // contre-jour
    box(10, 5, 0, -2, 12, 2.5);      // fill avant, doux
    var pm = new T.PMREMGenerator(renderer);
    var rt = pm.fromScene(s, 0.035);
    pm.dispose();
    s.traverse(function (o) { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
    return rt;
  }

  /* ------------------------------------------------------------ géométries */
  function V(T, x, y) { return new T.Vector2(x, y); }
  function spline(T, arr, div) {
    var c = new T.SplineCurve(arr.map(function (p) { return V(T, p[0], p[1]); }));
    return c.getPoints(Math.max(2, arr.length * (div || 8)));
  }
  function raw(T, arr) { return arr.map(function (p) { return V(T, p[0], p[1]); }); }
  /* liquide : le profil du verre, rentré de d, jusqu'au niveau « lvl » */
  function inner(T, prof, d, lift, lvl) {
    var out = [], last = null;
    prof.forEach(function (p) {
      if (p.y + lift <= lvl) { last = V(T, Math.max(p.x - d, 0), p.y + lift); out.push(last); }
    });
    if (!out.length) return raw(T, [[0, lift], [0.1, lift], [0.1, lvl], [0, lvl]]);
    out[0].x = 0;
    out.push(V(T, last.x, lvl)); out.push(V(T, 0, lvl));
    return out;
  }
  function roundRect(T, w, d, r) {
    var s = new T.Shape(), x = -w / 2, y = -d / 2;
    s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.absarc(x + w - r, y + r, r, -Math.PI / 2, 0, false);
    s.lineTo(x + w, y + d - r); s.absarc(x + w - r, y + d - r, r, 0, Math.PI / 2, false);
    s.lineTo(x + r, y + d); s.absarc(x + r, y + d - r, r, Math.PI / 2, Math.PI, false);
    s.lineTo(x, y + r); s.absarc(x + r, y + r, r, Math.PI, Math.PI * 1.5, false);
    return s;
  }
  function roundBox(T, w, d, h, r, bevel) {
    var g = new T.ExtrudeGeometry(roundRect(T, w - 2 * bevel, d - 2 * bevel, Math.max(r - bevel, 0.01)),
      { depth: h - 2 * bevel, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 6, curveSegments: 20 });
    g.rotateX(-Math.PI / 2);                     // l'extrusion (z) devient la hauteur (y)
    g.computeBoundingBox(); g.translate(0, -g.boundingBox.min.y, 0);
    return g;
  }

  /* ------------------------------------------------------------ construction des modèles */
  function Ctx(T, cfg, P) {
    var capDef = CAPS[cfg.cap] || CAPS[P.cap] || CAPS.or;
    var glassDef = GLASS[cfg.glass] || GLASS[P.glass] || GLASS.clair;
    var liquidHex = /^#[0-9a-f]{6}$/i.test(cfg.liquid || '') ? cfg.liquid : P.liquid;
    var liq = new T.Color(liquidHex);
    var self = {
      group: new T.Group(), disposables: [],
      track: function (o) { self.disposables.push(o); return o; },
      glass: function (flat) {
        return self.track(new T.MeshPhysicalMaterial({
          color: 0xffffff, metalness: 0, roughness: 0.035, transmission: 1, thickness: 1.1, ior: 1.5,
          attenuationColor: new T.Color(glassDef.color), attenuationDistance: glassDef.dist,
          envMapIntensity: 1.35, clearcoat: 0.6, clearcoatRoughness: 0.03, side: T.DoubleSide, flatShading: !!flat
        }));
      },
      liquid: function () {
        return self.track(new T.MeshPhysicalMaterial({
          color: liq, emissive: liq.clone().multiplyScalar(0.28), roughness: 0.12, metalness: 0,
          clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 0.55, side: T.DoubleSide
        }));
      },
      metal: function () {
        return self.track(new T.MeshPhysicalMaterial({
          color: new T.Color(capDef.color), metalness: capDef.metal ? 1 : 0.15, roughness: capDef.metal ? 0.2 : 0.14,
          clearcoat: capDef.metal ? 0.2 : 1, clearcoatRoughness: 0.08, envMapIntensity: capDef.metal ? 1.5 : 1.1, side: T.DoubleSide
        }));
      },
      add: function (geo, mat, y) { var m = new T.Mesh(self.track(geo), mat); if (y) m.position.y = y; self.group.add(m); return m; },
      segs: 112
    };
    return self;
  }
  function lathe(T, pts, segs, a, b) { return new T.LatheGeometry(pts, segs, a, b); }
  function patch(C, T, pts, arc, tex) {
    /* morceau de cylindre (ou du profil du verre) légèrement en avant, sur lequel on colle l'étiquette */
    C.track(tex);
    var mat = C.track(new T.MeshStandardMaterial({ map: tex, roughness: .62, metalness: 0, side: T.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2 }));
    C.group.add(new T.Mesh(C.track(lathe(T, pts, 48, -arc / 2, arc)), mat));
  }

  function wine(C, T, cfg, o) {
    var W = {
      'vin-bordeaux':  { R: 0.55, body: 1.75, sh: [[0.55, 1.75], [0.535, 1.95], [0.47, 2.12], [0.35, 2.26], [0.23, 2.37], [0.172, 2.52]], neck: 3.28, lvl: 2.5 },
      'vin-bourgogne': { R: 0.58, body: 1.4,  sh: [[0.58, 1.4], [0.56, 1.66], [0.47, 1.96], [0.33, 2.2], [0.21, 2.4], [0.172, 2.56]],      neck: 3.2,  lvl: 2.45 },
      'vin-flute':     { R: 0.43, body: 2.0,  sh: [[0.43, 2.0], [0.415, 2.32], [0.33, 2.72], [0.22, 3.02], [0.172, 3.18]], neck: 3.72, lvl: 3.05 },
      'vin-champagne': { R: 0.49, body: 1.82, sh: [[0.49, 1.82], [0.47, 2.05], [0.36, 2.28], [0.24, 2.43], [0.18, 2.56]], neck: 3.22, lvl: 2.5 },
      'vin-rose-provence': { R: 0.48, body: 1.8, sh: [[0.48, 1.8], [0.47, 2.04], [0.39, 2.25], [0.27, 2.4], [0.18, 2.54]], neck: 3.18, lvl: 2.5 },
      'vin-magnum': { R: 0.63, body: 1.92, sh: [[0.63, 1.92], [0.61, 2.13], [0.49, 2.34], [0.32, 2.5], [0.18, 2.65]], neck: 3.4, lvl: 2.6 },
      'vin-demi': { R: 0.44, body: 1.42, sh: [[0.44, 1.42], [0.43, 1.61], [0.35, 1.78], [0.25, 1.9], [0.17, 2.02]], neck: 2.62, lvl: 2.0 },
      'vin-alsace': { R: 0.39, body: 2.05, sh: [[0.39, 2.05], [0.38, 2.32], [0.31, 2.67], [0.22, 2.98], [0.16, 3.12]], neck: 3.72, lvl: 3.0 }
    }[o.id] || { R: 0.55, body: 1.75, sh: [[0.55, 1.75], [0.535, 1.95], [0.47, 2.12], [0.35, 2.26], [0.23, 2.37], [0.172, 2.52]], neck: 3.28, lvl: 2.5 };
    var heel = spline(T, [[0, 0.1], [0.26, 0.055], [0.4, 0.0], [W.R - 0.03, 0.045], [W.R, 0.16]], 7);
    var body = raw(T, [[W.R, 0.3], [W.R, W.body - 0.12]]);
    var sh = spline(T, W.sh, 8);
    var nr = W.R > 0.6 ? 0.185 : (W.R < 0.42 ? 0.15 : 0.172);
    var neck = raw(T, [[nr, W.sh[W.sh.length - 1][1] + 0.12], [nr, W.neck - 0.1], [nr * 1.16, W.neck - 0.06], [nr * 1.25, W.neck], [nr * 1.1, W.neck + 0.07], [nr * 0.93, W.neck + 0.075]]);
    var prof = heel.concat(body, sh, neck);
    var glass = C.add(lathe(T, prof, C.segs), C.glass(false));
    glass.renderOrder = 1;
    C.add(lathe(T, inner(T, heel.concat(body, sh), 0.05, 0.1, W.lvl), C.segs), C.liquid());
    /* capsule */
    var capBot = W.neck - 0.62, top = W.neck + 0.1, capR = nr * 1.12;
    C.add(lathe(T, raw(T, [[capR * 0.94, capBot], [capR * 0.94, W.neck - 0.1], [capR * 1.1, W.neck - 0.06], [capR * 1.16, W.neck], [capR * 1.1, top - 0.05], [capR * 0.94, top], [0, top]]), 64), C.metal());
    if (o.id === 'vin-champagne') {
      /* Muselet stylisé : anneau métallique et trois fils fins, sans surcharge de géométrie. */
      C.add(new T.TorusGeometry(capR * 1.08, 0.012, 6, 32), C.metal(), W.neck - 0.12).rotation.x = Math.PI / 2;
      for (var wi = 0; wi < 3; wi++) { var wire = C.add(new T.TorusGeometry(capR * 0.78, 0.008, 5, 28), C.metal(), W.neck - 0.02 - wi * 0.07); wire.rotation.x = Math.PI / 2; }
    }
    /* étiquette : ~1,3 de large, proportions de l'étiquette dessinée (1024 × 760) */
    var arc = Math.min(1.0 / W.R, 2.0), lw = arc * W.R, y0 = 0.45, y1 = y0 + lw / 1.347;
    patch(C, T, raw(T, [[W.R + 0.004, y0], [W.R + 0.004, y1]]), arc, wineLabel(T, { brand: o.brand || 'Winfum', name: o.name, sub: o.sub }));
  }

  function perfume(C, T, cfg, o) {
    var id = o.id, tex = perfumeLabel(T, { brand: o.brand || 'Winfum', name: o.name });
    C.track(tex);
    var lblMat = C.track(new T.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
    if (id === 'parfum-carre') {
      var w = 1.75, d = 1.05, h = 2.0;
      var gl = C.add(roundBox(T, w, d, h, 0.22, 0.07), C.glass(false)); gl.renderOrder = 1;
      var lg = roundBox(T, w - 0.3, d - 0.3, h - 0.5, 0.12, 0.05); lg.translate(0, 0.26, 0);
      C.add(lg, C.liquid());
      C.add(new T.CylinderGeometry(0.2, 0.22, 0.2, 48), C.glass(false), h + 0.05).renderOrder = 1;
      C.add(new T.CylinderGeometry(0.27, 0.27, 0.16, 48), C.metal(), h + 0.2);
      C.add(roundBox(T, 0.66, 0.66, 0.78, 0.1, 0.05), C.metal(), h + 0.28);
      var lb = new T.Mesh(C.track(new T.PlaneGeometry(1.2, 0.8)), lblMat); lb.position.set(0, h * 0.5, d / 2 + 0.004); C.group.add(lb);
    } else {
      var prof, cap, lvl, y0, y1, lbW, lbH, collarY, capR, capH, flat = false;
      if (id === 'parfum-amphore' || id === 'parfum-coeur') {
        prof = spline(T, id === 'parfum-coeur' ? [[0,0.1],[0.34,0.06],[0.68,0.22],[0.78,0.48],[0.58,0.78],[0.36,1.02],[0.22,1.28],[0.19,1.5]] : [[0,0.1],[0.48,0.06],[0.76,0.18],[0.88,0.48],[0.84,0.86],[0.7,1.25],[0.46,1.62],[0.28,1.82],[0.22,1.94]], 8).concat(raw(T, [[0.22, 2.04], [0.22, 2.12]]));
        lvl = id === 'parfum-coeur' ? 0.92 : 1.58; collarY = 2.08; capR = 0.3; capH = 0.78;
      } else if (id === 'parfum-flacon-plat') {
        prof = raw(T, [[0,0.1],[0.42,0.06],[0.53,0.12],[0.53,1.62],[0.48,1.78],[0.28,1.92],[0.21,1.96],[0.21,2.08]]);
        lvl = 1.48; collarY = 2.03; capR = 0.29; capH = 0.72; flat = true;
      } else if (id === 'parfum-vaporisateur') {
        prof = spline(T, [[0,0.1],[0.38,0.06],[0.57,0.14],[0.6,0.3],[0.6,1.55],[0.53,1.76],[0.3,1.9],[0.2,1.94]], 7).concat(raw(T, [[0.2,2.05],[0.2,2.12]]));
        lvl = 1.62; collarY = 2.1; capR = 0.25; capH = 0.24;
      } else if (id === 'parfum-mini') {
        prof = spline(T, [[0,0.1],[0.32,0.06],[0.48,0.18],[0.48,0.86],[0.38,1.02],[0.22,1.12],[0.18,1.18]], 7).concat(raw(T, [[0.18,1.28],[0.18,1.34]]));
        lvl = 0.84; collarY = 1.31; capR = 0.23; capH = 0.52;
      } else if (id === 'parfum-rond') {
        prof = spline(T, [[0, 0.1], [0.5, 0.06], [0.82, 0.27], [0.95, 0.76], [0.9, 1.25], [0.66, 1.66], [0.36, 1.87], [0.245, 1.99]], 8)
          .concat(raw(T, [[0.235, 2.1], [0.235, 2.2]]));
        lvl = 1.6; collarY = 2.16; capR = 0.31; capH = 1.0;
      } else if (id === 'parfum-cylindre') {
        prof = spline(T, [[0, 0.1], [0.4, 0.065], [0.57, 0.1], [0.6, 0.2]], 6).concat(raw(T, [[0.6, 0.4], [0.6, 1.95]]),
          spline(T, [[0.6, 1.95], [0.58, 2.08], [0.45, 2.17], [0.26, 2.2]], 6), raw(T, [[0.235, 2.26], [0.235, 2.36]]));
        lvl = 1.85; collarY = 2.32; capR = 0.37; capH = 0.98;
      } else { /* facetté */
        prof = raw(T, [[0, 0.12], [0.74, 0.04], [0.8, 0.13], [0.8, 1.7], [0.5, 2.02], [0.27, 2.1], [0.24, 2.2], [0.24, 2.3]]);
        lvl = 1.62; collarY = 2.26; capR = 0.34; capH = 0.95; flat = true;
      }
      var segs = flat ? 6 : C.segs;
      var gm = C.add(lathe(T, prof, segs), C.glass(flat)); gm.renderOrder = 1;
      var liqG = lathe(T, inner(T, prof, flat ? 0.1 : 0.075, 0.2, lvl), segs);
      var lm = C.add(liqG, C.liquid());
      if (flat) { gm.rotation.y = lm.rotation.y = Math.PI / 6; }  // une face plate vers l'avant
      C.add(new T.CylinderGeometry(capR * 0.86, capR * 0.86, 0.16, 48), C.metal(), collarY);
      var capG = lathe(T, raw(T, [[0, 0], [capR * 0.9, 0], [capR, 0.04], [capR, capH - 0.2]]).concat(
        spline(T, [[capR, capH - 0.2], [capR * 0.97, capH - 0.08], [capR * 0.7, capH - 0.01], [capR * 0.4, capH]], 5), raw(T, [[0, capH]])), 64);
      C.add(capG, C.metal(), collarY + 0.08);
      if (id === 'parfum-vaporisateur') {
        /* Pompe courte sous le capuchon et tube plongeur visible dans le liquide. */
        C.add(new T.CylinderGeometry(0.065, 0.065, 0.12, 20), C.metal(), collarY + 0.02);
        var tube = C.add(new T.CylinderGeometry(0.012, 0.012, 1.15, 8), C.glass(false), 0.62); tube.position.z = 0.015;
      }
      /* inscription */
      var bodyMax = 0; prof.forEach(function (p) { if (p.x > bodyMax) bodyMax = p.x; });
      if (flat) {
        var ap = bodyMax * Math.cos(Math.PI / 6);
        var pl = new T.Mesh(C.track(new T.PlaneGeometry(1.0, 0.66)), lblMat); pl.position.set(0, 0.95, ap + 0.004); C.group.add(pl);
      } else {
        var yy0 = id === 'parfum-mini' ? 0.38 : 0.55, yy1 = id === 'parfum-mini' ? 0.88 : (id === 'parfum-coeur' ? 0.86 : 1.55);
        var lp = prof.filter(function (p) { return p.y >= yy0 && p.y <= yy1; }).map(function (p) { return V(T, p.x + 0.004, p.y); });
        if (lp.length > 1) {
          var arc = (id === 'parfum-rond' || id === 'parfum-amphore' || id === 'parfum-coeur') ? 1.35 : 1.15;
          C.group.add(new T.Mesh(C.track(lathe(T, lp, 48, -arc / 2, arc)), lblMat));
        }
      }
    }
  }

  /* ------------------------------------------------------------ montage */
  function mount(el, cfg, isStale) {
    cfg = cfg || {}; isStale = isStale || function () { return false; };
    var pr = preset(cfg.model), glb = cfg.glb && /^https?:\/\//i.test(cfg.glb) ? cfg.glb : '';
    if (!pr && !glb) return Promise.reject(new Error('Aucun modèle'));
    if (!webgl()) return Promise.reject(new Error('WebGL indisponible'));

    var box = document.createElement('div'); box.className = 'w3d';
    box.innerHTML = '<div class="w3d-load"><i></i><span>Chargement 3D…</span></div>';
    el.innerHTML = ''; el.appendChild(box);

    var steps = [loadThree()];
    if (glb) steps.push(loadThree().then(function () { return window.THREE.GLTFLoader ? 0 : loadScript(GLTF_URL); }));
    var fontsReady = (document.fonts && document.fonts.load)
      ? Promise.all([document.fonts.load('italic 600 40px "Cormorant Garamond"'), document.fonts.load('600 30px "Cinzel"')]).catch(function () {})
      : Promise.resolve();
    steps.push(fontsReady);

    return Promise.all(steps).then(function () {
      if (isStale()) throw new Error('obsolete');
      var T = window.THREE, disposed = false, raf = 0, io = null, ro = null;
      var rect = el.getBoundingClientRect();
      var W = Math.max(200, Math.round(rect.width || el.clientWidth || 360)), H = Math.max(200, Math.round(rect.height || el.clientHeight || 360));

      var renderer;
      try { renderer = new T.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' }); }
      catch (e) { box.remove(); throw e; }
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setSize(W, H, false);
      renderer.outputEncoding = T.sRGBEncoding;
      renderer.toneMapping = T.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.05;
      renderer.setClearColor(0xffffff, 1);
      var cv = renderer.domElement; cv.className = 'w3d-cv'; cv.style.cssText = 'display:block;width:100%;height:100%;touch-action:pan-y;cursor:grab;outline:none';
      cv.setAttribute('role', 'img'); cv.setAttribute('aria-label', 'Vue 3D du produit : faites glisser pour le faire tourner');
      box.appendChild(cv);

      var scene = new T.Scene();
      var envRT = studioEnv(T, renderer); scene.environment = envRT.texture;
      var cam = new T.PerspectiveCamera(28, W / H, 0.1, 100);

      var bg = new T.Mesh(new T.PlaneGeometry(60, 60), new T.MeshBasicMaterial({ map: bgTex(T), toneMapped: false, depthWrite: false }));
      bg.position.set(0, 0, -14); scene.add(bg);
      var key = new T.DirectionalLight(0xffffff, 1.1); key.position.set(3, 6, 5); scene.add(key);

      var C = Ctx(T, cfg, pr || { liquid: '#e6bf72', cap: 'or', glass: 'clair' });
      var info = { id: pr && pr.id, name: cfg.name || '', brand: cfg.brand || 'Winfum', sub: cfg.sub || '' };
      var pivot = new T.Group(), model = null;
      function finishModel(obj) {
        model = obj; pivot.add(obj);
        var bb = new T.Box3().setFromObject(obj), size = bb.getSize(new T.Vector3()), ctr = bb.getCenter(new T.Vector3());
        var s = 2.7 / Math.max(size.y, 0.001); obj.scale.setScalar(s);
        obj.position.set(-ctr.x * s, -ctr.y * s, -ctr.z * s);
        return s;
      }
      var baseD = 9, zoom = 1;
      function setCam() { cam.position.set(0, 0.18, baseD / zoom); cam.lookAt(0, -0.02, 0); }
      function placeCamera(hh, ww) {
        var vf = cam.fov * Math.PI / 360, aspect = cam.aspect;
        var dH = (hh / 2) / Math.tan(vf), dW = (ww / 2) / (Math.tan(vf) * aspect);
        baseD = Math.max(dH, dW) / 0.78; setCam();
      }
      var modelW = 2.0, modelH = 2.7;

      var ready;
      if (pr) {
        if (/^vin/.test(pr.id)) wine(C, T, cfg, info); else perfume(C, T, cfg, info);
        finishModel(C.group);
        ready = Promise.resolve();
      } else {
        ready = new Promise(function (ok, ko) {
          new T.GLTFLoader().load(glb, function (g) {
            g.scene.traverse(function (n) { if (n.isMesh && n.material) { n.material.envMapIntensity = 1.2; } });
            finishModel(g.scene); ok();
          }, undefined, function () { ko(new Error('Fichier 3D illisible')); });
        });
      }
      return ready.then(function () {
        if (disposed || isStale()) {
          envRT.dispose(); renderer.dispose(); try { renderer.forceContextLoss(); } catch (e) {}
          if (box.parentNode) box.parentNode.removeChild(box);
          throw new Error('obsolete');
        }
        var bb = new T.Box3().setFromObject(pivot), sz = bb.getSize(new T.Vector3());
        modelH = sz.y; modelW = Math.max(sz.x, sz.z);
        placeCamera(modelH, modelW);

        var sh = new T.Mesh(new T.PlaneGeometry(1, 1), new T.MeshBasicMaterial({ map: shadowTex(T), transparent: true, depthWrite: false, toneMapped: false }));
        sh.rotation.x = -Math.PI / 2; sh.scale.set(modelW * 2.1, modelW * 2.1 * 0.7, 1); sh.position.y = -modelH / 2 + 0.005; scene.add(sh);
        scene.add(pivot);

        var load = box.querySelector('.w3d-load'); if (load) load.remove();
        var hint = document.createElement('div'); hint.className = 'w3d-hint'; hint.innerHTML = '<span>↔ Tournez à 360° · pincez pour zoomer</span>'; box.appendChild(hint);

        /* ----- interaction : tourner à 360°, petit zoom (pincer / molette), puis retour très lent à la position d'origine ----- */
        var BASE = -0.35, yaw = BASE, vy = 0, zoomT = 1, idle = 0, ptrs = {}, np = 0, pinch0 = 0, zoom0 = 1, lx = 0, quickReset = false;
        function stopHint() { hint.classList.add('off'); }
        function clampZ(z) { return Math.max(1, Math.min(1.75, z)); }
        function dist() { var k = Object.keys(ptrs), a = ptrs[k[0]], b = ptrs[k[1]]; return Math.hypot(a.x - b.x, a.y - b.y) || 1; }
        cv.addEventListener('pointerdown', function (e) {
          ptrs[e.pointerId] = { x: e.clientX, y: e.clientY }; np = Object.keys(ptrs).length; lx = e.clientX; vy = 0; idle = 0; stopHint();
          if (np === 2) { pinch0 = dist(); zoom0 = zoom; }
          try { cv.setPointerCapture(e.pointerId); } catch (x) {} cv.style.cursor = 'grabbing';
        });
        cv.addEventListener('pointermove', function (e) {
          if (!ptrs[e.pointerId]) return;
          ptrs[e.pointerId] = { x: e.clientX, y: e.clientY }; idle = 0;
          if (np >= 2) { zoom = zoomT = clampZ(zoom0 * dist() / pinch0); setCam(); return; }
          var dx = e.clientX - lx; lx = e.clientX; yaw += dx * 0.011; vy = dx * 0.011;
        });
        function up(e) { delete ptrs[e.pointerId]; np = Object.keys(ptrs).length; idle = 0; if (np === 1) lx = ptrs[Object.keys(ptrs)[0]].x; if (!np) cv.style.cursor = 'grab'; }
        cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up); cv.addEventListener('lostpointercapture', up);
        cv.addEventListener('wheel', function (e) { e.preventDefault(); zoom = zoomT = clampZ(zoom * Math.exp(-e.deltaY * 0.0015)); idle = 0; stopHint(); setCam(); }, { passive: false });
        function resetFast() { quickReset = true; vy = 0; idle = 99; }
        cv.addEventListener('dblclick', resetFast);
        var lastTap = 0; cv.addEventListener('pointerup', function (e) { var now = Date.now(); if (now - lastTap < 320) resetFast(); lastTap = now; });

        var last = performance.now();
        function frame(t) {
          raf = requestAnimationFrame(frame);
          var dt = Math.min(0.05, (t - last) / 1000); last = t;
          if (!np) {
            if (Math.abs(vy) > 0.0004) { yaw += vy; vy *= 0.95; } else vy = 0;
            idle += dt;
            if (idle > 1.5 && Math.abs(vy) < 0.002) {            /* retour doux vers la face avant en environ 2 à 3 secondes */
              var k = 1 - Math.exp(-dt * (quickReset ? 5.5 : 0.58)), tgt = BASE + Math.PI * 2 * Math.round((yaw - BASE) / (Math.PI * 2));
              yaw += (tgt - yaw) * k;
              if (Math.abs(zoom - 1) > 0.0005) { zoom += (1 - zoom) * k; setCam(); }
              if (Math.abs(tgt - yaw) < 0.002 && Math.abs(zoom - 1) < 0.002) { yaw = tgt; zoom = zoomT = 1; quickReset = false; setCam(); }
            }
          }
          pivot.rotation.y = yaw;
          renderer.render(scene, cam);
        }
        function start() { if (!raf && !disposed) { last = performance.now(); raf = requestAnimationFrame(frame); } }
        function stop() { if (raf) { cancelAnimationFrame(raf); raf = 0; } }
        if (window.IntersectionObserver) { io = new IntersectionObserver(function (en) { en[0].isIntersecting ? start() : stop(); }, { threshold: 0.05 }); io.observe(cv); }
        else start();
        function onVis() { document.hidden ? stop() : start(); }
        document.addEventListener('visibilitychange', onVis);

        function resize() {
          var r = el.getBoundingClientRect(), w = Math.round(r.width), h = Math.round(r.height);
          if (w < 50 || h < 50) return;
          renderer.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); placeCamera(modelH, modelW);
        }
        if (window.ResizeObserver) { ro = new ResizeObserver(resize); ro.observe(el); }

        function dispose() {
          if (disposed) return; disposed = true; stop();
          if (io) io.disconnect(); if (ro) ro.disconnect();
          document.removeEventListener('visibilitychange', onVis);
          scene.traverse(function (o) {
            if (o.geometry) o.geometry.dispose();
            if (o.material) { [].concat(o.material).forEach(function (m) { if (m.map) m.map.dispose(); m.dispose(); }); }
          });
          C.disposables.forEach(function (d) { try { d.dispose(); } catch (e) {} });
          envRT.dispose(); renderer.dispose();
          try { renderer.forceContextLoss(); } catch (e) {}
          if (box.parentNode) box.parentNode.removeChild(box);
        }
        if (window.__winfum3d && window.__winfum3d !== api) { try { window.__winfum3d.dispose(); } catch (e) {} }
        var api = { dispose: dispose };
        window.__winfum3d = api;
        return api;
      });
    }).catch(function (e) { if (box.parentNode) box.parentNode.removeChild(box); throw e; });
  }

  /* un seul contexte WebGL à la fois : on libère le précédent avant d'en créer un autre */
  var rawMount = mount, seq = 0;
  mount = function (el, cfg) {
    var my = ++seq;
    if (window.__winfum3d) { try { window.__winfum3d.dispose(); } catch (e) {} window.__winfum3d = null; }
    return rawMount(el, cfg, function () { return my !== seq; });
  };

  window.Winfum3D = { PRESETS: PRESETS, GLASS: GLASS, CAPS: CAPS, has: has, preset: preset, mount: mount };
})();
