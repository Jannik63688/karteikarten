// Liest Karten aus eingefügtem Text (z. B. aus einem Claude-Chat).
//
// Unterstützte Formate:
//   Begriff | Erklärung          (auch Tab, ::, –, ;, „Begriff: Erklärung“)
//   # Stapelname                 (folgende Karten landen in diesem Stapel)
//   F: Begriff / A: Erklärung    (mehrzeilige Antworten möglich)
//   Markdown-Tabellen, Aufzählungen, Codeblöcke
//   Blöcke aus „Begriff“ + Folgezeilen, getrennt durch Leerzeilen
//   JSON: [{ "front": "…", "back": "…", "deck": "…" }]

export const CLAUDE_PROMPT = `Erstelle mir Karteikarten zum Thema: [THEMA]

Regeln:
- Genau eine Karte pro Zeile im Format: Begriff | Erklärung
- Erklärung auf Deutsch, kurz und verständlich (1–2 Sätze), gern mit einem kurzen Beispiel
- Das Zeichen | nur als Trenner verwenden, nicht im Text
- Wichtige Wörter darfst du mit **fett** markieren
- Erste Zeile: # Stapelname (z. B. # Business English, # Sales, # BWL)
- Gib nur die Karten in einem einzigen Codeblock aus, ohne weiteren Text

Beispiel:
# Business English
to follow up | **nachfassen**; sich nach einem Gespräch erneut melden. Bsp.: „I'll follow up next week.“`;

const Q_FRONT = /^(?:f|q|frage|vorderseite|vorne|begriff|front|term|question|wort)\s*[:：]\s*(.*)$/i;
const Q_BACK = /^(?:a|antwort|rückseite|rueckseite|hinten|erklärung|erklaerung|definition|bedeutung|back|answer)\s*[:：]\s*(.*)$/i;
const DECK = /^(?:#{1,6}\s+(.+?)\s*#*|(?:stapel|deck|kategorie)\s*[:：]\s*(.+))$/i;
const BULLET = /^(?:[-*•–]\s+|\d{1,3}[.)]\s+)/;
const SEPARATORS = ['\t', ' | ', '|', ' :: ', '::', ' — ', ' – ', ' - ', ' ; ', ';', ': '];
const HEAD_FRONT = /^(begriff|begriffe|term|vorderseite|front|frage|wort|englisch|english)$/i;
const HEAD_BACK = /^(erklärung|erklaerung|definition|rückseite|rueckseite|back|antwort|bedeutung|deutsch|german)$/i;

function deckName(line) {
  const m = line.match(DECK);
  if (!m) return null;
  const name = (m[1] || m[2] || '').replace(/^\*\*|\*\*$/g, '').trim();
  return name || null;
}

function cleanFront(s) {
  return s
    .trim()
    .replace(/^(\*\*|__|`)(.+)\1$/, '$2')
    .replace(/[:：]$/, '')
    .trim();
}

function cleanBack(s) {
  return s
    .replace(/\\n|<br\s*\/?>/gi, '\n')
    .replace(/^[\s:–—|-]+/, '')
    .trim();
}

function make(front, back, deck) {
  return { front: cleanFront(front), back: cleanBack(back), deck: deck || null };
}

/** Zerlegt eine einzelne Zeile in [Begriff, Erklärung], 'skip' oder null. */
function splitLine(line, ctx) {
  // Markdown-Tabelle
  if (/^\|.*\|$/.test(line)) {
    const cells = line.slice(1, -1).split('|').map((c) => c.trim());
    if (cells.every((c) => c === '' || /^:?-{2,}:?$/.test(c))) return 'skip';
    if (cells.length >= 2) {
      if (!ctx.tableSeen && HEAD_FRONT.test(cells[0]) && HEAD_BACK.test(cells[1])) {
        ctx.tableSeen = true;
        return 'skip';
      }
      ctx.tableSeen = true;
      const rest = cells.slice(1).filter(Boolean).join(' – ');
      return cells[0] && rest ? [cells[0], rest] : null;
    }
  }
  // **Begriff:** Erklärung  /  **Begriff** – Erklärung
  const bold = line.match(/^\*\*(.+?)\*\*\s*(.*)$/);
  if (bold && bold[2] && (/[:：]$/.test(bold[1]) || /^[:：|–—-]/.test(bold[2]))) {
    return [bold[1], bold[2]];
  }
  for (const sep of SEPARATORS) {
    const i = line.indexOf(sep);
    if (i > 0 && i < line.length - sep.length) {
      const a = line.slice(0, i).trim();
      const b = line.slice(i + sep.length).trim();
      if (a && b) return [a, b];
    }
  }
  return null;
}

function parseJSON(data) {
  if (data && data.app === 'karteikarten') return { cards: [], skipped: [], backup: data };
  const arr = Array.isArray(data) ? data : data?.cards || data?.karten || [];
  const cards = [];
  for (const o of arr) {
    if (!o || typeof o !== 'object') continue;
    const f = o.front ?? o.vorderseite ?? o.begriff ?? o.term ?? o.question ?? o.frage;
    const b = o.back ?? o.rückseite ?? o.rueckseite ?? o.erklärung ?? o.erklaerung ?? o.definition ?? o.answer ?? o.antwort;
    if (f && b) cards.push(make(String(f), String(b), o.deck ?? o.stapel ?? null));
  }
  return { cards, skipped: [] };
}

export function parseCards(input) {
  const text = String(input || '')
    .replace(/\r\n?/g, '\n')
    .replace(/ /g, ' ');
  const trimmed = text.trim();
  if (/^[[{]/.test(trimmed)) {
    try {
      return parseJSON(JSON.parse(trimmed));
    } catch {
      /* kein JSON – als Text behandeln */
    }
  }

  const lines = text.split('\n').filter((l) => !/^\s*```/.test(l));
  const blocks = [];
  let cur = [];
  for (const l of lines) {
    if (!l.trim()) {
      if (cur.length) blocks.push(cur);
      cur = [];
    } else cur.push(l.trim());
  }
  if (cur.length) blocks.push(cur);

  const cards = [];
  const skipped = [];
  const ctx = { tableSeen: false };
  let deck = null;
  let pending = null;
  const flush = () => {
    if (!pending) return;
    if (pending.front.trim() && pending.back.trim()) cards.push(make(pending.front, pending.back, deck));
    else skipped.push((pending.front || pending.back).trim());
    pending = null;
  };

  for (const block of blocks) {
    flush();
    let ls = block;
    while (ls.length && deckName(ls[0])) {
      deck = deckName(ls[0]);
      ls = ls.slice(1);
    }
    if (!ls.length) continue;

    const hasQA = ls.some((l) => Q_FRONT.test(l));
    const anySep = ls.some((l) => splitLine(l.replace(BULLET, ''), { tableSeen: true }));
    if (!hasQA && !anySep && ls.length >= 2) {
      cards.push(make(ls[0].replace(BULLET, ''), ls.slice(1).join('\n'), deck));
      continue;
    }

    for (const raw of ls) {
      let m;
      const dn = deckName(raw);
      if (dn) {
        flush();
        deck = dn;
        continue;
      }
      if ((m = raw.match(Q_FRONT))) {
        flush();
        pending = { front: m[1], back: '', mode: 'front' };
        continue;
      }
      if (pending && (m = raw.match(Q_BACK))) {
        pending.back = m[1];
        pending.mode = 'back';
        continue;
      }
      if (pending) {
        pending[pending.mode] += (pending[pending.mode] ? '\n' : '') + raw;
        continue;
      }
      const sp = splitLine(raw.replace(BULLET, ''), ctx);
      if (sp === 'skip') continue;
      if (sp) cards.push(make(sp[0], sp[1], deck));
      else skipped.push(raw);
    }
  }
  flush();
  return { cards: cards.filter((c) => c.front && c.back), skipped };
}
