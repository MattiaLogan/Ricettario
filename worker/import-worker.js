/**
 * Ricettario – servizio di importazione ricette (Cloudflare Worker)
 *
 * Riceve  GET /?url=<indirizzo-della-ricetta>
 * Scarica la pagina al posto del browser (che non può farlo per via del CORS)
 * e risponde con JSON:  { ok: true, finalUrl: "...", html: "..." }
 * Il riconoscimento della ricetta avviene poi nell'app.
 *
 * Accetta richieste solo dai siti elencati in ALLOWED_ORIGINS.
 */

const ALLOWED_ORIGINS = [
  'https://mattialogan.github.io',
  'http://localhost:8000',   // prove in locale (python3 -m http.server 8000)
];

const MAX_BYTES = 4_000_000;     // oltre questa dimensione la pagina viene scartata
const TIMEOUT_MS = 15_000;

export default {
  async fetch(request) {
    const origin = request.headers.get('Origin') || '';
    const cors = {
      'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
      'Vary': 'Origin',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: { ...cors, 'Access-Control-Allow-Methods': 'GET', 'Access-Control-Max-Age': '86400' },
      });
    }
    if (request.method !== 'GET') return reply({ error: 'Metodo non consentito' }, 405, cors);
    if (!ALLOWED_ORIGINS.includes(origin)) return reply({ error: 'Origine non autorizzata' }, 403, cors);

    const raw = new URL(request.url).searchParams.get('url');
    let target;
    try { target = new URL(raw); } catch { return reply({ error: 'Indirizzo non valido' }, 400, cors); }
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
  },
};

function reply(body, status, headers) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8' },
  });
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
