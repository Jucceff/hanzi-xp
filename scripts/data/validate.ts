import { z } from 'zod';
import type { Char, Word } from '../../src/content/types';

/** Niveles cuya capa en español ya debe estar completa (se amplía por fases). */
export const REQUIRED_ES_LEVELS = [1];

const syllable = z.string().regex(/^[a-zāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜüńňǹḿ]+$/, 'sílaba inválida');

const example = z.object({
  zh: z.string().min(1),
  pinyin: z.string().min(1),
  es: z.string().min(1),
  source: z.enum(['tatoeba', 'claude']),
});

const wordSchema = z
  .object({
    id: z.string().min(1),
    simp: z.string().min(1),
    pinyin: z.string().min(1),
    syllables: z.array(syllable).min(1),
    tones: z.array(z.number().int().min(1).max(5)).min(1),
    level: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    en: z.array(z.string()),
    es: z.array(z.string().min(1)),
    chars: z.array(z.string()).min(1),
    examples: z.array(example),
  })
  .refine((w) => w.syllables.length === w.chars.length, 'nº de sílabas ≠ nº de caracteres')
  .refine((w) => w.tones.length === w.chars.length, 'nº de tonos ≠ nº de caracteres');

const charSchema = z.object({
  char: z.string().length(1),
  pinyin: z.array(z.string().min(1)).min(1, 'sin pinyin'),
  radical: z.string().min(1, 'sin radical'),
  strokes: z.number().int().positive('sin trazos'),
  words: z.array(z.string()).min(1, 'no aparece en ninguna palabra'),
});

export function validateAll(words: Word[], chars: Char[]) {
  const errors: string[] = [];
  for (const w of words) {
    const r = wordSchema.safeParse(w);
    if (!r.success) errors.push(`Palabra ${w.id}: ${r.error.issues.map((i) => i.message).join('; ')}`);
    if (REQUIRED_ES_LEVELS.includes(w.level) && !w.es.length) errors.push(`Palabra ${w.id} (HSK${w.level}): falta español`);
    if (!w.es.length && !w.en.length) errors.push(`Palabra ${w.id}: sin ninguna traducción`);
  }
  for (const c of chars) {
    const r = charSchema.safeParse(c);
    if (!r.success) errors.push(`Carácter ${c.char}: ${r.error.issues.map((i) => i.message).join('; ')}`);
    if (REQUIRED_ES_LEVELS.includes(c.level) && !c.es.length) errors.push(`Carácter ${c.char} (HSK${c.level}): falta español`);
  }
  const ids = new Set<string>();
  for (const w of words) {
    if (ids.has(w.id)) errors.push(`Id duplicado: ${w.id}`);
    ids.add(w.id);
  }

  const gaps: Record<string, string[]> = {};
  for (const lvl of [1, 2, 3]) {
    gaps[`HSK${lvl} · palabras sin español`] = words.filter((w) => w.level === lvl && !w.es.length).map((w) => w.id);
    gaps[`HSK${lvl} · palabras con menos de 2 ejemplos`] = words
      .filter((w) => w.level === lvl && w.examples.length < 2)
      .map((w) => `${w.id}(${w.examples.length})`);
    gaps[`HSK${lvl} · caracteres sin español`] = chars.filter((c) => c.level === lvl && !c.es.length).map((c) => c.char);
  }
  gaps['Palabras sin inglés (CC-CEDICT)'] = words.filter((w) => !w.en.length).map((w) => w.id);
  gaps['Caracteres con varias lecturas en HSK (revisar)'] = chars.filter((c) => c.pinyin.length > 1).map((c) => `${c.char}[${c.pinyin.join('/')}]`);
  gaps['Pendiente de revisión humana (palabras)'] = [String(words.filter((w) => w.review === 'pending').length)];
  return { errors, gaps };
}
