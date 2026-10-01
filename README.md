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
