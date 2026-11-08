import * as db from './db.js';
import { schedule, newSrs, previewLabels, dayKey, relDue, fmtDays } from './srs.js';
import { parseCards, CLAUDE_PROMPT } from './parser.js';
import { RATINGS, knowledge, isMastered, deckKnowledge, scoreColor, distribution, weakest, HISTORY_MAX } from './score.js';

const APP_VERSION = '1.2.0';
const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

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
  chart: svg('0 0 24 24', '<path d="M5 20v-6M12 20V5M19 20v-10"/>', 2.8),
  play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5v15a1 1 0 0 0 1.5.86l12.5-7.5a1 1 0 0 0 0-1.72L8.5 3.64A1 1 0 0 0 7 4.5z" fill="currentColor"/></svg>',
};

/* ================= Daten ================= */
const COLORS = ['#5856D6', '#007AFF', '#34C759', '#FF9500', '#FF3B30', '#AF52DE', '#FF2D55', '#30B0C7', '#00C7BE', '#FFCC00', '#A2845E', '#636366'];
const EMOJIS = ['📚', '🇬🇧', '🤝', '📊', '💼', '💡', '🧠', '🗣️', '📈', '💶', '🏢', '🛠️', '📝', '🎯', '🌍', '⚖️', '🧾', '📣', '💻', '🎓', '✈️', '⭐', '🔬', '🧩'];
const DEFAULT_SETTINGS = { newPerDay: 20, lastBackup: null };

/* Lernpakete: fertige Kartensätze mit festen IDs (erneutes Laden aktualisiert statt zu duplizieren). */
const PACKS = {
  sct: {
    id: 'sct',
    title: 'SCT-Lernpaket',
    label: 'SCT-Lernpaket laden (150 Karten)',
    blurb: '7 Stapel · Business, Sales, Finanzen, Glas & CERAN®',
    url: 'packs/sct.json',
  },
};
const PACK_DECK_STYLE = {
  'Finanzen & Controlling': { emoji: '💶', color: '#34C759' },
  'Pricing & kommerzielle Analyse': { emoji: '🏷️', color: '#FF9500' },
  'Sales & Verhandlung': { emoji: '🤝', color: '#007AFF' },
  'Markt, Kunden & Strategie': { emoji: '🧭', color: '#AF52DE' },
  'Business English, Planung & Operations': { emoji: '🗣️', color: '#30B0C7' },
  'Glas, Glaskeramik, Rohstoffe & Produktion': { emoji: '🧪', color: '#00C7BE' },
  'CERAN®-Produkte & Produktvergleich': { emoji: '🍳', color: '#FF3B30' },
};
const slug = (s) => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const packDeckId = (packId, category) => `pack-${packId}-${slug(category)}`;

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

const S = { decks: [], cards: [], settings: { ...DEFAULT_SETTINGS }, stats: { days: {} }, packs: {} };

async function load() {
  const [decks, cards, settings, stats, seeded, packs] = await Promise.all([
    db.getAll('decks'),
    db.getAll('cards'),
    db.getMeta('settings', {}),
    db.getMeta('stats', { days: {} }),
    db.getMeta('seeded', false),
    db.getMeta('packs', {}),
  ]);
  S.packs = packs || {};
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

/* ================= Kartendarstellung ================= */
function prioBadge(c, long = false) {
  const p = Number(c.priority);
  if (!p) return '';
  return `<span class="prio p${Math.min(p, 3)}" title="Priorität ${p}${p === 1 ? ' – zuerst lernen' : ''}">${long ? `Prio ${p}` : `P${p}`}</span>`;
}

const exampleIcon = (kind = '') => (/englisch/i.test(kind) ? '🗣️' : /fiktiv|praxis/i.test(kind) ? '📌' : /produkt|ceran/i.test(kind) ? '🍳' : '🔎');

/** Rückseite: strukturierte Lernpaket-Karten schön formatiert, sonst der Freitext. */
function backBodyHTML(c) {
  const f = c.fields;
  if (!f) {
    if (!c.back) return '';
    const long = c.back.length > 140 || c.back.includes('\n');
    return `<div class="fc-answer ${long ? 'long' : ''}">${rich(c.back)}</div>`;
  }
  return `<div class="fs">
    ${f.definition ? `<p class="fs-def">${rich(f.definition)}</p>` : ''}
    ${f.formula ? `<div class="fs-formula"><span class="fs-label">🧮 Formel</span><div class="fs-formula-body">${rich(f.formula)}</div></div>` : ''}
    ${f.example ? `<div class="fs-example"><span class="fs-label">${exampleIcon(f.example_kind)} ${esc(f.example_kind || 'Beispiel')}</span><p>${rich(f.example)}</p></div>` : ''}
    ${f.note ? `<div class="fs-note"><span class="fs-note-title">💡 Merke</span><p>${rich(f.note)}</p></div>` : ''}
  </div>`;
}

const cardSnippet = (c) => plain(c.fields?.definition || c.back);

function packRowHTML(id = 'sct') {
  const p = PACKS[id];
  const st = S.packs[id];
  return `<button class="row" data-pack="${id}"><span class="tile pack-tile">📦</span>
    <span class="row-main"><span class="row-title">${esc(p.label)}</span>
    <span class="row-sub">${st ? `✅ Geladen am ${fmtDate(st.loaded)} · erneut laden aktualisiert` : esc(p.blurb)}</span></span>
    <span class="chev">${I.chev}</span></button>`;
}

/* ================= Wissensstand-Bausteine ================= */
function scoreBadge(c) {
  const k = knowledge(c.history);
  if (k === null) return '<span class="score-badge new">Neu</span>';
  return `<span class="score-badge" style="--sc:${scoreColor(k)}">${isMastered(c.history) ? '⭐ ' : ''}${k} %</span>`;
}

function mood(k, hasHistory) {
  if (!hasHistory) return 'Los geht’s! 🚀';
  if (k < 30) return 'Guter Anfang 🌱';
  if (k < 60) return 'Du wirst besser 💪';
  if (k < 85) return 'Stark unterwegs 🚀';
  return 'Fast alles sitzt 🏆';
}

/** Fortschrittskreis. animate=false zeigt den Endwert sofort (z. B. beim stillen Aktualisieren). */
function ringHTML(p, size = 108, stroke = 12, animate = true) {
  const r = (size - stroke) / 2;
  const C = 2 * Math.PI * r;
  const off = C * (1 - p / 100);
  const anim = animate && !reduceMotion;
  const c = size / 2;
  return `<div class="ring" style="width:${size}px;height:${size}px;--ring:${scoreColor(p)}" role="img" aria-label="Wissensstand ${p} Prozent">
    <svg viewBox="0 0 ${size} ${size}" aria-hidden="true"><circle class="ring-track" cx="${c}" cy="${c}" r="${r}" stroke-width="${stroke}"/>
    <circle class="ring-val" cx="${c}" cy="${c}" r="${r}" stroke-width="${stroke}" stroke-dasharray="${C.toFixed(2)}"
      stroke-dashoffset="${(anim ? C : off).toFixed(2)}" ${anim ? `data-off="${off.toFixed(2)}"` : ''} transform="rotate(-90 ${c} ${c})"/></svg>
    <div class="ring-label" style="font-size:${Math.round(size * 0.27)}px"><b ${anim ? `data-count="${p}"` : ''}>${anim ? 0 : p}</b><span>%</span></div></div>`;
}

function animateIn(root) {
  root.querySelectorAll('.ring-val[data-off]').forEach((c) => {
    const off = c.dataset.off;
    delete c.dataset.off;
    raf2(() => { c.style.strokeDashoffset = off; });
  });
  root.querySelectorAll('[data-count]').forEach((el) => {
    const to = +el.dataset.count;
    delete el.dataset.count;
    const t0 = performance.now();
    const step = (now) => {
      const k = Math.min(1, (now - t0) / 1000);
      el.textContent = Math.round(to * (1 - Math.pow(1 - k, 3)));
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
  root.querySelectorAll('.mini-bar span[data-w]').forEach((s) => {
    const w = s.dataset.w;
    delete s.dataset.w;
    raf2(() => { s.style.width = `${w}%`; });
  });
}

function confetti(n = 80) {
  if (reduceMotion) return;
  const colors = ['#FF4B4B', '#FFC800', '#1CB0F6', '#58CC02', '#CE82FF', '#FF9600'];
  const wrap = h('<div class="confetti" aria-hidden="true"></div>');
  for (let i = 0; i < n; i++) {
    const p = document.createElement('i');
    p.style.left = `${Math.random() * 100}%`;
    p.style.background = colors[i % colors.length];
    p.style.setProperty('--dx', `${Math.round(Math.random() * 200 - 100)}px`);
    p.style.setProperty('--rot', `${Math.round(Math.random() * 900 - 450)}deg`);
    p.style.animationDelay = `${(Math.random() * 0.35).toFixed(2)}s`;
    p.style.animationDuration = `${(1.8 + Math.random() * 1.4).toFixed(2)}s`;
    if (i % 3 === 0) p.style.borderRadius = '50%';
    wrap.appendChild(p);
  }
  document.body.appendChild(wrap);
  setTimeout(() => wrap.remove(), 4000);
}

/** Letzte 7 Lerntage mit Anzahl Antworten aus den Verläufen. */
function last7Days(cards) {
  const keys = [];
  const [y, m, d] = dayKey().split('-').map(Number);
  for (let i = 6; i >= 0; i--) {
    const dt = new Date(y, m - 1, d - i, 12);
    keys.push({
      key: `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`,
      short: i === 0 ? 'Heute' : dt.toLocaleDateString('de-DE', { weekday: 'short' }).replace('.', ''),
      long: dt.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' }),
      n: 0,
    });
  }
  const idx = new Map(keys.map((k, i) => [k.key, i]));
  for (const c of cards) for (const e of c.history || []) {
    const i = idx.get(dayKey(e.t));
    if (i !== undefined) keys[i].n++;
  }
  return keys;
}

const fmtDateTime = (ts) => {
  const d = new Date(ts);
  const today = dayKey() === dayKey(ts);
  const time = d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  return today ? `heute, ${time}` : `${d.toLocaleDateString('de-DE', { day: 'numeric', month: 'short' })}, ${time}`;
};

/** Neue Karten: Priorität 1 vor 2 vor 3; eigene Karten ohne Priorität zählen wie Priorität 1. */
const prioOf = (c) => (Number(c.priority) > 0 ? Number(c.priority) : 1);
const byPriority = (a, b) => prioOf(a) - prioOf(b) || a.created - b.created;

function buildQueue(deckIds) {
  const now = Date.now();
  const due = [];
  const fresh = [];
  for (const id of deckIds) {
    const cs = deckCards(id);
    const cnt = deckCounts(id, now);
    due.push(...cs.filter((c) => c.srs.state !== 'new' && c.srs.due <= now));
    fresh.push(...cs.filter((c) => c.srs.state === 'new').sort(byPriority).slice(0, cnt.newAvail));
  }
  fresh.sort(byPriority); // Priorität 1 zuerst, auch über mehrere Stapel hinweg
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

function openSheet({ title, left = 'Abbrechen', right = null, onRight, onClose, compact = false }) {
  const backdrop = h('<div class="sheet-backdrop"></div>');
  const el = h(`<div class="sheet ${compact ? 'compact' : ''}" role="dialog" aria-label="${esc(title)}">
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
  v.right.innerHTML = `<button class="nav-btn icon" data-a="stats" aria-label="Statistik">${I.chart}</button>
    <button class="nav-btn icon" data-a="add-deck" aria-label="Neuer Stapel">${I.plus}</button>`;
  const shown = new Map(); // zuletzt angezeigte Werte, damit nur Änderungen animiert werden

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
        const k = deckKnowledge(deckCards(d.id));
        const animate = shown.get(d.id) !== k;
        shown.set(d.id, k);
        const sub = c.total ? `${plural(c.total, 'Karte', 'Karten')} · ${k} % gewusst${c.due ? '' : ' ✓'}` : 'Noch leer';
        return `<button class="row" data-a="open-deck" data-id="${d.id}">
          <span class="tile big" style="background:${esc(d.color)}">${esc(d.emoji)}</span>
          <span class="row-main"><span class="row-title">${esc(d.name)}</span><span class="row-sub">${sub}</span>
            ${c.total ? `<span class="mini-bar"><span style="width:${animate && !reduceMotion ? 0 : k}%;background:${scoreColor(k)}" ${animate && !reduceMotion ? `data-w="${k}"` : ''}></span></span>` : ''}</span>
          ${c.due ? `<span class="badge" style="background:${esc(d.color)}">${c.due}</span>` : ''}
          <span class="chev">${I.chev}</span></button>`;
      })
      .join('');
    const overall = deckKnowledge(S.cards);
    const mastered = S.cards.filter((c) => isMastered(c.history)).length;
    const answers = S.cards.reduce((n, c) => n + (c.history?.length || 0), 0);
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
          <div class="hero-chips"><div class="chip ${st ? 'fire' : ''}">🔥 ${st ? plural(st, 'Tag', 'Tage') : 'Serie starten'}</div><div class="chip">✅ ${today} heute</div></div>
        </div>
        ${due ? `<button class="btn white" data-a="learn-all">${I.play}Jetzt lernen</button>`
          : S.cards.length ? `<button class="btn white" data-a="cram-all">🔁 Frei üben</button>` : ''}
      </div>
      <div class="tiles3">
        <button class="stat-tile" data-a="stats"><span class="st-emoji">🧠</span><span class="st-num">${overall} %</span><span class="st-label">Wissensstand</span></button>
        <button class="stat-tile" data-a="stats"><span class="st-emoji">⭐</span><span class="st-num">${mastered}</span><span class="st-label">gemeistert</span></button>
        <button class="stat-tile" data-a="stats"><span class="st-emoji">🎯</span><span class="st-num">${answers}</span><span class="st-label">Antworten</span></button>
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
          ${packRowHTML('sct')}
        </div>
        <div class="section-footer">Lass dir von Claude Karten erstellen, kopiere die Antwort und füge sie hier ein.</div></div>`;
    animateIn(v.content);
  };

  v.el.addEventListener('click', (e) => {
    const a = e.target.closest('[data-a]');
    if (!a) return;
    const all = () => S.decks.map((d) => d.id);
    switch (a.dataset.a) {
      case 'settings': pushView(SettingsView()); break;
      case 'stats': pushView(StatsView()); break;
      case 'add-deck': openDeckEditor(); break;
      case 'open-deck': pushView(DeckView(a.dataset.id)); break;
      case 'learn-all': startLearn({ deckIds: all() }); break;
      case 'cram-all': startLearn({ deckIds: all(), practice: true }); break;
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
    <div class="list-tools">
      <div class="search">${I.search}<input type="search" placeholder="Karten durchsuchen" enterkeyhint="search" autocomplete="off"></div>
      <div class="seg sort-seg" role="tablist" aria-label="Sortierung">
        <button data-sort="new" role="tab">Neueste</button><button data-sort="weak" role="tab">Schwächste zuerst</button><button data-sort="az" role="tab">A–Z</button></div>
    </div>
    <div class="deck-list"></div>`;
  const headEl = $('.deck-head', v.content);
  const topEl = $('.deck-top', v.content);
  const toolsEl = $('.list-tools', v.content);
  const input = $('input', toolsEl);
  const listEl = $('.deck-list', v.content);
  let lastK = null;
  input.addEventListener('input', () => renderList());
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') input.blur(); });

  const sorters = {
    new: (a, b) => b.created - a.created,
    weak: (a, b) => (knowledge(a.history) ?? 101) - (knowledge(b.history) ?? 101) || b.created - a.created,
    az: (a, b) => plain(a.front).localeCompare(plain(b.front), 'de', { sensitivity: 'base' }),
  };

  function renderList() {
    const sort = sorters[S.settings.cardSort] ? S.settings.cardSort : 'new';
    toolsEl.querySelectorAll('[data-sort]').forEach((b) => {
      b.classList.toggle('on', b.dataset.sort === sort);
      b.setAttribute('aria-selected', b.dataset.sort === sort);
    });
    const q = norm(input.value);
    const all = deckCards(deckId).sort(sorters[sort]);
    if (!all.length) {
      toolsEl.classList.add('hidden');
      listEl.innerHTML = `<div class="empty"><div class="empty-icon">🗂️</div><h3>Noch keine Karten</h3>
        <p>Lege deine erste Karte an oder importiere mehrere auf einmal aus Text.</p>
        <button class="btn primary" data-a="add-card">${I.plus}Karte anlegen</button>
        <button class="btn secondary" data-a="import">Aus Text importieren</button></div>`;
      return;
    }
    toolsEl.classList.remove('hidden');
    const list = q ? all.filter((c) => norm(c.front).includes(q) || norm(c.back).includes(q)) : all;
    if (!list.length) {
      listEl.innerHTML = '<div class="empty"><p>Keine Treffer. 🔍</p></div>';
      return;
    }
    const shown = list.slice(0, 400);
    listEl.innerHTML = `<div class="section"><div class="section-header">${plural(list.length, 'Karte', 'Karten')}</div>
      <div class="group">${shown
        .map((c) => `<button class="row" data-a="card-detail" data-id="${c.id}">
            <span class="row-main"><span class="row-title">${esc(plain(c.front))}</span><span class="row-sub">${esc(cardSnippet(c))}</span></span>
            ${c.imageId ? `<span class="photo-ind">${I.photo}</span>` : ''}
            ${prioBadge(c)}${scoreBadge(c)}</button>`)
        .join('')}</div>
      ${list.length > shown.length ? `<div class="section-footer">… und ${list.length - shown.length} weitere. Nutze die Suche.</div>` : ''}</div>`;
  }

  v.render = () => {
    const d = getDeck(deckId);
    if (!d) return;
    v.setTitle(d.name);
    const c = deckCounts(deckId);
    const cards = deckCards(deckId);
    const k = deckKnowledge(cards);
    const animate = lastK !== k;
    lastK = k;
    const mastered = cards.filter((x) => isMastered(x.history)).length;
    const learned = cards.filter((x) => x.history?.length).length;
    const weakN = weakest(cards).length;
    headEl.innerHTML = `<span class="tile big" style="background:${esc(d.color)}">${esc(d.emoji)}</span><h1 class="large-title">${esc(d.name)}</h1>`;
    topEl.innerHTML = c.total
      ? `<button class="deck-card" data-a="stats" aria-label="Statistik öffnen">
          ${ringHTML(k, 112, 13, animate)}
          <span class="deck-card-info">
            <span class="dc-label">Wissensstand</span>
            <span class="dc-mood">${mood(k, learned > 0)}</span>
            <span class="dc-chips"><span class="mini-chip">⭐ ${mastered} gemeistert</span><span class="mini-chip">📚 ${learned}/${c.total} gelernt</span></span>
          </span><span class="chev">${I.chev}</span></button>
        <div class="stats3">
          <div class="stat c-new"><div class="stat-num">${c.newAvail}</div><div class="stat-label">Neu</div></div>
          <div class="stat c-learn"><div class="stat-num">${c.learn}</div><div class="stat-label">Lernen</div></div>
          <div class="stat c-due"><div class="stat-num">${c.review}</div><div class="stat-label">Wiederholen</div></div></div>
        <div class="deck-actions">${c.due
          ? `<button class="btn primary" data-a="learn">${I.play}Lernen · ${c.due}</button>`
          : `<div class="all-done">🎉 Für heute alles erledigt!${c.nextDue < Infinity ? `<br><span>Nächste Karte ${relDue(c.nextDue).replace(/\.$/, '')}.</span>` : ''}</div>`}
          <div class="btn-row">
            ${weakN ? `<button class="btn secondary sm" data-a="weak">🎯 Schwächste üben</button>` : ''}
            <button class="btn secondary sm" data-a="cram">🔁 Frei üben</button></div></div>`
      : '';
    renderList();
    animateIn(topEl);
  };

  v.el.addEventListener('click', async (e) => {
    const sortBtn = e.target.closest('[data-sort]');
    if (sortBtn) {
      S.settings.cardSort = sortBtn.dataset.sort;
      saveSettings();
      renderList();
      return;
    }
    const a = e.target.closest('[data-a]');
    if (!a) return;
    const d = getDeck(deckId);
    if (!d) return;
    switch (a.dataset.a) {
      case 'learn': startLearn({ deckIds: [deckId] }); break;
      case 'cram': startLearn({ deckIds: [deckId], practice: true }); break;
      case 'weak': {
        const ids = weakest(deckCards(deckId)).map((w) => w.card.id);
        startLearn({ cardIds: ids, practice: true });
        break;
      }
      case 'stats': pushView(StatsView(deckId)); break;
      case 'add-card': openCardEditor({ deckId }); break;
      case 'import': openImport({ deckId }); break;
      case 'card-detail': openCardDetail(a.dataset.id); break;
      case 'more': {
        const has = deckCards(deckId).length > 0;
        const choice = await actionSheet({
          title: `${d.emoji} ${d.name}`,
          actions: [
            { text: 'Stapel bearbeiten', value: 'edit' },
            ...(has ? [{ text: 'Statistik', value: 'stats' }, { text: 'Frei üben (alle Karten)', value: 'cram' }, { text: 'Als Text kopieren', value: 'copy' }] : []),
            { text: 'Karten aus Text importieren', value: 'import' },
            ...(has ? [{ text: 'Lernfortschritt zurücksetzen', value: 'reset' }] : []),
            { text: 'Stapel löschen', value: 'delete', destructive: true },
          ],
        });
        if (choice === 'edit') openDeckEditor(d);
        else if (choice === 'stats') pushView(StatsView(deckId));
        else if (choice === 'cram') startLearn({ deckIds: [deckId], practice: true });
        else if (choice === 'import') openImport({ deckId });
        else if (choice === 'copy') {
          const lines = deckCards(deckId)
            .sort((a, b) => a.created - b.created)
            .map((c) => `${c.front.replace(/\n/g, ' ')} | ${c.back.replace(/\n/g, '\\n')}`);
          const ok = await copyText(`# ${d.name}\n${lines.join('\n')}`);
          toast(ok ? `${plural(lines.length, 'Karte', 'Karten')} kopiert` : 'Kopieren nicht möglich');
        } else if (choice === 'reset') {
          if (await confirmBox('Fortschritt zurücksetzen?', `Alle Karten in „${d.name}“ gelten danach wieder als neu, Lernplan und Bewertungsverlauf werden gelöscht.`, 'Zurücksetzen')) {
            const cs = deckCards(deckId).map((c) => ({ ...c, srs: newSrs(), history: [], updated: Date.now() }));
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
      <div class="section-footer">${card?.fields
        ? `📦 Karte aus dem ${esc(PACKS[card.pack]?.title || 'Lernpaket')} (${esc(card.id)}). Die Rückseite wird formatiert angezeigt. Änderst du sie hier, ersetzt dein Text die Formatierung. Erneutes Laden des Pakets stellt sie wieder her.`
        : 'Tipp: **Wort** wird auf der Karte fett angezeigt.'}</div></div>
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
        if (!(await confirmBox('Fortschritt zurücksetzen?', 'Die Karte gilt danach wieder als neu, ihr Bewertungsverlauf wird gelöscht.', 'Zurücksetzen'))) return;
        const c = getCard(card.id);
        if (c) await saveCard({ ...c, srs: newSrs(), history: [] });
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
    if (c.fields && b !== String(base.back || '').trim()) c.fields = null;
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

/**
 * deckIds: Stapel lernen (Lernplan) · practice: frei üben ohne Lernplan-Änderung
 * cardIds: genau diese Karten üben (z. B. „Diese Begriffe musst du üben“)
 * Jede Bewertung landet im Verlauf der Karte und zählt für den Wissensstand.
 */
function startLearn({ deckIds = [], cardIds = null, practice = false }) {
  let queue;
  if (cardIds) queue = cardIds.filter((id) => getCard(id));
  else if (practice) queue = shuffle(S.cards.filter((c) => deckIds.includes(c.deckId))).map((c) => c.id);
  else queue = buildQueue(deckIds);
  if (!queue.length) {
    toast(practice ? 'Keine Karten vorhanden' : 'Gerade ist nichts fällig 🎉');
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
  let combo = 0;
  let bestCombo = 0;
  const tally = { 1: 0, 2: 0, 3: 0, 4: 0 };
  const seen = new Set();
  const startScores = new Map();
  const retried = new Set();
  const history = [];

  const imgTag = (c, small) => (c.imageId ? `<img class="fc-img ${small ? 'small' : ''}" data-img="${c.imageId}" alt="">` : '');
  const frontHTML = (c) => {
    const k = knowledge(c.history);
    const tag = k === null
      ? '<span class="fc-tag new">🆕 Neu</span>'
      : isMastered(c.history)
        ? `<span class="fc-tag star">⭐ ${k} %</span>`
        : `<span class="fc-tag" style="--sc:${scoreColor(k)}">${k} %</span>`;
    return `${tag}${c.priority ? `<span class="fc-prio">${prioBadge(c, true)}</span>` : ''}<div class="fc-inner">${c.imageSide === 'front' ? imgTag(c) : ''}
      <div class="fc-term ${c.front.length > 60 ? 'long' : ''}">${rich(c.front)}</div></div>
      <div class="fc-hint">👆 Tippen zum Umdrehen</div>`;
  };
  const backHTML = (c) => `<div class="fc-inner"><div class="fc-term small">${rich(c.front)}</div>
      ${c.imageSide === 'front' ? imgTag(c, true) : ''}<div class="fc-divider"></div>
      ${c.imageSide !== 'front' ? imgTag(c) : ''}
      ${backBodyHTML(c)}</div>`;

  const sessionSize = new Set(queue).size;
  function progress() {
    const rem = queue.length + (current ? 1 : 0);
    // Erledigte Karten zählen voll, schon einmal beantwortete halb – so wächst der Balken mit jeder Antwort.
    const part = rem ? (done + 0.5 * Math.max(0, seen.size - done)) / Math.max(1, sessionSize) : 1;
    bar.style.width = `${Math.max(4, Math.min(100, part * 100))}%`;
    countEl.textContent = rem || '';
  }

  function renderBottom() {
    if (!current) {
      bottom.innerHTML = '<button class="btn primary show" data-a="close">Weiter</button>';
    } else if (!flipped) {
      bottom.innerHTML = '<button class="btn primary show" data-a="flip">Antwort zeigen</button>';
    } else {
      const l = practice ? ['gleich nochmal', 'später nochmal', 'weiter', 'weiter'] : previewLabels(current.srs);
      bottom.innerHTML = `<div class="rate-grid">${[1, 2, 3, 4]
        .map((r) => `<button class="rate r${r}" data-r="${r}"><span>${RATINGS[r].name}</span><small>${l[r - 1]}</small></button>`)
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

  function cheer(text, cls = '') {
    el.querySelectorAll('.combo').forEach((x) => x.remove());
    const c = h(`<div class="combo ${cls}" role="status">${esc(text)}</div>`);
    el.appendChild(c);
    setTimeout(() => c.remove(), 1700);
  }

  async function rate(r) {
    if (!flipped || busy || !current) return;
    busy = true;
    const card = current;
    history.push({ card: JSON.parse(JSON.stringify(card)), queue: queue.slice(), done, combo, tally: { ...tally }, seen: [...seen], retried: [...retried] });
    undoBtn.disabled = false;
    if (!startScores.has(card.id)) startScores.set(card.id, knowledge(card.history) ?? 0);
    seen.add(card.id);
    tally[r]++;
    const wasMastered = isMastered(card.history);
    const hist = [...(card.history || []), { t: Date.now(), r }].slice(-HISTORY_MAX);
    const updated = practice ? { ...card, history: hist } : { ...card, history: hist, srs: schedule(card.srs, r) };
    try {
      await saveCard(updated);
      bumpStats(1);
    } catch (err) {
      history.pop();
      busy = false;
      alertBox({ title: 'Speichern fehlgeschlagen', message: err?.message || String(err) });
      return;
    }
    if (practice) {
      if (r === 1) queue.splice(Math.min(3, queue.length), 0, card.id);
      else if (r === 2 && !retried.has(card.id)) {
        retried.add(card.id);
        queue.push(card.id);
      } else done++;
    } else if (updated.srs.state !== 'review') {
      queue.splice(Math.min(r === 1 ? 3 : r === 2 ? 5 : 8, queue.length), 0, card.id);
    } else done++;

    // Erfolgsmomente
    combo = r === 1 ? 0 : combo + 1;
    bestCombo = Math.max(bestCombo, combo);
    if (!wasMastered && isMastered(hist)) cheer('⭐ Gemeistert!', 'star');
    else if (combo >= 3 && combo % 5 === 0) cheer(`🔥 ${combo} in Folge!`);
    else if (r === 4 && Math.random() < 0.35) cheer(['😎 Easy!', '💪 Stark!', '🚀 Weiter so!'][Math.floor(Math.random() * 3)], 'small');

    const cardEl = $('.flashcard', stage);
    if (cardEl && !reduceMotion) {
      if (r === 1) {
        await cardEl.animate(
          [{ transform: 'translateX(0)' }, { transform: 'translateX(-12px)' }, { transform: 'translateX(10px)' }, { transform: 'translateX(-6px)' }, { transform: 'translateX(0)' }],
          { duration: 280, easing: 'ease-out' },
        ).finished.catch(() => {});
      }
      await cardEl
        .animate([{ transform: 'none', opacity: 1 }, { transform: r === 1 ? 'translateY(16px) scale(.97)' : 'translateX(-30px) rotate(-2deg) scale(.98)', opacity: 0 }], { duration: 160, easing: 'ease-in', fill: 'forwards' })
        .finished.catch(() => {});
    }
    next();
    busy = false;
  }

  async function undo() {
    if (busy || !history.length) return;
    busy = true;
    const snap = history.pop();
    await saveCard(snap.card);
    bumpStats(-1);
    queue = snap.queue;
    done = snap.done;
    combo = snap.combo;
    Object.assign(tally, snap.tally);
    seen.clear();
    snap.seen.forEach((id) => seen.add(id));
    retried.clear();
    snap.retried.forEach((id) => retried.add(id));
    if (!seen.has(snap.card.id)) startScores.delete(snap.card.id);
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
    const answers = tally[1] + tally[2] + tally[3] + tally[4];
    const pct = answers ? Math.round((100 * (tally[2] + tally[3] + tally[4])) / answers) : 0;
    let delta = 0;
    if (startScores.size) {
      let diff = 0;
      for (const [id, before] of startScores) diff += (knowledge(getCard(id)?.history) ?? before) - before;
      delta = Math.round(diff / startScores.size);
    }
    const headline = pct >= 90 ? 'Perfekt! 🏆' : pct >= 70 ? 'Super gemacht!' : pct >= 40 ? 'Gut dabei! 💪' : 'Dranbleiben! 🌱';
    const st = streak();
    stage.innerHTML = `<div class="done">
      <div class="done-emoji">🎉</div>
      <h2>${headline}</h2>
      <p>Du hast ${plural(n, 'Karte', 'Karten')} ${practice ? 'geübt' : 'gelernt'}${bestCombo >= 5 ? ` · beste Serie: ${bestCombo} 🔥` : ''}.</p>
      <div class="done-hero">
        <div class="dh"><b>${pct} %</b><span>gewusst</span></div>
        <div class="dh"><b class="${delta > 0 ? 'up' : ''}">${delta > 0 ? '+' : ''}${delta} %</b><span>Wissensstand</span></div>
        <div class="dh"><b>🔥 ${st}</b><span>${st === 1 ? 'Tag' : 'Tage'} Serie</span></div>
      </div>
      <div class="done-stats">${[1, 2, 3, 4].map((r) => `<div class="ds r${r}"><i></i><b>${tally[r]}</b><span>${RATINGS[r].name}</span></div>`).join('')}</div>
    </div>`;
    renderBottom();
    if (answers) confetti();
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
    } else if (/^[1-4]$/.test(e.key) && flipped) rate(+e.key);
    else if (e.key === 'Escape') close();
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
    <div class="section"><div class="section-header">Lernpaket</div><div class="group has-tiles">${packRowHTML('sct')}</div></div>
    <div class="section"><div class="section-header">Eigener Text</div><div class="group"><textarea class="field" data-f="text" placeholder="Hier den Text von Claude einfügen, z. B.:

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

/* ================= Lernpakete ================= */
async function loadPack(packId) {
  const pack = PACKS[packId];
  if (!pack) return;
  let data;
  try {
    const res = await fetch(pack.url, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    data = await res.json();
  } catch (err) {
    alertBox({ title: 'Lernpaket nicht verfügbar', message: `Das Paket konnte nicht geladen werden. Bist du online?\n(${err?.message || err})` });
    return;
  }
  const cards = (Array.isArray(data?.cards) ? data.cards : []).filter((c) => c && c.id && c.front && (c.back || c.definition));
  if (!cards.length) {
    alertBox({ title: 'Lernpaket leer', message: 'In der Paketdatei wurden keine Karten gefunden.' });
    return;
  }
  const categories = [...new Set(cards.map((c) => c.category || pack.title))];
  const existing = cards.filter((c) => getCard(String(c.id))).length;
  const fresh = cards.length - existing;
  const go = await alertBox({
    title: `📦 ${pack.title}`,
    message: `${plural(cards.length, 'Karte', 'Karten')} in ${plural(categories.length, 'Stapel', 'Stapeln')}.\n${[
      fresh ? `${fresh} neu` : '',
      existing ? `${existing} ${existing === 1 ? 'wird' : 'werden'} aktualisiert – dein Lernfortschritt bleibt erhalten` : '',
    ].filter(Boolean).join(' · ')}.`,
    buttons: [{ text: 'Abbrechen', value: false }, { text: fresh ? 'Laden' : 'Aktualisieren', value: true, style: 'bold' }],
  });
  if (!go) return;

  const now = Date.now();
  const ops = [];
  const newDecks = [];
  let order = Math.max(-1, ...S.decks.map((x) => x.order ?? 0));
  const deckFor = (cat) => {
    const id = packDeckId(packId, cat);
    const d = getDeck(id) || newDecks.find((x) => x.id === id) || findDeckByName(cat);
    if (d) return d.id;
    const style = PACK_DECK_STYLE[cat] || { emoji: '📚', color: COLORS[(S.decks.length + newDecks.length) % COLORS.length] };
    const nd = { id, name: cat, emoji: style.emoji, color: style.color, created: now, order: ++order, pack: packId };
    newDecks.push(nd);
    ops.push({ store: 'decks', op: 'put', value: nd });
    return id;
  };
  const touched = [];
  cards.forEach((c, i) => {
    const id = String(c.id);
    const ex = getCard(id);
    const content = {
      front: String(c.front),
      back: String(c.back || c.definition || ''),
      fields: {
        definition: c.definition || '',
        formula: c.formula || '',
        example: c.example || '',
        example_kind: c.example_kind || '',
        note: c.note || '',
      },
      priority: Number(c.priority) || null,
      sources: Array.isArray(c.source_ids) ? c.source_ids : [],
      pack: packId,
    };
    const deckId = ex && getDeck(ex.deckId) ? ex.deckId : deckFor(c.category || pack.title);
    const card = ex
      ? { ...ex, ...content, deckId, updated: now } // Lernplan & Verlauf bleiben erhalten
      : { id, deckId, imageId: null, imageSide: 'back', created: now + i, updated: now + i, srs: newSrs(), history: [], ...content };
    touched.push(card);
    ops.push({ store: 'cards', op: 'put', value: card });
  });
  const packs = { ...S.packs, [packId]: { loaded: now, count: cards.length, sources: Array.isArray(data.sources) ? data.sources : [] } };
  ops.push({ store: 'meta', op: 'put', value: { key: 'packs', value: packs } });
  try {
    await db.bulk(ops);
  } catch (err) {
    alertBox({ title: 'Laden fehlgeschlagen', message: err?.message || String(err) });
    return;
  }
  S.decks.push(...newDecks);
  sortDecks();
  touched.forEach(upsertLocal);
  S.packs = packs;
  overlay.querySelectorAll('.sheet.open .sh-left').forEach((b) => b.click()); // offenes Import-Sheet schließen
  refresh();
  if (fresh) {
    confetti();
    toast(`🎉 ${plural(fresh, 'Karte', 'Karten')} geladen${existing ? `, ${existing} aktualisiert` : ''}`);
  } else toast(`✅ ${plural(existing, 'Karte', 'Karten')} aktualisiert`);
}

document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-pack]');
  if (b) loadPack(b.dataset.pack);
});

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
      decks: S.decks, cards: S.cards, images: imgs, settings: S.settings, stats: S.stats, packs: S.packs,
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
  if (data.packs && typeof data.packs === 'object') {
    ops.push({ store: 'meta', op: 'put', value: { key: 'packs', value: replace ? data.packs : { ...data.packs, ...S.packs } } });
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

/* ================= Statistik ================= */
function StatsView(deckId = null) {
  const deck0 = deckId ? getDeck(deckId) : null;
  const v = makeView({ title: 'Statistik', backLabel: deck0 ? deck0.name : 'Karteikarten' });
  let lastK = null;
  let selDay = 6;

  v.render = () => {
    const d = deckId ? getDeck(deckId) : null;
    if (deckId && !d) return;
    const cards = d ? deckCards(deckId) : S.cards;
    const k = deckKnowledge(cards);
    const animate = lastK !== k;
    lastK = k;
    const learned = cards.filter((c) => c.history?.length).length;
    const mastered = cards.filter((c) => isMastered(c.history)).length;
    const dist = distribution(cards);
    const total = dist[1] + dist[2] + dist[3] + dist[4];
    const weak = weakest(cards, 12);
    const days = last7Days(cards);
    const maxN = Math.max(1, ...days.map((x) => x.n));
    const st = streak();
    const pct = (n) => (total ? Math.round((100 * n) / total) : 0);

    v.content.innerHTML = `
      <div class="scope-line">${d ? `${esc(d.emoji)} ${esc(d.name)}` : '📚 Alle Stapel'}</div>
      <div class="stats-hero">
        ${ringHTML(k, 132, 15, animate)}
        <div class="sh-info">
          <div class="dc-label">Wissensstand</div>
          <div class="dc-mood">${mood(k, learned > 0)}</div>
          <div class="sh-grid">
            <div><b>⭐ ${mastered}</b><span>gemeistert</span></div>
            <div><b>📚 ${learned}/${cards.length}</b><span>gelernt</span></div>
            <div><b>🔥 ${st}</b><span>${st === 1 ? 'Tag' : 'Tage'} Serie</span></div>
            <div><b>🎯 ${total}</b><span>Antworten</span></div>
          </div>
        </div>
      </div>

      ${total ? `
      <div class="section"><div class="section-header">Letzte 7 Tage</div>
        <div class="chart-card">
          <div class="chart-caption" aria-live="polite"></div>
          <div class="bars" role="group" aria-label="Antworten pro Tag">
            ${days.map((x, i) => `<button class="bar-col ${i === selDay ? 'sel' : ''}" data-day="${i}" aria-label="${esc(x.long)}: ${x.n} Antworten">
              <span class="vbar ${i === 6 ? 'today' : ''}" style="height:${x.n ? Math.max(6, (x.n / maxN) * 100) : 0}%"></span>
              <span class="bar-day">${esc(x.short)}</span></button>`).join('')}
          </div>
        </div></div>

      <div class="section"><div class="section-header">Deine Antworten</div>
        <div class="chart-card">
          <div class="stack" role="img" aria-label="${[1, 2, 3, 4].map((r) => `${RATINGS[r].name} ${dist[r]}`).join(', ')}">
            ${[1, 2, 3, 4].filter((r) => dist[r]).map((r) => `<span class="seg-r r${r}" style="flex-grow:${dist[r]}"></span>`).join('')}
          </div>
          <div class="legend4">
            ${[1, 2, 3, 4].map((r) => `<div class="lg"><i class="r${r}"></i><span class="lg-name">${RATINGS[r].emoji} ${RATINGS[r].name}</span>
              <span class="lg-val"><b>${dist[r]}</b> · ${pct(dist[r])} %</span></div>`).join('')}
          </div>
        </div></div>

      <div class="section"><div class="section-header">💪 Diese Begriffe musst du üben</div>
        ${weak.length ? `<div class="group">${weak.map((w) => {
          const dk = getDeck(w.card.deckId);
          return `<button class="row" data-a="card-detail" data-id="${w.card.id}">
            <span class="row-main"><span class="row-title">${esc(plain(w.card.front))}</span>
            <span class="row-sub">${d ? esc(plain(w.card.back)) : `${esc(dk?.emoji || '')} ${esc(dk?.name || '')}`}</span></span>
            ${scoreBadge(w.card)}</button>`;
        }).join('')}</div>
        <div class="pad" style="margin-top:14px"><button class="btn primary" data-a="practice-weak">🎯 ${plural(weak.length, 'Karte', 'Karten')} gezielt üben</button></div>
        <div class="section-footer">Gezieltes Üben ändert deinen Lernplan nicht, zählt aber für den Wissensstand.</div>`
        : '<div class="empty small"><div class="empty-icon">🏆</div><p>Keine Schwachstellen – alle gelernten Karten sitzen!</p></div>'}
      </div>`
      : `<div class="empty"><div class="empty-icon">📊</div><h3>Noch keine Antworten</h3>
          <p>Lerne ein paar Karten, dann siehst du hier deinen Fortschritt.</p>
          <button class="btn primary" data-a="learn-now">${I.play}Jetzt lernen</button></div>`}`;

    const cap = $('.chart-caption', v.content);
    if (cap) {
      const x = days[selDay];
      cap.innerHTML = `<b>${x.n}</b> ${x.n === 1 ? 'Antwort' : 'Antworten'} <span>· ${esc(x.long)}</span>`;
    }
    animateIn(v.content);
  };

  v.el.addEventListener('click', (e) => {
    const day = e.target.closest('[data-day]');
    if (day) {
      selDay = +day.dataset.day;
      lastK = deckKnowledge(deckId ? deckCards(deckId) : S.cards); // Kreis nicht neu animieren
      v.render();
      return;
    }
    const a = e.target.closest('[data-a]');
    if (!a) return;
    const cards = deckId ? deckCards(deckId) : S.cards;
    if (a.dataset.a === 'card-detail') openCardDetail(a.dataset.id);
    else if (a.dataset.a === 'practice-weak') startLearn({ cardIds: weakest(cards, 12).map((w) => w.card.id), practice: true });
    else if (a.dataset.a === 'learn-now') startLearn({ deckIds: deckId ? [deckId] : S.decks.map((x) => x.id) });
  });
  return v;
}

/* ================= Karten-Detail ================= */
function sourcesHTML(card) {
  const all = S.packs[card.pack]?.sources || [];
  const list = (card.sources || []).map((id) => all.find((x) => x.id === id)).filter(Boolean);
  if (!list.length) return '';
  return `<div class="section"><div class="section-header">Quellen</div><div class="group">${list
    .map((q) => {
      const url = /^https?:\/\//i.test(q.url || '') ? q.url : '';
      const inner = `<span class="row-main"><span class="row-title wrap">${esc(q.title || q.id)}</span>
        <span class="row-sub wrap">${esc([q.author, q.section].filter(Boolean).join(' · '))}</span></span>`;
      return url ? `<a class="row" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${inner}<span class="chev">${I.chev}</span></a>` : `<div class="row">${inner}</div>`;
    })
    .join('')}</div>${list.some((q) => q.note) ? `<div class="section-footer">${esc(list.map((q) => q.note).filter(Boolean).join(' '))}</div>` : ''}</div>`;
}

function openCardDetail(cardId) {
  const card = getCard(cardId);
  if (!card) return;
  const sh = openSheet({
    title: 'Karte',
    left: 'Schließen',
    right: 'Bearbeiten',
    compact: true,
    onRight: () => {
      sh.close();
      setTimeout(() => { const c = getCard(cardId); if (c) openCardEditor({ card: c }); }, 320);
    },
  });
  const hist = card.history || [];
  const k = knowledge(hist);
  const d = getDeck(card.deckId);
  const s = card.srs;
  const wrong = hist.filter((x) => x.r === 1).length;
  const statusLine = k === null
    ? '🆕 Noch nicht gelernt'
    : isMastered(hist) ? '⭐ Gemeistert!' : k >= 60 ? '💪 Fast geschafft' : '🌱 Braucht noch Übung';
  const nextLine = s.state === 'new' ? 'Kommt in der nächsten Lernrunde' : s.state === 'review' ? `Nächste Wiederholung ${relDue(s.due)}` : 'Gerade in der Lernphase';
  sh.body.innerHTML = `
    <div class="detail-card">
      <div class="detail-deck">${esc(d ? `${d.emoji} ${d.name}` : '')}${card.priority ? ` · ${prioBadge(card, true)}${Number(card.priority) === 1 ? ' <span class="prio-hint">zuerst lernen</span>' : ''}` : ''}</div>
      <div class="detail-front">${rich(card.front)}</div>
      <div class="fc-divider"></div>
      ${card.imageId ? `<img class="fc-img small" data-img="${card.imageId}" alt="">` : ''}
      <div class="detail-back">${backBodyHTML(card)}</div>
    </div>
    <div class="detail-score">
      ${k === null ? '<div class="ring-empty">🆕</div>' : ringHTML(k, 84, 10, true)}
      <div><div class="ds-status">${statusLine}</div>
        <div class="ds-sub">${hist.length ? `${plural(hist.length, 'Antwort', 'Antworten')}${wrong ? ` · ${wrong}× falsch` : ''}` : 'Noch keine Antworten'}</div>
        <div class="ds-sub">${nextLine}</div></div>
    </div>
    ${hist.length ? `
    <div class="section"><div class="section-header">Verlauf</div>
      <div class="chart-card">
        <div class="dots" role="list">${hist.map((x, i) => `<button class="dot r${x.r} ${i === hist.length - 1 ? 'sel' : ''}" role="listitem" data-i="${i}"
          aria-label="${esc(RATINGS[x.r].name)}, ${esc(fmtDateTime(x.t))}"></button>`).join('')}</div>
        <div class="dot-caption" aria-live="polite"></div>
        <div class="dot-legend">${[1, 2, 3, 4].map((r) => `<span><i class="r${r}"></i>${RATINGS[r].name}</span>`).join('')}</div>
      </div></div>
    <div class="section"><div class="section-header">Zuletzt</div><div class="group">
      ${hist.slice(-6).reverse().map((x) => `<div class="row"><i class="dot r${x.r} static"></i><span class="row-main"><span class="row-title">${RATINGS[x.r].name}</span></span>
        <span class="row-value small">${esc(fmtDateTime(x.t))}</span></div>`).join('')}
    </div></div>` : `<div class="empty small"><p>Starte eine Lernrunde, dann siehst du hier, wie du diese Karte bewertet hast. 🚀</p></div>`}
    ${sourcesHTML(card)}`;
  hydrateImages(sh.body);
  animateIn(sh.body);
  const cap = $('.dot-caption', sh.body);
  const showDot = (i) => {
    const x = hist[i];
    sh.body.querySelectorAll('.dot[data-i]').forEach((b) => b.classList.toggle('sel', +b.dataset.i === i));
    if (cap) cap.innerHTML = `<b>${RATINGS[x.r].emoji} ${RATINGS[x.r].name}</b> · ${esc(fmtDateTime(x.t))}`;
  };
  if (hist.length) showDot(hist.length - 1);
  sh.body.addEventListener('click', (e) => {
    const dot = e.target.closest('.dot[data-i]');
    if (dot) showDot(+dot.dataset.i);
  });
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
          <span class="row-main"><span class="row-title">Prompt für Claude kopieren</span></span></button>
        ${packRowHTML('sct')}</div></div>
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
        <span class="rate r1">Falsch</span><span>Nicht gewusst – kommt gleich noch einmal.</span>
        <span class="rate r2">Mühsam</span><span>Mit Mühe gewusst – kommt bald wieder.</span>
        <span class="rate r3">Gut</span><span>Gewusst – der Abstand wächst.</span>
        <span class="rate r4">Einfach</span><span>Sofort gewusst – kommt erst viel später.</span>
      </div>
      <p>Die App plant jede Karte nach dem Prinzip der verteilten Wiederholung (Spaced Repetition): Schwierige Karten kommen öfter, leichte immer seltener. Die Zeit auf den Knöpfen zeigt, wann die Karte wiederkommt.</p>
      <h3>Wissensstand ⭐</h3>
      <p>Jede Antwort wird mit Datum gespeichert. Daraus berechnet die App pro Karte einen Wissensstand in Prozent, wobei neuere Antworten stärker zählen als alte. Ab 85 % und mindestens drei Antworten gilt eine Karte als <b>gemeistert ⭐</b>.</p>
      <p>Unter <b>Statistik</b> siehst du deine Antworten, die Verteilung und die Begriffe, die du noch üben solltest – mit einem Knopf, um genau diese Karten gezielt zu lernen.</p>
      <p><b>Frei üben</b> geht alle Karten eines Stapels durch, ohne den Lernplan zu verändern. Die Antworten zählen trotzdem für den Wissensstand.</p>
      <h3>Karten mit Claude erstellen</h3>
      <ol><li>Tippe auf „Prompt für Claude kopieren“.</li>
      <li>Füge ihn in Claude ein und ersetze <span class="code">[THEMA]</span>.</li>
      <li>Kopiere Claudes Antwort (Kopieren-Symbol am Codeblock).</li>
      <li>Öffne „Aus Text importieren“ und tippe auf „Einfügen“.</li></ol>
      <p>Der Prompt:</p>
      <div class="code-block">${esc(CLAUDE_PROMPT)}</div>
      <h3>Lernpakete 📦</h3>
      <p>Unter „Karten hinzufügen“ lädst du das SCT-Lernpaket mit 150 Karten in 7 Stapeln. Karten mit <b>Priorität 1</b> kommen beim Lernen zuerst. Lädst du das Paket später erneut, werden die Karten aktualisiert – dein Lernfortschritt bleibt erhalten.</p>
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
