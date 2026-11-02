// Contenido estático (generado por `npm run data`) e índices de acceso.
import charsJson from '../../data/build/chars.json';
import metaJson from '../../data/build/meta.json';
import wordsJson from '../../data/build/words.json';
import { charItem, itemKey, itemKind, wordItem, type ItemId } from '../core/skills';
import type { Char, ContentMeta, HskLevel, Word } from './types';

export const words = wordsJson as Word[];
export const chars = charsJson as Char[];
export const meta = metaJson as ContentMeta;

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

export { charItem, wordItem };
export type { Char, Word };
