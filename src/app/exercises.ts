// Elige el tipo de ejercicio para cada elemento de la cola y genera distractores.
import { chars, viewOf, words, wordById, type ItemView } from '../content';
import { markTone, stripTones, toneOf } from '../core/pinyin';
import type { QueueItem } from '../core/queue';
import { itemKey, itemKind } from '../core/skills';
import type { Exercise } from '../core/xp';
import type { Tone } from '../content/types';

export type ExerciseSpec =
  | { type: 'flash'; front: 'hanzi' | 'meaning'; xpKind: Exercise }
  | { type: 'choice'; prompt: 'hanzi' | 'meaning'; answer: 'meaning' | 'pinyin' | 'hanzi'; options: string[]; correct: number; xpKind: Exercise };

const shuffle = <T>(a: T[], rnd = Math.random): T[] => {
  const b = [...a];
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
};

/** Núcleo del significado ("allí (coloquial)" → "allí") para no ofrecer sinónimos como distractores. */
const sense = (m: string) => m.split(/[,(;]/)[0].trim().toLowerCase();

function pool(view: ItemView) {
  // mismo tipo (palabra/carácter), mismo nivel o inferior, con traducción y sin sinónimos
  const base =
    view.kind === 'w'
      ? words.filter((w) => w.level <= view.level && w.es.length && w.id !== itemKey(view.id)).map((w) => viewOf(`w:${w.id}`)!)
      : chars.filter((c) => c.es.length && c.char !== view.hanzi).map((c) => viewOf(`c:${c.char}`)!);
  const mine = new Set(view.meanings.map(sense));
  return base.filter((o) => o.hanzi !== view.hanzi && !o.meanings.some((m) => mine.has(sense(m))));
}

/** `ordered`: los candidatos ya vienen en orden de preferencia (no se barajan antes de elegir). */
function choices(correct: string, candidates: string[], n = 4, rnd = Math.random, ordered = false) {
  const distinct = [...new Set(candidates.filter((c) => c && c !== correct))];
  const picked = (ordered ? distinct : shuffle(distinct, rnd)).slice(0, n - 1);
  const opts = shuffle([correct, ...picked], rnd);
  return { options: opts, correct: opts.indexOf(correct) };
}

/** Variantes de tono plausibles del pinyin de una palabra (cambiando una o dos sílabas). */
export function toneVariants(syllables: string[], rnd = Math.random): string[] {
  const out = new Set<string>();
  const tones: Tone[] = [1, 2, 3, 4];
  for (let tries = 0; tries < 40 && out.size < 6; tries++) {
    const next = syllables.map((s) => s);
    const k = syllables.length === 1 ? 1 : 1 + Math.floor(rnd() * Math.min(2, syllables.length));
    for (const i of shuffle([...syllables.keys()], rnd).slice(0, k)) {
      if (syllables[i] === 'r') continue;
      const current = toneOf(syllables[i]);
      const t = shuffle(tones.filter((x) => x !== current), rnd)[0];
      next[i] = markTone(stripTones(syllables[i]), t);
    }
    const v = next.join('');
    if (v !== syllables.join('')) out.add(v);
  }
  return [...out];
}

function pinyinOf(view: ItemView): { display: string; syllables: string[] } {
  if (view.kind === 'w') {
    const w = wordById.get(itemKey(view.id))!;
    return { display: w.syllables.join(''), syllables: w.syllables };
  }
  return { display: view.pinyin, syllables: [view.pinyin] };
}

export function specFor(q: QueueItem, rnd = Math.random): ExerciseSpec {
  const view = viewOf(q.itemId)!;
  const isNew = q.reason === 'new';
  const others = pool(view);
  switch (q.skill) {
    case 'recognition':
      if (isNew || rnd() < 0.5) return { type: 'flash', front: 'hanzi', xpKind: 'flashcard' };
      return { type: 'choice', prompt: 'hanzi', answer: 'meaning', xpKind: 'choice', ...choices(view.meaning, others.map((o) => o.meaning), 4, rnd) };
    case 'production':
      if (!isNew && rnd() < 0.5) return { type: 'flash', front: 'meaning', xpKind: 'production' };
      return {
        type: 'choice', prompt: 'meaning', answer: 'hanzi', xpKind: 'choice',
        ...choices(view.hanzi, shuffle(others.filter((o) => o.chars.length === view.chars.length), rnd).map((o) => o.hanzi).concat(others.map((o) => o.hanzi)), 4, rnd, true),
      };
    case 'pinyin':
    default: {
      const p = pinyinOf(view);
      const sameLen = others
        .filter((o) => o.chars.length === view.chars.length)
        .map((o) => pinyinOf(o).display);
      // dos variantes de tono (lo difícil) + una palabra distinta de la misma longitud
      const candidates = [...toneVariants(p.syllables, rnd).slice(0, 2), ...shuffle(sameLen, rnd)];
      return { type: 'choice', prompt: 'hanzi', answer: 'pinyin', xpKind: 'choice', ...choices(p.display, candidates, 4, rnd, true) };
    }
  }
}

export const isWord = (q: QueueItem) => itemKind(q.itemId) === 'w';
