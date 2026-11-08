import * as db from './db.js';
import { schedule, newSrs, previewLabels, dayKey, relDue, fmtDays } from './srs.js';
import { parseCards, CLAUDE_PROMPT } from './parser.js';

const APP_VERSION = '1.0.0';

/* ================= Hilfsfunktionen ================= */
const $ = (s, el = document) => el.querySelector(s);
const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const rich = (s) =>
  esc(s)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*\w])\*(?!\s)([^*\n]+?)\*(?!\w)/g, '$1<em>$2</em>')
    .replace(/\n/g, '<br>');
const plain = (s) => String(s ?? '').replace(/\*\*|__/g, '').replace(/\s*\n+\s*/g, ' ');
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
const norm = (s) => String(s ?? '').toLowerCase().replace(/\*\*/g, '').replace(/\s+/g, ' ').trim();
const raf2 = (fn) => requestAnimationFrame(() => requestAnimationFrame(fn));
function h(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const fmtDate = (ts) => new Date(ts).toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric' });
const fmtSize = (b) => (b < 1048576 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1048576).toFixed(1).replace('.', ',')} MB`);

/* ================= Icons ================= */
const svg = (vb, body, sw = 2) =>
  `<svg viewBox="${vb}" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
const I = {
  back: svg('0 0 13 21', '<path d="M11 2L2.5 10.5 11 19"/>', 2.6),
  chev: svg('0 0 8 14', '<path d="M1.5 1.5L6.5 7l-5 5.5"/>', 2.2),
  updown: svg('0 0 11 16', '<path d="M2 6l3.5-3.5L9 6M2 10l3.5 3.5L9 10"/>', 1.8),
  plus: svg('0 0 24 24', '<path d="M12 5v14M5 12h14"/>', 2.2),
  gear: svg(
    '0 0 24 24',
    '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
    1.8,
  ),
  more: svg(
    '0 0 24 24',
    '<circle cx="12" cy="12" r="9.5"/><circle cx="7.6" cy="12" r="1.1" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.1" fill="currentColor" stroke="none"/><circle cx="16.4" cy="12" r="1.1" fill="currentColor" stroke="none"/>',
    1.7,
  ),
  search: svg('0 0 24 24', '<circle cx="10.5" cy="10.5" r="7"/><path d="M20.5 20.5l-5-5"/>', 2.4),
  close: svg('0 0 16 16', '<path d="M3 3l10 10M13 3L3 13"/>', 2.4),
  photo: svg('0 0 24 24', '<rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="1.8"/><path d="M21 16l-5-5-9 9"/>', 1.9),
  doc: svg('0 0 24 24', '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>', 2),
  clip: svg('0 0 24 24', '<rect x="8" y="3" width="8" height="4" rx="1.5"/><path d="M16 5h1.5A2.5 2.5 0 0 1 20 7.5v11a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 18.5v-11A2.5 2.5 0 0 1 6.5 5H8"/>', 2),
  sparkles: svg('0 0 24 24', '<path d="M10 3l1.8 5.2L17 10l-5.2 1.8L10 17l-1.8-5.2L3 10l5.2-1.8zM18 15l.9 2.1L21 18l-2.1.9L18 21l-.9-2.1L15 18l2.1-.9z"/>', 1.8),
  share: svg('0 0 24 24', '<path d="M12 15V3M8 7l4-4 4 4"/><path d="M6 11H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2h-1"/>', 2),
  download: svg('0 0 24 24', '<path d="M12 3v12M8 11l4 4 4-4"/><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/>', 2),
  book: svg('0 0 24 24', '<path d="M2 4h6a4 4 0 0 1 4 4v13a3 3 0 0 0-3-3H2zM22 4h-6a4 4 0 0 0-4 4v13a3 3 0 0 1 3-3h7z"/>', 1.9),
  check: svg('0 0 24 24', '<path d="M5 12.5l4.5 4.5L19 7.5"/>', 2.8),
  undo: svg('0 0 24 24', '<path d="M3 8h11a6 6 0 0 1 0 12H8"/><path d="M7 4L3 8l4 4"/>', 2.4),
  edit: svg('0 0 24 24', '<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z"/>', 2.2),
  play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5v15a1 1 0 0 0 1.5.86l12.5-7.5a1 1 0 0 0 0-1.72L8.5 3.64A1 1 0 0 0 7 4.5z" fill="currentColor"/></svg>',
};

/* ================= Daten ================= */
const COLORS = ['#5856D6', '#007AFF', '#34C759', '#FF9500', '#FF3B30', '#AF52DE', '#FF2D55', '#30B0C7', '#00C7BE', '#FFCC00', '#A2845E', '#636366'];
const EMOJIS = ['📚', '🇬🇧', '🤝', '📊', '💼', '💡', '🧠', '🗣️', '📈', '💶', '🏢', '🛠️', '📝', '🎯', '🌍', '⚖️', '🧾', '📣', '💻', '🎓', '✈️', '⭐', '🔬', '🧩'];
const DEFAULT_SETTINGS = { newPerDay: 20, lastBackup: null };

const SEED = [
  {
    name: 'Business English', emoji: '🇬🇧', color: '#007AFF',
    front: 'to follow up (on something)',
    back: '**nachfassen**, sich erneut melden – z. B. nach einem Meeting oder Angebot.\n\n*„I’ll follow up on the proposal next week.“*',
  },
  {
    name: 'Sales', emoji: '🤝', color: '#34C759',
    front: 'Pipeline',
    back: 'Alle laufenden **Verkaufschancen**, sortiert nach Phasen – vom ersten Kontakt (Lead) bis zum Abschluss. Zeigt, welcher Umsatz wahrscheinlich kommt.',
  },
  {
    name: 'BWL', emoji: '📊', color: '#FF9500',
    front: 'Deckungsbeitrag',
    back: '**Umsatz minus variable Kosten.**\nZeigt, wie viel ein Produkt zur Deckung der Fixkosten beiträgt.\n\nBsp.: Preis 50 €, variable Kosten 30 € → DB 20 € pro Stück.',
  },
  {
    name: 'Meine Arbeit', emoji: '💼', color: '#5856D6',
    front: 'Wie lege ich eigene Karten an?',
    back: 'Öffne einen Stapel und tippe oben rechts auf **+**. Vorne steht der Begriff, hinten die Erklärung – optional mit Bild.\n\nDiese Beispielkarte kannst du danach löschen.',
  },
];

const S = { decks: [], cards: [], settings: { ...DEFAULT_SETTINGS }, stats: { days: {} } };

async function load() {
  const [decks, cards, settings, stats, seeded] = await Promise.all([
    db.getAll('decks'),
    db.getAll('cards'),
    db.getMeta('settings', {}),
    db.getMeta('stats', { days: {} }),
    db.getMeta('seeded', false),
  ]);
  S.decks = decks;
  S.cards = cards;
  S.settings = { ...DEFAULT_SETTINGS, ...settings };
  S.stats = stats && stats.days ? stats : { days: {} };
  if (!seeded && !decks.length) await seed();
  sortDecks();
}

async function seed() {
  const now = Date.now();
  const ops = [];
  SEED.forEach((d, i) => {
    const deck = { id: uid(), name: d.name, emoji: d.emoji, color: d.color, created: now + i, order: i };
    const card = {
      id: uid(), deckId: deck.id, front: d.front, back: d.back, imageId: null, imageSide: 'back',
      created: now + i, updated: now + i, srs: newSrs(),
    };
    S.decks.push(deck);
    S.cards.push(card);
    ops.push({ store: 'decks', op: 'put', value: deck }, { store: 'cards', op: 'put', value: card });
  });
  ops.push({ store: 'meta', op: 'put', value: { key: 'seeded', value: true } });
  await db.bulk(ops);
}

const getDeck = (id) => S.decks.find((d) => d.id === id);
const getCard = (id) => S.cards.find((c) => c.id === id);
const deckCards = (id) => S.cards.filter((c) => c.deckId === id);
const sortDecks = () => S.decks.sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.created - b.created);
const findDeckByName = (name) => S.decks.find((d) => norm(d.name) === norm(name));

function upsertLocal(card) {
  const i = S.cards.findIndex((c) => c.id === card.id);
  if (i < 0) S.cards.push(card);
  else S.cards[i] = card;
}

async function saveCard(card) {
  card.updated = Date.now();
  upsertLocal(card);
  await db.put('cards', card);
}

async function saveDeck(deck) {
  const i = S.decks.findIndex((d) => d.id === deck.id);
  if (i < 0) S.decks.push(deck);
  else S.decks[i] = deck;
  sortDecks();
  await db.put('decks', deck);
}

async function deleteCardData(card) {
  S.cards = S.cards.filter((c) => c.id !== card.id);
  const ops = [{ store: 'cards', op: 'del', key: card.id }];
  if (card.imageId && !S.cards.some((c) => c.imageId === card.imageId)) {
    ops.push({ store: 'images', op: 'del', key: card.imageId });
    dropImageURL(card.imageId);
  }
  await db.bulk(ops);
}

async function deleteDeckData(deck) {
  const cards = deckCards(deck.id);
  S.cards = S.cards.filter((c) => c.deckId !== deck.id);
  S.decks = S.decks.filter((d) => d.id !== deck.id);
  const ops = [{ store: 'decks', op: 'del', key: deck.id }];
  for (const c of cards) {
    ops.push({ store: 'cards', op: 'del', key: c.id });
    if (c.imageId && !S.cards.some((x) => x.imageId === c.imageId)) {
      ops.push({ store: 'images', op: 'del', key: c.imageId });
      dropImageURL(c.imageId);
    }
  }
  await db.bulk(ops);
}

const saveSettings = () => db.setMeta('settings', S.settings);

async function bumpStats(delta) {
  const k = dayKey();
  S.stats.days[k] = Math.max(0, (S.stats.days[k] || 0) + delta);
  await db.setMeta('stats', S.stats);
}

function streak() {
  const [y, m, d] = dayKey().split('-').map(Number);
  const date = new Date(y, m - 1, d, 12);
  const key = (dt) => `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
  if (!S.stats.days[key(date)]) date.setDate(date.getDate() - 1);
  let n = 0;
  while (S.stats.days[key(date)] > 0) {
    n++;
    date.setDate(date.getDate() - 1);
  }
  return n;
}

function deckCounts(deckId, now = Date.now()) {
  const today = dayKey(now);
  let total = 0, nNew = 0, learn = 0, review = 0, introduced = 0, nextDue = Infinity;
  for (const c of S.cards) {
    if (c.deckId !== deckId) continue;
    total++;
    const s = c.srs;
    if (s.state === 'new') {
      nNew++;
      continue;
    }
    if (s.firstStudied === today) introduced++;
    if (s.due <= now) {
      if (s.state === 'review') review++;
      else learn++;
    } else nextDue = Math.min(nextDue, s.due);
  }
  const newAvail = Math.max(0, Math.min(nNew, S.settings.newPerDay - introduced));
  return { total, nNew, newAvail, learn, review, due: learn + review + newAvail, nextDue };
}

function cardStatus(c, now = Date.now()) {
  const s = c.srs;
  if (s.state === 'new') return { cls: 'new', text: 'Neu' };
  if (s.state !== 'review') return { cls: 'learn', text: 'Lernen' };
  if (s.due <= now) return { cls: 'due', text: 'Fällig' };
  return { cls: '', text: relDue(s.due, now) };
}

function buildQueue(deckIds) {
  const now = Date.now();
  const due = [];
  const fresh = [];
  for (const id of deckIds) {
    const cs = deckCards(id);
    const cnt = deckCounts(id, now);
    due.push(...cs.filter((c) => c.srs.state !== 'new' && c.srs.due <= now));
    fresh.push(...cs.filter((c) => c.srs.state === 'new').sort((a, b) => a.created - b.created).slice(0, cnt.newAvail));
  }
  const learning = due.filter((c) => c.srs.state !== 'review').sort((a, b) => a.srs.due - b.srs.due);
  const reviews = shuffle(due.filter((c) => c.srs.state === 'review'));
  const mixed = [];
  const every = fresh.length ? Math.max(1, Math.floor(reviews.length / fresh.length)) : Infinity;
  let r = 0;
  for (const f of fresh) {
    for (let k = 0; k < every && r < reviews.length; k++) mixed.push(reviews[r++]);
    mixed.push(f);
  }
  while (r < reviews.length) mixed.push(reviews[r++]);
  return [...learning, ...mixed].map((c) => c.id);
}

/* ================= Bilder ================= */
const imgURLs = new Map();
async function imageURL(id) {
  if (imgURLs.has(id)) return imgURLs.get(id);
  const rec = await db.get('images', id);
  if (!rec) return null;
  const url = URL.createObjectURL(new Blob([rec.data], { type: rec.type }));
  imgURLs.set(id, url);
  return url;
}
function dropImageURL(id) {
  const u = imgURLs.get(id);
  if (u) URL.revokeObjectURL(u);
  imgURLs.delete(id);
}
function hydrateImages(root) {
  root.querySelectorAll('img[data-img]').forEach(async (img) => {
    const u = await imageURL(img.dataset.img);
    if (u) img.src = u;
    else img.remove();
  });
}
async function processImage(file) {
  const src = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => rej(new Error('Das Bild konnte nicht gelesen werden.'));
      i.src = src;
    });
    const max = 1280;
    const sc = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * sc));
    const hgt = Math.max(1, Math.round(img.naturalHeight * sc));
    const cv = document.createElement('canvas');
    cv.width = w;
    cv.height = hgt;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, w, hgt);
    ctx.drawImage(img, 0, 0, w, hgt);
    const blob = await new Promise((r) => cv.toBlob(r, 'image/jpeg', 0.85));
    if (!blob) throw new Error('Das Bild konnte nicht verarbeitet werden.');
    return { type: 'image/jpeg', data: await blob.arrayBuffer(), url: URL.createObjectURL(blob) };
  } finally {
    URL.revokeObjectURL(src);
  }
}
const blobToDataURL = (blob) =>
  new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = () => rej(r.error);
    r.readAsDataURL(blob);
  });
function dataURLToBuffer(url) {
  const b64 = String(url).split(',')[1] || '';
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

/* ================= UI-Bausteine ================= */
const app = document.getElementById('app');
const overlay = document.getElementById('overlay-root');

let toastTimer;
function toast(msg, action) {
  document.querySelectorAll('.toast').forEach((t) => t.remove());
  const t = h(`<div class="toast" role="status"><span>${esc(msg)}</span>${action ? `<button>${esc(action.text)}</button>` : ''}</div>`);
  document.body.appendChild(t);
  const hide = () => {
    t.classList.remove('open');
    setTimeout(() => t.remove(), 500);
  };
  if (action) t.querySelector('button').onclick = () => { hide(); action.fn(); };
  raf2(() => t.classList.add('open'));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hide, action ? 10000 : 2200);
}

function alertBox({ title, message = '', buttons = [{ text: 'OK', style: 'bold' }], input = null }) {
  return new Promise((resolve) => {
    const dim = h('<div class="dim"></div>');
    const box = h(`<div class="alert" role="alertdialog">
      <div class="alert-body"><div class="alert-title">${esc(title)}</div>
      ${message ? `<div class="alert-msg">${esc(message)}</div>` : ''}
      ${input ? `<input class="alert-input" placeholder="${esc(input.placeholder || '')}" maxlength="40">` : ''}</div>
      <div class="alert-btns ${buttons.length > 2 ? 'vertical' : ''}">${buttons
        .map((b, i) => `<button data-i="${i}" class="${b.style || ''}">${esc(b.text)}</button>`)
        .join('')}</div></div>`);
    document.body.append(dim, box);
    const inp = $('input', box);
    if (inp) {
      inp.value = input.value || '';
      setTimeout(() => inp.focus(), 60);
    }
    raf2(() => {
      dim.classList.add('open');
      box.classList.add('open');
    });
    const finish = (val) => {
      inp?.blur();
      dim.classList.remove('open');
      box.classList.remove('open');
      setTimeout(() => {
        dim.remove();
        box.remove();
      }, 300);
      resolve(val);
    };
    $('.alert-btns', box).onclick = (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      const btn = buttons[+b.dataset.i];
      finish(inp ? (btn.value ? inp.value.trim() : null) : btn.value);
    };
    inp?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') finish(inp.value.trim() || null);
    });
  });
}

const confirmBox = (title, message, okText = 'Löschen', destructive = true) =>
  alertBox({
    title,
    message,
    buttons: [
      { text: 'Abbrechen', value: false },
      { text: okText, value: true, style: destructive ? 'destructive bold' : 'bold' },
    ],
  });

const promptBox = (title, message, value = '', okText = 'OK') =>
  alertBox({
    title,
    message,
    input: { value, placeholder: 'Name' },
    buttons: [
      { text: 'Abbrechen', value: false },
      { text: okText, value: true, style: 'bold' },
    ],
  });

function actionSheet({ title = '', message = '', actions }) {
  return new Promise((resolve) => {
    const dim = h('<div class="dim"></div>');
    const sheet = h(`<div class="action-sheet" role="dialog">
      <div class="as-group">${title || message ? `<div class="as-title">${title ? `<b>${esc(title)}</b>` : ''}${esc(message)}</div>` : ''}
      ${actions.map((a, i) => `<button data-i="${i}" class="${a.destructive ? 'destructive' : ''}">${esc(a.text)}</button>`).join('')}</div>
      <div class="as-group cancel"><button data-i="-1">Abbrechen</button></div></div>`);
    document.body.append(dim, sheet);
    raf2(() => {
      dim.classList.add('open');
      sheet.classList.add('open');
    });
    const finish = (val) => {
      dim.classList.remove('open');
      sheet.classList.remove('open');
      setTimeout(() => {
        dim.remove();
        sheet.remove();
      }, 400);
      resolve(val);
    };
    dim.onclick = () => finish(null);
    sheet.onclick = (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      const i = +b.dataset.i;
      finish(i < 0 ? null : actions[i].value);
    };
  });
}

function openSheet({ title, left = 'Abbrechen', right = null, onRight, onClose }) {
  const backdrop = h('<div class="sheet-backdrop"></div>');
  const el = h(`<div class="sheet" role="dialog" aria-label="${esc(title)}">
    <div class="sheet-header"><button class="nav-btn sh-left">${esc(left)}</button><div class="sheet-title">${esc(title)}</div>
    ${right ? `<button class="nav-btn strong sh-right">${esc(right)}</button>` : '<span></span>'}<div class="sheet-grabber"></div></div>
    <div class="sheet-body"></div></div>`);
  overlay.append(backdrop, el);
  if (!learnOpen) app.classList.add('behind-sheet');
  raf2(() => {
    backdrop.classList.add('open');
    el.classList.add('open');
  });
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    document.activeElement?.blur?.();
    backdrop.classList.remove('open');
    el.classList.remove('open');
    el.style.transform = '';
    if (!overlay.querySelector('.sheet.open')) app.classList.remove('behind-sheet');
    setTimeout(() => {
      backdrop.remove();
      el.remove();
    }, 500);
    onClose?.();
  };
  const rightBtn = $('.sh-right', el);
  $('.sh-left', el).onclick = close;
  backdrop.onclick = close;
  if (rightBtn) rightBtn.onclick = () => onRight?.();

  // Zum Schließen nach unten ziehen
  const header = $('.sheet-header', el);
  let y0 = null;
  let dy = 0;
  header.addEventListener('touchstart', (e) => {
    if (e.target.closest('button')) return;
    y0 = e.touches[0].clientY;
    dy = 0;
    el.classList.add('dragging');
  }, { passive: true });
  header.addEventListener('touchmove', (e) => {
    if (y0 === null) return;
    dy = Math.max(0, e.touches[0].clientY - y0);
    el.style.transform = `translateY(${dy}px)`;
  }, { passive: true });
  header.addEventListener('touchend', () => {
    if (y0 === null) return;
    y0 = null;
    el.classList.remove('dragging');
    if (dy > 110) close();
    else el.style.transform = '';
  });

  return {
    el,
    body: $('.sheet-body', el),
    close,
    rightBtn,
    setRightEnabled: (on) => { if (rightBtn) rightBtn.disabled = !on; },
  };
}

function autogrow(ta) {
  const fit = () => {
    ta.style.height = 'auto';
    ta.style.height = `${ta.scrollHeight + 2}px`;
  };
  ta.addEventListener('input', fit);
  requestAnimationFrame(fit);
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;top:0;opacity:0';
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, text.length);
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    ta.remove();
    return ok;
  }
}

async function copyPrompt() {
  const ok = await copyText(CLAUDE_PROMPT);
  if (ok) {
    alertBox({
      title: 'Prompt kopiert',
      message: 'Füge ihn in Claude ein und ersetze [THEMA] durch dein Thema.\n\nDie Antwort kopierst du dann unter „Aus Text importieren“ in die App.',
    });
  } else {
    alertBox({ title: 'Kopieren nicht möglich', message: 'Du findest den Prompt auch unter Einstellungen → Anleitung.' });
  }
}

/* ================= Navigation ================= */
const stack = [];

function makeView({ title = '', backLabel = null, largeTitle = true }) {
  const el = h(`<section class="view">
    <header class="navbar"><div class="nav-left"></div><div class="nav-title"></div><div class="nav-right"></div></header>
    <div class="scroll">${largeTitle ? '<h1 class="large-title"></h1>' : ''}<div class="content"></div></div></section>`);
  const v = {
    el,
    navbar: $('.navbar', el),
    left: $('.nav-left', el),
    right: $('.nav-right', el),
    scroll: $('.scroll', el),
    content: $('.content', el),
    render() {},
  };
  const titleEl = $('.nav-title', el);
  const largeEl = $('.large-title', el);
  v.setTitle = (t) => {
    titleEl.textContent = t;
    if (largeEl) largeEl.textContent = t;
  };
  v.setTitle(title);
  if (backLabel !== null) {
    v.left.innerHTML = `<button class="nav-btn back" data-nav="back" aria-label="Zurück">${I.back}<span>${esc(backLabel)}</span></button>`;
  }
  v.scroll.addEventListener('scroll', () => v.navbar.classList.toggle('scrolled', v.scroll.scrollTop > 34), { passive: true });
  el.addEventListener('click', (e) => {
    if (e.target.closest('[data-nav="back"]')) popView();
  });
  return v;
}

function pushView(v, animate = true) {
  const prev = stack[stack.length - 1];
  stack.push(v);
  v.render();
  if (animate && prev) {
    v.el.classList.add('offright');
    app.appendChild(v.el);
    v.el.getBoundingClientRect();
    v.el.classList.remove('offright');
    prev.el.classList.add('below');
  } else app.appendChild(v.el);
}

function popView() {
  if (stack.length < 2) return;
  const v = stack.pop();
  const prev = stack[stack.length - 1];
  prev.render();
  prev.el.classList.remove('below');
  v.el.classList.add('offright');
  setTimeout(() => v.el.remove(), 520);
}

function popToRoot() {
  while (stack.length > 1) stack.pop().el.remove();
  stack[0].el.classList.remove('below');
}

function refresh() {
  for (const v of stack) v.render();
}

// Wischgeste vom linken Rand zurück (wie in iOS)
(() => {
  let sw = null;
  app.addEventListener('touchstart', (e) => {
    if (stack.length < 2 || learnOpen || app.classList.contains('behind-sheet')) return;
    const t = e.touches[0];
    if (t.clientX > 28) return;
    sw = { x0: t.clientX, y0: t.clientY, t0: Date.now(), cur: stack[stack.length - 1], prev: stack[stack.length - 2], active: false, dx: 0 };
  }, { passive: true });
  app.addEventListener('touchmove', (e) => {
    if (!sw) return;
    const t = e.touches[0];
    const dx = t.clientX - sw.x0;
    const dy = t.clientY - sw.y0;
    if (!sw.active) {
      if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 6) { sw = null; return; }
      if (dx > 8) {
        sw.active = true;
        sw.cur.el.classList.add('dragging');
        sw.prev.el.classList.add('dragging');
      } else return;
    }
    sw.dx = Math.max(0, dx);
    const w = window.innerWidth;
    sw.cur.el.style.transform = `translateX(${sw.dx}px)`;
    sw.prev.el.style.transform = `translateX(${-28 + (28 * sw.dx) / w}%)`;
  }, { passive: true });
  const end = () => {
    if (!sw) return;
    const s = sw;
    sw = null;
    if (!s.active) return;
    s.cur.el.classList.remove('dragging');
    s.prev.el.classList.remove('dragging');
    s.cur.el.style.transform = '';
    s.prev.el.style.transform = '';
    const fast = s.dx / Math.max(1, Date.now() - s.t0) > 0.5;
    if (s.dx > window.innerWidth * 0.35 || (fast && s.dx > 40)) popView();
  };
  app.addEventListener('touchend', end);
  app.addEventListener('touchcancel', end);
})();

/* ================= Startseite ================= */
function HomeView() {
  const v = makeView({ title: 'Karteikarten' });
  v.left.innerHTML = `<button class="nav-btn icon" data-a="settings" aria-label="Einstellungen">${I.gear}</button>`;
  v.right.innerHTML = `<button class="nav-btn icon" data-a="add-deck" aria-label="Neuer Stapel">${I.plus}</button>`;

  v.render = () => {
    const now = Date.now();
    let due = 0, review = 0, learn = 0, nw = 0;
    const rows = S.decks
      .map((d) => {
        const c = deckCounts(d.id, now);
        due += c.due;
        review += c.review;
        learn += c.learn;
        nw += c.newAvail;
        const sub = c.total ? `${plural(c.total, 'Karte', 'Karten')}${c.due ? '' : ' · erledigt ✓'}` : 'Noch leer';
        return `<button class="row" data-a="open-deck" data-id="${d.id}">
          <span class="tile big" style="background:${esc(d.color)}">${esc(d.emoji)}</span>
          <span class="row-main"><span class="row-title">${esc(d.name)}</span><span class="row-sub">${sub}</span></span>
          ${c.due ? `<span class="badge" style="background:${esc(d.color)}">${c.due}</span>` : ''}
          <span class="chev">${I.chev}</span></button>`;
      })
      .join('');
    const today = S.stats.days[dayKey(now)] || 0;
    const st = streak();
    const parts = [review && `${review} Wiederholen`, learn && `${learn} Lernen`, nw && `${nw} Neu`].filter(Boolean).join(' · ');
    const lb = S.settings.lastBackup;
    const needBackup = S.cards.length >= 15 && (!lb || now - lb > 30 * 86400000);

    v.content.innerHTML = `
      <div class="hero">
        <div class="hero-top">
          <div><div class="hero-label">Heute fällig</div><div class="hero-num">${due}</div>
          <div class="hero-sub">${due ? parts : 'Alles erledigt – stark! 🎉'}</div></div>
          <div class="hero-chips"><div class="chip">🔥 ${st ? plural(st, 'Tag', 'Tage') : 'Serie starten'}</div><div class="chip">✓ ${today} heute</div></div>
        </div>
        ${due ? `<button class="btn white" data-a="learn-all">${I.play}Jetzt lernen</button>`
          : S.cards.length ? `<button class="btn white" data-a="cram-all">Frei üben</button>` : ''}
      </div>
      ${needBackup ? `<div class="section"><div class="group has-tiles"><button class="row" data-a="backup">
        <span class="tile" style="background:var(--green)">${I.share}</span>
        <span class="row-main"><span class="row-title">Backup empfohlen</span><span class="row-sub">${lb ? `Letztes Backup: ${fmtDate(lb)}` : 'Du hast noch kein Backup erstellt'}</span></span>
        <span class="chev">${I.chev}</span></button></div></div>` : ''}
      <div class="section"><div class="section-header">Stapel</div>
        <div class="group has-big-tiles">${rows}
          <button class="row accent" data-a="add-deck"><span class="tile big" style="background:var(--accent-soft);color:var(--accent)">${I.plus}</span>
          <span class="row-main"><span class="row-title">Neuer Stapel</span></span></button>
        </div></div>
      <div class="section"><div class="section-header">Karten hinzufügen</div>
        <div class="group has-tiles">
          <button class="row" data-a="import"><span class="tile" style="background:var(--teal)">${I.doc}</span>
            <span class="row-main"><span class="row-title">Aus Text importieren</span></span><span class="chev">${I.chev}</span></button>
          <button class="row" data-a="copy-prompt"><span class="tile" style="background:var(--orange)">${I.sparkles}</span>
            <span class="row-main"><span class="row-title">Prompt für Claude kopieren</span></span></button>
        </div>
        <div class="section-footer">Lass dir von Claude Karten erstellen, kopiere die Antwort und füge sie hier ein.</div></div>`;
  };

  v.el.addEventListener('click', (e) => {
    const a = e.target.closest('[data-a]');
    if (!a) return;
    const all = () => S.decks.map((d) => d.id);
    switch (a.dataset.a) {
      case 'settings': pushView(SettingsView()); break;
      case 'add-deck': openDeckEditor(); break;
      case 'open-deck': pushView(DeckView(a.dataset.id)); break;
      case 'learn-all': startLearn({ deckIds: all() }); break;
      case 'cram-all': startLearn({ deckIds: all(), cram: true }); break;
      case 'import': openImport(); break;
      case 'copy-prompt': copyPrompt(); break;
      case 'backup': createBackup(); break;
    }
  });
  return v;
}

/* ================= Stapel-Ansicht ================= */
function DeckView(deckId) {
  const v = makeView({ title: '', backLabel: 'Stapel', largeTitle: false });
  v.deckId = deckId;
  v.right.innerHTML = `<button class="nav-btn icon" data-a="more" aria-label="Optionen">${I.more}</button>
    <button class="nav-btn icon" data-a="add-card" aria-label="Neue Karte">${I.plus}</button>`;
  v.content.innerHTML = `<div class="deck-head"></div><div class="deck-top"></div>
    <div class="search">${I.search}<input type="search" placeholder="Karten durchsuchen" enterkeyhint="search" autocomplete="off"></div>
    <div class="deck-list"></div>`;
  const headEl = $('.deck-head', v.content);
  const topEl = $('.deck-top', v.content);
  const searchEl = $('.search', v.content);
  const input = $('input', searchEl);
  const listEl = $('.deck-list', v.content);
  input.addEventListener('input', () => renderList());
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') input.blur(); });

  function renderList() {
    const q = norm(input.value);
    const all = deckCards(deckId).sort((a, b) => b.created - a.created);
    if (!all.length) {
      searchEl.classList.add('hidden');
      listEl.innerHTML = `<div class="empty"><div class="empty-icon">🗂️</div><h3>Noch keine Karten</h3>
        <p>Lege deine erste Karte an oder importiere mehrere auf einmal aus Text.</p>
        <button class="btn primary" data-a="add-card">${I.plus}Karte anlegen</button>
        <button class="btn secondary" data-a="import">Aus Text importieren</button></div>`;
      return;
    }
    searchEl.classList.remove('hidden');
    const list = q ? all.filter((c) => norm(c.front).includes(q) || norm(c.back).includes(q)) : all;
    if (!list.length) {
      listEl.innerHTML = '<div class="empty"><p>Keine Treffer.</p></div>';
      return;
    }
    const now = Date.now();
    const shown = list.slice(0, 400);
    listEl.innerHTML = `<div class="section"><div class="section-header">${plural(list.length, 'Karte', 'Karten')}</div>
      <div class="group">${shown
        .map((c) => {
          const st = cardStatus(c, now);
          return `<button class="row" data-a="edit-card" data-id="${c.id}">
            <span class="row-main"><span class="row-title">${esc(plain(c.front))}</span><span class="row-sub">${esc(plain(c.back))}</span></span>
            ${c.imageId ? `<span class="photo-ind">${I.photo}</span>` : ''}
            <span class="status ${st.cls}">${esc(st.text)}</span></button>`;
        })
        .join('')}</div>
      ${list.length > shown.length ? `<div class="section-footer">… und ${list.length - shown.length} weitere. Nutze die Suche.</div>` : ''}</div>`;
  }

  v.render = () => {
    const d = getDeck(deckId);
    if (!d) return;
    v.setTitle(d.name);
    const c = deckCounts(deckId);
    headEl.innerHTML = `<span class="tile big" style="background:${esc(d.color)}">${esc(d.emoji)}</span><h1 class="large-title">${esc(d.name)}</h1>`;
    topEl.innerHTML = c.total
      ? `<div class="stats3">
          <div class="stat c-new"><div class="stat-num">${c.newAvail}</div><div class="stat-label">Neu</div></div>
          <div class="stat c-learn"><div class="stat-num">${c.learn}</div><div class="stat-label">Lernen</div></div>
          <div class="stat c-due"><div class="stat-num">${c.review}</div><div class="stat-label">Wiederholen</div></div></div>
        <div class="deck-actions">${c.due
          ? `<button class="btn primary" data-a="learn">${I.play}Lernen</button>`
          : `<button class="btn secondary" data-a="cram">Frei üben</button>
             <div class="deck-note">Für heute alles erledigt 🎉${c.nextDue < Infinity ? ` Nächste Karte ${relDue(c.nextDue)}.` : ''}</div>`}</div>`
      : '';
    renderList();
  };

  v.el.addEventListener('click', async (e) => {
    const a = e.target.closest('[data-a]');
    if (!a) return;
    const d = getDeck(deckId);
    if (!d) return;
    switch (a.dataset.a) {
      case 'learn': startLearn({ deckIds: [deckId] }); break;
      case 'cram': startLearn({ deckIds: [deckId], cram: true }); break;
      case 'add-card': openCardEditor({ deckId }); break;
      case 'import': openImport({ deckId }); break;
      case 'edit-card': openCardEditor({ card: getCard(a.dataset.id) }); break;
      case 'more': {
        const has = deckCards(deckId).length > 0;
        const choice = await actionSheet({
          title: `${d.emoji} ${d.name}`,
          actions: [
            { text: 'Stapel bearbeiten', value: 'edit' },
            ...(has ? [{ text: 'Frei üben (alle Karten)', value: 'cram' }, { text: 'Als Text kopieren', value: 'copy' }] : []),
            { text: 'Karten aus Text importieren', value: 'import' },
            ...(has ? [{ text: 'Lernfortschritt zurücksetzen', value: 'reset' }] : []),
            { text: 'Stapel löschen', value: 'delete', destructive: true },
          ],
        });
        if (choice === 'edit') openDeckEditor(d);
        else if (choice === 'cram') startLearn({ deckIds: [deckId], cram: true });
        else if (choice === 'import') openImport({ deckId });
        else if (choice === 'copy') {
          const lines = deckCards(deckId)
            .sort((a, b) => a.created - b.created)
            .map((c) => `${c.front.replace(/\n/g, ' ')} | ${c.back.replace(/\n/g, '\\n')}`);
          const ok = await copyText(`# ${d.name}\n${lines.join('\n')}`);
          toast(ok ? `${plural(lines.length, 'Karte', 'Karten')} kopiert` : 'Kopieren nicht möglich');
        } else if (choice === 'reset') {
          if (await confirmBox('Fortschritt zurücksetzen?', `Alle Karten in „${d.name}“ gelten danach wieder als neu.`, 'Zurücksetzen')) {
            const cs = deckCards(deckId).map((c) => ({ ...c, srs: newSrs(), updated: Date.now() }));
            cs.forEach(upsertLocal);
            await db.bulk(cs.map((c) => ({ store: 'cards', op: 'put', value: c })));
            refresh();
            toast('Fortschritt zurückgesetzt');
          }
        } else if (choice === 'delete') confirmDeleteDeck(d);
        break;
      }
    }
  });
  return v;
}

async function confirmDeleteDeck(d, after) {
  const n = deckCards(d.id).length;
  const ok = await confirmBox('Stapel löschen?', `„${d.name}“${n ? ` und ${plural(n, 'Karte', 'Karten')}` : ''} werden endgültig gelöscht.`);
  if (!ok) return false;
  await deleteDeckData(d);
  after?.();
  const top = stack[stack.length - 1];
  if (top.deckId === d.id) popView();
  refresh();
  toast('Stapel gelöscht');
  return true;
}

/* ================= Stapel anlegen/bearbeiten ================= */
function openDeckEditor(deck = null) {
  const isNew = !deck;
  const d = deck ? { ...deck } : { name: '', emoji: EMOJIS[0], color: COLORS[S.decks.length % COLORS.length] };
  const sh = openSheet({ title: isNew ? 'Neuer Stapel' : 'Stapel bearbeiten', right: isNew ? 'Erstellen' : 'Sichern', onRight: save });
  sh.body.innerHTML = `
    <div class="deck-preview"><span class="tile" data-prev></span></div>
    <div class="section"><div class="group"><input class="field" data-f="name" maxlength="40" placeholder="Name, z. B. Business English" autocapitalize="words" enterkeyhint="done"></div></div>
    <div class="section"><div class="section-header">Farbe</div><div class="group"><div class="color-grid">${COLORS.map(
      (c) => `<button data-color="${c}" style="background:${c}" aria-label="Farbe ${c}"></button>`,
    ).join('')}</div></div></div>
    <div class="section"><div class="section-header">Symbol</div><div class="group"><div class="emoji-grid">${EMOJIS.map(
      (e) => `<button data-emoji="${e}">${e}</button>`,
    ).join('')}</div></div></div>
    ${isNew ? '' : '<div class="section"><div class="group"><button class="row center danger" data-a="delete"><span class="row-title">Stapel löschen</span></button></div></div>'}`;
  const name = $('[data-f="name"]', sh.body);
  name.value = d.name;
  const prev = $('[data-prev]', sh.body);
  const sync = () => {
    prev.style.background = d.color;
    prev.textContent = d.emoji;
    sh.body.querySelectorAll('[data-color]').forEach((b) => b.classList.toggle('on', b.dataset.color === d.color));
    sh.body.querySelectorAll('[data-emoji]').forEach((b) => b.classList.toggle('on', b.dataset.emoji === d.emoji));
    sh.setRightEnabled(name.value.trim().length > 0);
  };
  sync();
  name.addEventListener('input', sync);
  name.addEventListener('keydown', (e) => { if (e.key === 'Enter') name.blur(); });
  sh.body.addEventListener('click', (e) => {
    const c = e.target.closest('[data-color]');
    const em = e.target.closest('[data-emoji]');
    if (c) d.color = c.dataset.color;
    if (em) d.emoji = em.dataset.emoji;
    if (c || em) sync();
    if (e.target.closest('[data-a="delete"]')) confirmDeleteDeck(deck, () => sh.close());
  });
  if (isNew) setTimeout(() => name.focus(), 350);

  async function save() {
    const n = name.value.trim();
    if (!n) return;
    if (isNew) {
      const nd = { id: uid(), name: n, emoji: d.emoji, color: d.color, created: Date.now(), order: Math.max(-1, ...S.decks.map((x) => x.order ?? 0)) + 1 };
      await saveDeck(nd);
      sh.close();
      refresh();
      if (stack.length === 1) setTimeout(() => pushView(DeckView(nd.id)), 250);
    } else {
      await saveDeck({ ...deck, name: n, emoji: d.emoji, color: d.color });
      sh.close();
      refresh();
    }
  }
}

/* ================= Karte anlegen/bearbeiten ================= */
function openCardEditor({ card = null, deckId = null, onSaved, onDeleted } = {}) {
  if (!S.decks.length) {
    toast('Lege zuerst einen Stapel an');
    openDeckEditor();
    return;
  }
  const isNew = !card;
  let imageId = card?.imageId || null;
  let side = card?.imageSide || 'back';
  let img = { action: 'keep' }; // keep | new | remove
  let saved = false;
  const sh = openSheet({
    title: isNew ? 'Neue Karte' : 'Karte bearbeiten',
    right: 'Sichern',
    onRight: () => save(false),
    onClose: () => { if (!saved && img.action === 'new') URL.revokeObjectURL(img.url); },
  });
  const selDeck = card?.deckId || deckId || S.decks[0].id;
  const s = card?.srs;
  const info = card
    ? s.state === 'new'
      ? 'Diese Karte wurde noch nicht gelernt.'
      : `${plural(s.reps, 'Mal', 'Mal')} gelernt${s.lapses ? `, ${s.lapses}× vergessen` : ''}. ${s.state === 'review' ? `Intervall: ${fmtDays(s.interval)}, nächste Wiederholung ${relDue(s.due)}.` : 'Gerade in der Lernphase.'}`
    : '';
  sh.body.innerHTML = `
    <div class="section"><div class="group"><label class="row"><span class="row-title">Stapel</span><span class="row-main"></span>
      <select class="row-select" data-f="deck">${S.decks.map((d) => `<option value="${d.id}" ${d.id === selDeck ? 'selected' : ''}>${esc(`${d.emoji} ${d.name}`)}</option>`).join('')}</select>
      <span class="select-ind">${I.updown}</span></label></div></div>
    <div class="section"><div class="section-header">Vorderseite · Begriff</div>
      <div class="group"><textarea class="field" data-f="front" rows="1" placeholder="z. B. Deckungsbeitrag" style="min-height:52px"></textarea></div></div>
    <div class="section"><div class="section-header">Rückseite · Erklärung</div>
      <div class="group"><textarea class="field" data-f="back" rows="4" placeholder="Erklärung, Beispiel …"></textarea></div>
      <div class="section-footer">Tipp: **Wort** wird auf der Karte fett angezeigt.</div></div>
    <div class="section"><div class="section-header">Bild (optional)</div><div class="group" data-img-group></div></div>
    ${isNew
      ? '<div class="section pad"><button class="btn secondary" data-a="save-next">Sichern & nächste Karte</button></div>'
      : `<div class="section"><div class="group">
          <button class="row center" data-a="reset"><span class="row-title accent-text">Lernfortschritt zurücksetzen</span></button>
          <button class="row center danger" data-a="delete"><span class="row-title">Karte löschen</span></button></div>
          <div class="section-footer">${esc(info)}</div></div>`}
    <input type="file" accept="image/*" class="hidden" data-f="file">`;

  const front = $('[data-f="front"]', sh.body);
  const back = $('[data-f="back"]', sh.body);
  const deckSel = $('[data-f="deck"]', sh.body);
  const fileIn = $('[data-f="file"]', sh.body);
  const imgGroup = $('[data-img-group]', sh.body);
  front.value = card?.front || '';
  back.value = card?.back || '';
  autogrow(front);
  autogrow(back);

  const hasImage = () => img.action === 'new' || (img.action === 'keep' && imageId);
  const validate = () => sh.setRightEnabled(front.value.trim() && (back.value.trim() || hasImage()));
  front.addEventListener('input', validate);
  back.addEventListener('input', validate);

  async function renderImg() {
    if (!hasImage()) {
      imgGroup.innerHTML = `<button class="row" data-a="pick"><span class="tile" style="background:var(--blue)">${I.photo}</span>
        <span class="row-main"><span class="row-title accent-text">Bild hinzufügen</span></span></button>`;
    } else {
      imgGroup.innerHTML = `<div class="img-preview"><img alt=""><button class="img-remove" data-a="rm-img" aria-label="Bild entfernen">${I.close}</button></div>
        <div style="padding:0 0 12px"><div class="seg"><button data-side="front">Auf Vorderseite</button><button data-side="back">Auf Rückseite</button></div></div>`;
      imgGroup.querySelectorAll('[data-side]').forEach((b) => b.classList.toggle('on', b.dataset.side === side));
      $('img', imgGroup).src = img.action === 'new' ? img.url : await imageURL(imageId);
    }
    validate();
  }
  renderImg();

  fileIn.addEventListener('change', async () => {
    const f = fileIn.files[0];
    fileIn.value = '';
    if (!f) return;
    try {
      const r = await processImage(f);
      if (img.action === 'new') URL.revokeObjectURL(img.url);
      img = { action: 'new', data: { type: r.type, data: r.data }, url: r.url };
      renderImg();
    } catch (err) {
      alertBox({ title: 'Bild nicht möglich', message: err.message });
    }
  });

  sh.body.addEventListener('click', async (e) => {
    const sideBtn = e.target.closest('[data-side]');
    if (sideBtn) {
      side = sideBtn.dataset.side;
      renderImg();
      return;
    }
    const a = e.target.closest('[data-a]');
    if (!a) return;
    switch (a.dataset.a) {
      case 'pick': fileIn.click(); break;
      case 'rm-img':
        if (img.action === 'new') URL.revokeObjectURL(img.url);
        img = { action: imageId ? 'remove' : 'keep' };
        renderImg();
        break;
      case 'save-next': save(true); break;
      case 'reset': {
        if (!(await confirmBox('Fortschritt zurücksetzen?', 'Die Karte gilt danach wieder als neu.', 'Zurücksetzen'))) return;
        const c = getCard(card.id);
        if (c) await saveCard({ ...c, srs: newSrs() });
        sh.close();
        refresh();
        onSaved?.(getCard(card.id));
        toast('Fortschritt zurückgesetzt');
        break;
      }
      case 'delete': {
        if (!(await confirmBox('Karte löschen?', 'Das kann nicht rückgängig gemacht werden.'))) return;
        await deleteCardData(card);
        saved = true;
        sh.close();
        refresh();
        onDeleted?.();
        toast('Karte gelöscht');
        break;
      }
    }
  });

  async function save(next) {
    const f = front.value.trim();
    const b = back.value.trim();
    if (!f || !(b || hasImage())) return;
    const now = Date.now();
    const base = isNew ? { id: uid(), created: now, srs: newSrs(), imageId: null } : { ...(getCard(card.id) || card) };
    const c = { ...base, front: f, back: b, deckId: deckSel.value, imageSide: side };
    const ops = [];
    if (img.action === 'new') {
      const id = uid();
      ops.push({ store: 'images', op: 'put', value: { id, type: img.data.type, data: img.data.data } });
      if (c.imageId) {
        ops.push({ store: 'images', op: 'del', key: c.imageId });
        dropImageURL(c.imageId);
      }
      c.imageId = id;
      imgURLs.set(id, img.url);
    } else if (img.action === 'remove' && c.imageId) {
      ops.push({ store: 'images', op: 'del', key: c.imageId });
      dropImageURL(c.imageId);
      c.imageId = null;
    }
    c.updated = now;
    ops.push({ store: 'cards', op: 'put', value: c });
    try {
      await db.bulk(ops);
    } catch (err) {
      alertBox({ title: 'Speichern fehlgeschlagen', message: err?.message || String(err) });
      return;
    }
    upsertLocal(c);
    refresh();
    onSaved?.(c);
    if (next) {
      front.value = '';
      back.value = '';
      img = { action: 'keep' };
      imageId = null;
      side = 'back';
      front.dispatchEvent(new Event('input'));
      back.dispatchEvent(new Event('input'));
      renderImg();
      front.focus();
      sh.body.scrollTop = 0;
      toast('Karte gesichert');
    } else {
      saved = true;
      sh.close();
      if (isNew) toast('Karte angelegt');
    }
  }
}

/* ================= Lernmodus ================= */
let learnOpen = false;

function startLearn({ deckIds, cram = false }) {
  let queue = cram ? shuffle(S.cards.filter((c) => deckIds.includes(c.deckId))).map((c) => c.id) : buildQueue(deckIds);
  if (!queue.length) {
    toast(cram ? 'Keine Karten vorhanden' : 'Gerade ist nichts fällig');
    return;
  }
  learnOpen = true;
  const el = h(`<div class="learn" role="dialog" aria-label="Lernen">
    <div class="learn-top">
      <button class="circle-btn" data-a="close" aria-label="Beenden">${I.close}</button>
      <div class="progress"><div class="bar"></div></div><span class="learn-count"></span>
      <button class="circle-btn" data-a="undo" aria-label="Rückgängig" disabled>${I.undo}</button>
      <button class="circle-btn" data-a="edit" aria-label="Karte bearbeiten">${I.edit}</button>
    </div>
    <div class="learn-deck"></div>
    <div class="learn-stage"></div>
    <div class="learn-bottom"></div></div>`);
  overlay.appendChild(el);
  raf2(() => el.classList.add('open'));

  const stage = $('.learn-stage', el);
  const bottom = $('.learn-bottom', el);
  const bar = $('.bar', el);
  const countEl = $('.learn-count', el);
  const deckEl = $('.learn-deck', el);
  const undoBtn = $('[data-a="undo"]', el);
  const editBtn = $('[data-a="edit"]', el);
  let current = null;
  let flipped = false;
  let busy = false;
  let done = 0;
  const tally = { 1: 0, 2: 0, 3: 0, 4: 0 };
  const seen = new Set();
  const history = [];

  const imgTag = (c, small) => (c.imageId ? `<img class="fc-img ${small ? 'small' : ''}" data-img="${c.imageId}" alt="">` : '');
  const frontHTML = (c) => {
    const st = cardStatus(c);
    const tag = cram ? '' : `<span class="fc-tag ${st.cls}">${c.srs.state === 'new' ? 'Neu' : c.srs.state === 'review' ? 'Wiederholung' : 'Lernen'}</span>`;
    return `${tag}<div class="fc-inner">${c.imageSide === 'front' ? imgTag(c) : ''}
      <div class="fc-term ${c.front.length > 60 ? 'long' : ''}">${rich(c.front)}</div></div>
      <div class="fc-hint">Tippen zum Umdrehen</div>`;
  };
  const backHTML = (c) => {
    const long = c.back.length > 140 || c.back.includes('\n');
    return `<div class="fc-inner"><div class="fc-term small">${rich(c.front)}</div>
      ${c.imageSide === 'front' ? imgTag(c, true) : ''}<div class="fc-divider"></div>
      ${c.imageSide !== 'front' ? imgTag(c) : ''}
      ${c.back ? `<div class="fc-answer ${long ? 'long' : ''}">${rich(c.back)}</div>` : ''}</div>`;
  };

  function progress() {
    const rem = queue.length + (current ? 1 : 0);
    const total = done + rem;
    bar.style.width = `${total ? (done / total) * 100 : 100}%`;
    countEl.textContent = rem || '';
  }

  function renderBottom() {
    if (!current) {
      bottom.innerHTML = '<button class="btn primary show" data-a="close">Fertig</button>';
    } else if (!flipped) {
      bottom.innerHTML = '<button class="btn primary show" data-a="flip">Antwort zeigen</button>';
    } else if (cram) {
      bottom.innerHTML = `<div class="rate-grid two"><button class="rate r1" data-r="1">Nochmal<small>kommt gleich wieder</small></button>
        <button class="rate r3" data-r="3">Gewusst<small>weiter</small></button></div>`;
    } else {
      const l = previewLabels(current.srs);
      const names = ['Nochmal', 'Schwer', 'Gut', 'Einfach'];
      bottom.innerHTML = `<div class="rate-grid">${names
        .map((n, i) => `<button class="rate r${i + 1}" data-r="${i + 1}">${n}<small>${l[i]}</small></button>`)
        .join('')}</div>`;
    }
  }

  function showCard(anim = true) {
    flipped = false;
    const d = getDeck(current.deckId);
    deckEl.textContent = d ? `${d.emoji} ${d.name}` : '';
    const card = h(`<div class="flashcard ${anim ? 'enter' : ''}" role="button" tabindex="0" aria-label="Karte umdrehen">${frontHTML(current)}</div>`);
    stage.replaceChildren(card);
    hydrateImages(card);
    renderBottom();
    progress();
    editBtn.disabled = false;
  }

  function showBackStatic() {
    const card = $('.flashcard', stage);
    card.innerHTML = backHTML(current);
    hydrateImages(card);
    renderBottom();
  }

  async function flip() {
    if (flipped || busy || !current) return;
    busy = true;
    flipped = true;
    const card = $('.flashcard', stage);
    card.classList.remove('enter');
    const a1 = card.animate([{ transform: 'rotateY(0deg)' }, { transform: 'rotateY(90deg)' }], { duration: 140, easing: 'ease-in', fill: 'forwards' });
    await a1.finished.catch(() => {});
    card.innerHTML = backHTML(current);
    card.scrollTop = 0;
    hydrateImages(card);
    a1.cancel();
    card.animate([{ transform: 'rotateY(-90deg)' }, { transform: 'rotateY(0deg)' }], { duration: 230, easing: 'cubic-bezier(.2,.8,.3,1)' });
    renderBottom();
    busy = false;
  }

  function next() {
    while (queue.length) {
      const c = getCard(queue.shift());
      if (c) {
        current = c;
        showCard();
        return;
      }
    }
    current = null;
    finish();
  }

  async function rate(r) {
    if (!flipped || busy || !current) return;
    busy = true;
    const card = current;
    history.push({ card: JSON.parse(JSON.stringify(card)), queue: queue.slice(), done, tally: { ...tally }, seen: [...seen] });
    undoBtn.disabled = false;
    seen.add(card.id);
    tally[r]++;
    if (cram) {
      if (r === 1) queue.splice(Math.min(3, queue.length), 0, card.id);
      else done++;
    } else {
      const s = schedule(card.srs, r);
      try {
        await saveCard({ ...card, srs: s });
        bumpStats(1);
      } catch (err) {
        busy = false;
        alertBox({ title: 'Speichern fehlgeschlagen', message: err?.message || String(err) });
        return;
      }
      if (s.state !== 'review') {
        const pos = r === 1 ? 3 : r === 2 ? 5 : 8;
        queue.splice(Math.min(pos, queue.length), 0, card.id);
      } else done++;
    }
    const cardEl = $('.flashcard', stage);
    if (cardEl) {
      await cardEl
        .animate([{ transform: 'none', opacity: 1 }, { transform: 'translateX(-28px) scale(.98)', opacity: 0 }], { duration: 150, easing: 'ease-in', fill: 'forwards' })
        .finished.catch(() => {});
    }
    next();
    busy = false;
  }

  async function undo() {
    if (busy || !history.length) return;
    busy = true;
    const snap = history.pop();
    if (!cram) {
      await saveCard(snap.card);
      bumpStats(-1);
    }
    queue = snap.queue;
    done = snap.done;
    Object.assign(tally, snap.tally);
    seen.clear();
    snap.seen.forEach((id) => seen.add(id));
    current = getCard(snap.card.id);
    if (current) showCard();
    else next();
    undoBtn.disabled = !history.length;
    busy = false;
  }

  function finish() {
    progress();
    editBtn.disabled = true;
    deckEl.textContent = '';
    const n = seen.size;
    stage.innerHTML = `<div class="done"><div class="done-check">${I.check}</div><h2>Geschafft!</h2>
      <p>${cram ? `Du hast ${plural(n, 'Karte', 'Karten')} geübt.` : `Du hast ${plural(n, 'Karte', 'Karten')} gelernt.`}</p>
      ${cram ? '' : `<div class="done-stats">
        <div><b style="color:var(--red)">${tally[1]}</b><span>Nochmal</span></div>
        <div><b style="color:var(--orange)">${tally[2]}</b><span>Schwer</span></div>
        <div><b style="color:var(--green)">${tally[3]}</b><span>Gut</span></div>
        <div><b style="color:var(--blue)">${tally[4]}</b><span>Einfach</span></div></div>`}</div>`;
    renderBottom();
  }

  function close() {
    learnOpen = false;
    document.removeEventListener('keydown', onKey);
    el.classList.remove('open');
    setTimeout(() => el.remove(), 520);
    refresh();
  }

  function edit() {
    if (!current) return;
    openCardEditor({
      card: current,
      onSaved: (c) => {
        current = c;
        if (flipped) showBackStatic();
        else showCard(false);
      },
      onDeleted: () => {
        current = null;
        next();
      },
    });
  }

  function onKey(e) {
    if (overlay.querySelector('.sheet') || document.querySelector('.alert')) return;
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      if (!current) close();
      else if (!flipped) flip();
      else if (cram) rate(3);
    } else if (/^[1-4]$/.test(e.key) && flipped) {
      if (!cram) rate(+e.key);
      else if (e.key === '1' || e.key === '3') rate(+e.key);
    } else if (e.key === 'Escape') close();
  }
  document.addEventListener('keydown', onKey);

  el.addEventListener('click', (e) => {
    const r = e.target.closest('[data-r]');
    if (r) return rate(+r.dataset.r);
    const a = e.target.closest('[data-a]');
    if (a) {
      if (a.dataset.a === 'flip') flip();
      else if (a.dataset.a === 'close') close();
      else if (a.dataset.a === 'undo') undo();
      else if (a.dataset.a === 'edit') edit();
      return;
    }
    if (e.target.closest('.flashcard') && !flipped) flip();
  });

  next();
}

/* ================= Text-Import ================= */
function openImport({ deckId = null, text = '' } = {}) {
  let result = { cards: [], skipped: [] };
  let plan = { items: [], newDecks: [], importable: 0, dups: 0 };
  let newDeckName = null;
  const sh = openSheet({ title: 'Text importieren', right: 'Importieren', onRight: doImport });
  sh.setRightEnabled(false);
  const defDeck = deckId || S.decks[0]?.id || '';
  sh.body.innerHTML = `
    <div class="section"><div class="group"><textarea class="field" data-f="text" placeholder="Hier den Text von Claude einfügen, z. B.:

# Sales
Pipeline | Alle laufenden Verkaufschancen
Lead | Potenzieller Kunde mit Interesse" autocapitalize="off" autocorrect="off" spellcheck="false" style="min-height:190px;font-size:15px"></textarea></div>
      <div class="pad" style="margin-top:10px"><div class="btn-row">
        <button class="btn secondary" data-a="paste">${I.clip}Einfügen</button>
        <button class="btn secondary" data-a="prompt">${I.sparkles}Claude-Prompt</button></div></div></div>
    <div class="section"><div class="group">
      <label class="row"><span class="row-title">Stapel</span><span class="row-main"></span>
        <select class="row-select" data-f="deck"></select><span class="select-ind">${I.updown}</span></label>
      <label class="row"><span class="row-main"><span class="row-title">Doppelte überspringen</span></span>
        <span class="switch"><input type="checkbox" data-f="dups" checked><span></span></span></label></div>
      <div class="section-footer">Karten ohne eigene Überschrift landen im gewählten Stapel. Eine Zeile <span class="code"># Stapelname</span> legt automatisch einen neuen Stapel an.</div></div>
    <div data-preview></div>
    <div class="section"><div class="section-header">Erkannte Formate</div>
      <div class="pad"><div class="code-block"># Stapelname
Begriff | Erklärung
Begriff ; Erklärung
Begriff: Erklärung

F: Frage
A: Antwort (auch mehrzeilig)</div></div>
      <div class="section-footer">Auch Markdown-Tabellen, Aufzählungen und Tab-getrennte Listen (z. B. aus Excel) funktionieren.</div></div>`;
  const ta = $('[data-f="text"]', sh.body);
  const sel = $('[data-f="deck"]', sh.body);
  const dupBox = $('[data-f="dups"]', sh.body);
  const preview = $('[data-preview]', sh.body);
  ta.value = text;

  function fillSelect(selected) {
    sel.innerHTML = `${S.decks.map((d) => `<option value="${d.id}">${esc(`${d.emoji} ${d.name}`)}</option>`).join('')}
      ${newDeckName ? `<option value="__pending">${esc(`📚 ${newDeckName} (neu)`)}</option>` : ''}
      <option value="__new">＋ Neuer Stapel …</option>`;
    sel.value = selected;
  }
  fillSelect(defDeck || '__new');
  let lastSel = sel.value;
  sel.addEventListener('change', async () => {
    if (sel.value === '__new') {
      const n = await promptBox('Neuer Stapel', 'Wie soll der Stapel heißen?', '', 'Anlegen');
      if (n) {
        const existing = findDeckByName(n);
        if (existing) fillSelect(existing.id);
        else {
          newDeckName = n;
          fillSelect('__pending');
        }
      } else fillSelect(lastSel === '__new' ? S.decks[0]?.id || '__new' : lastSel);
    }
    lastSel = sel.value;
    update();
  });
  dupBox.addEventListener('change', update);
  let t;
  ta.addEventListener('input', () => {
    clearTimeout(t);
    t = setTimeout(update, 150);
  });

  function defaultTarget() {
    if (sel.value === '__pending') return { name: newDeckName };
    const d = getDeck(sel.value);
    return d ? { id: d.id, name: d.name } : null;
  }

  function update() {
    result = parseCards(ta.value);
    const def = defaultTarget();
    const existingFronts = new Map();
    const frontsOf = (key) => {
      if (!existingFronts.has(key)) {
        const d = key.startsWith('id:') ? key.slice(3) : null;
        existingFronts.set(key, new Set(d ? deckCards(d).map((c) => norm(c.front)) : []));
      }
      return existingFronts.get(key);
    };
    const newDecks = new Set();
    let dups = 0;
    const items = result.cards.map((c) => {
      let target;
      if (c.deck) {
        const d = findDeckByName(c.deck);
        target = d ? { id: d.id, name: d.name } : { name: c.deck };
      } else target = def;
      if (!target) target = { name: 'Importiert' };
      if (!target.id) newDecks.add(target.name);
      const key = target.id ? `id:${target.id}` : `new:${norm(target.name)}`;
      const fronts = frontsOf(key);
      const dup = fronts.has(norm(c.front));
      if (dup) dups++;
      fronts.add(norm(c.front));
      return { ...c, target, dup };
    });
    const skipDup = dupBox.checked;
    const importable = items.filter((i) => !(skipDup && i.dup)).length;
    plan = { items, newDecks: [...newDecks], importable, dups };
    sh.setRightEnabled(importable > 0);

    if (!ta.value.trim()) {
      preview.innerHTML = '';
      return;
    }
    const shown = items.slice(0, 60);
    preview.innerHTML = `
      <div class="section"><div class="section-header">${plural(items.length, 'Karte', 'Karten')} erkannt${dups ? ` · ${dups} doppelt` : ''}</div>
      ${items.length ? `<div class="group">${shown
        .map((i) => `<div class="row preview-row"><span class="row-main"><span class="row-title">${esc(plain(i.front))}</span>
          <span class="row-sub">${esc(plain(i.back))}</span></span>
          ${i.dup ? '<span class="status">doppelt</span>' : ''}
          ${i.target && (!def || i.target.name !== def.name) ? `<span class="pill">${esc(i.target.name)}</span>` : ''}</div>`)
        .join('')}</div>` : ''}
      ${items.length > shown.length ? `<div class="section-footer">… und ${items.length - shown.length} weitere</div>` : ''}
      ${plan.newDecks.length ? `<div class="section-footer">Neue Stapel: ${esc(plan.newDecks.join(', '))}</div>` : ''}</div>
      ${result.skipped.length ? `<div class="section"><div class="section-header warn">${plural(result.skipped.length, 'Zeile', 'Zeilen')} nicht erkannt</div>
        <div class="pad"><div class="code-block">${esc(result.skipped.slice(0, 8).join('\n'))}${result.skipped.length > 8 ? '\n…' : ''}</div></div></div>` : ''}
      ${importable ? `<div class="section pad"><button class="btn primary" data-a="do-import">${plural(importable, 'Karte', 'Karten')} importieren</button></div>` : ''}`;
  }
  update();

  sh.body.addEventListener('click', async (e) => {
    const a = e.target.closest('[data-a]');
    if (!a) return;
    if (a.dataset.a === 'paste') {
      try {
        const txt = await navigator.clipboard.readText();
        if (txt) {
          ta.value = ta.value.trim() ? `${ta.value.trim()}\n${txt}` : txt;
          ta.dispatchEvent(new Event('input'));
          update();
        } else toast('Zwischenablage ist leer');
      } catch {
        toast('Lange ins Textfeld tippen → „Einsetzen“');
        ta.focus();
      }
    } else if (a.dataset.a === 'prompt') copyPrompt();
    else if (a.dataset.a === 'do-import') doImport();
  });

  async function doImport() {
    if (!plan.importable) return;
    const skipDup = dupBox.checked;
    const now = Date.now();
    const ops = [];
    const created = new Map();
    let order = Math.max(-1, ...S.decks.map((x) => x.order ?? 0));
    const deckFor = (target) => {
      if (target.id) return target.id;
      const key = norm(target.name);
      if (!created.has(key)) {
        const d = { id: uid(), name: target.name, emoji: '📚', color: COLORS[(S.decks.length + created.size) % COLORS.length], created: now, order: ++order };
        created.set(key, d);
        ops.push({ store: 'decks', op: 'put', value: d });
      }
      return created.get(key).id;
    };
    const cards = [];
    plan.items.forEach((i, idx) => {
      if (skipDup && i.dup) return;
      const c = {
        id: uid(), deckId: deckFor(i.target), front: i.front, back: i.back, imageId: null, imageSide: 'back',
        created: now + idx, updated: now + idx, srs: newSrs(),
      };
      cards.push(c);
      ops.push({ store: 'cards', op: 'put', value: c });
    });
    try {
      await db.bulk(ops);
    } catch (err) {
      alertBox({ title: 'Import fehlgeschlagen', message: err?.message || String(err) });
      return;
    }
    for (const d of created.values()) S.decks.push(d);
    sortDecks();
    S.cards.push(...cards);
    sh.close();
    refresh();
    toast(`${plural(cards.length, 'Karte', 'Karten')} importiert`);
  }
}

/* ================= Backup ================= */
async function createBackup() {
  let file;
  let size = 0;
  try {
    const images = await db.getAll('images');
    const imgs = {};
    for (const im of images) imgs[im.id] = { type: im.type, data: await blobToDataURL(new Blob([im.data], { type: im.type })) };
    const data = {
      app: 'karteikarten', version: 1, exported: new Date().toISOString(),
      decks: S.decks, cards: S.cards, images: imgs, settings: S.settings, stats: S.stats,
    };
    const json = JSON.stringify(data);
    size = json.length;
    file = new File([json], `karteikarten-backup-${dayKey()}.json`, { type: 'application/json' });
  } catch (err) {
    alertBox({ title: 'Backup fehlgeschlagen', message: err?.message || String(err) });
    return;
  }
  const go = await alertBox({
    title: 'Backup bereit',
    message: `${plural(S.decks.length, 'Stapel', 'Stapel')} · ${plural(S.cards.length, 'Karte', 'Karten')} · ${fmtSize(size)}\n\nIm nächsten Schritt „In Dateien sichern“ wählen, z. B. in iCloud Drive.`,
    buttons: [{ text: 'Abbrechen', value: false }, { text: 'Sichern', value: true, style: 'bold' }],
  });
  if (!go) return;
  let ok = false;
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      ok = true;
    } catch (err) {
      if (err?.name === 'AbortError') return;
    }
  }
  if (!ok) {
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }
  S.settings.lastBackup = Date.now();
  await saveSettings();
  refresh();
  toast('Backup erstellt');
}

async function restoreFromFile(file) {
  const text = await file.text();
  let data = null;
  try { data = JSON.parse(text); } catch { data = null; }
  if (!data || data.app !== 'karteikarten' || !Array.isArray(data.decks) || !Array.isArray(data.cards)) {
    if (parseCards(text).cards.length) {
      openImport({ text });
      return;
    }
    alertBox({ title: 'Datei nicht erkannt', message: 'Das ist kein Karteikarten-Backup.' });
    return;
  }
  const mode = await actionSheet({
    title: 'Backup wiederherstellen',
    message: `${plural(data.decks.length, 'Stapel', 'Stapel')} · ${plural(data.cards.length, 'Karte', 'Karten')}${data.exported ? ` vom ${fmtDate(data.exported)}` : ''}`,
    actions: [
      { text: 'Mit vorhandenen zusammenführen', value: 'merge' },
      { text: 'Alles ersetzen', value: 'replace', destructive: true },
    ],
  });
  if (!mode) return;
  if (mode === 'replace' && !(await confirmBox('Alles ersetzen?', 'Alle aktuellen Stapel und Karten werden durch das Backup ersetzt.', 'Ersetzen'))) return;

  const replace = mode === 'replace';
  const ops = [];
  if (replace) ['decks', 'cards', 'images'].forEach((s) => ops.push({ store: s, op: 'clear' }));
  const deckIds = new Set(replace ? [] : S.decks.map((d) => d.id));
  for (const d of data.decks) {
    if (!d?.id || !d.name) continue;
    if (replace || !getDeck(d.id)) ops.push({ store: 'decks', op: 'put', value: { emoji: '📚', color: COLORS[0], order: 0, created: Date.now(), ...d } });
    deckIds.add(d.id);
  }
  let added = 0;
  for (const c of data.cards) {
    if (!c?.id || !deckIds.has(c.deckId) || typeof c.front !== 'string') continue;
    const cur = replace ? null : getCard(c.id);
    if (cur && (cur.updated || 0) >= (c.updated || 0)) continue;
    ops.push({ store: 'cards', op: 'put', value: { imageId: null, imageSide: 'back', back: '', created: Date.now(), ...c, srs: { ...newSrs(), ...(c.srs || {}) } } });
    added++;
  }
  for (const [id, im] of Object.entries(data.images || {})) {
    try { ops.push({ store: 'images', op: 'put', value: { id, type: im.type || 'image/jpeg', data: dataURLToBuffer(im.data) } }); } catch { /* defektes Bild überspringen */ }
  }
  if (data.stats?.days) {
    const days = replace ? { ...data.stats.days } : { ...S.stats.days };
    if (!replace) for (const [k, n] of Object.entries(data.stats.days)) days[k] = Math.max(days[k] || 0, n);
    ops.push({ store: 'meta', op: 'put', value: { key: 'stats', value: { days } } });
  }
  if (replace && data.settings) ops.push({ store: 'meta', op: 'put', value: { key: 'settings', value: { ...DEFAULT_SETTINGS, ...data.settings } } });
  try {
    await db.bulk(ops);
  } catch (err) {
    alertBox({ title: 'Wiederherstellen fehlgeschlagen', message: err?.message || String(err) });
    return;
  }
  for (const id of [...imgURLs.keys()]) dropImageURL(id);
  await load();
  refresh();
  toast(replace ? 'Backup wiederhergestellt' : `${plural(added, 'Karte', 'Karten')} übernommen`);
}

/* ================= Einstellungen ================= */
function SettingsView() {
  const v = makeView({ title: 'Einstellungen', backLabel: 'Karteikarten' });
  v.render = () => {
    const lb = S.settings.lastBackup;
    v.content.innerHTML = `
      <div class="section"><div class="section-header">Lernen</div><div class="group">
        <div class="row"><span class="row-main"><span class="row-title">Neue Karten pro Tag</span><span class="row-sub">je Stapel</span></span>
          <span class="row-value">${S.settings.newPerDay}</span>
          <div class="stepper"><button data-a="np-" aria-label="Weniger">−</button><button data-a="np+" aria-label="Mehr">+</button></div></div></div>
        <div class="section-footer">So viele neue Karten kommen pro Stapel und Tag dazu. Wiederholungen sind nicht begrenzt.</div></div>
      <div class="section"><div class="section-header">Karten importieren</div><div class="group has-tiles">
        <button class="row" data-a="import"><span class="tile" style="background:var(--teal)">${I.doc}</span>
          <span class="row-main"><span class="row-title">Aus Text importieren</span></span><span class="chev">${I.chev}</span></button>
        <button class="row" data-a="prompt"><span class="tile" style="background:var(--orange)">${I.sparkles}</span>
          <span class="row-main"><span class="row-title">Prompt für Claude kopieren</span></span></button></div></div>
      <div class="section"><div class="section-header">Backup</div><div class="group has-tiles">
        <button class="row" data-a="backup"><span class="tile" style="background:var(--green)">${I.share}</span>
          <span class="row-main"><span class="row-title">Backup erstellen</span><span class="row-sub">${lb ? `Zuletzt: ${fmtDate(lb)}` : 'Noch kein Backup erstellt'}</span></span><span class="chev">${I.chev}</span></button>
        <button class="row" data-a="restore"><span class="tile" style="background:var(--blue)">${I.download}</span>
          <span class="row-main"><span class="row-title">Backup wiederherstellen</span><span class="row-sub">Backup-Datei (.json) auswählen</span></span><span class="chev">${I.chev}</span></button></div>
        <div class="section-footer">Deine Karten liegen nur auf diesem Gerät. Sichere sie ab und zu, z. B. in iCloud Drive.</div></div>
      <div class="section"><div class="section-header">Hilfe</div><div class="group has-tiles">
        <button class="row" data-a="help"><span class="tile" style="background:var(--accent)">${I.book}</span>
          <span class="row-main"><span class="row-title">Anleitung</span></span><span class="chev">${I.chev}</span></button></div></div>
      <div class="section"><div class="group"><button class="row center danger" data-a="wipe"><span class="row-title">Alle Daten löschen</span></button></div>
        <div class="section-footer" data-info>Version ${APP_VERSION} · ${plural(S.decks.length, 'Stapel', 'Stapel')} · ${plural(S.cards.length, 'Karte', 'Karten')}</div></div>
      <input type="file" class="hidden" accept=".json,application/json,.txt,text/plain" data-restore>`;
    navigator.storage?.estimate?.().then((e) => {
      const info = $('[data-info]', v.content);
      if (info && e?.usage) info.textContent += ` · ${fmtSize(e.usage)} belegt`;
    }).catch(() => {});
  };
  v.el.addEventListener('change', (e) => {
    if (e.target.matches('[data-restore]')) {
      const f = e.target.files[0];
      e.target.value = '';
      if (f) restoreFromFile(f);
    }
  });
  v.el.addEventListener('click', async (e) => {
    const a = e.target.closest('[data-a]');
    if (!a) return;
    switch (a.dataset.a) {
      case 'np-':
      case 'np+': {
        const cur = S.settings.newPerDay;
        const d = a.dataset.a === 'np+' ? (cur >= 10 ? 5 : 1) : cur > 10 ? 5 : 1;
        S.settings.newPerDay = Math.max(0, Math.min(200, S.settings.newPerDay + (a.dataset.a === 'np+' ? d : -d)));
        await saveSettings();
        refresh();
        break;
      }
      case 'import': openImport(); break;
      case 'prompt': copyPrompt(); break;
      case 'backup': createBackup(); break;
      case 'restore': $('[data-restore]', v.content).click(); break;
      case 'help': pushView(HelpView()); break;
      case 'wipe': {
        if (!(await confirmBox('Alle Daten löschen?', 'Alle Stapel, Karten, Bilder und Lernfortschritte werden von diesem Gerät gelöscht. Erstelle vorher ein Backup, falls du sie behalten willst.', 'Alles löschen'))) return;
        await db.bulk(db.STORES.map((s) => ({ store: s, op: 'clear' })));
        for (const id of [...imgURLs.keys()]) dropImageURL(id);
        S.decks = [];
        S.cards = [];
        await load();
        popToRoot();
        refresh();
        toast('Alle Daten gelöscht');
        break;
      }
    }
  });
  return v;
}

function HelpView() {
  const v = makeView({ title: 'Anleitung', backLabel: 'Zurück' });
  v.render = () => {
    if (v.content.childElementCount) return;
    v.content.innerHTML = `<div class="prose">
      <h3>Lernen</h3>
      <p>Tippe auf eine Karte, um sie umzudrehen. Danach bewertest du, wie gut du sie wusstest:</p>
      <div class="rating-legend">
        <span class="rate r1">Nochmal</span><span>Nicht gewusst – kommt gleich noch einmal.</span>
        <span class="rate r2">Schwer</span><span>Mit Mühe gewusst – kommt bald wieder.</span>
        <span class="rate r3">Gut</span><span>Gewusst – der Abstand wächst.</span>
        <span class="rate r4">Einfach</span><span>Sofort gewusst – kommt erst viel später.</span>
      </div>
      <p>Die App plant jede Karte nach dem Prinzip der verteilten Wiederholung (Spaced Repetition): Schwierige Karten kommen öfter, leichte immer seltener. Die Zeit auf den Knöpfen zeigt, wann die Karte wiederkommt.</p>
      <p><b>Frei üben</b> geht alle Karten eines Stapels durch, ohne den Lernplan zu verändern.</p>
      <h3>Karten mit Claude erstellen</h3>
      <ol><li>Tippe auf „Prompt für Claude kopieren“.</li>
      <li>Füge ihn in Claude ein und ersetze <span class="code">[THEMA]</span>.</li>
      <li>Kopiere Claudes Antwort (Kopieren-Symbol am Codeblock).</li>
      <li>Öffne „Aus Text importieren“ und tippe auf „Einfügen“.</li></ol>
      <p>Der Prompt:</p>
      <div class="code-block">${esc(CLAUDE_PROMPT)}</div>
      <h3>Backup</h3>
      <p>Alle Daten liegen nur auf diesem Gerät, nichts wird hochgeladen. Unter Einstellungen → „Backup erstellen“ sicherst du alles als Datei, z. B. in iCloud Drive. Mit „Backup wiederherstellen“ holst du sie zurück, auch auf einem neuen iPhone.</p>
      <p>Wichtig: Nutze die App immer über das Symbol auf dem Home-Bildschirm. Safari und die installierte App haben getrennte Speicher.</p>
    </div>`;
  };
  return v;
}

/* ================= Service Worker ================= */
function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker
    .register('sw.js')
    .then((reg) => {
      const notify = (w) => toast('Neue Version verfügbar', { text: 'Aktualisieren', fn: () => w.postMessage('skipWaiting') });
      if (reg.waiting && hadController) notify(reg.waiting);
      reg.addEventListener('updatefound', () => {
        const w = reg.installing;
        w?.addEventListener('statechange', () => {
          if (w.state === 'installed' && navigator.serviceWorker.controller) notify(w);
        });
      });
      document.addEventListener('visibilitychange', () => { if (!document.hidden) reg.update().catch(() => {}); });
    })
    .catch(() => {});
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloading) return;
    reloading = true;
    location.reload();
  });
}

/* ================= Start ================= */
async function boot() {
  document.addEventListener('gesturestart', (e) => e.preventDefault());
  try {
    await load();
  } catch (err) {
    app.innerHTML = `<div class="fatal"><h2>Daten konnten nicht geladen werden</h2><p>${esc(err?.message || err)}</p>
      <p>Tipp: In Safari darf das „Privat“-Surfen nicht aktiv sein.</p></div>`;
    return;
  }
  pushView(HomeView(), false);
  navigator.storage?.persist?.().catch(() => {});
  registerSW();
  document.addEventListener('visibilitychange', () => { if (!document.hidden && !learnOpen) refresh(); });
  setInterval(() => { if (!document.hidden && !learnOpen) refresh(); }, 60_000);
}

boot();
