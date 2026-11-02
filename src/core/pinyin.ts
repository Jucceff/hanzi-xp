// Utilidades de pinyin: tonos, conversión a numérico y partición por sílabas.
import type { Tone } from '../content/types';

const MARKS: Record<string, [string, Tone]> = {
  ā: ['a', 1], á: ['a', 2], ǎ: ['a', 3], à: ['a', 4],
  ē: ['e', 1], é: ['e', 2], ě: ['e', 3], è: ['e', 4],
  ī: ['i', 1], í: ['i', 2], ǐ: ['i', 3], ì: ['i', 4],
  ō: ['o', 1], ó: ['o', 2], ǒ: ['o', 3], ò: ['o', 4],
  ū: ['u', 1], ú: ['u', 2], ǔ: ['u', 3], ù: ['u', 4],
  ǖ: ['ü', 1], ǘ: ['ü', 2], ǚ: ['ü', 3], ǜ: ['ü', 4],
  ń: ['n', 2], ň: ['n', 3], ǹ: ['n', 4], ḿ: ['m', 2],
};

/** Tono de una sílaba con marcas (5 = neutro). */
export function toneOf(syllable: string): Tone {
  for (const ch of syllable.normalize('NFC')) {
    const m = MARKS[ch];
    if (m) return m[1];
  }
  return 5;
}

/** Quita las marcas de tono (conserva ü). */
export function stripTones(s: string): string {
  let out = '';
  for (const ch of s.normalize('NFC')) out += MARKS[ch]?.[0] ?? ch;
  return out;
}

/** "nǚ" -> "nü3", "men" -> "men5" */
export function toNumbered(syllable: string): string {
  return stripTones(syllable).toLowerCase() + toneOf(syllable);
}

/** Normaliza para comparar: minúsculas, sin tonos, sin separadores, ü→v. */
export function plainKey(s: string): string {
  return stripTones(s).toLowerCase().replace(/[\s'’\-·]/g, '').replace(/ü/g, 'v');
}

/**
 * Parte un pinyin oficial ("bú kèqi", "nǚ’ér") en una sílaba por carácter,
 * usando las lecturas candidatas (sin tono) de cada carácter.
 * Devuelve null si no hay alineación posible.
 */
export function splitPinyin(official: string, candidates: string[][]): string[] | null {
  const src = official.normalize('NFC').replace(/[\s'’\-·]/g, '');
  const keyAt = (i: number, len: number) => plainKey(src.slice(i, i + len));
  const memo = new Map<string, string[] | null>();

  const go = (pos: number, idx: number): string[] | null => {
    if (idx === candidates.length) return pos === src.length ? [] : null;
    const k = `${pos}:${idx}`;
    if (memo.has(k)) return memo.get(k)!;
    let res: string[] | null = null;
    const cands = [...new Set(candidates[idx].map((c) => plainKey(c)))].sort((a, b) => b.length - a.length);
    for (const c of cands) {
      if (keyAt(pos, c.length) === c) {
        const rest = go(pos + c.length, idx + 1);
        if (rest) {
          res = [src.slice(pos, pos + c.length).toLowerCase(), ...rest];
          break;
        }
      }
    }
    memo.set(k, res);
    return res;
  };
  return go(0, 0);
}
