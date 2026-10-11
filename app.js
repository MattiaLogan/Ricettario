'use strict';

/** Deve coincidere con VERSION in sw.js: serve a capire se l'app in uso è quella più recente. */
const APP_VERSION = 'v12';

/* =========================================================
   Utilità
   ========================================================= */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

const CAT_EMOJI = { antipasti: '🥗', primi: '🍝', secondi: '🍖', contorni: '🥦', dolci: '🍰', lievitati: '🍞', zuppe: '🍲', pesce: '🐟', altro: '🍽️' };
const DEFAULT_CATS = ['Antipasti', 'Primi', 'Secondi', 'Contorni', 'Dolci', 'Lievitati', 'Zuppe', 'Pesce'];
const UNITS = ['kg', 'g', 'l', 'ml', 'cl', 'dl', 'pz', 'cucchiaio', 'cucchiai', 'cucchiaino', 'cucchiaini', 'spicchio', 'spicchi', 'pizzico', 'foglia', 'foglie', 'bicchiere', 'tazza'];

const emojiFor = cat => CAT_EMOJI[String(cat || '').trim().toLowerCase()] || '🍽️';
const HUES = [12, 28, 42, 55, 95, 140, 350, 18]; // tinte calde, in tema cucina
const hueFor = s => { let h = 0; for (const c of String(s || 'x')) h = (h * 31 + c.charCodeAt(0)) % 997; return HUES[h % HUES.length]; };

function parseQty(s) {
  s = String(s ?? '').trim().replace(',', '.');
  if (!s) return null;
  let m = s.match(/^(\d+)\s+(\d+)\/(\d+)$/); if (m) return +m[1] + m[2] / m[3];
  m = s.match(/^(\d+)\/(\d+)$/); if (m) return m[1] / m[2];
  return /^\d*\.?\d+$/.test(s) ? parseFloat(s) : null;
}
const fmtQty = n => n == null ? '' : String(Math.round(n * 100) / 100).replace('.', ',');
/** Arrotonda come si farebbe a mano: 107 g invece di 106,67 g; 1,5 cucchiai; 0,33. */
const niceQty = n => n >= 100 ? Math.round(n) : n >= 10 ? Math.round(n * 10) / 10 : Math.round(n * 100) / 100;

function fmtMin(m) {
  m = Math.round(+m || 0);
  if (!m) return '';
  const h = Math.floor(m / 60), r = m % 60;
  return h ? (r ? `${h} h ${r} min` : `${h} h`) : `${m} min`;
}
function fmtClock(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000)), h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60;
  const p = n => String(n).padStart(2, '0');
  return h ? `${h}:${p(m)}:${p(x)}` : `${p(m)}:${p(x)}`;
}

/* =========================================================
   Stato e salvataggio
   ========================================================= */
const KEY = 'ricettario.v1';

function seed() {
  return [
    {
      id: uid(), title: 'Spaghetti al pomodoro', category: 'Primi', servings: 4, prepMin: 10, cookMin: 20,
      cookMethod: 'Fornello, fuoco medio', difficulty: 'Facile', fav: true, photo: '',
      ingredients: [
        { qty: '320', unit: 'g', name: 'spaghetti' }, { qty: '500', unit: 'g', name: 'passata di pomodoro' },
        { qty: '1', unit: 'spicchio', name: 'aglio' }, { qty: '3', unit: 'cucchiai', name: 'olio extravergine' },
        { qty: '', unit: '', name: 'basilico fresco' }, { qty: '', unit: 'q.b.', name: 'sale' }
      ],
      steps: [
        { text: 'Scalda l\'olio con l\'aglio schiacciato, senza farlo scurire.', minutes: 2 },
        { text: 'Aggiungi la passata, un pizzico di sale e cuoci a fuoco medio.', minutes: 15 },
        { text: 'Nel frattempo lessa gli spaghetti in acqua salata, scolali al dente.', minutes: 9 },
        { text: 'Salta la pasta nel sugo, aggiungi il basilico e servi.', minutes: 0 }
      ],
      notes: 'Un cucchiaino di zucchero toglie l\'acidità del pomodoro.', created: Date.now()
    },
    {
      id: uid(), title: 'Torta di mele della nonna', category: 'Dolci', servings: 8, prepMin: 20, cookMin: 45,
      cookMethod: 'Forno statico 175 °C', difficulty: 'Facile', fav: false, photo: '',
      ingredients: [
        { qty: '3', unit: 'pz', name: 'mele' }, { qty: '3', unit: 'pz', name: 'uova' },
        { qty: '150', unit: 'g', name: 'zucchero' }, { qty: '250', unit: 'g', name: 'farina 00' },
        { qty: '100', unit: 'ml', name: 'latte' }, { qty: '70', unit: 'ml', name: 'olio di semi' },
        { qty: '1', unit: 'pz', name: 'bustina di lievito' }
      ],
      steps: [
        { text: 'Accendi il forno a 175 °C. Sbuccia e taglia a fettine due mele.', minutes: 0 },
        { text: 'Monta le uova con lo zucchero fino a ottenere un composto chiaro.', minutes: 5 },
        { text: 'Aggiungi olio, latte, poi farina e lievito setacciati. Incorpora le mele.', minutes: 0 },
        { text: 'Versa in una tortiera da 24 cm, decora con le fettine di mela e inforna.', minutes: 45 },
        { text: 'Lascia raffreddare prima di sformare.', minutes: 20 }
      ],
      notes: 'Controlla la cottura con uno stecchino: deve uscire asciutto.', created: Date.now() - 1000
    }
  ];
}

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    if (s && Array.isArray(s.recipes)) return { shopping: [], timers: [], plan: {}, ...s };
  } catch { /* primo avvio o dati corrotti */ }
  return { recipes: seed(), shopping: [], timers: [], plan: {} };
}
let state = load();

/** Scrive i dati nel browser, senza avviare la sincronizzazione. */
function persist() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); return true; }
  catch { toast('Spazio pieno: impossibile salvare. Prova con foto più piccole.'); return false; }
}
/** Salva e, se la sincronizzazione è attiva, la fa partire a breve. */
function save() {
  if (state.sync?.code && !state.sync.dirtyAt) state.sync.dirtyAt = Date.now();   // quando è avvenuta la modifica
  const ok = persist();
  if (ok) scheduleSync();
  return ok;
}

const ui = { tab: 'ricette', week: null, pick: null, q: '', cat: '', favOnly: false, viewId: null, servings: 0, checked: new Set(), edit: null, photo: '' };
const recipeById = id => state.recipes.find(r => r.id === id);

/* =========================================================
   Toast
   ========================================================= */
let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.hidden = true, 2600);
}

/* =========================================================
   Render principale
   ========================================================= */
function render() {
  const open = state.shopping.filter(i => !i.done).length;
  const b = $('#badge'); b.textContent = open; b.hidden = !open;
  $$('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === ui.tab));
  $('#fab').hidden = ui.tab !== 'ricette';
  ({ ricette: renderRecipes, piano: renderPlan, spesa: renderShopping })[ui.tab]();
  renderTimers();
}

/* ---------- Elenco ricette ---------- */
function allCats() {
  const set = new Set(DEFAULT_CATS);
  state.recipes.forEach(r => r.category && set.add(r.category.trim()));
  return [...set];
}

function renderRecipes() {
  $('#view').innerHTML = `
    <div class="toolbar">
      <input id="search" type="search" placeholder="Cerca per nome, categoria o ingrediente…" value="${esc(ui.q)}" autocomplete="off">
      <button class="chip ${ui.favOnly ? 'on' : ''}" data-act="favfilter">♥ Preferite</button>
      <button class="chip" data-act="import-recipe">🔗 Da link</button>
    </div>
    <div class="chips" id="chips"></div>
    <div class="grid" id="grid"></div>`;
  renderChips();
  renderGrid();
}

function renderChips() {
  const used = new Set(state.recipes.map(r => (r.category || '').trim()).filter(Boolean));
  const cats = allCats().filter(c => used.has(c));
  if (ui.cat && !used.has(ui.cat)) ui.cat = '';
  $('#chips').innerHTML = !cats.length ? '' :
    `<button class="chip ${!ui.cat ? 'on' : ''}" data-act="cat" data-cat="">Tutte</button>` +
    cats.map(c => `<button class="chip ${ui.cat === c ? 'on' : ''}" data-act="cat" data-cat="${esc(c)}">${emojiFor(c)} ${esc(c)}</button>`).join('');
}

function renderGrid() {
  const q = ui.q.trim().toLowerCase();
  const list = state.recipes.filter(r =>
    (!ui.cat || (r.category || '').trim() === ui.cat) &&
    (!ui.favOnly || r.fav) &&
    (!q || [r.title, r.category, ...r.ingredients.map(i => i.name)].join(' ').toLowerCase().includes(q))
  ).sort((a, b) => a.title.localeCompare(b.title, 'it'));

  if (!list.length) {
    $('#grid').innerHTML = `<div class="empty" style="grid-column:1/-1">
      <div class="big">${state.recipes.length ? '🔍' : '👩‍🍳'}</div>
      <h3>${state.recipes.length ? 'Nessuna ricetta trovata' : 'Il tuo ricettario è vuoto'}</h3>
      <p>${state.recipes.length ? 'Prova a cambiare ricerca o filtri.' : 'Aggiungi la prima ricetta con il pulsante in basso.'}</p></div>`;
    return;
  }
  $('#grid').innerHTML = list.map(r => {
    const total = (+r.prepMin || 0) + (+r.cookMin || 0);
    return `<article class="card" data-act="open" data-id="${r.id}">
      <div class="thumb" style="--h:${hueFor(r.category || r.title)}">
        ${r.photo ? `<img src="${r.photo}" alt="" loading="lazy">` : `<span>${emojiFor(r.category)}</span>`}
        <button class="heart ${r.fav ? 'on' : ''}" data-act="fav" data-id="${r.id}" aria-label="Preferita">♥</button>
      </div>
      <div class="body">
        <span class="cat">${esc(r.category || 'Senza categoria')}</span>
        <h3>${esc(r.title)}</h3>
        <div class="meta">
          ${total ? `<span>🕒 ${fmtMin(total)}</span>` : ''}
          ${r.cookMin ? `<span>🔥 ${fmtMin(r.cookMin)}</span>` : ''}
          ${r.servings ? `<span>👥 ${r.servings}</span>` : ''}
        </div>
      </div></article>`;
  }).join('');
}

/* ---------- Dettaglio ricetta ---------- */
/** `servings`: porzioni da mostrare subito (es. quelle decise nel piano); se assenti, quelle della ricetta. */
function openRecipe(id, servings) {
  const r = recipeById(id); if (!r) return;
  ui.viewId = id; ui.servings = servings || +r.servings || 1; ui.checked = new Set();
  renderRecipeDialog();
  const d = $('#rv'); if (!d.open) d.showModal();
}

function scaledIng(i, factor) {
  const n = parseQty(i.qty);
  return n != null ? fmtQty(niceQty(n * factor)) : String(i.qty || '').trim();
}

function renderRecipeDialog() {
  const r = recipeById(ui.viewId); if (!r) return;
  const base = +r.servings || 1, factor = ui.servings / base;
  const total = (+r.prepMin || 0) + (+r.cookMin || 0);
  const fact = (l, v) => v ? `<div class="fact"><small>${l}</small><b>${esc(v)}</b></div>` : '';

  $('#rv').innerHTML = `
    <button class="close" data-act="close" aria-label="Chiudi">✕</button>
    <div class="timers in-dialog" hidden></div>
    <div class="rv-hero ${r.photo ? '' : 'noimg'}" style="--h:${hueFor(r.category || r.title)}">
      ${r.photo ? `<img src="${r.photo}" alt="">` : `<span>${emojiFor(r.category)}</span>`}
    </div>
    <div class="rv-body">
      <div class="rv-top">
        <div><span class="cat">${esc(r.category || 'Senza categoria')}</span><h2>${esc(r.title)}</h2></div>
        <button class="heart ${r.fav ? 'on' : ''}" style="position:static;background:var(--card);border:1px solid var(--line)" data-act="fav" data-id="${r.id}" aria-label="Preferita">♥</button>
      </div>

      <div class="facts">
        ${fact('Preparazione', fmtMin(r.prepMin))}${fact('Cottura', fmtMin(r.cookMin))}${fact('Totale', total ? fmtMin(total) : '')}${fact('Difficoltà', r.difficulty)}
      </div>

      ${(r.cookMin || r.cookMethod) ? `<div class="cook">
        <div class="t"><b>🔥 ${r.cookMin ? 'Cottura: ' + fmtMin(r.cookMin) : 'Cottura'}</b>${r.cookMethod ? `<span>${esc(r.cookMethod)}</span>` : ''}</div>
        ${r.cookMin ? `<button class="btn primary" data-act="timer" data-min="${r.cookMin}" data-label="${esc(r.title)} · cottura">⏱ Avvia timer cottura</button>` : ''}
      </div>` : ''}

      ${r.steps.length ? `<button class="btn primary block cook-btn" data-act="cook" data-id="${r.id}">👩‍🍳 Modalità cucina</button>` : ''}

      <div>
        <div class="sec">
          <h3>Ingredienti</h3>
          <div class="serv"><button data-act="serv" data-d="-1" aria-label="Meno porzioni">−</button>
            <span>${ui.servings} ${ui.servings === 1 ? 'porzione' : 'porzioni'}</span>
            <button data-act="serv" data-d="1" aria-label="Più porzioni">＋</button></div>
        </div>
        <ul class="ings">${r.ingredients.map((i, k) => `
          <li><label><input type="checkbox" data-chk="i${k}" ${ui.checked.has('i' + k) ? 'checked' : ''}>
            <span class="qty">${esc([scaledIng(i, factor), i.unit].filter(Boolean).join(' '))}</span><span class="nm">${esc(i.name)}</span></label></li>`).join('') || '<li><label>Nessun ingrediente</label></li>'}
        </ul>
        ${r.ingredients.length ? `<button class="btn green block" style="margin-top:12px" data-act="shop-recipe" data-id="${r.id}">🛒 Aggiungi alla lista della spesa</button>` : ''}
      </div>

      ${r.steps.length ? `<div>
        <div class="sec"><h3>Preparazione</h3></div>
        <ol class="steps">${r.steps.map((s, k) => `
          <li><div class="sbody">
            <label><input type="checkbox" data-chk="s${k}" ${ui.checked.has('s' + k) ? 'checked' : ''}><span class="stext">${esc(s.text)}</span></label>
            ${+s.minutes ? `<button class="btn sm" data-act="timer" data-min="${s.minutes}" data-label="${esc(r.title)} · passo ${k + 1}">⏱ ${fmtMin(s.minutes)}</button>` : ''}
          </div></li>`).join('')}
        </ol></div>` : ''}

      ${r.notes ? `<div class="notes"><b>💡 Note e consigli</b>${esc(r.notes)}</div>` : ''}

      <div class="actions">
        <button class="btn" data-act="wake" id="wakeBtn">${wake ? '☀️ Schermo sempre acceso' : '🌙 Tieni lo schermo acceso'}</button>
        <button class="btn" data-act="edit" data-id="${r.id}">✏️ Modifica</button>
        <button class="btn danger" data-act="del" data-id="${r.id}">🗑 Elimina</button>
      </div>
    </div>`;
  renderTimers();
}

/* ---------- Editor ricetta ---------- */
const ingRow = (i = {}) => `<div class="row ing">
  <input class="q" placeholder="Q.tà" value="${esc(i.qty)}" inputmode="decimal" aria-label="Quantità">
  <input class="u" list="units" placeholder="Unità" value="${esc(i.unit)}" aria-label="Unità">
  <input class="n" placeholder="Ingrediente" value="${esc(i.name)}" aria-label="Ingrediente">
  <button type="button" class="x" data-act="rm-row" aria-label="Rimuovi">✕</button></div>`;
const stepRow = (s = {}) => `<div class="row step">
  <textarea class="t" placeholder="Descrivi il passaggio…" aria-label="Passaggio">${esc(s.text)}</textarea>
  <input class="m" type="number" min="0" placeholder="⏱ min" value="${+s.minutes || ''}" title="Minuti per un timer (facoltativo)" aria-label="Minuti timer">
  <button type="button" class="x" data-act="rm-row" aria-label="Rimuovi">✕</button></div>`;

/** `draft`: ricetta importata da mostrare nell'editor come nuova (non ancora salvata). */
function openEditor(id, draft) {
  const r = id ? recipeById(id) : null;
  ui.edit = id || null; ui.photo = r?.photo || draft?.photo || '';
  $('#cats').innerHTML = allCats().map(c => `<option value="${esc(c)}">`).join('');
  const v = r || draft || { title: '', category: '', servings: 4, prepMin: '', cookMin: '', cookMethod: '', difficulty: '', ingredients: [{}, {}, {}], steps: [{}], notes: '' };

  $('#ed').innerHTML = `<form class="ed" id="edForm" autocomplete="off">
    <h2>${r ? 'Modifica ricetta' : draft ? 'Controlla la ricetta importata' : 'Nuova ricetta'}</h2>
    ${draft ? '<p class="hint" style="margin:-8px 0 0">Verifica ingredienti e passaggi, poi salva. Nulla è stato ancora aggiunto al ricettario.</p>' : ''}
    <label class="field"><span>Titolo *</span><input name="title" required maxlength="120" value="${esc(v.title)}" placeholder="Es. Lasagne alla bolognese"></label>
    <div class="grid2">
      <label class="field"><span>Categoria</span><input name="category" list="cats" value="${esc(v.category)}" placeholder="Es. Primi"></label>
      <label class="field"><span>Porzioni</span><input name="servings" type="number" min="1" value="${esc(v.servings)}"></label>
    </div>
    <div class="grid2">
      <label class="field"><span>Difficoltà</span>
        <select name="difficulty"><option value="">—</option>${['Facile', 'Media', 'Impegnativa'].map(d => `<option ${v.difficulty === d ? 'selected' : ''}>${d}</option>`).join('')}</select></label>
      <label class="field"><span>Preparazione (min)</span><input name="prepMin" type="number" min="0" value="${esc(v.prepMin)}"></label>
    </div>

    <div class="cookbox">
      <span class="lbl">🔥 Cottura</span>
      <div class="grid2">
        <label class="field"><span>Durata (min)</span><input name="cookMin" type="number" min="0" value="${esc(v.cookMin)}" placeholder="Es. 45"></label>
        <label class="field"><span>Metodo / temperatura</span><input name="cookMethod" value="${esc(v.cookMethod)}" placeholder="Es. Forno 180 °C ventilato"></label>
      </div>
    </div>

    <div class="field"><span>Foto (facoltativa)</span>
      <div class="photo-pick">
        <img id="photoPrev" alt="" ${ui.photo ? `src="${ui.photo}"` : 'hidden'}>
        <label class="btn sm">📷 Scegli foto<input type="file" id="photoIn" accept="image/*"></label>
        <button type="button" class="btn sm" data-act="photo-rm" id="photoRm" ${ui.photo ? '' : 'hidden'}>Rimuovi</button>
      </div></div>

    <div><span class="lbl">Ingredienti</span>
      <div class="rows" id="ingRows">${v.ingredients.map(ingRow).join('')}</div>
      <button type="button" class="btn sm" data-act="add-ing">＋ Ingrediente</button></div>

    <div><span class="lbl">Preparazione · il timer per ogni passo è facoltativo</span>
      <div class="rows" id="stepRows">${v.steps.map(stepRow).join('')}</div>
      <button type="button" class="btn sm" data-act="add-step">＋ Passaggio</button></div>

    <label class="field"><span>Note e consigli</span><textarea name="notes" rows="3" placeholder="Trucchi, varianti, conservazione…">${esc(v.notes)}</textarea></label>

    <div class="form-actions">
      <button type="button" class="btn" data-act="close">Annulla</button>
      <button class="btn primary">💾 Salva ricetta</button>
    </div></form>`;
  const d = $('#ed'); if (!d.open) d.showModal();
  d.scrollTop = 0;
}

function saveRecipe(form) {
  const f = new FormData(form);
  const ingredients = $$('#ingRows .row').map(row => ({
    qty: $('.q', row).value.trim(), unit: $('.u', row).value.trim(), name: $('.n', row).value.trim()
  })).filter(i => i.name);
  const steps = $$('#stepRows .row').map(row => ({
    text: $('.t', row).value.trim(), minutes: Math.max(0, parseInt($('.m', row).value, 10) || 0)
  })).filter(s => s.text);

  const data = {
    title: f.get('title').trim(), category: f.get('category').trim(), servings: Math.max(1, +f.get('servings') || 1),
    prepMin: +f.get('prepMin') || 0, cookMin: +f.get('cookMin') || 0, cookMethod: f.get('cookMethod').trim(),
    difficulty: f.get('difficulty'), notes: f.get('notes').trim(), photo: ui.photo, ingredients, steps
  };
  if (!data.title) return;

  const prev = state.recipes;
  let id = ui.edit;
  if (id) Object.assign(recipeById(id), data);
  else { id = uid(); state.recipes.unshift({ id, fav: false, created: Date.now(), ...data }); }
  if (!save()) { state.recipes = prev; return; }

  $('#ed').close();
  toast('Ricetta salvata ✔');
  render();
  if ($('#rv').open) { ui.viewId = id; renderRecipeDialog(); }
}

function resizePhoto(file) {
  return new Promise((res, rej) => {
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => {
      const max = 900, k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      res(c.toDataURL('image/jpeg', .75));
    };
    img.onerror = rej;
    img.src = url;
  });
}

/* =========================================================
   Modalità cucina
   =========================================================
   Schermo intero, un passaggio per volta. Pagine: 0 = ingredienti, 1…N = passaggi, N+1 = fine.
   Lo schermo resta acceso finché è aperta; si scorre con i pulsanti, con il dito o con le frecce. */
const CK_SIZES = [1, 1.25, 1.55, 1.9];
function ckSizeLoad() { try { const raw = localStorage.getItem('ricettario.ckSize'), n = +raw; return raw !== null && Number.isInteger(n) && n >= 0 && n < CK_SIZES.length ? n : 1; } catch { return 1; } }

function openCook(id) {
  const r = recipeById(id); if (!r || !r.steps.length) return;
  ui.ck = { id, page: 0, peek: false, size: ckSizeLoad(), hadWake: !!wake };
  ui.wantWake = true; setWake(true);
  renderCook();
  const d = $('#ck'); if (!d.open) d.showModal();
}

function ckIngredients(r) {
  const f = (ui.servings || +r.servings || 1) / (+r.servings || 1);
  return `<ul class="ings ck-ings">${r.ingredients.map((i, k) => `
    <li><label><input type="checkbox" data-chk="i${k}" ${ui.checked.has('i' + k) ? 'checked' : ''}>
      <span class="qty">${esc([scaledIng(i, f), i.unit].filter(Boolean).join(' '))}</span><span class="nm">${esc(i.name)}</span></label></li>`).join('') || '<li><label>Nessun ingrediente</label></li>'}</ul>`;
}

function renderCook() {
  const c = ui.ck, r = c && recipeById(c.id), d = $('#ck');
  if (!r || !r.steps.length) { if (d.open) d.close(); return; }
  const last = r.steps.length + 1;
  c.page = Math.max(0, Math.min(last, c.page));
  const sv = ui.servings || +r.servings || 1;
  d.style.setProperty('--ck-fs', CK_SIZES[c.size]);

  let title, body;
  if (c.peek) {
    title = 'Ingredienti';
    body = ckIngredients(r);
  } else if (c.page === 0) {
    title = 'Prima di iniziare';
    body = `<p class="ck-sub">${sv} ${sv === 1 ? 'porzione' : 'porzioni'} · tocca per spuntare quello che hai preparato</p>${ckIngredients(r)}`;
  } else if (c.page === last) {
    title = 'Fatto!';
    body = `<div class="ck-end"><div class="big">🎉</div><h2>Buon appetito!</h2>
      ${r.notes ? `<div class="notes"><b>💡 Note e consigli</b>${esc(r.notes)}</div>` : ''}
      <button class="btn" data-act="ck-restart">↺ Ricomincia dall'inizio</button></div>`;
  } else {
    const s = r.steps[c.page - 1], label = `${r.title} · passo ${c.page}`;
    const running = state.timers.some(t => t.label === label && !t.fired);
    title = `Passo ${c.page} di ${r.steps.length}`;
    body = `<p class="ck-step">${esc(s.text)}</p>
      ${+s.minutes ? `<button class="btn ${running ? 'green' : 'primary'} ck-timer" data-act="timer" data-min="${s.minutes}" data-label="${esc(label)}">
        ${running ? `✔ Timer avviato · ${fmtMin(s.minutes)}` : `⏱ Avvia timer · ${fmtMin(s.minutes)}`}</button>` : ''}`;
  }

  const pct = Math.round(c.page / last * 100);
  d.innerHTML = `
    <div class="ck-top">
      <button class="icon-btn" data-act="close" aria-label="Esci dalla modalità cucina">✕</button>
      <div class="ck-title"><b>${esc(r.title)}</b><span>${title}</span></div>
      <button class="icon-btn" data-act="ck-size" data-d="-1" aria-label="Testo più piccolo" ${c.size === 0 ? 'disabled' : ''}><span style="font-size:.8rem">A</span></button>
      <button class="icon-btn" data-act="ck-size" data-d="1" aria-label="Testo più grande" ${c.size === CK_SIZES.length - 1 ? 'disabled' : ''}><span style="font-size:1.25rem">A</span></button>
    </div>
    <div class="ck-bar" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><i style="width:${pct}%"></i></div>
    <div class="ck-body">${body}</div>
    <div class="timers in-cook" hidden></div>
    <div class="ck-nav">
      ${c.page > 0 && c.page < last ? `<button class="btn ${c.peek ? 'on' : ''}" data-act="ck-ing" aria-label="Ingredienti">${c.peek ? '↩︎' : '🧾'}</button>` : ''}
      <button class="btn" data-act="ck-prev" ${c.page === 0 && !c.peek ? 'disabled' : ''}>← Indietro</button>
      ${c.page < last ? `<button class="btn primary" data-act="ck-next">${c.page === 0 ? 'Inizia' : c.page === r.steps.length ? 'Fine' : 'Avanti'} →</button>`
        : `<button class="btn primary" data-act="close">Chiudi</button>`}
    </div>`;
  renderTimers();
  $('.ck-body', d).scrollTop = 0;
}

function ckGo(delta) {
  const c = ui.ck; if (!c) return;
  if (c.peek) { c.peek = false; if (delta > 0) return renderCook(); }   // dalla vista ingredienti si torna al passo
  c.page += delta; renderCook();
}

$('#ck').addEventListener('close', () => {
  if (ui.ck && !ui.ck.hadWake) { ui.wantWake = false; setWake(false); }
  ui.ck = null;
  if ($('#rv').open) renderRecipeDialog();      // le spunte fatte in cucina compaiono anche nella scheda
});

// scorrimento con il dito: sinistra = avanti, destra = indietro
(() => {
  let x0 = 0, y0 = 0;
  const d = $('#ck');
  d.addEventListener('touchstart', e => { x0 = e.changedTouches[0].clientX; y0 = e.changedTouches[0].clientY; }, { passive: true });
  d.addEventListener('touchend', e => {
    if (!ui.ck || e.target.closest('.timers, .ck-nav, .ck-top')) return;
    const dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0;
    if (Math.abs(dx) > 70 && Math.abs(dx) > 1.6 * Math.abs(dy)) ckGo(dx < 0 ? 1 : -1);
  }, { passive: true });
})();
document.addEventListener('keydown', e => {
  if (!ui.ck || !$('#ck').open) return;
  if (e.key === 'ArrowRight') { e.preventDefault(); ckGo(1); }
  else if (e.key === 'ArrowLeft') { e.preventDefault(); ckGo(-1); }
});

/* =========================================================
   Piano settimanale
   ========================================================= */
const SLOTS = [['p', '☀️ Pranzo'], ['c', '🌙 Cena']];
const PEOPLE_KEY = 'ricettario.planPeople';
/** Per quante persone si cucina di solito (ultima scelta fatta su questo dispositivo; all'inizio 2). */
function planPeople() { try { const n = +localStorage.getItem(PEOPLE_KEY); return Number.isInteger(n) && n >= 1 && n <= 30 ? n : 2; } catch { return 2; } }
function setPlanPeople(n) { try { localStorage.setItem(PEOPLE_KEY, n); } catch { /* ignora */ } }
/** Persone di un pasto in programma: quelle scelte, altrimenti (pasti vecchi) le porzioni della ricetta. */
const mealPeople = (e, r) => e.servings || +r.servings || 1;
const ymd = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const mondayOf = d => addDays(new Date(d.getFullYear(), d.getMonth(), d.getDate()), -((d.getDay() + 6) % 7));
const dayName = (d, opt) => d.toLocaleDateString('it-IT', opt);
ui.week = mondayOf(new Date());

function renderPlan() {
  const todayS = ymd(new Date()), end = addDays(ui.week, 6);
  const range = `${dayName(ui.week, { day: 'numeric', month: 'short' })} – ${dayName(end, { day: 'numeric', month: 'short' })}`;
  const isThisWeek = ymd(ui.week) === ymd(mondayOf(new Date()));
  let planned = 0;

  const days = Array.from({ length: 7 }, (_, k) => {
    const d = addDays(ui.week, k), key = ymd(d), day = state.plan[key] || {};
    const slots = SLOTS.map(([s, label]) => {
      const entries = day[s] || [];
      planned += entries.filter(e => e.rid && recipeById(e.rid)).length;
      return `<div class="slot"><div class="slot-h"><span>${label}</span>
          <button class="add" data-act="plan-add" data-date="${key}" data-slot="${s}" aria-label="Aggiungi a ${label}">＋</button></div>
        ${entries.map(e => {
          const r = e.rid && recipeById(e.rid);
          return `<div class="meal ${e.rid && !r ? 'gone' : ''}">
            ${r ? `<button class="mt" data-act="open" data-id="${r.id}" data-serv="${mealPeople(e, r)}">${emojiFor(r.category)} ${esc(r.title)}</button>
              <span class="pp"><button data-act="plan-serv" data-d="-1" data-date="${key}" data-slot="${s}" data-id="${e.id}" aria-label="Meno persone">−</button><span>👥 ${mealPeople(e, r)}</span><button data-act="plan-serv" data-d="1" data-date="${key}" data-slot="${s}" data-id="${e.id}" aria-label="Più persone">＋</button></span>`
               : `<span class="mt">${e.rid ? 'Ricetta eliminata' : '✎ ' + esc(e.text)}</span>`}
            <button class="x" data-act="plan-del" data-date="${key}" data-slot="${s}" data-id="${e.id}" aria-label="Rimuovi">✕</button></div>`;
        }).join('')}</div>`;
    }).join('');
    return `<section class="day ${key === todayS ? 'today' : ''} ${key < todayS ? 'past' : ''}">
      <h3>${esc(dayName(d, { weekday: 'long' }))} <small>${d.getDate()} ${esc(dayName(d, { month: 'short' }))}</small>${key === todayS ? '<em>Oggi</em>' : ''}</h3>${slots}</section>`;
  }).join('');

  $('#view').innerHTML = `
    <div class="week-nav">
      <button class="btn sm" data-act="week" data-d="-1" aria-label="Settimana precedente">‹</button>
      <div class="wl"><b>${range}</b>${isThisWeek ? '<small>Questa settimana</small>' : ''}</div>
      <button class="btn sm" data-act="week" data-d="1" aria-label="Settimana successiva">›</button>
      ${isThisWeek ? '' : '<button class="btn sm" data-act="week" data-d="0">Oggi</button>'}
    </div>
    <div class="days">${days}</div>
    <div class="shop-actions" style="margin-top:18px">
      <button class="btn green" data-act="plan-shop" ${planned ? '' : 'disabled'}>🛒 Aggiungi alla spesa gli ingredienti della settimana</button>
      <button class="btn sm danger" data-act="plan-clear" ${Object.keys(state.plan).some(k => k >= ymd(ui.week) && k <= ymd(end)) ? '' : 'disabled'}>Svuota settimana</button>
    </div>
    <p class="hint">Gli ingredienti vengono calcolati per il numero di persone (👥) di ogni pasto. Vengono aggiunti solo i giorni da oggi in poi, e le quantità uguali si sommano.</p>`;
}

function openPicker(date, slot) {
  ui.pick = { date, slot, people: planPeople() };
  const d = new Date(date + 'T12:00:00');
  const label = SLOTS.find(s => s[0] === slot)[1];
  $('#pk').innerHTML = `<div class="rv-body">
    <button class="close" data-act="close" style="position:static;float:none;margin:0 0 -10px auto;display:block" aria-label="Chiudi">✕</button>
    <div><h2>Cosa si mangia?</h2><p class="hint" style="margin-top:4px">${esc(dayName(d, { weekday: 'long', day: 'numeric', month: 'long' }))} · ${label}</p></div>
    <div class="pk-people"><span>👥 Per quante persone?</span>
      <div class="serv"><button data-act="pk-people" data-d="-1" aria-label="Meno persone">−</button><span id="pkPeople">${ui.pick.people} ${ui.pick.people === 1 ? 'persona' : 'persone'}</span><button data-act="pk-people" data-d="1" aria-label="Più persone">＋</button></div></div>
    <input id="pkSearch" type="search" placeholder="Cerca nel ricettario…" autocomplete="off"
      style="padding:12px 16px;border-radius:14px;border:1px solid var(--line);background:var(--card);color:var(--ink);width:100%">
    <div class="stack" id="pkList"></div>
    <hr>
    <form class="add-form" id="pkForm"><input id="pkText" placeholder="Oppure scrivi: es. Pizza fuori, Avanzi…" autocomplete="off"><button class="btn">Aggiungi</button></form></div>`;
  renderPickList('');
  $('#pk').showModal();
}

function renderPickList(q) {
  q = q.trim().toLowerCase();
  const list = state.recipes.filter(r => !q || [r.title, r.category].join(' ').toLowerCase().includes(q))
    .sort((a, b) => a.title.localeCompare(b.title, 'it'));
  $('#pkList').innerHTML = list.length
    ? list.map(r => `<button class="btn pick" data-act="pick" data-id="${r.id}"><span>${emojiFor(r.category)} ${esc(r.title)}</span><small>${esc(r.category || '')}</small></button>`).join('')
    : '<p class="hint">Nessuna ricetta trovata: puoi scrivere un pasto libero qui sotto.</p>';
}

function planAdd(entry) {
  const { date, slot } = ui.pick;
  const day = state.plan[date] = state.plan[date] || {};
  (day[slot] = day[slot] || []).push({ id: uid(), ...entry });
  save(); $('#pk').close(); render();
}

function planToShopping() {
  const todayS = ymd(new Date());
  let n = 0;
  for (let k = 0; k < 7; k++) {
    const day = state.plan[ymd(addDays(ui.week, k))];
    if (!day || ymd(addDays(ui.week, k)) < todayS) continue;
    SLOTS.forEach(([s]) => (day[s] || []).forEach(e => {
      const r = e.rid && recipeById(e.rid); if (!r) return;
      const f = mealPeople(e, r) / (+r.servings || 1);
      r.ingredients.forEach(i => { const q = parseQty(i.qty); addShopItem({ name: i.name, qty: q != null ? niceQty(q * f) : null, unit: i.unit, from: 'Piano settimanale' }); });
      n++;
    }));
  }
  if (!n) return toast('Nessun pasto da oggi in poi in questa settimana');
  save(); render();
  toast(`Ingredienti di ${n} ${n === 1 ? 'pasto aggiunto' : 'pasti aggiunti'} alla spesa 🛒`);
}

/* =========================================================
   Lista della spesa
   ========================================================= */
/* ---------- Reparti del supermercato ---------- */
// Ordine = percorso tipico nel supermercato. `w`: parole esatte; con * finale basta l'inizio ("mandarin*"); `p`: frasi (hanno la precedenza).
const AISLES = [
  { id: 'frutta', label: 'Frutta e verdura', icon: '🥬', w: ['mela', 'mele', 'pera', 'pere', 'banana', 'banane', 'arancia', 'arance', 'limone', 'limoni', 'mandarin*', 'clementin*', 'fragol*', 'uva', 'kiwi', 'ananas', 'pesca', 'pesche', 'albicocc*', 'ciliegi*', 'melone', 'anguria', 'cocomero', 'avocado', 'lime', 'pompelmo', 'mirtill*', 'lampon*', 'insalata', 'lattuga', 'rucola', 'spinaci', 'valeriana', 'radicchio', 'pomodor*', 'cipolla', 'cipolle', 'cipollotto', 'cipollotti', 'scalogno', 'aglio', 'patata', 'patate', 'carota', 'carote', 'zucchina', 'zucchine', 'melanzan*', 'peperon*', 'funghi', 'fungo', 'champignon', 'sedano', 'finocch*', 'cavol*', 'broccol*', 'verza', 'zucca', 'porro', 'porri', 'asparag*', 'carciof*', 'fagiolini', 'basilico', 'prezzemolo', 'rosmarino', 'salvia', 'menta', 'timo', 'bietol*', 'cetriol*', 'ravanell*', 'barbabietol*', 'zenzero', 'rapa', 'rape', 'friarielli', 'cicoria', 'indivia', 'songino', 'erbette', 'verdura', 'verdure', 'frutta', 'tuberi'] },
  { id: 'pane', label: 'Pane e forno', icon: '🥖', w: ['pane', 'panini', 'panino', 'focaccia', 'grissini', 'cracker', 'crackers', 'piadina', 'piadine', 'pizza', 'tortilla', 'tortillas', 'wrap', 'pancarr*', 'baguette', 'ciabatta', 'rosette', 'michette'] },
  { id: 'carne', label: 'Carne e salumi', icon: '🥩', w: ['pollo', 'tacchino', 'manzo', 'vitello', 'maiale', 'suino', 'agnello', 'salsiccia', 'salsicce', 'hamburger', 'macinato', 'bistecca', 'bistecche', 'fettina', 'fettine', 'arrosto', 'coniglio', 'prosciutto', 'salame', 'mortadella', 'speck', 'bresaola', 'pancetta', 'guanciale', 'wurstel', 'cotoletta', 'cotolette', 'spezzatino', 'costine', 'coscia', 'cosce', 'fesa', 'nduja', 'cotechino', 'porchetta', 'carne', 'salumi', 'affettato', 'tritato'] },
  { id: 'pesce', label: 'Pesce', icon: '🐟', w: ['pesce', 'salmone', 'merluzzo', 'baccala', 'branzino', 'orata', 'spigola', 'gamber*', 'scamp*', 'calamar*', 'polpo', 'cozze', 'vongol*', 'seppia', 'seppie', 'sogliola', 'platessa', 'trota', 'acciugh*', 'alici', 'sarde', 'sardine', 'mazzancolle', 'totani', 'moscardini', 'crostacei'] },
  { id: 'latte', label: 'Latticini e uova', icon: '🧀', w: ['latte', 'panna', 'burro', 'yogurt', 'formaggio', 'formaggi', 'mozzarella', 'mozzarelle', 'parmigiano', 'grana', 'pecorino', 'ricotta', 'mascarpone', 'gorgonzola', 'provola', 'scamorza', 'fontina', 'taleggio', 'stracchino', 'philadelphia', 'emmental', 'asiago', 'burrata', 'feta', 'uova', 'uovo', 'tuorli', 'tuorlo', 'albumi', 'albume', 'kefir', 'besciamella', 'fiocchi'] },
  { id: 'pasta', label: 'Pasta, riso e farine', icon: '🍝', w: ['pasta', 'spaghetti', 'penne', 'fusilli', 'rigatoni', 'tagliatelle', 'lasagne', 'farfalle', 'orecchiette', 'tortellini', 'ravioli', 'gnocchi', 'riso', 'couscous', 'farro', 'orzo', 'quinoa', 'farina', 'semola', 'polenta', 'pangrattato', 'amido', 'maizena', 'bucatini', 'linguine', 'paccheri', 'mezze', 'tagliolini', 'cereali'] },
  { id: 'conserve', label: 'Conserve e legumi', icon: '🥫', w: ['passata', 'pelati', 'polpa', 'concentrato', 'tonno', 'scatola', 'lenticchie', 'ceci', 'fagioli', 'legumi', 'piselli', 'mais', 'olive', 'capperi', 'carciofini', 'cetriolini', 'sottaceti', 'sottolio', 'salsa', 'pesto', 'ragu', 'sugo', 'conserva', 'conserve', 'scatolette'] },
  { id: 'condimenti', label: 'Olio, spezie e condimenti', icon: '🧂', w: ['olio', 'aceto', 'sale', 'pepe', 'peperoncino', 'spezie', 'origano', 'paprika', 'curry', 'curcuma', 'cannella', 'noce', 'zafferano', 'dado', 'brodo', 'maionese', 'ketchup', 'senape', 'tahini', 'rosmarino secco', 'chiodi', 'cumino', 'coriandolo', 'aromi', 'bicarbonato'] },
  { id: 'dolci', label: 'Colazione, dolci e snack', icon: '🍪', w: ['zucchero', 'cacao', 'cioccolato', 'cioccolata', 'nutella', 'marmellata', 'confettura', 'miele', 'biscotti', 'biscotto', 'muesli', 'merendine', 'brioche', 'croissant', 'cornetto', 'cornetti', 'lievito', 'vanillina', 'vaniglia', 'savoiardi', 'amaretti', 'mandorle', 'noci', 'nocciole', 'pistacchi', 'pinoli', 'uvetta', 'caffe', 'te', 'the', 'tisana', 'camomilla', 'budino', 'wafer', 'patatine', 'snack', 'gelatina', 'colla', 'canditi', 'granella', 'fette'] },
  { id: 'surgelati', label: 'Surgelati', icon: '🧊', w: ['surgelat*', 'congelat*', 'gelato', 'gelati', 'ghiaccio', 'bastoncini'] },
  { id: 'bevande', label: 'Bevande', icon: '🥤', w: ['acqua', 'vino', 'birra', 'succo', 'succhi', 'aranciata', 'coca', 'cola', 'bibita', 'bibite', 'spumante', 'prosecco', 'liquore', 'grappa', 'amaro', 'limonata', 'gassosa', 'sciroppo', 'soda', 'tonica', 'chinotto', 'energy', 'frizzante', 'rum', 'vodka', 'gin', 'whisky'] },
  { id: 'casa', label: 'Casa e igiene', icon: '🧴', w: ['detersivo', 'detersivi', 'sapone', 'shampoo', 'bagnoschiuma', 'dentifricio', 'spazzolino', 'ammorbidente', 'pellicola', 'alluminio', 'sacchetti', 'sacchi', 'spugna', 'spugne', 'candeggina', 'sgrassatore', 'lavastoviglie', 'pastiglie', 'tovaglioli', 'pannolini', 'assorbenti', 'deodorante', 'rasoio', 'cotone', 'fazzoletti', 'lampadine', 'pile', 'batterie', 'detergente', 'scottex', 'igienica', 'panni', 'straccio', 'carta'] },
  { id: 'altro', label: 'Altro', icon: '🛒', w: [] },
];
const AISLE_PHRASES = [
  ['surgelati', ['surgelat', 'congelat']],
  ['condimenti', ['peperoncino', 'noce moscata']],
  ['conserve', ['tonno in scatola', 'tonno sott', 'latte di cocco', 'burro di arachidi', 'burro di noccio', 'passata di', 'polpa di pomodoro', 'concentrato di pomodoro', 'pomodori pelati', 'pomodori in scatola', 'legumi in scatola', 'piselli in scatola']],
  ['surgelati', ['pizza surgelata', 'verdure surgelate', 'spinaci surgelati', 'piselli surgelati', 'patatine surgelate', 'minestrone surgelato', 'pesce surgelato']],
  ['pesce', ['tonno fresco', 'pesce spada', 'frutti di mare', 'filetto di merluzzo', 'filetti di merluzzo']],
  ['bevande', ['latte di soia', 'latte di mandorla', 'latte di riso', 'latte di avena', 'latte vegetale', 'te freddo', 'the freddo', 'acqua tonica']],
  ['dolci', ['latte condensato', 'zucchero a velo', 'gocce di cioccolato', 'fette biscottate']],
  ['condimenti', ['noce moscata', 'rosmarino secco', 'salvia secca', 'basilico secco', 'sale grosso', 'sale fino', 'chiodi di garofano', 'olio di semi', 'olio di oliva']],
  ['carne', ['petto di pollo', 'carne macinata']],
  ['casa', ['carta igienica', 'carta da cucina', 'carta forno', 'carta stagnola', 'sacchetti per', 'piatti di carta', 'bicchieri di carta']],
];
const AISLE_BY_ID = Object.fromEntries(AISLES.map(a => [a.id, a]));
const normName = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9' ]+/g, ' ').replace(/\s+/g, ' ').trim();

/** Indovina il reparto dal nome: prima le frasi, poi la prima parola riconosciuta da sinistra. */
function guessAisle(name) {
  const n = normName(name);
  for (const [id, phrases] of AISLE_PHRASES) if (phrases.some(p => n.includes(p))) return id;
  for (const t of n.split(/[ ']/)) {
    for (const a of AISLES) {
      if (a.w.some(w => w.endsWith('*') ? t.startsWith(w.slice(0, -1)) : t === w)) return a.id;
    }
  }
  return 'altro';
}
/** Reparto scelto a mano, oppure ricordato da una scelta precedente, oppure indovinato. */
const aisleOf = i => (AISLE_BY_ID[i.aisle] && i.aisle) || (state.aisleMap || {})[normName(i.name)] || guessAisle(i.name);
const shopGrouped = () => { try { return localStorage.getItem('ricettario.groupShop') !== '0'; } catch { return true; } };

const shopRow = (i, mover) => `
  <li class="${i.done ? 'done' : ''}"><label>
    <input type="checkbox" data-chk="shop" data-id="${i.id}" ${i.done ? 'checked' : ''}>
    <span class="t">${itemLabel(i)}</span>${i.from ? `<span class="from">${esc(i.from)}</span>` : ''}</label>
    ${mover ? `<button class="x" data-act="shop-aisle" data-id="${i.id}" aria-label="Cambia reparto" title="Cambia reparto">↪</button>` : ''}
    <button class="x" data-act="shop-del" data-id="${i.id}" aria-label="Elimina">✕</button></li>`;

/** Prodotti da comprare divisi per reparto (nell'ordine del supermercato), poi quelli già nel carrello. */
function shopSections() {
  const byName = (a, b) => a.name.localeCompare(b.name, 'it');
  const open = state.shopping.filter(i => !i.done), done = state.shopping.filter(i => i.done);
  const sections = AISLES.map(a => ({ a, items: open.filter(i => aisleOf(i) === a.id).sort(byName) })).filter(s => s.items.length);
  return { sections, done: done.sort(byName) };
}

function renderShopping() {
  const items = state.shopping, grouped = shopGrouped();
  let list = '';
  if (!items.length) {
    list = `<div class="empty"><div class="big">🛒</div><h3>La lista è vuota</h3>
      <p>Aggiungi prodotti qui sopra oppure, da una ricetta, tocca “Aggiungi alla lista della spesa”.</p></div>`;
  } else if (grouped) {
    const { sections, done } = shopSections();
    list = sections.map(({ a, items }) => `<section class="aisle"><h3><span>${a.icon}</span> ${esc(a.label)} <small>${items.length}</small></h3>
        <ul class="list">${items.map(i => shopRow(i, true)).join('')}</ul></section>`).join('')
      + (done.length ? `<section class="aisle in-cart"><h3><span>✔</span> Nel carrello <small>${done.length}</small></h3>
        <ul class="list">${done.map(i => shopRow(i, false)).join('')}</ul></section>` : '');
  } else {
    list = `<ul class="list">${[...items].sort((a, b) => a.done - b.done).map(i => shopRow(i, false)).join('')}</ul>`;
  }
  $('#view').innerHTML = `
    <form class="add-form" id="addForm">
      <input id="addInput" placeholder="Aggiungi… (es. 2 kg patate, latte)" autocomplete="off" aria-label="Nuovo prodotto">
      <button class="btn primary">Aggiungi</button>
    </form>
    <div class="shop-actions">
      <button class="btn sm ${grouped ? 'on' : ''}" data-act="shop-group" aria-pressed="${grouped}">🗂 Per reparto</button>
      <button class="btn sm" data-act="share" ${items.length ? '' : 'disabled'}>📤 Condividi</button>
      <button class="btn sm" data-act="import">📥 Importa</button>
      <button class="btn sm" data-act="clear-done" ${items.some(i => i.done) ? '' : 'disabled'}>✔ Rimuovi spuntati</button>
      <button class="btn sm danger" data-act="clear-all" ${items.length ? '' : 'disabled'}>Svuota</button>
    </div>
    ${list}`;
}

function openAislePicker(id) {
  const it = state.shopping.find(i => i.id === id); if (!it) return;
  const cur = aisleOf(it);
  $('#pk').innerHTML = `<div class="rv-body">
    <button class="close" data-act="close" style="position:static;float:none;margin:0 0 -10px auto;display:block" aria-label="Chiudi">✕</button>
    <div><h2>In che reparto?</h2><p class="hint" style="margin-top:4px">“${esc(it.name)}” — la scelta viene ricordata per la prossima volta.</p></div>
    <div class="stack">${AISLES.map(a => `<button class="btn pick ${a.id === cur ? 'primary' : ''}" data-act="aisle-pick" data-id="${id}" data-aisle="${a.id}"><span>${a.icon} ${esc(a.label)}</span></button>`).join('')}</div></div>`;
  $('#pk').showModal();
}

const itemLabel = i => {
  const q = [fmtQty(i.qty), i.unit].filter(Boolean).join(' ');
  return (q ? `<b>${esc(q)}</b>` : '') + esc(i.name);
};

/** Aggiunge un prodotto; somma le quantità se già presente con la stessa unità. */
function addShopItem({ name, qty = null, unit = '', from = '' }) {
  name = String(name || '').trim(); if (!name) return;
  const key = name.toLowerCase();
  const same = state.shopping.find(i => !i.done && i.name.toLowerCase() === key && (i.unit || '') === (unit || ''));
  if (same) {
    if (same.qty != null && qty != null) same.qty = Math.round((same.qty + qty) * 100) / 100;
    else if (same.qty == null && qty != null) same.qty = qty;
    return;
  }
  state.shopping.push({ id: uid(), name, qty, unit, done: false, from, ...((state.aisleMap || {})[normName(name)] ? { aisle: state.aisleMap[normName(name)] } : {}) });
}

/** Interpreta "2 kg patate", "3 uova", "latte". */
function parseShopInput(text) {
  const m = text.trim().match(/^(\d+(?:[.,]\d+)?(?:\/\d+)?)\s*([^\s\d]+)?\s+(.+)$/);
  if (m) {
    const qty = parseQty(m[1]);
    if (m[2] && UNITS.includes(m[2].toLowerCase())) return { name: m[3], qty, unit: m[2] };
    if (qty != null) return { name: [m[2], m[3]].filter(Boolean).join(' '), qty, unit: '' };
  }
  return { name: text.trim() };
}

function shopText() {
  const line = i => '☐ ' + [fmtQty(i.qty), i.unit, i.name].filter(Boolean).join(' ');
  if (!shopGrouped()) return '🛒 Lista della spesa\n' + state.shopping.filter(i => !i.done).map(line).join('\n');
  return '🛒 Lista della spesa\n' + shopSections().sections.map(({ a, items }) => `\n${a.icon} ${a.label}\n` + items.map(line).join('\n')).join('\n');
}

const b64 = s => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64 = s => decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/'))));
const shopCode = () => b64(JSON.stringify(state.shopping.filter(i => !i.done).map(i => [i.name, i.qty, i.unit])));
const shopLink = () => location.href.split('#')[0] + '#lista=' + shopCode();

/** Accetta un link completo o solo il codice. Restituisce quanti prodotti sono stati importati. */
function importShopCode(input) {
  const raw = String(input || '').trim().replace(/^.*lista=/, '');
  if (!raw) return 0;
  let arr;
  try { arr = JSON.parse(unb64(raw)); } catch { return -1; }
  if (!Array.isArray(arr)) return -1;
  let n = 0;
  arr.forEach(a => { if (Array.isArray(a) && a[0]) { addShopItem({ name: String(a[0]), qty: typeof a[1] === 'number' ? a[1] : null, unit: String(a[2] || ''), from: 'condivisa' }); n++; } });
  save(); render();
  return n;
}

function openShare() {
  $('#sh').innerHTML = `<div class="rv-body">
    <button class="close" data-act="close" style="position:static;float:none;margin:0 0 -10px auto;display:block" aria-label="Chiudi">✕</button>
    <h2>Condividi la lista</h2>
    <div class="sh-preview">${esc(shopText())}</div>
    <div class="stack">
      <a class="btn green" id="waBtn" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(shopText())}">💬 Invia su WhatsApp</a>
      ${navigator.share ? '<button class="btn" data-act="native-share">📤 Altre app…</button>' : ''}
      <button class="btn" data-act="copy-text">📋 Copia come testo</button>
      <hr>
      <p class="hint">Se anche l'altra persona usa questo Ricettario, mandale il link: aprendolo troverà i prodotti da importare.</p>
      <button class="btn" data-act="copy-link">🔗 Copia link / codice lista</button>
    </div></div>`;
  $('#sh').showModal();
}

function openImport() {
  $('#sh').innerHTML = `<div class="rv-body">
    <button class="close" data-act="close" style="position:static;float:none;margin:0 0 -10px auto;display:block" aria-label="Chiudi">✕</button>
    <h2>Importa una lista</h2>
    <p class="hint">Incolla qui il link o il codice che ti hanno inviato. I prodotti verranno aggiunti alla tua lista.</p>
    <form class="stack" id="importForm"><input class="add-form" style="padding:13px 16px;border:1px solid var(--line);border-radius:14px;background:var(--card);color:var(--ink)" id="importIn" placeholder="Incolla qui…" autocomplete="off">
      <button class="btn primary">Importa</button></form></div>`;
  $('#sh').showModal();
  $('#importIn').focus();
}

async function copy(text, okMsg) {
  try { await navigator.clipboard.writeText(text); }
  catch {
    const t = document.createElement('textarea'); t.value = text; document.body.append(t); t.select();
    try { document.execCommand('copy'); } catch { /* ignora */ }
    t.remove();
  }
  toast(okMsg);
}

/* =========================================================
   Timer
   ========================================================= */
let actx;
function ensureAudio() {
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    if (actx.state === 'suspended') actx.resume();
  } catch { /* audio non disponibile */ }
}
function ring() {
  ensureAudio();
  if (actx) for (let i = 0; i < 5; i++) {
    const o = actx.createOscillator(), g = actx.createGain(), t = actx.currentTime + i * .45;
    o.frequency.value = 880; o.connect(g); g.connect(actx.destination);
    g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(.35, t + .03); g.gain.exponentialRampToValueAtTime(.0001, t + .32);
    o.start(t); o.stop(t + .34);
  }
  navigator.vibrate?.([300, 150, 300, 150, 300]);
}

function startTimer(min, label) {
  ensureAudio();
  state.timers.push({ id: uid(), label, end: Date.now() + min * 60000, fired: false });
  save(); renderTimers(); pushSyncTimers();
  toast(`Timer avviato: ${fmtMin(min) || Math.round(min * 60) + ' secondi'}${pushOn() ? ' · ti avviso anche con l\'app chiusa' : ''}`);
}

function renderTimers() {
  const html = state.timers.map(t => {
    const left = t.end - Date.now();
    return `<div class="timer ${left <= 0 ? 'done' : ''}"><span class="tl">${esc(t.label)}</span>
      <b>${left <= 0 ? 'Pronto! 🔔' : fmtClock(left)}</b><button data-act="timer-x" data-id="${t.id}" aria-label="Rimuovi timer">✕</button></div>`;
  }).join('');
  $$('.timers').forEach(el => { el.innerHTML = html; el.hidden = !state.timers.length; });
}

function tick() {
  let changed = false;
  state.timers.forEach(t => {
    if (!t.fired && t.end <= Date.now()) {
      t.fired = true; changed = true;
      // se l'app era in background e la notifica è già arrivata, niente suono a sorpresa alla riapertura
      if (Date.now() - t.end < 20000) ring();
      toast('⏰ ' + t.label + ': tempo scaduto!');
    }
  });
  if (changed) { save(); pushSyncTimers(); }
  if (state.timers.length) renderTimers();
}
setInterval(tick, 1000);

/* ---------- Schermo sempre acceso ---------- */
let wake = null;
/** Accende o spegne lo schermo sempre acceso senza ridisegnare nulla. */
async function setWake(on) {
  if (!('wakeLock' in navigator)) return false;
  try {
    if (on && !wake) { wake = await navigator.wakeLock.request('screen'); wake.addEventListener('release', () => { wake = null; }); }
    if (!on && wake) { await wake.release(); wake = null; }
  } catch { /* non concesso (batteria scarica, scheda in background…) */ }
  return !!wake;
}
async function toggleWake() {
  if (!('wakeLock' in navigator)) return toast('Il browser non supporta questa funzione');
  try {
    if (wake) { await wake.release(); wake = null; }
    else { wake = await navigator.wakeLock.request('screen'); wake.addEventListener('release', () => { wake = null; }); }
  } catch { toast('Impossibile mantenere lo schermo acceso'); }
  if ($('#rv').open) renderRecipeDialog();
}
document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState === 'visible' && wake === null && ui.wantWake) try { wake = await navigator.wakeLock.request('screen'); } catch { /* ignora */ }
});
$('#rv').addEventListener('close', () => { if (wake) { wake.release(); wake = null; } });

/* =========================================================
   Backup
   ========================================================= */
/* =========================================================
   Importazione ricette da link
   ========================================================= */
const IMPORT_ENDPOINT = 'https://ricettario-import.mattia-subscriber.workers.dev';
const importEndpoint = () => (localStorage.getItem('ricettario.importUrl') || IMPORT_ENDPOINT).trim().replace(/\/+$/, '');

/** fetch con tempo massimo (AbortSignal.timeout non esiste sui Safari meno recenti). */
function fetchTimeout(url, opts = {}, ms = 20000) {
  const c = new AbortController(), t = setTimeout(() => c.abort(), ms);
  return fetch(url, { ...opts, signal: c.signal }).finally(() => clearTimeout(t));
}

const FRACTIONS = { '½': .5, '¼': .25, '¾': .75, '⅓': 1 / 3, '⅔': 2 / 3, '⅛': .125 };
const UNIT_MAP = {
  g: 'g', gr: 'g', grammo: 'g', grammi: 'g', kg: 'kg', chilo: 'kg', chili: 'kg', ml: 'ml', l: 'l', lt: 'l', litro: 'l', litri: 'l', cl: 'cl', dl: 'dl',
  cucchiaio: 'cucchiaio', cucchiai: 'cucchiai', cucchiaino: 'cucchiaino', cucchiaini: 'cucchiaini', pizzico: 'pizzico',
  spicchio: 'spicchio', spicchi: 'spicchi', foglia: 'foglia', foglie: 'foglie', bicchiere: 'bicchiere', bicchieri: 'bicchieri',
  tazza: 'tazza', tazze: 'tazze', tazzina: 'tazzina', bustina: 'bustina', bustine: 'bustine', pz: 'pz', pezzi: 'pz', pezzo: 'pz',
  rametto: 'rametto', rametti: 'rametti', ciuffo: 'ciuffo', noce: 'noce', fetta: 'fetta', fette: 'fette'
};

/** Toglie tag HTML ed entità (&amp;, &#39; …) e normalizza gli spazi. */
const decodeHtml = s => new DOMParser().parseFromString(String(s ?? ''), 'text/html').documentElement.textContent.replace(/\s+/g, ' ').trim();

function isoMinutes(s) {
  const m = String(s || '').match(/^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?/i);
  return m ? (+m[1] || 0) * 1440 + (+m[2] || 0) * 60 + (+m[3] || 0) : 0;
}

/** "200 g di farina" → { qty: '200', unit: 'g', name: 'farina' } */
function parseIngredient(line) {
  let s = decodeHtml(line).replace(/(\d+)?\s*([½¼¾⅓⅔⅛])/, (_, w, f) => String((+w || 0) + FRACTIONS[f]));
  const whole = { qty: '', unit: '', name: s };
  let m = s.match(/^q\.?\s?b\.?\s+(?:di\s+|d')?(.+)$/i);
  if (m) return { qty: '', unit: 'q.b.', name: m[1] };
  m = s.match(/^(.+?)[\s,]+q\.?\s?b\.?$/i);
  if (m) return { qty: '', unit: 'q.b.', name: m[1] };

  let qty, rest;
  if ((m = s.match(/^(\d+)\s+(\d+)\/(\d+)\s*(.*)$/))) { qty = +m[1] + m[2] / m[3]; rest = m[4]; }
  else if ((m = s.match(/^(\d+)\/(\d+)\s*(.*)$/))) { qty = m[1] / m[2]; rest = m[3]; }
  else if ((m = s.match(/^(\d+(?:[.,]\d+)?)\s*(.*)$/))) { qty = parseFloat(m[1].replace(',', '.')); rest = m[2]; }
  else {
    // quantità in fondo, come su GialloZafferano: "Spaghetti 320 g", "Tuorli (di uova medie) 6"
    m = s.match(/^(.+?)\s+(\d+(?:[.,]\d+)?)\s*([A-Za-zàèéìòù]+)?\.?$/);
    const n = m && parseFloat(m[2].replace(',', '.'));
    const unit = m && m[3] ? UNIT_MAP[m[3].toLowerCase()] : '';
    return n > 0 && (!m[3] || unit) ? { qty: fmtQty(n), unit: unit || '', name: m[1] } : whole;
  }
  if (/^[-–]\s*\d/.test(rest) || !rest) return whole;       // intervalli ("2-3 uova") o solo numero

  let unit = '';
  const u = rest.match(/^([A-Za-zàèéìòù]+)\.?\s*(.*)$/);
  if (u && UNIT_MAP[u[1].toLowerCase()] && u[2]) { unit = UNIT_MAP[u[1].toLowerCase()]; rest = u[2]; }
  rest = rest.replace(/^(?:di|d')\s*/i, '').trim();
  return rest ? { qty: fmtQty(qty), unit, name: rest } : whole;
}

/** Alcuni siti lasciano nel testo i numeri che rimandano alle foto ("antiaderente 4 e rosolate", "cottura 10 ;"): li toglie. */
function stripPhotoRefs(t) {
  return t
    .replace(/([\wà-ù])\s+\d{1,2}(?:\s+\d{1,2})*\s*([.,;:])(?!\d)/gi, '$1$2')
    .replace(/([a-zà-ù])\s+\d{1,2}(?=\s+(?:e|ed)\s+(?!\d|mezz))/gi, '$1')
    .replace(/\s{2,}/g, ' ').trim();
}

function flattenSteps(x, out = []) {
  if (!x) return out;
  if (typeof x === 'string') {
    x.replace(/<\/(?:p|li|div)>|<br\s*\/?>/gi, '\n').split(/\n+/).forEach(t => {
      t = stripPhotoRefs(decodeHtml(t)).replace(/^\s*(?:passo|step)?\s*\d+\s*[.):\-]\s*/i, '');
      if (t) out.push(t);
    });
  } else if (Array.isArray(x)) x.forEach(i => flattenSteps(i, out));
  else if (x.itemListElement) flattenSteps(x.itemListElement, out);
  else if (x.text || x.name) flattenSteps(x.text || x.name, out);
  return out;
}

/** Se il testo cita un solo tempo in minuti ("cuoci per 15 minuti") lo usa come timer del passo. */
function stepMinutes(text) {
  const all = [...text.matchAll(/(\d+)\s*(?:-\s*\d+\s*)?minut/gi)];
  return all.length === 1 ? Math.min(+all[0][1], 600) : 0;
}

function guessCategory(raw) {
  const first = decodeHtml([].concat(raw || [])[0] || '');
  const l = first.toLowerCase();
  const map = [['antipast', 'Antipasti'], ['starter', 'Antipasti'], ['primo', 'Primi'], ['primi', 'Primi'], ['pasta', 'Primi'], ['secondo', 'Secondi'], ['secondi', 'Secondi'],
    ['contorn', 'Contorni'], ['dolc', 'Dolci'], ['dessert', 'Dolci'], ['lievitat', 'Lievitati'], ['pane', 'Lievitati'], ['pizza', 'Lievitati'],
    ['zupp', 'Zuppe'], ['minestr', 'Zuppe'], ['pesce', 'Pesce']];
  return (map.find(([k]) => l.includes(k)) || [])[1] || first.slice(0, 30);
}

function findRecipeNode(doc) {
  const nodes = [];
  const walk = n => {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) return n.forEach(walk);
    nodes.push(n);
    if (n['@graph']) walk(n['@graph']);
  };
  $$('script[type="application/ld+json"]', doc).forEach(s => { try { walk(JSON.parse(s.textContent.trim())); } catch { /* JSON non valido: salta */ } });
  return nodes.find(n => [].concat(n['@type'] || []).some(t => /Recipe$/i.test(t)));
}

function recipeFromLd(n, url) {
  const prep = isoMinutes(n.prepTime), cook = isoMinutes(n.cookTime), total = isoMinutes(n.totalTime);
  const steps = flattenSteps(n.recipeInstructions).map(text => ({ text, minutes: stepMinutes(text) }));
  const ingredients = [].concat(n.recipeIngredient || n.ingredients || []).map(parseIngredient).filter(i => i.name);
  if (!ingredients.length && !steps.length) throw new Error('NO_RECIPE');
  const yieldNum = String([].concat(n.recipeYield || []).join(' ')).match(/\d+/);
  return {
    title: decodeHtml(n.name || ''), category: guessCategory(n.recipeCategory),
    servings: yieldNum ? +yieldNum[0] : 4,
    prepMin: prep || (!cook ? total : 0) || '', cookMin: cook || '',
    cookMethod: decodeHtml([].concat(n.cookingMethod || [])[0] || ''), difficulty: '',
    ingredients: ingredients.length ? ingredients : [{}], steps: steps.length ? steps : [{}],
    notes: 'Fonte: ' + url, photo: ''
  };
}

async function importFromUrl(url) {
  const ep = importEndpoint();
  if (!ep) throw new Error('NO_ENDPOINT');
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
  let res;
  try { res = await fetchTimeout(`${ep}/?url=${encodeURIComponent(url)}`, {}, 25000); }
  catch { throw new Error('Servizio di importazione non raggiungibile. Controlla la connessione e l\'indirizzo del servizio.'); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.html) throw new Error(data.error || `Errore ${res.status}`);
  const node = findRecipeNode(new DOMParser().parseFromString(data.html, 'text/html'));
  if (!node) throw new Error('NO_RECIPE');
  return recipeFromLd(node, data.finalUrl || url);
}

/** Bozza da testo libero: titolo sulla prima riga, poi sezioni "Ingredienti" e "Preparazione". */
function recipeFromText(text) {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const iIng = lines.findIndex(l => /^ingredienti\b/i.test(l));
  const iPrep = lines.findIndex((l, k) => k > iIng && /^(preparazione|procedimento|istruzioni|metodo|come si prepara)\b/i.test(l));
  if (iIng < 0 || iPrep < 0) throw new Error('Non trovo le sezioni "Ingredienti" e "Preparazione" nel testo.');
  const clean = l => l.replace(/^[-•*▢☐▪◦]\s*/, '');
  return {
    title: iIng > 0 ? lines[0] : '', category: '', servings: 4, prepMin: '', cookMin: '', cookMethod: '', difficulty: '',
    ingredients: lines.slice(iIng + 1, iPrep).map(clean).map(parseIngredient).filter(i => i.name),
    steps: flattenSteps(lines.slice(iPrep + 1).join('\n')).map(text => ({ text, minutes: stepMinutes(text) })),
    notes: '', photo: ''
  };
}

function openImportRecipe() {
  $('#im').innerHTML = `<div class="rv-body">
    <button class="close" data-act="close" style="position:static;float:none;margin:0 0 -10px auto;display:block" aria-label="Chiudi">✕</button>
    <h2>Importa una ricetta</h2>
    <p class="hint">Incolla il link di una ricetta (GialloZafferano, Cucchiaio d'Argento, Benedetta…). Si aprirà già compilata: controllala e salvala.</p>
    <form class="stack" id="imForm">
      <input class="inp" id="imUrl" type="text" inputmode="url" placeholder="https://…" autocomplete="off" aria-label="Link della ricetta">
      <button class="btn primary" id="imBtn">🔗 Importa</button>
    </form>
    <p class="hint" id="imMsg" role="status"></p>
    <details><summary>Il sito non funziona? Incolla il testo della ricetta</summary>
      <form class="stack" id="imTextForm" style="margin-top:10px">
        <textarea class="inp" id="imText" rows="8" placeholder="Titolo&#10;Ingredienti&#10;200 g farina&#10;2 uova&#10;Preparazione&#10;Mescola…"></textarea>
        <button class="btn">📝 Crea la bozza</button>
      </form></details>
    <details><summary>⚙️ Servizio di importazione</summary>
      <form class="stack" id="imEpForm" style="margin-top:10px">
        <input class="inp" id="imEp" placeholder="https://ricettario-import.NOME.workers.dev" value="${esc(importEndpoint())}" aria-label="Indirizzo del servizio">
        <button class="btn sm">Salva indirizzo</button>
      </form></details></div>`;
  $('#im').showModal();
  if (importEndpoint()) $('#imUrl').focus(); else $('#imMsg').textContent = 'Prima di iniziare imposta l\'indirizzo del servizio qui sotto (⚙️).';
}

async function doImportUrl() {
  const url = $('#imUrl').value.trim(), msg = $('#imMsg'), btn = $('#imBtn');
  if (!url) return;
  btn.disabled = true; msg.textContent = 'Sto leggendo la pagina…';
  try {
    const draft = await importFromUrl(url);
    $('#im').close();
    openEditor(null, draft);
  } catch (e) {
    msg.textContent = e.message === 'NO_ENDPOINT' ? 'Imposta prima l\'indirizzo del servizio (⚙️ qui sotto).'
      : e.message === 'NO_RECIPE' ? 'Non ho trovato i dati della ricetta in questa pagina. Prova a incollare il testo qui sotto.'
      : e.message;
    if (e.message === 'NO_RECIPE') $('#im details').open = true;
  } finally { btn.disabled = false; }
}

/* =========================================================
   Sincronizzazione tra dispositivi
   =========================================================
   Ogni dato (ricetta, prodotto della spesa, pasto del piano) è un'"entità" con id.
   Per ognuna si ricorda l'impronta dell'ultima versione sincronizzata (state.sync.meta):
   se cambia, l'entità è da inviare con la data di modifica; se sparisce, si invia una cancellazione.
   Le modifiche ricevute sostituiscono quelle locali solo se più recenti (vince l'ultima).
   Il codice famiglia non viene mai inviato: al servizio arriva solo il suo hash SHA-256. */
const SYNC_OVERLAP = 5_000_000;   // 5 s (in microsecondi del server): rilegge un po' indietro per non perdere nulla
const SYNC_CHUNK_BYTES = 2_500_000, SYNC_CHUNK_ITEMS = 100;
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
let syncing = false, syncAgain = false, syncTimer = null;
const syncUi = { s: 'off', msg: '', at: 0 };

/** Serializzazione con chiavi ordinate: due oggetti uguali danno sempre lo stesso testo. */
function canon(v) {
  if (Array.isArray(v)) return '[' + v.map(canon).join(',') + ']';
  if (v && typeof v === 'object') {
    return '{' + Object.keys(v).filter(k => v[k] !== undefined).sort().map(k => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}';
  }
  return JSON.stringify(v);
}
function hash53(str) {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761); h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}
async function spaceId(code) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('ricettario:' + code));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

function newSyncCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(20));
  return [...bytes].map(b => CODE_ALPHABET[b % 32]).join('');
}
const prettyCode = c => c.match(/.{1,4}/g).join('-');
/** Accetta il codice con trattini, spazi, minuscole o dentro un messaggio; restituisce '' se non valido. */
function normalizeCode(s) {
  const up = String(s || '').toUpperCase();
  const m = up.match(/(?:[A-Z2-9]{4}-){4}[A-Z2-9]{4}/);
  const cand = (m ? m[0] : up).replace(/[\s-]/g, '');
  return new RegExp('^[' + CODE_ALPHABET + ']{20}$').test(cand) ? cand : '';
}

/* ---------- Entità locali ---------- */
function localEntities() {
  const m = new Map();
  state.recipes.forEach(r => m.set('recipe:' + r.id, r));
  state.shopping.forEach(i => m.set('shop:' + i.id, i));
  Object.entries(state.plan).forEach(([date, day]) =>
    SLOTS.forEach(([slot]) => (day[slot] || []).forEach(e => m.set('plan:' + e.id, { ...e, date, slot }))));
  return m;
}

function removeEntity(kind, id) {
  if (kind === 'recipe') state.recipes = state.recipes.filter(r => r.id !== id);
  else if (kind === 'shop') state.shopping = state.shopping.filter(i => i.id !== id);
  else if (kind === 'plan') removePlanEntry(id);
}
function removePlanEntry(id) {
  Object.keys(state.plan).forEach(date => {
    const day = state.plan[date];
    SLOTS.forEach(([s]) => { if (day[s]) day[s] = day[s].filter(e => e.id !== id); });
    if (SLOTS.every(([s]) => !(day[s] || []).length)) delete state.plan[date];
  });
}
function upsertEntity(kind, id, data) {
  if (kind === 'recipe' || kind === 'shop') {
    const list = kind === 'recipe' ? state.recipes : state.shopping, k = list.findIndex(x => x.id === id);
    k >= 0 ? list[k] = data : list.push(data);
  } else if (kind === 'plan') {
    removePlanEntry(id);
    const { date, slot, ...entry } = data;
    if (!date || !SLOTS.some(([s]) => s === slot)) return;
    const day = state.plan[date] = state.plan[date] || {};
    (day[slot] = day[slot] || []).push(entry);
  }
}

/** Le ricette di esempio mai modificate: sul dispositivo che si unisce a uno spazio vengono scartate. */
const sampleKey = r => canon({ title: r.title, category: r.category, servings: r.servings, prepMin: r.prepMin, cookMin: r.cookMin,
  cookMethod: r.cookMethod, difficulty: r.difficulty, ingredients: r.ingredients, steps: r.steps, notes: r.notes });
const isUnmodifiedSample = r => { const k = sampleKey(r); return seed().some(s => sampleKey(s) === k); };

/* ---------- Comunicazione ---------- */
async function syncPost(body) {
  const ep = importEndpoint();
  if (!ep) throw new Error('Servizio non configurato');
  let res;
  try {
    res = await fetchTimeout(`${ep}/sync`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }, 30000);
  } catch {
    const e = new Error('Nessuna connessione'); e.offline = true; throw e;
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Errore ${res.status}`);
  return data;
}

function setSyncStatus(s, msg = '') {
  syncUi.s = s; syncUi.msg = msg; if (s === 'ok') syncUi.at = Date.now();
  const b = document.querySelector('[data-act="backup"]');
  if (b) {
    b.classList.toggle('sync-ok', s === 'ok'); b.classList.toggle('sync-busy', s === 'busy'); b.classList.toggle('sync-err', s === 'err');
    b.title = s === 'off' ? 'Impostazioni' : 'Sincronizzazione: ' + syncText();
  }
  const el = $('#syncStatus'); if (el) el.innerHTML = syncText();
}
function syncText() {
  if (syncUi.s === 'busy') return '⏳ Sincronizzazione in corso…';
  if (syncUi.s === 'err') return '⚠️ ' + esc(syncUi.msg);
  if (syncUi.s === 'ok') return '✔ Tutto aggiornato' + (syncUi.at ? ' · ' + new Date(syncUi.at).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }) : '');
  return 'Non attiva';
}

function scheduleSync(delay = 1500) {
  if (!state.sync?.code) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(syncNow, delay);
}

/** Un ciclo completo: rileva le modifiche locali, le invia, riceve quelle degli altri e le applica. */
async function syncNow() {
  const sy = state.sync;
  if (!sy?.code) return;
  if (syncing) { syncAgain = true; return; }
  syncing = true; setSyncStatus('busy');
  try {
    const space = await spaceId(sy.code);

    // 1. cosa è cambiato qui da ultima volta
    // (la data è quella della modifica, non della sincronizzazione: conta se si è lavorato senza rete)
    const local = localEntities(), stamp = sy.dirtyAt || Date.now();
    sy.dirtyAt = 0;
    const next = m => Math.max(stamp, (m?.updated || 0) + 1);
    for (const [key, data] of local) {
      const h = hash53(canon(data)), m = sy.meta[key];
      if (!m || m.deleted || m.h !== h) sy.meta[key] = { h, updated: next(m), dirty: true };
    }
    for (const [key, m] of Object.entries(sy.meta)) {
      if (!m.deleted && !local.has(key)) sy.meta[key] = { deleted: true, updated: next(m), dirty: true };
    }
    persist();

    // 2. invio a blocchi (le foto rendono pesanti alcune ricette) + ricezione
    const queue = Object.entries(sy.meta).filter(([, m]) => m.dirty).map(([key, m]) => {
      const [k, ...rest] = key.split(':'), i = rest.join(':');
      return m.deleted ? { k, i, x: true, u: m.updated } : { k, i, d: local.get(key), u: m.updated };
    });
    const chunks = [[]];
    let size = 0;
    for (const c of queue) {
      const n = c.d ? canon(c.d).length : 50;
      if (chunks[chunks.length - 1].length && (size + n > SYNC_CHUNK_BYTES || chunks[chunks.length - 1].length >= SYNC_CHUNK_ITEMS)) { chunks.push([]); size = 0; }
      chunks[chunks.length - 1].push(c); size += n;
    }

    let cursor = Math.max(0, (sy.since || 0) - SYNC_OVERLAP), maxSrv = sy.since || 0, changed = new Set();
    const pull = async changes => {
      for (;;) {
        const res = await syncPost({ action: 'sync', space, since: cursor, changes });
        changes = [];
        applyRows(res.rows, changed);
        const last = res.rows.length ? res.rows[res.rows.length - 1].s : cursor;
        maxSrv = Math.max(maxSrv, last);
        if (!res.more || last <= cursor) break;
        cursor = last;
      }
    };
    for (const ch of chunks) {
      await pull(ch);
      ch.forEach(c => { const m = sy.meta[c.k + ':' + c.i]; if (m && m.updated === c.u) delete m.dirty; });
    }
    sy.since = maxSrv;
    persist();
    setSyncStatus('ok');
    if (changed.size) refreshAfterSync(changed);
  } catch (e) {
    setSyncStatus('err', e.offline ? 'Nessuna connessione: riprovo appena possibile' : e.message);
    persist();
  } finally {
    syncing = false;
    if (syncAgain) { syncAgain = false; scheduleSync(300); }
  }
}

function applyRows(rows, changed) {
  const sy = state.sync;
  for (const r of rows) {
    const key = r.k + ':' + r.i, m = sy.meta[key];
    if (m && m.updated >= r.u) continue;           // la versione locale è uguale o più recente
    if (r.x) { removeEntity(r.k, r.i); sy.meta[key] = { deleted: true, updated: r.u }; }
    else { upsertEntity(r.k, r.i, r.d); sy.meta[key] = { h: hash53(canon(r.d)), updated: r.u }; }
    changed.add(r.k);
  }
}

/** Aggiorna lo schermo dopo modifiche arrivate dagli altri, senza disturbare chi sta scrivendo. */
function refreshAfterSync(kinds) {
  const a = document.activeElement;
  if (a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) && a.value && ($('#view').contains(a) || $('#pk').contains(a))) {
    setTimeout(() => refreshAfterSync(kinds), 3000);   // sta scrivendo: riprova tra poco
    return;
  }
  if ($('#ed').open) return;                           // editor aperto: non lo tocco
  render();
  if ($('#rv').open && kinds.has('recipe')) {
    if (recipeById(ui.viewId)) renderRecipeDialog(); else $('#rv').close();
  }
  if (ui.ck && $('#ck').open && kinds.has('recipe')) renderCook();
}

/* ---------- Attivazione dal dialog ⚙️ ---------- */
async function startSync(code, mode) {
  const space = await spaceId(code);
  await syncPost({ action: mode === 'create' ? 'create' : 'join', space });
  if (mode === 'join') state.recipes = state.recipes.filter(r => !isUnmodifiedSample(r));
  state.sync = { code, since: 0, meta: {} };
  persist();
  syncNow();
}

function syncBlock() {
  if (!importEndpoint()) return '';
  if (!state.sync?.code) return `
    <h3>☁️ Sincronizzazione</h3>
    <p class="hint">Tieni ricette, piano settimanale e lista della spesa uguali su telefono e computer, anche con altre persone.</p>
    <div class="stack">
      <button class="btn primary" data-act="sync-create">✨ Crea lo spazio famiglia</button>
      <button class="btn" data-act="sync-join">🔑 Ho già un codice</button>
    </div><p class="hint" id="syncMsg" role="status"></p><hr>`;
  return `
    <h3>☁️ Sincronizzazione</h3>
    <p class="hint" id="syncStatus">${syncText()}</p>
    <details><summary>🔑 Codice famiglia</summary>
      <p class="hint" style="margin:10px 0 6px">Chi ha questo codice può leggere e modificare tutto: condividilo solo con la famiglia.</p>
      <div class="code">${esc(prettyCode(state.sync.code))}</div>
      <div class="stack" style="margin-top:10px">
        <button class="btn sm" data-act="sync-share">📤 Invia il codice</button>
        <button class="btn sm" data-act="sync-copy">📋 Copia</button>
      </div></details>
    <div class="stack">
      <button class="btn" data-act="sync-now">🔄 Sincronizza adesso</button>
      <button class="btn sm danger" data-act="sync-off">Scollega questo dispositivo</button>
    </div><p class="hint" id="syncMsg" role="status"></p><hr>`;
}

function openSyncJoin() {
  $('#bk').innerHTML = `<div class="rv-body">
    <button class="close" data-act="close" style="position:static;float:none;margin:0 0 -10px auto;display:block" aria-label="Chiudi">✕</button>
    <h2>Inserisci il codice</h2>
    <p class="hint">Usa il codice famiglia creato sull'altro dispositivo (20 caratteri). Puoi incollare anche tutto il messaggio che ti hanno inviato.</p>
    <form class="stack" id="syncJoinForm">
      <input class="inp" id="syncCode" placeholder="XXXX-XXXX-XXXX-XXXX-XXXX" autocomplete="off" autocapitalize="characters" spellcheck="false" aria-label="Codice famiglia">
      <button class="btn primary" id="syncJoinBtn">Collegati</button>
    </form><p class="hint" id="syncMsg" role="status"></p></div>`;
  $('#syncCode').focus();
}

/* =========================================================
   Avvisi dei timer anche ad app chiusa (Web Push)
   =========================================================
   L'app registra il dispositivo presso il servizio di notifiche del browser e comunica al Worker
   i timer attivi. Alla scadenza il Worker manda una notifica "vuota"; il service worker (sw.js)
   la trasforma in un avviso leggendo l'elenco dei timer salvato qui sotto. */
const PUSH_FLAG = 'ricettario.push';
const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const pushOn = () => { try { return localStorage.getItem(PUSH_FLAG) === '1' && pushSupported() && Notification.permission === 'granted'; } catch { return false; } };
const b64uToBytes = str => Uint8Array.from(atob(str.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));

/** Copia dei timer attivi leggibile dal service worker (non può usare localStorage). */
function storeTimersForSW() {
  if (!('caches' in window)) return;
  const list = state.timers.filter(t => !t.fired).map(t => ({ id: t.id, label: t.label, end: t.end }));
  caches.open('meta-timers').then(c => c.put('timers', new Response(JSON.stringify(list), { headers: { 'Content-Type': 'application/json' } }))).catch(() => { /* ignora */ });
}

async function pushPost(path, opts = {}) {
  const ep = importEndpoint();
  if (!ep) throw new Error('Servizio non configurato');
  const res = await fetchTimeout(ep + path, opts, 20000);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Errore ' + res.status);
  return data;
}

/** Comunica al Worker i timer ancora da far suonare. Se il Worker non risponde, ci riprova alla prossima occasione. */
async function pushSyncTimers() {
  storeTimersForSW();
  if (!pushOn()) return;
  try {
    const sub = await (await navigator.serviceWorker.ready).pushManager.getSubscription();
    if (!sub) return;
    await pushPost('/push', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'set', endpoint: sub.endpoint, timers: state.timers.filter(t => !t.fired).map(t => ({ id: t.id, due: t.end })) })
    });
  } catch { /* offline: riproverà */ }
}

async function pushEnable() {
  if (!pushSupported()) {
    throw new Error(isIOS() && !isStandalone()
      ? 'Su iPhone gli avvisi funzionano solo con l\'app installata: tocca Condividi → Aggiungi alla schermata Home, poi riapri l\'app dall\'icona.'
      : 'Questo browser non supporta gli avvisi.');
  }
  if (!location.protocol.startsWith('http')) throw new Error('Apri il Ricettario dal suo indirizzo web (non dal file sul computer).');
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('Permesso negato. Puoi riattivarlo dalle impostazioni del dispositivo (Notifiche → Ricettario).');

  const reg = await navigator.serviceWorker.ready;
  const { key } = await pushPost('/push/key');
  let sub = await reg.pushManager.getSubscription();
  if (sub && sub.options && sub.options.applicationServerKey &&
      b64uToBytes(key).join() !== new Uint8Array(sub.options.applicationServerKey).join()) {
    await sub.unsubscribe(); sub = null;                     // chiavi cambiate: ci si iscrive di nuovo
  }
  sub = sub || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64uToBytes(key) });
  try { localStorage.setItem(PUSH_FLAG, '1'); } catch { /* ignora */ }
  await pushSyncTimers();
}

async function pushDisable() {
  try { localStorage.removeItem(PUSH_FLAG); } catch { /* ignora */ }
  try {
    const sub = await (await navigator.serviceWorker.ready).pushManager.getSubscription();
    if (sub) {
      await pushPost('/push', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'set', endpoint: sub.endpoint, timers: [] }) }).catch(() => {});
      await sub.unsubscribe();
    }
  } catch { /* ignora */ }
}

function pushBlock() {
  if (!importEndpoint()) return '';
  const head = '<h3>🔔 Avvisi dei timer</h3>';
  if (!pushSupported()) {
    return head + `<p class="hint">${isIOS() && !isStandalone()
      ? 'Per ricevere l\'avviso con l\'app chiusa, installa prima l\'app: tocca <b>Condividi → Aggiungi alla schermata Home</b> e riaprila dall\'icona. Serve iOS 16.4 o successivo.'
      : 'Questo browser non supporta gli avvisi con l\'app chiusa: il timer suona solo con l\'app aperta.'}</p><hr>`;
  }
  if (pushOn()) return head + `
    <p class="hint" id="pushStatus">✔ Attivi su questo dispositivo: quando un timer scade ricevi una notifica anche con l'app chiusa o lo schermo bloccato.</p>
    <div class="stack">
      <button class="btn" data-act="push-test">🧪 Prova con un timer di 20 secondi</button>
      <button class="btn sm" data-act="push-off">Disattiva gli avvisi</button>
    </div><p class="hint" id="pushMsg" role="status"></p><hr>`;
  const denied = Notification.permission === 'denied';
  return head + `
    <p class="hint">${denied ? 'Le notifiche sono bloccate per questa app: riattivale dalle impostazioni del dispositivo (Notifiche → Ricettario), poi riprova.'
      : 'Fai suonare il timer anche quando l\'app è chiusa o lo schermo è bloccato.'}</p>
    <div class="stack"><button class="btn primary" data-act="push-on">🔔 Attiva gli avvisi</button></div>
    <p class="hint" id="pushMsg" role="status"></p><hr>`;
}

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', e => { if (e.data && e.data.type === 'push-shown') pushSyncTimers(); });
}

/* =========================================================
   Installazione come app (PWA)
   ========================================================= */
let installEvt = null;
const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; });
window.addEventListener('appinstalled', () => { installEvt = null; toast('App installata ✔'); });

/* ---------- Aggiornamenti dell'app ---------- */
let updateReady = false;
function showUpdateBanner() {
  if (updateReady) return;
  updateReady = true;
  const b = document.createElement('div');
  b.className = 'upd'; b.id = 'updBanner';
  b.innerHTML = '<span>✨ Nuova versione disponibile</span><button data-act="reload-app">Aggiorna</button><button class="x" data-act="upd-later" aria-label="Più tardi">✕</button>';
  document.body.append(b);
}

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register('sw.js').catch(() => { /* offline o non supportato */ });
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadController) navigator.serviceWorker.controller?.postMessage('version');   // il Worker risponde con la sua versione
  });
  navigator.serviceWorker.addEventListener('message', e => {
    if (e.data && e.data.type === 'version' && e.data.version !== APP_VERSION) showUpdateBanner();
  });
}

/** Cerca una versione nuova; restituisce 'nuova', 'aggiornata' oppure 'errore'. */
async function checkForUpdates() {
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg) return 'errore';
    await reg.update();
    for (let i = 0; i < 40 && (reg.installing || reg.waiting); i++) await new Promise(r => setTimeout(r, 200));   // fino a 8 s
    await new Promise(r => setTimeout(r, 300));
    return updateReady ? 'nuova' : 'aggiornata';
  } catch { return 'errore'; }
}
navigator.storage?.persist?.().catch(() => { /* ignora */ });

function installBlock() {
  if (isStandalone()) return '<p class="hint">✔ Stai già usando l\'app installata.</p>';
  if (installEvt) return '<button class="btn green" data-act="install">📲 Installa l\'app sul telefono</button>';
  if (!location.protocol.startsWith('http')) return '<p class="hint">Per installare l\'app apri il Ricettario dal suo indirizzo web (non dal file sul computer).</p>';
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  return `<p class="hint">${ios
    ? 'Su iPhone/iPad: tocca <b>Condividi</b> (il quadrato con la freccia) e poi <b>Aggiungi alla schermata Home</b>.'
    : 'Dal menu del browser (⋮) scegli <b>Installa app</b> oppure <b>Aggiungi a schermata Home</b>.'}</p>`;
}

function openBackup() {
  $('#bk').innerHTML = `<div class="rv-body">
    <button class="close" data-act="close" style="position:static;float:none;margin:0 0 -10px auto;display:block" aria-label="Chiudi">✕</button>
    <h2>App e sincronizzazione</h2>
    <div class="stack">${installBlock()}</div>
    <hr>
    ${pushBlock()}
    ${syncBlock()}
    <h3>Backup e ripristino</h3>
    <p class="hint">${state.sync?.code ? 'Con la sincronizzazione i dati sono anche online, ma un backup ogni tanto non guasta.' : 'I dati sono salvati solo in questo browser. Scarica un backup ogni tanto, e usalo per spostare le ricette su un altro dispositivo.'}</p>
    <div class="stack">
      <button class="btn primary" data-act="export">⬇️ Scarica backup (.json)</button>
      <label class="btn">⬆️ Ripristina da backup<input type="file" id="restoreIn" accept="application/json,.json" hidden></label>
    </div>
    <p class="hint">${state.recipes.length} ricette · ${state.shopping.length} prodotti nella lista</p>
    ${'serviceWorker' in navigator && location.protocol.startsWith('http') ? `<hr>
    <h3>Versione dell'app</h3>
    <p class="hint" id="verMsg">Stai usando la versione <b>${APP_VERSION}</b>.</p>
    <div class="stack"><button class="btn" data-act="check-update">🔄 Controlla aggiornamenti</button></div>` : `<p class="hint">Versione ${APP_VERSION}</p>`}</div>`;
  $('#bk').showModal();
}

function exportData() {
  const blob = new Blob([JSON.stringify({ recipes: state.recipes, shopping: state.shopping, plan: state.plan }, null, 1)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `ricettario-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click(); URL.revokeObjectURL(a.href);
}

/* =========================================================
   Eventi
   ========================================================= */
document.addEventListener('click', async e => {
  const el = e.target.closest('[data-act]'); if (!el) return;
  const { act, id } = el.dataset;
  const dlg = el.closest('dialog');

  switch (act) {
    case 'tab': ui.tab = el.dataset.tab; render(); window.scrollTo(0, 0); break;
    case 'new': openEditor(); break;
    case 'import-recipe': openImportRecipe(); break;
    case 'open': openRecipe(id, +el.dataset.serv || 0); break;
    case 'edit': openEditor(id); break;
    case 'close': dlg?.close(); break;
    case 'cat': ui.cat = el.dataset.cat; renderChips(); renderGrid(); break;
    case 'favfilter': ui.favOnly = !ui.favOnly; el.classList.toggle('on', ui.favOnly); renderGrid(); break;
    case 'fav': {
      const r = recipeById(id); r.fav = !r.fav; save();
      renderGrid(); if ($('#rv').open) renderRecipeDialog();
      break;
    }
    case 'del': {
      const r = recipeById(id);
      if (confirm(`Eliminare “${r.title}”?`)) {
        state.recipes = state.recipes.filter(x => x.id !== id);
        Object.values(state.plan).forEach(day => SLOTS.forEach(([s]) => { if (day[s]) day[s] = day[s].filter(e => e.rid !== id); }));
        save();
        $('#rv').close(); render(); toast('Ricetta eliminata');
      }
      break;
    }
    case 'cook': openCook(id); break;
    case 'ck-next': ckGo(1); break;
    case 'ck-prev': ckGo(-1); break;
    case 'ck-ing': ui.ck.peek = !ui.ck.peek; renderCook(); break;
    case 'ck-restart': ui.ck.page = 0; renderCook(); break;
    case 'ck-size': {
      ui.ck.size = Math.max(0, Math.min(CK_SIZES.length - 1, ui.ck.size + (+el.dataset.d)));
      try { localStorage.setItem('ricettario.ckSize', ui.ck.size); } catch { /* ignora */ }
      renderCook(); break;
    }
    case 'serv': ui.servings = Math.max(1, ui.servings + (+el.dataset.d)); renderRecipeDialog(); break;
    case 'shop-recipe': {
      const r = recipeById(id), f = ui.servings / (+r.servings || 1);
      r.ingredients.forEach(i => { const n = parseQty(i.qty); addShopItem({ name: i.name, qty: n != null ? n * f : null, unit: i.unit, from: r.title }); });
      save(); render(); toast(`Ingredienti aggiunti alla spesa (${r.ingredients.length})`);
      break;
    }
    case 'timer': startTimer(+el.dataset.min, el.dataset.label); if (ui.ck && $('#ck').open) renderCook(); break;
    case 'timer-x': state.timers = state.timers.filter(t => t.id !== id); save(); renderTimers(); pushSyncTimers(); if (ui.ck && $('#ck').open) renderCook(); break;
    case 'wake': ui.wantWake = !wake; toggleWake(); break;

    /* editor */
    case 'add-ing': { $('#ingRows').insertAdjacentHTML('beforeend', ingRow()); $('#ingRows .row:last-child .q').focus(); break; }
    case 'add-step': { $('#stepRows').insertAdjacentHTML('beforeend', stepRow()); $('#stepRows .row:last-child .t').focus(); break; }
    case 'rm-row': el.closest('.row').remove(); break;
    case 'photo-rm': ui.photo = ''; $('#photoPrev').hidden = true; el.hidden = true; break;

    /* piano settimanale */
    case 'week': ui.week = el.dataset.d === '0' ? mondayOf(new Date()) : addDays(ui.week, 7 * +el.dataset.d); renderPlan(); break;
    case 'plan-add': openPicker(el.dataset.date, el.dataset.slot); break;
    case 'pick': planAdd({ rid: id, servings: ui.pick.people }); break;
    case 'pk-people': {
      ui.pick.people = Math.max(1, Math.min(30, ui.pick.people + (+el.dataset.d)));
      setPlanPeople(ui.pick.people);
      $('#pkPeople').textContent = `${ui.pick.people} ${ui.pick.people === 1 ? 'persona' : 'persone'}`;
      break;
    }
    case 'plan-serv': {
      const e = (state.plan[el.dataset.date]?.[el.dataset.slot] || []).find(x => x.id === id), r = e && recipeById(e.rid);
      if (!e || !r) break;
      e.servings = Math.max(1, Math.min(30, mealPeople(e, r) + (+el.dataset.d)));
      setPlanPeople(e.servings);
      save(); renderPlan();
      break;
    }
    case 'plan-del': {
      const day = state.plan[el.dataset.date];
      day[el.dataset.slot] = day[el.dataset.slot].filter(e => e.id !== id);
      if (SLOTS.every(([s]) => !(day[s] || []).length)) delete state.plan[el.dataset.date];
      save(); renderPlan();
      break;
    }
    case 'plan-shop': planToShopping(); break;
    case 'plan-clear':
      if (confirm('Svuotare il piano di questa settimana?')) {
        for (let k = 0; k < 7; k++) delete state.plan[ymd(addDays(ui.week, k))];
        save(); renderPlan();
      }
      break;

    /* spesa */
    case 'shop-group': {
      try { localStorage.setItem('ricettario.groupShop', shopGrouped() ? '0' : '1'); } catch { /* ignora */ }
      renderShopping();
      break;
    }
    case 'shop-aisle': openAislePicker(id); break;
    case 'aisle-pick': {
      const it = state.shopping.find(i => i.id === id), aisle = el.dataset.aisle;
      if (it) {
        it.aisle = aisle;
        (state.aisleMap = state.aisleMap || {})[normName(it.name)] = aisle;
        save(); $('#pk').close(); render();
      }
      break;
    }
    case 'shop-del': state.shopping = state.shopping.filter(i => i.id !== id); save(); render(); break;
    case 'clear-done': state.shopping = state.shopping.filter(i => !i.done); save(); render(); break;
    case 'clear-all': if (confirm('Svuotare tutta la lista della spesa?')) { state.shopping = []; save(); render(); } break;
    case 'share': openShare(); break;
    case 'import': openImport(); break;
    case 'copy-text': copy(shopText(), 'Lista copiata ✔'); break;
    case 'copy-link': copy(shopLink(), 'Link copiato ✔'); break;
    case 'native-share': try { await navigator.share({ title: 'Lista della spesa', text: shopText() }); } catch { /* annullato */ } break;

    /* backup */
    case 'backup': openBackup(); break;
    case 'export': exportData(); break;

    /* aggiornamenti */
    case 'reload-app': location.reload(); break;
    case 'upd-later': $('#updBanner')?.remove(); break;
    case 'check-update': {
      const m = $('#verMsg'); m.textContent = 'Controllo…';
      const r = await checkForUpdates();
      m.innerHTML = r === 'nuova' ? '✨ Trovata una versione nuova: tocca <b>Aggiorna</b> nell\'avviso in basso.'
        : r === 'aggiornata' ? `✔ Sei già alla versione più recente (<b>${APP_VERSION}</b>).` : '⚠️ Non riesco a controllare: verifica la connessione.';
      break;
    }

    /* avvisi dei timer */
    case 'push-on': {
      const msg = $('#pushMsg'); msg.textContent = 'Attivo gli avvisi…';
      try { await pushEnable(); openBackup(); toast('Avvisi attivati ✔'); }
      catch (err) { msg.textContent = err.name === 'AbortError' ? 'Il servizio notifiche del browser non risponde: riprova tra poco.' : err.message; }
      break;
    }
    case 'push-off': await pushDisable(); openBackup(); toast('Avvisi disattivati'); break;
    case 'push-test':
      startTimer(1 / 3, 'Prova avvisi');
      $('#pushMsg').textContent = 'Timer di 20 secondi avviato. Chiudi l\'app o blocca lo schermo: tra 20-60 secondi dovrebbe arrivare la notifica.';
      break;

    /* sincronizzazione */
    case 'sync-create': case 'sync-join': {
      if (act === 'sync-join') { openSyncJoin(); break; }
      const msg = $('#syncMsg'); msg.textContent = 'Creo lo spazio…';
      try { await startSync(newSyncCode(), 'create'); openBackup(); toast('Spazio creato ✔ Ora invia il codice agli altri'); }
      catch (err) { msg.textContent = err.offline ? 'Nessuna connessione.' : err.message; }
      break;
    }
    case 'sync-now': syncNow(); break;
    case 'sync-copy': copy(prettyCode(state.sync.code), 'Codice copiato ✔'); break;
    case 'sync-share': {
      const text = `Codice famiglia del Ricettario: ${prettyCode(state.sync.code)}\n\nApri ${location.origin}${location.pathname}, installa l'app e poi vai in ⚙️ → "Ho già un codice".`;
      if (navigator.share) { try { await navigator.share({ text }); } catch { /* annullato */ } }
      else window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank');
      break;
    }
    case 'sync-off':
      if (confirm('Scollegare questo dispositivo?\nLe ricette e la lista restano qui, ma non saranno più allineate con gli altri dispositivi.')) {
        state.sync = null; persist(); setSyncStatus('off'); openBackup();
      }
      break;
    case 'install':
      if (installEvt) { installEvt.prompt(); await installEvt.userChoice.catch(() => {}); installEvt = null; $('#bk').close(); }
      break;
  }
});

/* chiusura dialog con click sullo sfondo */
$$('dialog:not(.cooking)').forEach(d => d.addEventListener('click', e => { if (e.target === d) d.close(); }));

document.addEventListener('input', e => {
  if (e.target.id === 'search') { ui.q = e.target.value; renderGrid(); }
  else if (e.target.id === 'pkSearch') renderPickList(e.target.value);
});

document.addEventListener('change', async e => {
  const t = e.target;
  if (t.dataset.chk === 'shop') {
    const it = state.shopping.find(i => i.id === t.dataset.id); it.done = t.checked; save(); render();
  } else if (t.dataset.chk) {
    t.checked ? ui.checked.add(t.dataset.chk) : ui.checked.delete(t.dataset.chk);
  } else if (t.id === 'photoIn' && t.files[0]) {
    try {
      ui.photo = await resizePhoto(t.files[0]);
      $('#photoPrev').src = ui.photo; $('#photoPrev').hidden = false; $('#photoRm').hidden = false;
    } catch { toast('Immagine non valida'); }
  } else if (t.id === 'restoreIn' && t.files[0]) {
    try {
      const data = JSON.parse(await t.files[0].text());
      if (!Array.isArray(data.recipes)) throw 0;
      if (confirm(`Sostituire i dati attuali con il backup (${data.recipes.length} ricette)?` + (state.sync?.code ? '\n\nLa sincronizzazione è attiva: la sostituzione si propagherà anche agli altri dispositivi.' : ''))) {
        state.recipes = data.recipes; state.shopping = Array.isArray(data.shopping) ? data.shopping : [];
        state.plan = data.plan && typeof data.plan === 'object' ? data.plan : {};
        save(); $('#bk').close(); render(); toast('Backup ripristinato ✔');
      }
    } catch { toast('File di backup non valido'); }
    t.value = '';
  }
});

document.addEventListener('submit', e => {
  e.preventDefault();
  const f = e.target;
  if (f.id === 'edForm') saveRecipe(f);
  else if (f.id === 'imForm') doImportUrl();
  else if (f.id === 'syncJoinForm') {
    const code = normalizeCode($('#syncCode').value), msg = $('#syncMsg');
    if (!code) { msg.textContent = 'Il codice deve avere 20 caratteri (lettere e numeri).'; return; }
    $('#syncJoinBtn').disabled = true; msg.textContent = 'Mi collego…';
    startSync(code, 'join')
      .then(() => { openBackup(); toast('Collegato ✔ Sto scaricando i dati…'); })
      .catch(err => { msg.textContent = err.offline ? 'Nessuna connessione.' : err.message; $('#syncJoinBtn').disabled = false; });
  }
  else if (f.id === 'imTextForm') {
    try {
      const draft = recipeFromText($('#imText').value);
      $('#im').close(); openEditor(null, draft);
    } catch (err) { $('#imMsg').textContent = err.message; }
  } else if (f.id === 'imEpForm') {
    const v = $('#imEp').value.trim();
    try { v ? localStorage.setItem('ricettario.importUrl', v) : localStorage.removeItem('ricettario.importUrl'); } catch { /* ignora */ }
    $('#imMsg').textContent = v ? 'Indirizzo salvato ✔' : 'Indirizzo rimosso.';
  } else if (f.id === 'pkForm') {
    const text = $('#pkText').value.trim();
    if (text) planAdd({ text });
  } else if (f.id === 'addForm') {
    const inp = $('#addInput'); if (!inp.value.trim()) return;
    addShopItem(parseShopInput(inp.value)); save(); render(); $('#addInput').focus();
  } else if (f.id === 'importForm') {
    const n = importShopCode($('#importIn').value);
    if (n < 0) return toast('Codice non valido');
    $('#sh').close(); toast(`${n} prodotti importati ✔`);
  }
});

/* Invio nell'ultima riga ingrediente → nuova riga */
document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && e.target.matches('#ingRows .n')) {
    e.preventDefault();
    const row = e.target.closest('.row');
    if (row.nextElementSibling) $('.q', row.nextElementSibling).focus();
    else { $('#ingRows').insertAdjacentHTML('beforeend', ingRow()); $('#ingRows .row:last-child .q').focus(); }
  }
});

/* =========================================================
   Avvio (compresa l'importazione da link #lista=…)
   ========================================================= */
render();

if (state.sync?.code) { setSyncStatus('busy'); syncNow(); }
pushSyncTimers();
setInterval(() => { if (document.visibilityState === 'visible' && state.sync?.code) syncNow(); }, 20000);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { scheduleSync(300); tick(); } });
window.addEventListener('online', () => scheduleSync(300));

if (location.hash.startsWith('#lista=')) {
  const code = location.hash.slice(1);
  history.replaceState(null, '', location.pathname + location.search);
  let count = 0;
  try { count = JSON.parse(unb64(code.replace(/^lista=/, ''))).length; } catch { /* codice non valido */ }
  if (count && confirm(`Hai ricevuto una lista della spesa con ${count} prodotti. Vuoi aggiungerla alla tua?`)) {
    importShopCode(code);
    ui.tab = 'spesa'; render();
  }
}
