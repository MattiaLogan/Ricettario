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
Dopo ogni modifica incrementa `VERSION` in `sw.js` (così i telefoni scaricano la nuova versione), poi:
```
git add -A && git commit -m "Aggiornamento" && git push
```

## Servizi online (Cloudflare Worker `ricettario-import`)
Il codice è in `worker/import-worker.js`. Fa due cose:
- **Importazione ricette da link** (`GET /?url=…`).
- **Sincronizzazione** tra dispositivi (`POST /sync`), che usa un database **D1** collegato al Worker con il nome `DB`.
  Le tabelle si creano da sole. Il codice famiglia non viene mai inviato: arriva solo il suo hash.

Per aggiornare il Worker: Cloudflare → Workers & Pages → `ricettario-import` → *Edit code* → incolla il file → *Deploy*.
