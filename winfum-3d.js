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
    { id: 'vin-flute',       label: 'Bouteille flûte (blanc / rosé)', dept: 'vin',  liquid: '#e9d88a', cap: 'or',     glass: 'clair' }
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
  function has(d) { d = d || {}; return !!(d.model3d === 'photo' || preset(d.model3d) || (d.model3d_glb && /^https?:\/\//i.test(d.model3d_glb))); }

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
      gr.addColorStop(0, '#ffffff'); gr.addColorStop(.72, '#ffffff'); gr.addColorStop(1, '#ffffff');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
    });
  }
  function shadowTex(T) {
    return canvasTex(T, 256, 256, function (g, w, h) {
      var gr = g.createRadialGradient(w / 2, h / 2, 4, w / 2, h / 2, w / 2);
      gr.addColorStop(0, 'rgba(28,24,20,.30)'); gr.addColorStop(.5, 'rgba(28,24,20,.10)'); gr.addColorStop(1, 'rgba(40,28,14,0)');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
    }, false);
  }

  /* ------------------------------------------------------------ environnement « studio » (reflets du verre) */
  function studioEnv(T, renderer) {
    var s = new T.Scene();
    var room = new T.Mesh(new T.BoxGeometry(30, 30, 30), new T.MeshBasicMaterial({ color: new T.Color(0.05, 0.05, 0.05), side: T.BackSide }));
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
      'vin-flute':     { R: 0.43, body: 2.0,  sh: [[0.43, 2.0], [0.415, 2.32], [0.33, 2.72], [0.22, 3.02], [0.172, 3.18]],                  neck: 3.72, lvl: 3.05 }
    }[o.id];
    var heel = spline(T, [[0, 0.1], [0.26, 0.055], [0.4, 0.0], [W.R - 0.03, 0.045], [W.R, 0.16]], 7);
    var body = raw(T, [[W.R, 0.3], [W.R, W.body - 0.12]]);
    var sh = spline(T, W.sh, 8);
    var neck = raw(T, [[0.172, W.sh[W.sh.length - 1][1] + 0.12], [0.172, W.neck - 0.1], [0.2, W.neck - 0.06], [0.215, W.neck], [0.19, W.neck + 0.07], [0.16, W.neck + 0.075]]);
    var prof = heel.concat(body, sh, neck);
    var glass = C.add(lathe(T, prof, C.segs), C.glass(false));
    glass.renderOrder = 1;
    C.add(lathe(T, inner(T, heel.concat(body, sh), 0.05, 0.1, W.lvl), C.segs), C.liquid());
    /* capsule */
    var capBot = W.neck - 0.62, top = W.neck + 0.1;
    C.add(lathe(T, raw(T, [[0.18, capBot], [0.18, W.neck - 0.1], [0.212, W.neck - 0.06], [0.226, W.neck + 0.0], [0.215, top - 0.05], [0.185, top], [0, top]]), 64), C.metal());
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
      if (id === 'parfum-rond') {
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
      /* inscription */
      var bodyMax = 0; prof.forEach(function (p) { if (p.x > bodyMax) bodyMax = p.x; });
      if (flat) {
        var ap = bodyMax * Math.cos(Math.PI / 6);
        var pl = new T.Mesh(C.track(new T.PlaneGeometry(1.0, 0.66)), lblMat); pl.position.set(0, 0.95, ap + 0.004); C.group.add(pl);
      } else {
        var yy0 = id === 'parfum-rond' ? 0.55 : 0.55, yy1 = id === 'parfum-rond' ? 1.4 : 1.55;
        var lp = prof.filter(function (p) { return p.y >= yy0 && p.y <= yy1; }).map(function (p) { return V(T, p.x + 0.004, p.y); });
        if (lp.length > 1) {
          var arc = id === 'parfum-rond' ? 1.45 : 1.55;
          C.group.add(new T.Mesh(C.track(lathe(T, lp, 48, -arc / 2, arc)), lblMat));
        }
      }
    }
  }

  /* ------------------------------------------------------------ montage */

  /* ------------------------------------------------------------ MODÈLE « D'APRÈS LA PHOTO » ------------------------------------------------------------
     La photo du produit (fond blanc, vue de face) est analysée dans le navigateur : silhouette → forme exacte du flacon,
     capuchon (or / noir), couleur réelle du liquide, et l'ÉTIQUETTE RÉELLE est découpée dans la photo puis collée sur la face avant.
     Les côtés et l'arrière n'ont pas d'étiquette : on voit le verre et le liquide. */
  /* Analyse d'une photo produit (fond blanc, vue de face) : silhouette, capuchon, étiquette, couleur du liquide.
     px = Uint8ClampedArray RGBA, w,h. dept = 'parfum' | 'vin'. Renvoie null si la photo est inexploitable. */
  function analyzePhoto(px, w, h, dept) {
    var OUT = 70;
    function P(x, y) { var i = (y * w + x) * 4; return [px[i], px[i + 1], px[i + 2]]; }
    function bgd(x, y) { var i = (y * w + x) * 4; return 765 - px[i] - px[i + 1] - px[i + 2]; }
    function med(a, k) {
      var o = new Float32Array(a.length), t = [];
      for (var i = 0; i < a.length; i++) {
        t.length = 0;
        for (var j = Math.max(0, i - k); j <= Math.min(a.length - 1, i + k); j++) t.push(a[j]);
        t.sort(function (p, q) { return p - q; }); o[i] = t[t.length >> 1];
      }
      return o;
    }
    /* 1. silhouette : premier / dernier pixel « non blanc » de chaque ligne (série d'au moins 3 pixels) */
    var L = new Float32Array(h).fill(-1), R = new Float32Array(h).fill(-1), y, x, run;
    for (y = 0; y < h; y++) {
      run = 0; for (x = 0; x < w; x++) { if (bgd(x, y) > OUT) { if (++run >= 3) { L[y] = x - 2; break; } } else run = 0; }
      if (L[y] < 0) continue;
      run = 0; for (x = w - 1; x >= 0; x--) { if (bgd(x, y) > OUT) { if (++run >= 3) { R[y] = x + 2; break; } } else run = 0; }
    }
    var ok = function (yy) { return L[yy] >= 0 && R[yy] - L[yy] >= 6; };
    var yTop = -1, yBot = -1;
    for (y = 0; y < h - 6; y++) { var g = true; for (var k = 0; k < 6; k++) if (!ok(y + k)) g = false; if (g) { yTop = y; break; } }
    for (y = h - 1; y >= 6; y--) { var g2 = true; for (var k2 = 0; k2 < 6; k2++) if (!ok(y - k2)) g2 = false; if (g2) { yBot = y; break; } }
    if (yTop < 0 || yBot - yTop < h * 0.3) return null;
    var H = yBot - yTop + 1;
    var Ls = med(L, 3), Rs = med(R, 3);
    var cxs = []; for (y = yTop; y <= yBot; y++) cxs.push((Ls[y] + Rs[y]) / 2); cxs.sort(function (a, b) { return a - b; });
    var cx = cxs[cxs.length >> 1];
    var half = new Float32Array(h); for (y = yTop; y <= yBot; y++) half[y] = Math.max(2, (Rs[y] - Ls[y]) / 2);

    /* 2. capuchon (or ou noir), du haut vers le bas */
    var gold = function (r, g, b) { return r > 150 && r - b > 70 && g > 80 && r - g < 130; };
    var black = function (r, g, b) { return r + g + b < 170 && Math.max(r, g, b) - Math.min(r, g, b) < 60; };
    var nG = 0, nB = 0, n = 0;
    for (y = yTop; y < yTop + H * 0.12; y++) for (x = Math.round(Ls[y]); x <= Rs[y]; x += 2) { var c = P(x, y); n++; if (gold(c[0], c[1], c[2])) nG++; if (black(c[0], c[1], c[2])) nB++; }
    var capKind = nG > nB ? 'gold' : 'black', isCap = capKind === 'gold' ? gold : black;
    var capBottom = -1, miss = 0, hs = [];
    for (y = Math.round(yTop + H * 0.03); y <= yTop + H * 0.1; y++) hs.push(half[y]);
    hs.sort(function (a, b) { return a - b; }); var capHalf = hs[hs.length >> 1] || 10;
    for (y = yTop; y < yTop + H * 0.6; y++) {
      var cnt = 0, tot = 0;
      for (x = Math.round(Ls[y]); x <= Rs[y]; x += 2) { var c2 = P(x, y); tot++; if (isCap(c2[0], c2[1], c2[2])) cnt++; }
      if (tot && cnt / tot >= 0.3 && half[y] <= capHalf * 1.3) { capBottom = y; miss = 0; } else if (++miss > 8) break;
    }
    if (capBottom - yTop < H * 0.07) capBottom = -1;
    var capRGB = [200, 160, 60];
    if (capBottom > 0 && capKind === 'gold') {
      var rs = [], gs = [], bs = [];
      for (y = yTop + 4; y < capBottom - 2; y += 2) for (x = Math.round(cx - half[y] * 0.5); x <= cx + half[y] * 0.5; x += 3) { var c3 = P(x, y); if (gold(c3[0], c3[1], c3[2])) { rs.push(c3[0]); gs.push(c3[1]); bs.push(c3[2]); } }
      var m = function (a) { a.sort(function (p, q) { return p - q; }); return a[a.length >> 1] || 0; };
      if (rs.length) capRGB = [m(rs), m(gs), m(bs)];
    }
    var maxHalf = 0; for (y = Math.max(capBottom, yTop); y <= yBot; y++) if (half[y] > maxHalf) maxHalf = half[y];
    var shoulder = Math.max(capBottom, yTop); for (y = shoulder; y <= yBot; y++) if (half[y] >= 0.6 * maxHalf) { shoulder = y; break; }

    /* 3. étiquette */
    var x0b = Math.round(cx - maxHalf), x1b = Math.round(cx + maxHalf), label = null, bw = x1b - x0b;
    function bbox(testFn, yA, yB, minRow, minCol) {
      var rowC = new Float32Array(h), colC = new Float32Array(w), xx, yy;
      for (yy = yA; yy <= yB; yy++) for (xx = Math.max(0, x0b); xx <= Math.min(w - 1, x1b); xx++) { var q = P(xx, yy); if (testFn(q[0], q[1], q[2])) { rowC[yy]++; colC[xx]++; } }
      var mr = 0, mc = 0; for (yy = yA; yy <= yB; yy++) mr = Math.max(mr, rowC[yy]); for (xx = 0; xx < w; xx++) mc = Math.max(mc, colC[xx]);
      var ya = -1, yb = -1, xa = -1, xb = -1;
      for (yy = yA; yy <= yB; yy++) if (rowC[yy] >= minRow * mr) { if (ya < 0) ya = yy; yb = yy; }
      for (xx = 0; xx < w; xx++) if (colC[xx] >= minCol * mc) { if (xa < 0) xa = xx; xb = xx; }
      return ya < 0 || xa < 0 ? null : { x0: xa, y0: ya, x1: xb, y1: yb };
    }
    if (dept === 'vin') {
      var cream = function (r, g, b) { return r > 195 && g > 180 && b > 120 && r - b > 18 && b < r; };
      var bb = bbox(cream, shoulder, yBot, 0.6, 0.5);
      if (bb && bb.x1 - bb.x0 > bw * 0.45 && bb.y1 - bb.y0 > H * 0.1) {
        var hh = Math.round((bb.x1 - bb.x0) * 1.08);                      // proportions d'étiquette de vin
        if (Math.abs((bb.y1 - bb.y0) - hh) > hh * 0.1) bb.y1 = Math.min(yBot - 6, bb.y0 + hh);
        label = bb;
      }
    } else {
      var green = function (r, g, b) { return g > r + 25 && g > b + 55 && g > 150; };
      var gb = null, rowG = new Float32Array(h), yy2;
      for (yy2 = shoulder; yy2 <= yBot; yy2++) for (x = x0b; x <= x1b; x++) { var q2 = P(x, yy2); if (green(q2[0], q2[1], q2[2])) rowG[yy2]++; }
      var T = -1; for (yy2 = shoulder; yy2 <= yBot; yy2++) if (rowG[yy2] > 0.14 * bw) { T = yy2; break; }
      if (T > 0) {
        var xs0 = 1e9, xs1 = -1;
        for (yy2 = T; yy2 < T + bw * 0.12; yy2++) for (x = x0b; x <= x1b; x++) { var q3 = P(x, yy2); if (green(q3[0], q3[1], q3[2])) { if (x < xs0) xs0 = x; if (x > xs1) xs1 = x; } }
        var Wl = xs1 - xs0;
        if (Wl > bw * 0.45) {
          /* bord bas : plus forte arête horizontale dans la fenêtre attendue */
          var best = -1, bestE = -1;
          for (yy2 = Math.round(T + Wl * 1.2); yy2 <= Math.min(yBot - 2, Math.round(T + Wl * 1.42)); yy2++) {
            var E = 0; for (x = xs0 + Math.round(Wl * 0.12); x <= xs1 - Math.round(Wl * 0.12); x++) { var a1 = P(x, yy2 + 2), a0 = P(x, yy2 - 2); E += Math.abs(a1[0] + a1[1] + a1[2] - a0[0] - a0[1] - a0[2]); }
            if (E > bestE) { bestE = E; best = yy2; }
          }
          gb = { x0: xs0, y0: T, x1: xs1, y1: best };
        }
      }
      if (gb) label = gb;
      else {
        var plate = function (r, g, b) { return r > 190 && g > 140 && b < 150 && r - b > 60; };
        var pb = bbox(plate, shoulder, yBot, 0.5, 0.5);
        if (pb && pb.x1 - pb.x0 > bw * 0.45) label = pb;
      }
    }

    /* 4. couleur du liquide (médiane des pixels colorés, hors étiquette et reflets blancs) */
    var cr = [], cg = [], cb = [], c4, xx3;
    function take(xa, xb, ya, yb) {
      for (var yy3 = ya; yy3 <= yb; yy3 += 2) for (xx3 = Math.round(xa); xx3 <= xb; xx3 += 1) {
        c4 = P(xx3, yy3); if (Math.min(c4[0], c4[1], c4[2]) > 215) continue;   // reflet blanc / fond
        cr.push(c4[0]); cg.push(c4[1]); cb.push(c4[2]);
      }
    }
    if (label && dept !== 'vin') {
      var gapL = label.x0 - x0b, gapR = x1b - label.x1, ya2 = label.y0 + Math.round((label.y1 - label.y0) * 0.1), yb2 = label.y1 - Math.round((label.y1 - label.y0) * 0.1);
      if (gapL > 8) take(x0b + gapL * 0.3, x0b + gapL * 0.8, ya2, yb2);
      if (gapR > 8) take(x1b - gapR * 0.8, x1b - gapR * 0.3, ya2, yb2);
      if (label.y0 - shoulder > 14) take(cx - maxHalf * 0.5, cx + maxHalf * 0.5, shoulder + 4, label.y0 - 4);
      if (yBot - label.y1 > 14) take(cx - maxHalf * 0.5, cx + maxHalf * 0.5, label.y1 + 4, yBot - 6);
    } else {
      var yA = shoulder + Math.round(H * 0.04), yB = label ? label.y0 - Math.round(H * 0.015) : shoulder + Math.round(H * 0.45);
      if (yB <= yA + 6) { yA = shoulder; yB = Math.min(yBot, shoulder + Math.round(H * 0.3)); }
      take(cx - maxHalf * 0.55, cx + maxHalf * 0.55, yA, yB);
    }
    var mm = function (a) { a.sort(function (p, q) { return p - q; }); return a.length ? a[a.length >> 1] : 200; };
    var liquid = [mm(cr), mm(cg), mm(cb)];

    return {
      w: w, h: h, cx: cx, yTop: yTop, yBot: yBot, H: H, capBottom: capBottom, capKind: capKind, capRGB: capRGB,
      maxHalf: maxHalf, shoulder: shoulder, label: label, liquid: liquid,
      half: Array.prototype.slice.call(half), width: 2 * maxHalf, hwRatio: H / (2 * maxHalf)
    };
  }

  /* balayage d'une section « carré arrondi » le long de la silhouette (fonction pure, testable) */
  function sweepArrays(rings, K, flip) {
    var pos = new Float32Array(rings.length * K * 3), idx = [], i, k, t, ct, st, o, r;
    for (i = 0; i < rings.length; i++) {
      r = rings[i];
      for (k = 0; k < K; k++) {
        t = Math.PI * 2 * k / K; ct = Math.cos(t); st = Math.sin(t); o = (i * K + k) * 3;
        var f = r.rib ? 1 + r.rib.amp * Math.cos(t * r.rib.count) : 1;
        pos[o] = f * r.a * (ct < 0 ? -1 : 1) * Math.pow(Math.abs(ct), 2 / r.n);
        pos[o + 1] = r.y;
        pos[o + 2] = f * r.d * (st < 0 ? -1 : 1) * Math.pow(Math.abs(st), 2 / r.n);
      }
    }
    for (i = 0; i < rings.length - 1; i++) for (k = 0; k < K; k++) {
      var a = i * K + k, b = i * K + (k + 1) % K, c = (i + 1) * K + k, d = (i + 1) * K + (k + 1) % K;
      if (flip) idx.push(a, c, b, b, c, d); else idx.push(a, b, c, b, d, c);
    }
    return { pos: pos, idx: idx };
  }
  /* sens des triangles : vers l'extérieur ? (sinon on inverse) */
  function sweepFlip() {
    var rg = [{ y: 0, a: 1, d: 1, n: 2 }, { y: 1, a: 1, d: 1, n: 2 }], q = sweepArrays(rg, 8, false), P = q.pos, I = q.idx;
    var ax = P[I[1] * 3] - P[I[0] * 3], ay = P[I[1] * 3 + 1] - P[I[0] * 3 + 1], az = P[I[1] * 3 + 2] - P[I[0] * 3 + 2];
    var bx = P[I[2] * 3] - P[I[0] * 3], by = P[I[2] * 3 + 1] - P[I[0] * 3 + 1], bz = P[I[2] * 3 + 2] - P[I[0] * 3 + 2];
    var nx = ay * bz - az * by, nz = ax * by - ay * bx;
    return (nx * P[I[0] * 3] + nz * P[I[0] * 3 + 2]) < 0;
  }

  function loadPhoto(url, dept) {
    return new Promise(function (ok, ko) {
      var img = new Image(); img.crossOrigin = 'anonymous';
      img.onload = function () {
        try {
          var sc = Math.min(1, 640 / Math.max(img.naturalWidth, img.naturalHeight)), w = Math.round(img.naturalWidth * sc), h = Math.round(img.naturalHeight * sc);
          var c = document.createElement('canvas'); c.width = w; c.height = h;
          var g = c.getContext('2d', { willReadFrequently: true }); g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); g.drawImage(img, 0, 0, w, h);
          var A = analyzePhoto(g.getImageData(0, 0, w, h).data, w, h, dept);
          if (!A) return ko(new Error('Photo inexploitable pour la 3D (fond blanc, produit de face)'));
          ok({ A: A, img: img });
        } catch (e) { ko(new Error('Photo illisible (accès refusé par le stockage)')); }
      };
      img.onerror = function () { ko(new Error('Photo introuvable')); };
      img.src = url;
    });
  }

  function photoModel(C, T, cfg, ph) {
    var A = ph.A, img = ph.img, dept = cfg.dept === 'vin' ? 'vin' : 'parfum';
    var s = 2.7 / A.H, half = A.half, cx = A.cx, yTop = A.yTop, yBot = A.yBot, maxA = A.maxHalf * s;
    var DR = (+cfg.depth > 0) ? Math.max(0.3, Math.min(1.1, +cfg.depth)) : (dept === 'vin' ? 1 : 0.62), N0 = dept === 'vin' ? 2 : 4.2;   // vin : section ronde
    function Y(py) { return (yBot - py) * s; }
    function aAt(py) { return half[Math.max(yTop, Math.min(yBot, Math.round(py)))] * s; }
    function sec(a) { var t = Math.max(0, Math.min(1, (a / maxA - 0.35) / 0.45)), sm = t * t * (3 - 2 * t); return { d: a * (1 + (DR - 1) * sm), n: 2 + (N0 - 2) * sm }; }
    var flip = sweepFlip(), bodyTop = A.capBottom > 0 ? A.capBottom : yTop;

    /* capuchon : forme exacte d'après la silhouette. Noir = plastique mat avec nervures de préhension et bague ; doré = métal satiné */
    if (A.capBottom > 0) {
      var goldCap = A.capKind === 'gold', cc = A.capRGB, capH = Math.max(4, A.capBottom - yTop), py, cr = [];
      var capMat = C.track(new T.MeshPhysicalMaterial(goldCap
        ? { color: new T.Color(cc[0] / 255, cc[1] / 255, cc[2] / 255).convertSRGBToLinear(), metalness: 1, roughness: 0.43, envMapIntensity: 0.9, clearcoat: 0, side: T.DoubleSide }
        : { color: 0x1b1b1d, metalness: 0, roughness: 0.62, clearcoat: 0, envMapIntensity: 0.3, side: T.DoubleSide }));
      cr.push({ y: Y(A.capBottom), a: 0.0005, d: 0.0005, n: 2 });
      for (py = A.capBottom; py >= yTop; py -= 2) {
        var ca = Math.max(0.01, aAt(py)), tt = (A.capBottom - py) / capH;
        cr.push({ y: Y(py), a: ca, d: ca, n: 2, rib: (!goldCap && tt > 0.2 && tt < 0.92) ? { amp: 0.02, count: 44 } : null });
      }
      cr.push({ y: Y(yTop), a: 0.0005, d: 0.0005, n: 2 });
      C.add(geo(cr, 176), capMat);
    }

    function ringsFor(inset, y0px, y1px, baseW) {
      var r = [], py, a, q;
      var yb = Math.max(Y(y0px), baseW || 0);
      r.push({ y: yb, a: 0.0005, d: 0.0005, n: 2 });
      for (py = y0px; py >= y1px; py -= 3) {
        if (Y(py) < yb) continue;
        a = aAt(py); q = sec(a);
        r.push({ y: Y(py), a: Math.max(0.01, a - inset), d: Math.max(0.01, q.d - inset), n: q.n });
      }
      r.push({ y: Y(y1px), a: 0.0005, d: 0.0005, n: 2 });
      return r;
    }
    function geo(rings, K) {
      var q = sweepArrays(rings, K || 72, flip), g = new T.BufferGeometry();
      g.setAttribute('position', new T.BufferAttribute(q.pos, 3));
      g.setIndex(new T.BufferAttribute(new Uint16Array(q.idx), 1));
      g.computeVertexNormals(); return g;
    }
    /* liquide : couleur mesurée sur la photo (modifiable dans l'admin) */
    var lq = /^#[0-9a-f]{6}$/i.test(cfg.liquid || '') ? new T.Color(cfg.liquid) : new T.Color(A.liquid[0] / 255, A.liquid[1] / 255, A.liquid[2] / 255).convertSRGBToLinear();
    var liqTop = dept === 'vin' ? A.capBottom + (A.shoulder - A.capBottom) * 0.55 : A.shoulder + A.H * 0.015;
    if (!(liqTop > bodyTop + 4)) liqTop = bodyTop + A.H * 0.1;
    var wall = 0.055, base = dept === 'vin' ? 0.07 : 0.13;
    C.add(geo(ringsFor(wall, yBot, liqTop, base)), C.track(new T.MeshPhysicalMaterial({
      color: lq, emissive: lq.clone().multiplyScalar(0.025), roughness: 0.68, metalness: 0, clearcoat: 0.05, envMapIntensity: 0.08, side: T.DoubleSide })));

    /* verre : uniquement des reflets de studio nets (pas de voile blanc) */
    var glassGeo = geo(ringsFor(0, yBot, bodyTop, 0));
    var gm = C.add(glassGeo, C.track(new T.MeshStandardMaterial({
      color: 0x000000, metalness: 1, roughness: 0.09, envMapIntensity: 0.5, transparent: true, blending: T.AdditiveBlending, depthWrite: false, side: T.FrontSide })));
    gm.renderOrder = 3;
    /* épaisseur du verre : bords légèrement sombres (effet Fresnel), centre parfaitement clair */
    var edge = C.add(glassGeo, C.track(new T.ShaderMaterial({
      transparent: true, depthWrite: false, side: T.FrontSide,
      vertexShader: 'varying vec3 vN; varying vec3 vV; void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'varying vec3 vN; varying vec3 vV; void main(){ float f = 1.0 - abs(dot(normalize(vN), normalize(vV))); f = pow(f, 2.4); gl_FragColor = vec4(vec3(0.09, 0.10, 0.10), f * 0.55); }'
    })));
    edge.renderOrder = 3;

    /* étiquette réelle découpée dans la photo */
    var lb = A.label;
    if (cfg.labelRect) {
      var q4 = String(cfg.labelRect).split(',').map(Number);
      if (q4.length === 4 && q4.every(isFinite) && q4[2] > q4[0] && q4[3] > q4[1]) lb = { x0: q4[0] * A.w / 100, y0: q4[1] * A.h / 100, x1: q4[2] * A.w / 100, y1: q4[3] * A.h / 100 };
    }
    if (lb) {
      var k = img.naturalWidth / A.w, pad = 1.5;
      var sx = Math.max(0, (lb.x0 - pad) * k), sy = Math.max(0, (lb.y0 - pad) * k), sw = Math.min(img.naturalWidth - sx, (lb.x1 - lb.x0 + 2 * pad) * k), sh = Math.min(img.naturalHeight - sy, (lb.y1 - lb.y0 + 2 * pad) * k);
      var tw = Math.min(1024, Math.round(sw)), th = Math.round(tw * sh / sw);
      var cv2 = document.createElement('canvas'); cv2.width = tw; cv2.height = th;
      cv2.getContext('2d').drawImage(img, sx, sy, sw, sh, 0, 0, tw, th);
      var tex = new T.CanvasTexture(cv2); tex.encoding = T.sRGBEncoding; tex.anisotropy = 8; C.track(tex);
      var NC = 28, rows = [], pyy;
      for (pyy = lb.y0 - pad; pyy <= lb.y1 + pad; pyy += 2) rows.push(pyy);
      var wl = (lb.x1 - lb.x0 + 2 * pad) * s, xlc = ((lb.x0 + lb.x1) / 2 - cx) * s, pos = new Float32Array(rows.length * (NC + 1) * 3), uv = new Float32Array(rows.length * (NC + 1) * 2), id2 = [], i, j;
      for (i = 0; i < rows.length; i++) {
        var a2 = aAt(rows[i]), q2 = sec(a2), v = (rows[i] - (lb.y0 - pad)) / ((lb.y1 + pad) - (lb.y0 - pad));
        for (j = 0; j <= NC; j++) {
          var u = j / NC, xo = xlc + (u - 0.5) * wl, ratio = Math.min(0.995, Math.abs(xo) / Math.max(a2, 0.01)), o = (i * (NC + 1) + j);
          pos[o * 3] = xo; pos[o * 3 + 1] = Y(rows[i]); pos[o * 3 + 2] = q2.d * Math.pow(1 - Math.pow(ratio, q2.n), 1 / q2.n) + 0.004;
          uv[o * 2] = u; uv[o * 2 + 1] = 1 - v;
        }
      }
      for (i = 0; i < rows.length - 1; i++) for (j = 0; j < NC; j++) {
        var r0 = i * (NC + 1) + j, r1 = (i + 1) * (NC + 1) + j;
        id2.push(r0, r1, r0 + 1, r0 + 1, r1, r1 + 1);
      }
      var lg = new T.BufferGeometry();
      lg.setAttribute('position', new T.BufferAttribute(pos, 3)); lg.setAttribute('uv', new T.BufferAttribute(uv, 2)); lg.setIndex(new T.BufferAttribute(new Uint16Array(id2), 1));
      var lm = C.add(lg, C.track(new T.MeshBasicMaterial({ map: tex, toneMapped: false, side: T.FrontSide, polygonOffset: true, polygonOffsetFactor: -2 })));
      lm.renderOrder = 2;
    }
    /* centre le modèle sur l'axe de la bouteille */
  }

  function mount(el, cfg, isStale) {
    cfg = cfg || {}; isStale = isStale || function () { return false; };
    var glb = cfg.glb && /^https?:\/\//i.test(cfg.glb) ? cfg.glb : '';
    var usePhoto = !glb && cfg.model === 'photo' && /^(https?:\/\/|\/)/i.test(cfg.photo || '');
    var pr = (glb || usePhoto) ? null : preset(cfg.model);
    if (!pr && !glb && !usePhoto) return Promise.reject(new Error(cfg.model === 'photo' ? 'Ajoutez d\'abord une photo au produit' : 'Aucun modèle'));
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
    var photoP = usePhoto ? loadPhoto(cfg.photo, cfg.dept === 'vin' ? 'vin' : 'parfum') : null;
    if (photoP) steps.push(photoP);

    return Promise.all(steps).then(function (res) {
      if (isStale()) throw new Error('obsolete');
      var photoRes = photoP ? res[res.length - 1] : null;
      var T = window.THREE, disposed = false, raf = 0, io = null, ro = null;
      if (T.ColorManagement) T.ColorManagement.legacyMode = false;   // couleurs sRGB exactes (sinon rendu délavé / voilé)
      var rect = el.getBoundingClientRect();
      var W = Math.max(200, Math.round(rect.width || el.clientWidth || 360)), H = Math.max(200, Math.round(rect.height || el.clientHeight || 360));

      var renderer;
      try { renderer = new T.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' }); }
      catch (e) { box.remove(); throw e; }
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setSize(W, H, false);
      renderer.outputEncoding = T.sRGBEncoding;
      renderer.toneMapping = usePhoto ? T.NoToneMapping : T.ACESFilmicToneMapping;
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
      var key = new T.DirectionalLight(0xffffff, usePhoto ? 0.55 : 1.1); key.position.set(3, 6, 5); scene.add(key);
      if (usePhoto) scene.add(new T.HemisphereLight(0xffffff, 0xd9d4ca, 0.5));

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
      if (usePhoto) {
        photoModel(C, T, cfg, photoRes); finishModel(C.group); ready = Promise.resolve();
      } else if (pr) {
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
        var BASE = 0, yaw = BASE, vy = 0, zoomT = 1, idle = 0, ptrs = {}, np = 0, pinch0 = 0, zoom0 = 1, lx = 0, lastTap = 0, snap = false;
        function stopHint() { hint.classList.add('off'); }
        function clampZ(z) { return Math.max(1, Math.min(1.75, z)); }
        function dist() { var k = Object.keys(ptrs), a = ptrs[k[0]], b = ptrs[k[1]]; return Math.hypot(a.x - b.x, a.y - b.y) || 1; }
        cv.addEventListener('pointerdown', function (e) {
          ptrs[e.pointerId] = { x: e.clientX, y: e.clientY }; np = Object.keys(ptrs).length; lx = e.clientX; vy = 0; idle = 0; stopHint(); snap = false;
          if (e.pointerType === 'touch' && np === 1) { var nt = Date.now(); if (nt - lastTap < 320) { snap = true; lastTap = 0; } else lastTap = nt; }
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
        cv.addEventListener('dblclick', function (e) { e.preventDefault(); snap = true; });

        var last = performance.now();
        function frame(t) {
          raf = requestAnimationFrame(frame);
          var dt = Math.min(0.05, (t - last) / 1000); last = t;
          if (!np) {
            if (Math.abs(vy) > 0.0004) { yaw += vy; vy *= 0.95; } else vy = 0;
            idle += dt;
            if (snap) {                                              /* double-tap / double-clic : retour rapide */
              var ks = 1 - Math.exp(-dt * 9), tg = BASE + Math.PI * 2 * Math.round((yaw - BASE) / (Math.PI * 2));
              yaw += (tg - yaw) * ks; zoom += (1 - zoom) * ks; setCam(); vy = 0;
              if (Math.abs(tg - yaw) < 0.002 && Math.abs(zoom - 1) < 0.002) { yaw = tg; zoom = 1; setCam(); snap = false; }
            }
            if (idle > 1.4 && Math.abs(vy) < 0.002) {            /* retour très lent à la position d'origine */
              var k = 1 - Math.exp(-dt * 0.9), tgt = BASE + Math.PI * 2 * Math.round((yaw - BASE) / (Math.PI * 2));
              yaw += (tgt - yaw) * k;
              if (Math.abs(zoom - 1) > 0.0005) { zoom += (1 - zoom) * k; setCam(); }
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
