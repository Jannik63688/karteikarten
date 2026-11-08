// Wissensstand aus dem Bewertungsverlauf einer Karte.
// Neuere Antworten zählen stärker (jede ältere Antwort wiegt nur 60 % der nächstneueren).

export const RATINGS = {
  1: { name: 'Falsch', key: 'wrong', emoji: '😵' },
  2: { name: 'Mühsam', key: 'hard', emoji: '😅' },
  3: { name: 'Gut', key: 'good', emoji: '🙂' },
  4: { name: 'Einfach', key: 'easy', emoji: '😎' },
};

const VALUE = { 1: 0, 2: 0.5, 3: 0.9, 4: 1 };
const DECAY = 0.6;
const WINDOW = 12;
export const MASTERED_MIN = 85;
export const HISTORY_MAX = 200;

/** Wissensstand in Prozent (0–100) oder null, wenn die Karte noch nie bewertet wurde. */
export function knowledge(history) {
  if (!history || !history.length) return null;
  let num = 0;
  let den = 0;
  let w = 1;
  for (let i = history.length - 1; i >= 0 && i >= history.length - WINDOW; i--) {
    num += w * (VALUE[history[i].r] ?? 0);
    den += w;
    w *= DECAY;
  }
  return Math.round((100 * num) / den);
}

/** Gemeistert: mindestens 3 Antworten und Wissensstand ≥ 85 %. */
export function isMastered(history) {
  const k = knowledge(history);
  return k !== null && k >= MASTERED_MIN && history.length >= 3;
}

/** Wissensstand eines Stapels: Durchschnitt aller Karten, ungelernte zählen als 0 %. */
export function deckKnowledge(cards) {
  if (!cards.length) return 0;
  let sum = 0;
  for (const c of cards) sum += knowledge(c.history) ?? 0;
  return Math.round(sum / cards.length);
}

/** Farbe von Rot (0 %) über Gelb zu Grün (100 %). */
export function scoreColor(p) {
  const hue = Math.round(Math.max(0, Math.min(100, p)) * 1.25); // 0 → 125
  return `hsl(${hue} 80% 44%)`;
}

/** Häufigkeit der vier Bewertungen über alle Verläufe. */
export function distribution(cards) {
  const d = { 1: 0, 2: 0, 3: 0, 4: 0 };
  for (const c of cards) for (const h of c.history || []) if (d[h.r] !== undefined) d[h.r]++;
  return d;
}

/** Schwächste gelernte Karten (aufsteigend), nur unter 85 %. */
export function weakest(cards, limit = 12) {
  return cards
    .filter((c) => c.history?.length)
    .map((c) => ({ card: c, score: knowledge(c.history) }))
    .filter((w) => w.score < MASTERED_MIN)
    .sort((a, b) => a.score - b.score || b.card.history.length - a.card.history.length)
    .slice(0, limit);
}
