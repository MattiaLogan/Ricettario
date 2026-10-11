/* Service worker: l'app funziona offline dopo la prima visita.
   Strategia: si prova prima la rete (così le versioni nuove arrivano al primo avvio, saltando anche la
   cache HTTP di GitHub Pages) e, se è assente o lenta, si usa la copia salvata.
   Quando modifichi i file, incrementa VERSION qui sotto E APP_VERSION in app.js (devono coincidere). */
const VERSION = 'v11';
const CACHE = 'ricettario-' + VERSION;
const NET_TIMEOUT_MS = 3000;
const SHELL = [
  './', 'index.html', 'style.css', 'app.js', 'manifest.webmanifest',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png', 'icons/apple-touch-icon.png'
];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // cache: 'reload' = scarica davvero dal server, senza passare dalla cache HTTP del browser
    await Promise.all(SHELL.map(async url => {
      const res = await fetch(new Request(url, { cache: 'reload' }));
      if (!res.ok) throw new Error(url + ' → ' + res.status);
      await cache.put(url, res);
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('ricettario-') && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(networkFirst(req));
});

let slowUntil = 0;   // dopo un timeout la rete è considerata lenta per un po': si usa subito la copia salvata

async function networkFirst(req) {
  const cache = await caches.open(CACHE);
  // 'no-cache': chiede al server se il file è cambiato (risposta breve 304 se uguale)
  const net = fetch(req, { cache: 'no-cache' }).then(res => {
    if (res.status >= 500) throw new Error('errore del server');   // sito in panne: meglio la copia salvata
    if (res.ok) cache.put(req, res.clone());
    return res;
  });
  net.catch(() => {});                                             // l'errore è gestito sotto: niente avvisi in console

  if (Date.now() < slowUntil) {                                    // rete lenta: copia salvata subito, aggiornamento in sottofondo
    const cached = await cache.match(req, { ignoreSearch: true });
    if (cached) return cached;
  }
  const quick = await Promise.race([
    net.catch(() => null),
    new Promise(r => setTimeout(() => r('timeout'), NET_TIMEOUT_MS)),
  ]);
  if (quick && quick !== 'timeout') return quick;
  if (quick === 'timeout') slowUntil = Date.now() + 30000;
  const cached = await cache.match(req, { ignoreSearch: true });
  if (cached) return cached;
  const late = await net.catch(() => null);                        // niente copia: si attende la rete fino in fondo
  return late || (req.mode === 'navigate' ? cache.match('index.html') : Response.error());
}

/* L'app chiede quale versione sta girando (per il pannello ⚙️ e per l'avviso di aggiornamento). */
self.addEventListener('message', e => {
  if (e.data === 'version' && e.source) e.source.postMessage({ type: 'version', version: VERSION });
});

/* ---------- Avvisi dei timer (Web Push) ----------
   La notifica push arriva senza contenuto: il testo si legge dall'elenco dei timer che l'app
   salva qui accanto (cache "meta-timers", nome diverso da "ricettario-*" per non essere cancellata). */
self.addEventListener('push', e => {
  e.waitUntil((async () => {
    let timers = [];
    try {
      const r = await (await caches.open('meta-timers')).match('timers');
      if (r) timers = await r.json();
    } catch { /* nessun elenco: si usa il testo generico */ }

    const now = Date.now();
    const due = timers.filter(t => t.end <= now + 15000);
    const list = due.length ? due : [{ id: 'timer', label: 'Un timer è scaduto' }];
    const shown = [];
    for (const t of list) {
      shown.push(t.label);
      await self.registration.showNotification('⏰ Tempo scaduto!', {
        body: t.label, tag: t.id, renotify: true,
        icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', vibrate: [300, 150, 300, 150, 300],
      });
    }
    // utile per le prove automatiche; l'app ignora i messaggi che non conosce
    const clis = await self.clients.matchAll({ includeUncontrolled: true });
    clis.forEach(c => c.postMessage({ type: 'push-shown', labels: shown }));
  })());
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    const c = list.find(x => 'focus' in x);
    return c ? c.focus() : self.clients.openWindow('./');
  }));
});
