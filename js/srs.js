// Spaced Repetition (angelehnt an SM-2 / Anki) mit Lernschritten.
export const MIN = 60_000;
export const DAY = 86_400_000;
const ROLLOVER_H = 3; // Ein „Lerntag“ beginnt um 3 Uhr nachts.
const LEARN_STEPS = [1, 10]; // Minuten
const RELEARN_STEPS = [10];
const MAX_INTERVAL = 3650;

export function newSrs() {
  return { state: 'new', due: 0, interval: 0, ease: 2.5, step: 0, reps: 0, lapses: 0, firstStudied: null, last: null };
}

function shifted(ts) {
  return new Date(ts - ROLLOVER_H * 3_600_000);
}

export function dayKey(ts = Date.now()) {
  const d = shifted(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function dayStartOf(ts) {
  const d = shifted(ts);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Fälligkeit für Wiederholungskarten: Beginn des Lerntags in `days` Tagen. */
export function reviewDue(now, days) {
  const d = dayStartOf(now);
  d.setDate(d.getDate() + days);
  return d.getTime() + ROLLOVER_H * 3_600_000;
}

/** Anzahl Lerntage zwischen zwei Zeitpunkten (0 = gleicher Tag). */
export function dayDiff(from, to) {
  return Math.round((dayStartOf(to) - dayStartOf(from)) / DAY);
}

/**
 * Bewertet eine Karte. rating: 1 = Nochmal, 2 = Schwer, 3 = Gut, 4 = Einfach.
 * Gibt einen neuen SRS-Zustand zurück (der alte bleibt unverändert).
 */
export function schedule(prev, rating, now = Date.now()) {
  const s = { ...prev };
  s.reps += 1;
  s.last = now;
  if (!s.firstStudied) s.firstStudied = dayKey(now);
  if (s.state === 'new') {
    s.state = 'learning';
    s.step = 0;
  }

  if (s.state === 'learning' || s.state === 'relearning') {
    const steps = s.state === 'learning' ? LEARN_STEPS : RELEARN_STEPS;
    const relearn = s.state === 'relearning';
    if (rating === 1) {
      s.step = 0;
      s.due = now + steps[0] * MIN;
    } else if (rating === 2) {
      const cur = steps[Math.min(s.step, steps.length - 1)];
      const delay = s.step === 0 && steps.length > 1 ? (steps[0] + steps[1]) / 2 : cur * (steps.length === 1 ? 1.5 : 1);
      s.due = now + delay * MIN;
    } else if (rating === 3) {
      s.step += 1;
      if (s.step >= steps.length) {
        graduate(s, relearn ? Math.max(1, s.interval) : 1, now);
      } else {
        s.due = now + steps[s.step] * MIN;
      }
    } else {
      graduate(s, relearn ? Math.max(1, s.interval) + 1 : 4, now);
    }
    return s;
  }

  // state === 'review'
  const ivl = Math.max(1, s.interval);
  if (rating === 1) {
    s.lapses += 1;
    s.ease = Math.max(1.3, s.ease - 0.2);
    s.interval = Math.max(1, Math.round(ivl * 0.5));
    s.state = 'relearning';
    s.step = 0;
    s.due = now + RELEARN_STEPS[0] * MIN;
    return s;
  }
  const hard = Math.max(ivl + 1, Math.round(ivl * 1.2));
  const good = Math.max(hard + 1, Math.round(ivl * s.ease));
  const easy = Math.max(good + 1, Math.round(ivl * s.ease * 1.3));
  let next;
  if (rating === 2) {
    s.ease = Math.max(1.3, s.ease - 0.15);
    next = hard;
  } else if (rating === 3) {
    next = good;
  } else {
    next = easy;
    s.ease += 0.15;
  }
  graduate(s, next, now);
  return s;
}

function graduate(s, days, now) {
  s.state = 'review';
  s.step = 0;
  s.interval = Math.min(MAX_INTERVAL, Math.round(days));
  s.due = reviewDue(now, s.interval);
}

const fmt1 = (x) => String(Math.round(x * 10) / 10).replace('.', ',');

export function fmtDays(days) {
  if (days < 30) return days === 1 ? '1 Tag' : `${days} Tage`;
  if (days < 365) return `${fmt1(days / 30)} Mon.`;
  return `${fmt1(days / 365)} J.`;
}

export function fmtDuration(ms) {
  const m = ms / MIN;
  if (m < 1) return '<1 Min.';
  if (m < 60) return `${Math.round(m)} Min.`;
  const h = m / 60;
  if (h < 24) return `${Math.round(h)} Std.`;
  return fmtDays(Math.round(h / 24));
}

/** Beschriftungen für die vier Bewertungsknöpfe. */
export function previewLabels(s, now = Date.now()) {
  return [1, 2, 3, 4].map((r) => {
    const n = schedule(s, r, now);
    return n.state === 'review' ? fmtDays(n.interval) : fmtDuration(n.due - now);
  });
}

/** „heute“, „morgen“, „in 5 Tagen“ … */
export function relDue(ts, now = Date.now()) {
  if (ts <= now) return 'jetzt';
  const d = dayDiff(now, ts);
  if (d <= 0) return `in ${fmtDuration(ts - now)}`;
  if (d === 1) return 'morgen';
  if (d < 30) return `in ${d} Tagen`;
  return `in ${fmtDays(d)}`;
}
