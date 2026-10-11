# Ricettario

App web (PWA) per ricette, timer di cottura e lista della spesa.
Nessun server: i dati restano nel browser di chi la usa (usa "App e backup" ⚙️ per i backup).

## Pubblicazione su GitHub Pages
1. Crea su GitHub un repository vuoto (es. `ricettario`), senza README.
2. Da questa cartella:
   ```
   git remote add origin https://github.com/TUO-UTENTE/ricettario.git
   git push -u origin main
   ```
3. Su GitHub: Settings → Pages → Source: *Deploy from a branch* → `main` / `(root)`.
4. Dopo circa un minuto l'app è su `https://TUO-UTENTE.github.io/ricettario/`.

## Aggiornare l'app
Dopo ogni modifica incrementa `VERSION` in `sw.js` **e** `APP_VERSION` in `app.js` (devono avere lo stesso valore: servono ai telefoni per riconoscere la versione nuova), poi:
```
git add -A && git commit -m "Aggiornamento" && git push
```

## Servizi online (Cloudflare Worker `ricettario-import`)
Il codice è in `worker/import-worker.js`. Fa due cose:
- **Importazione ricette da link** (`GET /?url=…`).
- **Sincronizzazione** tra dispositivi (`POST /sync`), che usa un database **D1** collegato al Worker con il nome `DB`.
  Le tabelle si creano da sole. Il codice famiglia non viene mai inviato: arriva solo il suo hash.

- **Avvisi dei timer ad app chiusa** (Web Push: `GET /push/key`, `POST /push`). Serve un **Cron Trigger** `* * * * *`
  (Worker → Settings → Trigger Events → Cron Triggers). Le chiavi VAPID si creano da sole nel database.

Per aggiornare il Worker: Cloudflare → Workers & Pages → `ricettario-import` → *Edit code* → incolla il file → *Deploy*.
