'use strict';

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
    if (s && Array.isArray(s.recipes)) return { shopping: [], timers: [], ...s };
  } catch { /* primo avvio o dati corrotti */ }
  return { recipes: seed(), shopping: [], timers: [] };
}
let state = load();

function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); return true; }
  catch { toast('Spazio pieno: impossibile salvare. Prova con foto più piccole.'); return false; }
}

const ui = { tab: 'ricette', q: '', cat: '', favOnly: false, viewId: null, servings: 0, checked: new Set(), edit: null, photo: '' };
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
  ui.tab === 'ricette' ? renderRecipes() : renderShopping();
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
function openRecipe(id) {
  const r = recipeById(id); if (!r) return;
  ui.viewId = id; ui.servings = +r.servings || 1; ui.checked = new Set();
  renderRecipeDialog();
  const d = $('#rv'); if (!d.open) d.showModal();
}

function scaledIng(i, factor) {
  const n = parseQty(i.qty);
  return n != null ? fmtQty(n * factor) : String(i.qty || '').trim();
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

function openEditor(id) {
  const r = id ? recipeById(id) : null;
  ui.edit = id || null; ui.photo = r?.photo || '';
  $('#cats').innerHTML = allCats().map(c => `<option value="${esc(c)}">`).join('');
  const v = r || { title: '', category: '', servings: 4, prepMin: '', cookMin: '', cookMethod: '', difficulty: '', ingredients: [{}, {}, {}], steps: [{}], notes: '' };

  $('#ed').innerHTML = `<form class="ed" id="edForm" autocomplete="off">
    <h2>${r ? 'Modifica ricetta' : 'Nuova ricetta'}</h2>
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
   Lista della spesa
   ========================================================= */
function renderShopping() {
  const items = [...state.shopping].sort((a, b) => a.done - b.done);
  $('#view').innerHTML = `
    <form class="add-form" id="addForm">
      <input id="addInput" placeholder="Aggiungi… (es. 2 kg patate, latte)" autocomplete="off" aria-label="Nuovo prodotto">
      <button class="btn primary">Aggiungi</button>
    </form>
    <div class="shop-actions">
      <button class="btn sm" data-act="share" ${items.length ? '' : 'disabled'}>📤 Condividi</button>
      <button class="btn sm" data-act="import">📥 Importa</button>
      <button class="btn sm" data-act="clear-done" ${items.some(i => i.done) ? '' : 'disabled'}>✔ Rimuovi spuntati</button>
      <button class="btn sm danger" data-act="clear-all" ${items.length ? '' : 'disabled'}>Svuota</button>
    </div>
    ${items.length ? `<ul class="list">${items.map(i => `
      <li class="${i.done ? 'done' : ''}"><label>
        <input type="checkbox" data-chk="shop" data-id="${i.id}" ${i.done ? 'checked' : ''}>
        <span class="t">${itemLabel(i)}</span>${i.from ? `<span class="from">${esc(i.from)}</span>` : ''}</label>
        <button class="x" data-act="shop-del" data-id="${i.id}" aria-label="Elimina">✕</button></li>`).join('')}</ul>` :
    `<div class="empty"><div class="big">🛒</div><h3>La lista è vuota</h3>
      <p>Aggiungi prodotti qui sopra oppure, da una ricetta, tocca “Aggiungi alla lista della spesa”.</p></div>`}`;
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
  state.shopping.push({ id: uid(), name, qty, unit, done: false, from });
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
  const open = state.shopping.filter(i => !i.done);
  return '🛒 Lista della spesa\n' + open.map(i => '☐ ' + [fmtQty(i.qty), i.unit, i.name].filter(Boolean).join(' ')).join('\n');
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
  save(); renderTimers();
  toast(`Timer avviato: ${fmtMin(min)}`);
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
    if (!t.fired && t.end <= Date.now()) { t.fired = true; changed = true; ring(); toast('⏰ ' + t.label + ': tempo scaduto!'); }
  });
  if (changed) save();
  if (state.timers.length) renderTimers();
}
setInterval(tick, 1000);

/* ---------- Schermo sempre acceso ---------- */
let wake = null;
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
   Installazione come app (PWA)
   ========================================================= */
let installEvt = null;
const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; });
window.addEventListener('appinstalled', () => { installEvt = null; toast('App installata ✔'); });

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').catch(() => { /* offline o non supportato */ });
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
    <h2>App e backup</h2>
    <div class="stack">${installBlock()}</div>
    <hr>
    <h3>Backup e ripristino</h3>
    <p class="hint">I dati sono salvati solo in questo browser. Scarica un backup ogni tanto, e usalo per spostare le ricette su un altro dispositivo.</p>
    <div class="stack">
      <button class="btn primary" data-act="export">⬇️ Scarica backup (.json)</button>
      <label class="btn">⬆️ Ripristina da backup<input type="file" id="restoreIn" accept="application/json,.json" hidden></label>
    </div>
    <p class="hint">${state.recipes.length} ricette · ${state.shopping.length} prodotti nella lista</p></div>`;
  $('#bk').showModal();
}

function exportData() {
  const blob = new Blob([JSON.stringify({ recipes: state.recipes, shopping: state.shopping }, null, 1)], { type: 'application/json' });
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
    case 'open': openRecipe(id); break;
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
        state.recipes = state.recipes.filter(x => x.id !== id); save();
        $('#rv').close(); render(); toast('Ricetta eliminata');
      }
      break;
    }
    case 'serv': ui.servings = Math.max(1, ui.servings + (+el.dataset.d)); renderRecipeDialog(); break;
    case 'shop-recipe': {
      const r = recipeById(id), f = ui.servings / (+r.servings || 1);
      r.ingredients.forEach(i => { const n = parseQty(i.qty); addShopItem({ name: i.name, qty: n != null ? n * f : null, unit: i.unit, from: r.title }); });
      save(); render(); toast(`Ingredienti aggiunti alla spesa (${r.ingredients.length})`);
      break;
    }
    case 'timer': startTimer(+el.dataset.min, el.dataset.label); break;
    case 'timer-x': state.timers = state.timers.filter(t => t.id !== id); save(); renderTimers(); break;
    case 'wake': ui.wantWake = !wake; toggleWake(); break;

    /* editor */
    case 'add-ing': { $('#ingRows').insertAdjacentHTML('beforeend', ingRow()); $('#ingRows .row:last-child .q').focus(); break; }
    case 'add-step': { $('#stepRows').insertAdjacentHTML('beforeend', stepRow()); $('#stepRows .row:last-child .t').focus(); break; }
    case 'rm-row': el.closest('.row').remove(); break;
    case 'photo-rm': ui.photo = ''; $('#photoPrev').hidden = true; el.hidden = true; break;

    /* spesa */
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
    case 'install':
      if (installEvt) { installEvt.prompt(); await installEvt.userChoice.catch(() => {}); installEvt = null; $('#bk').close(); }
      break;
  }
});

/* chiusura dialog con click sullo sfondo */
$$('dialog').forEach(d => d.addEventListener('click', e => { if (e.target === d) d.close(); }));

document.addEventListener('input', e => {
  if (e.target.id === 'search') { ui.q = e.target.value; renderGrid(); }
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
      if (confirm(`Sostituire i dati attuali con il backup (${data.recipes.length} ricette)?`)) {
        state.recipes = data.recipes; state.shopping = Array.isArray(data.shopping) ? data.shopping : [];
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
  else if (f.id === 'addForm') {
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
