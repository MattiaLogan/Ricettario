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
 * 3. AVVISI DEI TIMER   GET /push/key   POST /push   (serve D1 + un Cron Trigger "* * * * *")
 *    Web Push: quando un timer scade, il telefono riceve una notifica anche con l'app chiusa.
 *    L'app registra qui i timer attivi; ogni minuto il Cron controlla quelli in scadenza,
 *    aspetta l'istante esatto e manda la notifica (senza contenuto: il testo lo mostra il
 *    service worker dell'app). Le chiavi VAPID si creano da sole alla prima richiesta
 *    e restano nel tuo database.
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

const PUSH_SUBJECT = 'https://mattialogan.github.io/Ricettario/';   // contatto indicato ai servizi push (VAPID "sub")
// Il Worker invia notifiche solo a questi servizi: impedisce di usarlo per colpire indirizzi arbitrari.
const PUSH_HOSTS = ['fcm.googleapis.com', 'push.services.mozilla.com', 'push.apple.com', 'notify.windows.com'];
const MAX_TIMERS = 20;
const CRON_HORIZON_MS = 59_000;   // ogni minuto gestisce i timer che scadono entro i 59 secondi successivi
const MAX_JOBS_PER_TICK = 10;

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
      if (request.method === 'GET' && url.pathname === '/push/key') return await handlePushKey(env, cors);
      if (request.method === 'POST' && url.pathname === '/push') return await handlePush(request, env, cors);
      if (request.method === 'GET') return await handleImport(url, cors);
    } catch (e) {
      return reply({ error: 'Errore del servizio: ' + (e && e.message || e) }, 500, cors);
    }
    return reply({ error: 'Richiesta non supportata' }, 405, cors);
  },

  /** Cron Trigger (ogni minuto): invia gli avvisi dei timer in scadenza. */
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runDuePushes(env));
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
  'CREATE TABLE IF NOT EXISTS config (key TEXT PRIMARY KEY, value TEXT NOT NULL)',
  // sent: 0 = da inviare, 2 = in invio, 1 = inviato (status = risposta del servizio push)
  'CREATE TABLE IF NOT EXISTS push_jobs (endpoint TEXT NOT NULL, id TEXT NOT NULL, due INTEGER NOT NULL, ' +
    'sent INTEGER NOT NULL DEFAULT 0, status INTEGER, PRIMARY KEY (endpoint, id))',
  'CREATE INDEX IF NOT EXISTS push_due ON push_jobs (sent, due)',
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
/* Avvisi dei timer (Web Push)                                         */
/* ------------------------------------------------------------------ */

const b64u = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const endpointOk = u => {
  try {
    const x = new URL(u);
    return x.protocol === 'https:' && u.length < 1000 && PUSH_HOSTS.some(h => x.hostname === h || x.hostname.endsWith('.' + h));
  } catch { return false; }
};

let vapidCache;
/** Chiavi VAPID: create alla prima richiesta e conservate in D1. */
async function getVapid(db) {
  if (vapidCache) return vapidCache;
  await ensureSchema(db);
  let row = await db.prepare("SELECT value FROM config WHERE key = 'vapid'").first();
  if (!row) {
    const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
    const value = JSON.stringify({
      pub: b64u(await crypto.subtle.exportKey('raw', pair.publicKey)),
      jwk: await crypto.subtle.exportKey('jwk', pair.privateKey),
    });
    await db.prepare("INSERT OR IGNORE INTO config (key, value) VALUES ('vapid', ?1)").bind(value).run();
    row = await db.prepare("SELECT value FROM config WHERE key = 'vapid'").first();   // vale la chiave scritta per prima
  }
  const { pub, jwk } = JSON.parse(row.value);
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  return (vapidCache = { pub, key });
}

async function vapidHeader(vapid, endpoint) {
  const enc = o => b64u(new TextEncoder().encode(JSON.stringify(o)));
  const head = enc({ typ: 'JWT', alg: 'ES256' });
  const body = enc({ aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: PUSH_SUBJECT });
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, vapid.key, new TextEncoder().encode(head + '.' + body));
  return `vapid t=${head}.${body}.${b64u(sig)}, k=${vapid.pub}`;
}

async function handlePushKey(env, cors) {
  if (!env.DB) return reply({ error: 'Database non collegato al Worker (binding "DB")' }, 500, cors);
  return reply({ ok: true, key: (await getVapid(env.DB)).pub }, 200, cors);
}

/** L'app comunica i timer attivi di questo dispositivo ("set"), oppure chiede l'esito degli ultimi invii ("status"). */
async function handlePush(request, env, cors) {
  if (!env.DB) return reply({ error: 'Database non collegato al Worker (binding "DB")' }, 500, cors);
  let body;
  try { body = await request.json(); } catch { return reply({ error: 'Richiesta non valida' }, 400, cors); }
  if (!endpointOk(body && body.endpoint)) return reply({ error: 'Servizio notifiche non supportato' }, 400, cors);
  const db = env.DB, endpoint = body.endpoint;
  await ensureSchema(db);

  if (body.action === 'status') {
    const { results } = await db.prepare(
      'SELECT id, due, sent, status FROM push_jobs WHERE endpoint = ?1 ORDER BY due DESC LIMIT 3'
    ).bind(endpoint).all();
    return reply({ ok: true, jobs: results }, 200, cors);
  }
  if (body.action !== 'set') return reply({ error: 'Azione sconosciuta' }, 400, cors);

  const timers = (Array.isArray(body.timers) ? body.timers : []).slice(0, MAX_TIMERS)
    .filter(t => t && typeof t.id === 'string' && t.id.length <= 40 && Number.isFinite(t.due));
  const stmts = [
    // l'elenco ricevuto sostituisce i timer ancora da inviare di questo dispositivo
    db.prepare('DELETE FROM push_jobs WHERE endpoint = ?1 AND sent = 0').bind(endpoint),
    db.prepare('DELETE FROM push_jobs WHERE sent != 0 AND due < ?1').bind(Date.now() - 24 * 3600 * 1000),
  ];
  for (const t of timers) {
    stmts.push(db.prepare(
      'INSERT INTO push_jobs (endpoint, id, due, sent) VALUES (?1, ?2, ?3, 0) ' +
      'ON CONFLICT (endpoint, id) DO UPDATE SET due = excluded.due, sent = 0, status = NULL WHERE push_jobs.sent = 0 OR push_jobs.due != excluded.due'
    ).bind(endpoint, t.id, Math.trunc(t.due)));
  }
  await db.batch(stmts);
  return reply({ ok: true, scheduled: timers.length }, 200, cors);
}

/** Eseguita ogni minuto dal Cron: per ogni timer in scadenza aspetta l'istante esatto e invia la notifica. */
async function runDuePushes(env) {
  if (!env.DB) return;
  const db = env.DB;
  await ensureSchema(db);
  const { results } = await db.prepare(
    'SELECT endpoint, id, due FROM push_jobs WHERE sent = 0 AND due <= ?1 ORDER BY due LIMIT ?2'
  ).bind(Date.now() + CRON_HORIZON_MS, MAX_JOBS_PER_TICK).all();
  if (!results.length) return;

  const vapid = await getVapid(db);
  for (const j of results) {
    const wait = j.due - Date.now();
    if (wait > 0) await sleep(wait);
    // "prenota" l'invio: se nel frattempo l'app ha annullato il timer, o un'altra esecuzione lo sta già inviando, si salta
    const claim = await db.prepare('UPDATE push_jobs SET sent = 2 WHERE endpoint = ?1 AND id = ?2 AND due = ?3 AND sent = 0')
      .bind(j.endpoint, j.id, j.due).run();
    if (!claim.meta || !claim.meta.changes) continue;

    let status = 0;
    try {
      const res = await fetch(j.endpoint, {
        method: 'POST',
        headers: { Authorization: await vapidHeader(vapid, j.endpoint), TTL: '600', Urgency: 'high' },
        signal: AbortSignal.timeout(10_000),
      });
      status = res.status;
    } catch { status = 599; }

    if (status === 404 || status === 410) {      // l'iscrizione non esiste più (app disinstallata o permesso tolto)
      await db.prepare('DELETE FROM push_jobs WHERE endpoint = ?1').bind(j.endpoint).run();
    } else {
      await db.prepare('UPDATE push_jobs SET sent = 1, status = ?3 WHERE endpoint = ?1 AND id = ?2').bind(j.endpoint, j.id, status).run();
    }
  }
}

/* ------------------------------------------------------------------ */

function reply(body, status, headers) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}
