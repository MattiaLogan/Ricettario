/* Service worker: l'app funziona offline dopo la prima visita.
   Strategia: risposta dalla cache subito, aggiornamento in background.
   Quando modifichi i file, incrementa VERSION per forzare l'aggiornamento. */
const VERSION = 'v8';
const CACHE = 'ricettario-' + VERSION;
const SHELL = [
  './', 'index.html', 'style.css', 'app.js', 'manifest.webmanifest',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png', 'icons/apple-touch-icon.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
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

  e.respondWith(
    caches.open(CACHE).then(async cache => {
      const cached = await cache.match(req, { ignoreSearch: true });
      const fresh = fetch(req).then(res => {
        if (res.ok) cache.put(req, res.clone());
        return res;
      }).catch(() => null);
      return cached || (await fresh) || (req.mode === 'navigate' ? cache.match('index.html') : Response.error());
    })
  );
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
