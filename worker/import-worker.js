/**
 * Ricettario – servizio online (Cloudflare Worker)
 *
 * 1. IMPORTAZIONE   GET  /?url=<indirizzo-ricetta>
 *    Scarica la pagina al posto del browser (che non può farlo per via del CORS)
 *    e risponde { ok, finalUrl, html }. Il riconoscimento della ricetta è nell'app.
 *
 * 2. SINCRONIZZAZIONE   POST /sync   (serve un database D1 collegato come "DB")
 *    Tiene allineati i dispositivi della famiglia. Ogni dato (ricetta, prodotto
 *    della spesa, pasto del piano) è una riga con data di modifica: vince la
 *    modifica più recente. Le tabelle vengono create da sole alla prima richiesta.
 *    Il codice famiglia non arriva mai qui: l'app invia solo il suo hash SHA-256.
 *
 * Accetta richieste solo dai siti elencati in ALLOWED_ORIGINS.
 */

const ALLOWED_ORIGINS = [
  'https://mattialogan.github.io',
  'http://localhost:8000',   // prove in locale (python3 -m http.server 8000)
];

const MAX_BYTES = 4_000_000;      // dimensione massima della pagina da importare
const TIMEOUT_MS = 15_000;

const PAGE = 50;                  // righe restituite per risposta di sync
const MAX_CHANGES = 200;          // modifiche accettate per richiesta
const MAX_ITEM_BYTES = 1_500_000; // dimensione massima di una riga (ricetta con foto)
const KINDS = ['recipe', 'shop', 'plan'];

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const cors = {
      'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
      'Vary': 'Origin',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: { ...cors, 'Access-Control-Allow-Methods': 'GET, POST', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '86400' },
      });
    }
    if (!ALLOWED_ORIGINS.includes(origin)) return reply({ error: 'Origine non autorizzata' }, 403, cors);

    const url = new URL(request.url);
    try {
      if (request.method === 'POST' && url.pathname === '/sync') return await handleSync(request, env, cors);
      if (request.method === 'GET') return await handleImport(url, cors);
    } catch (e) {
      return reply({ error: 'Errore del servizio: ' + (e && e.message || e) }, 500, cors);
    }
    return reply({ error: 'Richiesta non supportata' }, 405, cors);
  },
};

/* ------------------------------------------------------------------ */
/* Importazione                                                        */
/* ------------------------------------------------------------------ */

async function handleImport(url, cors) {
  let target;
  try { target = new URL(url.searchParams.get('url')); } catch { return reply({ error: 'Indirizzo non valido' }, 400, cors); }
  if (!/^https?:$/.test(target.protocol) || isPrivateHost(target.hostname)) {
    return reply({ error: 'Indirizzo non consentito' }, 400, cors);
  }

  let res;
  try {
    res = await fetch(target.toString(), {
      redirect: 'follow',
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'it-IT,it;q=0.9,en;q=0.7',
      },
      cf: { cacheTtl: 3600, cacheEverything: true },
    });
  } catch {
    return reply({ error: 'Il sito non ha risposto in tempo' }, 504, cors);
  }

  if (!res.ok) return reply({ error: `Il sito ha risposto con errore ${res.status}` }, 502, cors);
  const type = res.headers.get('Content-Type') || '';
  if (!/html|xml/i.test(type)) return reply({ error: 'L\'indirizzo non è una pagina web' }, 415, cors);
  if (+res.headers.get('Content-Length') > MAX_BYTES) return reply({ error: 'Pagina troppo grande' }, 413, cors);

  let html = await res.text();
  if (html.length > MAX_BYTES) html = html.slice(0, MAX_BYTES);
  return reply({ ok: true, finalUrl: res.url, html }, 200, cors);
}

/** Blocca indirizzi locali o di rete privata. */
function isPrivateHost(h) {
  h = h.toLowerCase();
  if (h === 'localhost' || h.endsWith('.local') || h.endsWith('.internal') || h.includes(':')) return true;
  const m = h.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (!m) return false;
  const [a, b] = [+m[1], +m[2]];
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

/* ------------------------------------------------------------------ */
/* Sincronizzazione                                                    */
/* ------------------------------------------------------------------ */

const SCHEMA = [
  'CREATE TABLE IF NOT EXISTS spaces (space TEXT PRIMARY KEY, created INTEGER NOT NULL)',
  'CREATE TABLE IF NOT EXISTS items (space TEXT NOT NULL, kind TEXT NOT NULL, id TEXT NOT NULL, data TEXT, ' +
    'deleted INTEGER NOT NULL DEFAULT 0, updated INTEGER NOT NULL, srv INTEGER NOT NULL, PRIMARY KEY (space, kind, id))',
  'CREATE INDEX IF NOT EXISTS items_srv ON items (space, srv)',
];
let schemaReady;
function ensureSchema(db) {
  if (!schemaReady) schemaReady = db.batch(SCHEMA.map(s => db.prepare(s))).catch(e => { schemaReady = null; throw e; });
  return schemaReady;
}

async function handleSync(request, env, cors) {
  if (!env.DB) return reply({ error: 'Database non collegato al Worker (binding "DB")' }, 500, cors);

  let body;
  try { body = await request.json(); } catch { return reply({ error: 'Richiesta non valida' }, 400, cors); }
  const { action, space } = body || {};
  if (typeof space !== 'string' || !/^[0-9a-f]{64}$/.test(space)) return reply({ error: 'Spazio non valido' }, 400, cors);

  const db = env.DB;
  await ensureSchema(db);

  if (action === 'create') {
    await db.prepare('INSERT OR IGNORE INTO spaces (space, created) VALUES (?1, ?2)').bind(space, Date.now()).run();
    return reply({ ok: true }, 200, cors);
  }

  const exists = await db.prepare('SELECT 1 AS x FROM spaces WHERE space = ?1').bind(space).first();
  if (!exists) return reply({ error: 'Codice non trovato' }, 404, cors);
  if (action === 'join') return reply({ ok: true }, 200, cors);
  if (action !== 'sync') return reply({ error: 'Azione sconosciuta' }, 400, cors);

  // 1. scrive le modifiche ricevute: una riga viene sostituita solo se la modifica è più recente
  const changes = (Array.isArray(body.changes) ? body.changes : []).slice(0, MAX_CHANGES);
  const base = Date.now() * 1000;
  const writes = [];
  changes.forEach((c, n) => {
    if (!c || !KINDS.includes(c.k) || typeof c.i !== 'string' || !c.i || c.i.length > 80 || !Number.isFinite(c.u)) return;
    const data = c.x ? null : JSON.stringify(c.d ?? null);
    if (data && data.length > MAX_ITEM_BYTES) return;
    writes.push(db.prepare(
      'INSERT INTO items (space, kind, id, data, deleted, updated, srv) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7) ' +
      'ON CONFLICT (space, kind, id) DO UPDATE SET data = excluded.data, deleted = excluded.deleted, ' +
      'updated = excluded.updated, srv = excluded.srv WHERE excluded.updated > items.updated'
    ).bind(space, c.k, c.i, data, c.x ? 1 : 0, Math.trunc(c.u), base + n));
  });
  if (writes.length) await db.batch(writes);

  // 2. restituisce le righe cambiate da `since` (estremo incluso: il client ripete l'operazione senza danni)
  const since = Math.max(0, Math.trunc(+body.since || 0));
  const { results } = await db.prepare(
    'SELECT kind, id, data, deleted, updated, srv FROM items WHERE space = ?1 AND srv >= ?2 ORDER BY srv LIMIT ?3'
  ).bind(space, since, PAGE + 1).all();

  const rows = results.slice(0, PAGE).map(r => ({
    k: r.kind, i: r.id, d: r.deleted ? null : JSON.parse(r.data), x: !!r.deleted, u: r.updated, s: r.srv,
  }));
  return reply({ ok: true, rows, more: results.length > PAGE, now: Date.now() * 1000 }, 200, cors);
}

/* ------------------------------------------------------------------ */

function reply(body, status, headers) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}
