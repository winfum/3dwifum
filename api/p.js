/* WINFUM — aperçu des liens de produits (fonction Vercel : /p/<id> → /api/p?id=<id>)
   Quand on colle le lien d'un produit dans WhatsApp, Messenger, Telegram, SMS, Facebook…, ces applications
   lisent cette page pour fabriquer la carte d'aperçu : PHOTO du produit + nom + prix + description.
   Une personne qui ouvre le lien est envoyée tout de suite sur le produit (la page défile jusqu'à lui, puis
   ouvre sa fiche).
   Aucune configuration nécessaire. Facultatif (Vercel > Settings > Environment Variables) :
   SUPABASE_URL et SUPABASE_ANON_KEY si vous changez de projet Supabase. */

const SB_URL = process.env.SUPABASE_URL || 'https://cxobpfaffgevxblnbwft.supabase.co';
const SB_KEY = process.env.SUPABASE_ANON_KEY || 'sb_publishable_bA-89TIqjkUhoA5NIlf7uQ_UUbb8oSB';
const LOGO = 'https://i.postimg.cc/cH4Hyzb7/Logo-winfum.png';

const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clip = (s, n) => { s = String(s || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s; };

async function getProduct(id) {
  const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 4000);
  try {
    const url = SB_URL + '/rest/v1/products?select=id,name,description,department,price_retail,images'
      + '&id=eq.' + encodeURIComponent(id) + '&is_active=eq.true&limit=1';
    const r = await fetch(url, { headers: { apikey: SB_KEY, Accept: 'application/json' }, signal: ctl.signal });
    if (!r.ok) return null;
    const rows = await r.json();
    return Array.isArray(rows) && rows[0] ? rows[0] : null;
  } catch (e) { return null; }
  finally { clearTimeout(timer); }
}

module.exports = async (req, res) => {
  let id = '';
  try { id = String((req.query && req.query.id) || new URL(req.url, 'http://x').searchParams.get('id') || ''); } catch (e) {}
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) id = '';   /* on n'accepte que des identifiants « propres » */

  const host = req.headers['x-forwarded-host'] || req.headers.host || '';
  const proto = (req.headers['x-forwarded-proto'] || 'https').split(',')[0];
  const origin = host ? proto + '://' + host : '';
  const self = origin + '/p/' + encodeURIComponent(id);

  const p = id ? await getProduct(id) : null;
  let dest, title, desc, image, found = !!p;

  if (p) {
    const vin = p.department === 'vin';
    const brand = vin ? 'Fun For Us' : 'JB Parfumerie';
    dest = '/' + (vin ? 'funforus#v-' : 'jbparfumerie#p-') + encodeURIComponent(p.id);
    const price = Number(p.price_retail) > 0 ? Number(p.price_retail) + ' G' : '';
    title = clip(p.name || 'Produit', 70) + ' — ' + brand + ' · Winfum';
    desc = [price, clip(p.description, 150)].filter(Boolean).join(' · ') || (vin ? 'Vins 100% haïtiens' : 'Parfums pour Homme, Femme et Mixte') + ' — commandez sur WhatsApp.';
    image = ((p.images || []).filter(u => /^https:\/\//i.test(u || ''))[0]) || LOGO;
  } else {
    /* produit introuvable ou base injoignable : l'accueil sait retrouver le produit tout seul */
    dest = id ? '/#p-' + encodeURIComponent(id) : '/';
    title = 'Winfum — Parfums & Vins d\'Haïti';
    desc = 'Découvrez JB Parfumerie et Fun For Us : parfums et vins 100% haïtiens, vente au détail et en gros.';
    image = LOGO;
  }

  const html = '<!doctype html><html lang="fr"><head><meta charset="utf-8">'
    + '<meta name="viewport" content="width=device-width,initial-scale=1">'
    + '<title>' + esc(title) + '</title>'
    + '<meta name="description" content="' + esc(desc) + '">'
    + '<meta property="og:type" content="' + (found ? 'product' : 'website') + '">'
    + '<meta property="og:site_name" content="Winfum">'
    + '<meta property="og:locale" content="fr_FR">'
    + '<meta property="og:title" content="' + esc(title) + '">'
    + '<meta property="og:description" content="' + esc(desc) + '">'
    + '<meta property="og:image" content="' + esc(image) + '">'
    + '<meta property="og:image:alt" content="' + esc(found ? p.name : 'Winfum') + '">'
    + (origin ? '<meta property="og:url" content="' + esc(self) + '">' : '')
    + '<meta name="twitter:card" content="summary_large_image">'
    + '<meta name="twitter:title" content="' + esc(title) + '">'
    + '<meta name="twitter:description" content="' + esc(desc) + '">'
    + '<meta name="twitter:image" content="' + esc(image) + '">'
    + '<script>location.replace(' + JSON.stringify(dest).replace(/</g, '\\u003c') + ')</script>'
    + '</head><body style="font-family:system-ui,sans-serif;text-align:center;padding:48px 20px;color:#1c1a17;background:#f6f4ef">'
    + '<p>Ouverture du produit…</p><p><a href="' + esc(dest) + '" style="color:#7a1128">Cliquez ici si rien ne se passe</a></p>'
    + '</body></html>';

  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  /* gardé en mémoire 5 min par Vercel (rapide pour WhatsApp), mis à jour ensuite si le produit change */
  res.setHeader('Cache-Control', found ? 'public, s-maxage=300, stale-while-revalidate=86400' : 'public, s-maxage=60');
  res.end(html);
};
