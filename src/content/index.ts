// Contenido estático (generado por `npm run data`) e índices de acceso.
import charsJson from '../../data/build/chars.json';
import metaJson from '../../data/build/meta.json';
import phrasesJson from '../../data/build/phrases.json';
import readingsJson from '../../data/build/readings.json';
import wordsJson from '../../data/build/words.json';
import { charItem, itemKey, itemKind, wordItem, type ItemId } from '../core/skills';
import type { Char, ContentMeta, HskLevel, Phrase, Reading, SentenceToken, Word } from './types';

export const words = wordsJson as Word[];
export const chars = charsJson as Char[];
export const meta = metaJson as ContentMeta;
export const phrases = phrasesJson as Phrase[];
export const phraseById = new Map(phrases.map((p) => [p.id, p]));
export const readings = readingsJson as Reading[];
export const readingById = new Map(readings.map((r) => [r.id, r]));

export const wordById = new Map(words.map((w) => [w.id, w]));
export const charByChar = new Map(chars.map((c) => [c.char, c]));

/** Nivel HSK más bajo de las palabras donde aparece cada carácter. */
export const charWordLevel = new Map(
  chars.map((c) => [c.char, Math.min(...c.words.map((id) => wordById.get(id)!.level)) as HskLevel]),
);

export const LEVELS: HskLevel[] = [1, 2, 3];

/** Palabras de un nivel en el orden en que se presentan como nuevas: frecuencia, luego temario. */
export function newWordOrder(levels: number[]): ItemId[] {
  return words
    .filter((w) => levels.includes(w.level) && w.es.length > 0)
    .map((w, i) => ({ w, i }))
    .sort((a, b) => a.w.level - b.w.level || (a.w.freqRank ?? 1e9) - (b.w.freqRank ?? 1e9) || a.i - b.i)
    .map(({ w }) => wordItem(w.id));
}

export function charsOfLevel(level: HskLevel | 'all'): Char[] {
  return level === 'all' ? chars : chars.filter((c) => c.level === level);
}

export interface ItemView {
  id: ItemId;
  kind: 'w' | 'c';
  hanzi: string;
  pinyin: string;
  meaning: string;
  meanings: string[];
  level: HskLevel;
  chars: string[];
}

export function viewOf(id: ItemId): ItemView | undefined {
  const key = itemKey(id);
  if (itemKind(id) === 'w') {
    const w = wordById.get(key);
    if (!w) return undefined;
    const meanings = w.es.length ? w.es : w.en;
    return { id, kind: 'w', hanzi: w.simp, pinyin: w.pinyin.split('/')[0], meaning: meanings[0], meanings, level: w.level, chars: w.chars };
  }
  const c = charByChar.get(key);
  if (!c) return undefined;
  const meanings = c.es.length ? c.es : c.en;
  return { id, kind: 'c', hanzi: c.char, pinyin: c.pinyin[0] ?? '', meaning: meanings[0], meanings, level: c.level, chars: [c.char] };
}

/** Frase lista para ejercicios (de un ejemplo o del repertorio de frases útiles). */
export interface Sentence {
  zh: string;
  es: string;
  tokens: SentenceToken[];
  phraseId?: string;
}

const isPunct = (t: SentenceToken) => !t.p;
/** Palabras de la frase (sin puntuación). */
export const sentenceWords = (s: Sentence) => s.tokens.filter((t) => !isPunct(t));

/** Útil para ejercicios: todas sus palabras son HSK (o nombres propios conocidos) y tiene 2–9 palabras. */
function usable(tokens: SentenceToken[] | undefined): tokens is SentenceToken[] {
  if (!tokens) return false;
  const ws = tokens.filter((t) => !isPunct(t));
  return ws.length >= 2 && ws.length <= 9 && ws.every((t) => t.w || t.g);
}

/** Frases donde aparece la palabra: primero las frases útiles, luego los ejemplos. */
export function sentencesFor(wordId: string): Sentence[] {
  const w = wordById.get(wordId);
  if (!w) return [];
  const fromPhrases = phrases
    .filter((p) => p.tokens.some((t) => t.w === wordId) && usable(p.tokens))
    .map((p) => ({ zh: p.zh, es: p.es, tokens: p.tokens, phraseId: p.id }));
  const fromExamples = w.examples
    .filter((e) => usable(e.tokens) && e.tokens!.some((t) => t.w === wordId))
    .map((e) => ({ zh: e.zh, es: e.es, tokens: e.tokens! }));
  return [...fromPhrases, ...fromExamples];
}

export function phraseSentence(p: Phrase): Sentence {
  return { zh: p.zh, es: p.es, tokens: p.tokens, phraseId: p.id };
}

export { charItem, wordItem };
export type { Char, Phrase, Reading, Word };
