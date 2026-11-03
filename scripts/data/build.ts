/**
 * Construye data/build/*.json a partir de data/raw/ (fuentes descargadas) y
 * data/authored/ (capa en español redactada y revisable).
 *
 *   npm run data:fetch   # descarga fuentes (una vez)
 *   npm run data         # construye, valida y escribe reports/data-gaps.md
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pinyin as pinyinPro, polyphonic } from 'pinyin-pro';
import { splitPinyin, toNumbered, toneOf } from '../../src/core/pinyin';
import { isHan, segment } from '../../src/core/segment';
import type { Char, ContentMeta, Example, GrammarPoint, HskLevel, Phrase, Reading, SentenceToken, Tone, Word } from '../../src/content/types';
import { plainKey } from '../../src/core/pinyin';
import { validateAll } from './validate';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const RAW = join(ROOT, 'data/raw');
const AUTH = join(ROOT, 'data/authored');
const OUT = join(ROOT, 'data/build');
const STROKES_OUT = join(ROOT, 'public/strokes');
const require = createRequire(import.meta.url);

const readJson = <T>(p: string): T => JSON.parse(readFileSync(p, 'utf8'));
const readAuthored = <T>(name: string, fallback: T): T =>
  existsSync(join(AUTH, name)) ? readJson<T>(join(AUTH, name)) : fallback;
const lines = (p: string) => readFileSync(p, 'utf8').split(/\r?\n/).filter(Boolean);

const LEVEL_ZH: Record<string, number> = { 一级: 1, 二级: 2, 三级: 3, 四级: 4, 五级: 5, 六级: 6, '七-九级': 7 };

// ───────────────────────── fuentes oficiales ─────────────────────────
interface OfficialWord { id: string; type: number; word: string; pinyin: string; cixing?: string; sort: number; levelName: string }
interface OfficialHanzi { examLevelId: string; word: string; type: string }
interface OfficialGrammar { examLevelId: string; content: string; grammarType: string; categoryType: string; grammarDetail: string; cases: string }

const officialWords = readJson<OfficialWord[]>(join(RAW, 'official_glossaryPage.json'))
  .filter((r) => r.type === 1)
  .map((r) => {
    const levels = [...r.levelName.matchAll(/(一级|二级|三级|四级|五级|六级|七-九级)/g)].map((m) => LEVEL_ZH[m[1]]);
    return { ...r, level: levels[0], senseLevels: levels.slice(1) };
  })
  .filter((r) => r.level <= 3)
  .sort((a, b) => a.sort - b.sort);

const officialHanzi = readJson<OfficialHanzi[]>(join(RAW, 'official_hanziPage.json'));
const hskLevelOf = (id: string) => Number(id.replace('HSK', '')) as HskLevel;
const recogLevel = new Map<string, HskLevel>();
const writeLevel = new Map<string, HskLevel>();
for (const h of officialHanzi) {
  if (!['HSK1', 'HSK2', 'HSK3'].includes(h.examLevelId)) continue;
  (h.type === '1' ? recogLevel : writeLevel).set(h.word, hskLevelOf(h.examLevelId));
}

const officialGrammar = readJson<OfficialGrammar[]>(join(RAW, 'official_languagePage.json')).filter((g) =>
  ['HSK1', 'HSK2', 'HSK3'].includes(g.examLevelId),
);

// ───────────────────────── CC-CEDICT ─────────────────────────
interface CedictEntry { trad: string; simp: string; num: string; proper: boolean; defs: string[] }
const cedict = new Map<string, CedictEntry[]>();
for (const line of lines(join(RAW, 'cedict.txt'))) {
  if (line.startsWith('#')) continue;
  const m = line.match(/^(\S+) (\S+) \[([^\]]+)\] \/(.*)\/$/);
  if (!m) continue;
  const e = { trad: m[1], simp: m[2], num: m[3].toLowerCase().replace(/u:/g, 'ü'), proper: /^[A-Z]/.test(m[3]), defs: m[4].split('/') };
  if (!cedict.has(e.simp)) cedict.set(e.simp, []);
  cedict.get(e.simp)!.push(e);
}
const toneless = (num: string) => num.replace(/[1-5]/g, '').replace(/\s+/g, '');
const isNoiseDef = (d: string) =>
  /^(variant of|old variant|erhua variant|surname |see also|see |also pr\.|CL:|abbr\. for|used in |\(Tw\)|\(old\))/i.test(d);

function lookupCedict(simp: string, num: string, proper = false): CedictEntry[] {
  // Los nombres propios (Hou4, Gui4 zhou1…) solo cuentan si la palabra oficial va en mayúscula.
  const all = (cedict.get(simp) ?? []).filter((e) => e.proper === proper);
  const exact = all.filter((e) => e.num.replace(/\s+/g, ' ') === num);
  if (exact.length) return exact;
  // tolerar tono neutro / sandhi: comparar sin tonos
  const loose = all.filter((e) => toneless(e.num) === toneless(num));
  return loose.length ? loose : all;
}

// ───────────────────────── Make Me a Hanzi ─────────────────────────
interface Mmah { character: string; definition?: string; pinyin: string[]; decomposition: string; radical: string; etymology?: { type: string; hint?: string } }
const mmah = new Map<string, Mmah>();
for (const l of lines(join(RAW, 'makemeahanzi.txt'))) {
  const e = JSON.parse(l) as Mmah;
  mmah.set(e.character, e);
}

// ───────────────────────── frecuencias ─────────────────────────
const drk = readJson<{ s: string; q: number }[]>(join(RAW, 'drkameleon_complete.json'));
const wordFreq = new Map<string, number>();
for (const e of drk) if (e.q > 0) wordFreq.set(e.s, Math.min(e.q, wordFreq.get(e.s) ?? Infinity));

const tatoebaCmn = new Map<number, string>();
for (const l of lines(join(RAW, 'tatoeba_cmn.tsv'))) {
  const [id, , text] = l.split('\t');
  tatoebaCmn.set(Number(id), text);
}
const charCount = new Map<string, number>();
for (const t of tatoebaCmn.values()) for (const ch of t) if (isHan(ch)) charCount.set(ch, (charCount.get(ch) ?? 0) + 1);
const charRank = new Map([...charCount.entries()].sort((a, b) => b[1] - a[1]).map(([c], i) => [c, i + 1]));

// ───────────────────────── capa redactada (español) ─────────────────────────
type AuthoredWord = { es: string[]; review?: 'pending' | 'ok' };
const esWords = readAuthored<Record<string, AuthoredWord>>('words.es.json', {});
const esChars = readAuthored<Record<string, AuthoredWord>>('chars.es.json', {});
const authoredExamples = readAuthored<Record<string, { zh: string; es: string; pinyin?: string }[]>>('examples.json', {});
const esGrammar = readAuthored<Record<string, { title: string; es: string }>>('grammar.es.json', {});

// ───────────────────────── palabras ─────────────────────────
const problems: string[] = [];

/** Pinyin de una oración (automático, pinyin-pro): sílabas separadas, puntuación pegada. */
function sentencePinyin(zh: string): string {
  return pinyinPro(zh, { type: 'array' })
    .join(' ')
    .replace(/ ?([，。？！、：；“”])/g, '$1')
    .replace(/([，。？！：；]) ?/g, '$1 ')
    .trim();
}

function candidatesFor(ch: string, ctx: string, idx: number): string[] {
  const c = new Set<string>();
  for (const p of polyphonic(ctx, { type: 'array', toneType: 'none' })[idx] ?? []) c.add(p);
  for (const p of mmah.get(ch)?.pinyin ?? []) c.add(p);
  for (const e of cedict.get(ch) ?? []) c.add(e.num.replace(/[1-5]/g, ''));
  if (ch === '儿') c.add('r');
  return [...c];
}

// Ids: la palabra oficial tal cual; si se repite (mismo hanzi con otra lectura en otro nivel,
// p. ej. 还 hái / 还 huán), las apariciones posteriores llevan el pinyin: "还·huán".
const seenWord = new Set<string>();
const words: Word[] = officialWords.map((r) => {
  const id = seenWord.has(r.word) ? `${r.word}·${r.pinyin}` : r.word;
  seenWord.add(r.word);
  const simp = r.word.replace(/\d+$/, '');
  const chars = [...simp];
  const officialPinyin = r.pinyin.split('/')[0].trim();
  let syllables = splitPinyin(officialPinyin, chars.map((ch, i) => candidatesFor(ch, simp, i)));
  if (!syllables) {
    problems.push(`Sin alineación de pinyin: ${r.word} «${r.pinyin}» → se usa pinyin-pro`);
    syllables = pinyinPro(simp, { type: 'array' });
  }
  const tones = syllables.map(toneOf) as Tone[];
  const pinyinNum = syllables.map(toNumbered).join(' ');
  const proper = /^[A-Z]/.test(r.pinyin);
  let ced = lookupCedict(simp, pinyinNum, proper);
  let en = [...new Set(ced.flatMap((e) => e.defs).filter((d) => !isNoiseDef(d)))].slice(0, 6);
  if (!en.length && simp.endsWith('儿')) {
    // variante con erhua: usar la definición de la forma sin 儿
    ced = lookupCedict(simp.slice(0, -1), pinyinNum.replace(/ r5$/, ''));
    en = [...new Set(ced.flatMap((e) => e.defs).filter((d) => !isNoiseDef(d)))].slice(0, 6);
  }
  const pos = (r.cixing ?? '').split(/[、（）()]/).map((s) => s.trim()).filter(Boolean);
  const authored = esWords[id];
  const examples: Example[] = (authoredExamples[id] ?? []).map((e) => ({
    zh: e.zh,
    pinyin: e.pinyin ?? sentencePinyin(e.zh),
    es: e.es,
    source: 'claude',
    review: 'pending',
  }));
  return {
    id,
    simp,
    trad: ced[0]?.trad ?? simp,
    pinyin: r.pinyin,
    syllables,
    pinyinNum,
    tones,
    pos: [...new Set(pos)],
    level: r.level as HskLevel,
    senseLevels: r.senseLevels,
    freqRank: wordFreq.get(simp) ?? null,
    es: authored?.es ?? [],
    en,
    chars,
    examples,
    review: authored?.review ?? 'pending',
  };
});

// ───────────────────────── ejemplos de Tatoeba ─────────────────────────
// Solo se aceptan frases cuyas palabras (segmentadas con el vocabulario HSK) sean todas
// de nivel ≤ al de la palabra, y en las que la palabra aparezca como token propio.
const spa = new Map<number, string>();
for (const l of lines(join(RAW, 'tatoeba_spa.tsv'))) {
  const [id, , text] = l.split('\t');
  spa.set(Number(id), text);
}
const pairs: { id: number; zh: string; es: string }[] = [];
const seenCmn = new Set<number>();
for (const l of lines(join(RAW, 'tatoeba_cmn_spa_links.tsv'))) {
  const [c, s] = l.split('\t').map(Number);
  if (seenCmn.has(c) || !tatoebaCmn.has(c) || !spa.has(s)) continue;
  seenCmn.add(c);
  pairs.push({ id: c, zh: tatoebaCmn.get(c)!, es: spa.get(s)! });
}
const wordLevel = new Map<string, number>();
for (const w of words) wordLevel.set(w.simp, Math.min(w.level, wordLevel.get(w.simp) ?? 9));
const vocab = new Set(wordLevel.keys());
/** Nivel HSK mínimo necesario para leer la frase (99 si contiene palabras fuera de HSK 1–3). */
const sentenceLevel = (s: string) =>
  Math.max(0, ...segment(s, vocab).filter((t) => isHan(t.text)).map((t) => wordLevel.get(t.text) ?? 99));
const pairTokens = pairs.map((p) => ({ ...p, level: sentenceLevel(p.zh), tokens: new Set(segment(p.zh, vocab).map((t) => t.text)) }));

for (const w of words)
  for (const e of w.examples)
    if (e.source === 'claude' && sentenceLevel(e.zh) > w.level)
      problems.push(`Ejemplo redactado de ${w.id} usa vocabulario de nivel superior: ${e.zh}`);

let tatoebaUsed = 0;
for (const w of words) {
  const need = 3 - w.examples.length;
  if (need <= 0) continue;
  const picked = pairTokens
    .filter((p) => p.level <= w.level && p.tokens.has(w.simp) && [...p.zh].length >= 4 && [...p.zh].length <= 18)
    .sort((a, b) => [...a.zh].length - [...b.zh].length)
    .slice(0, need);
  for (const p of picked) {
    w.examples.push({
      zh: p.zh,
      pinyin: sentencePinyin(p.zh),
      es: p.es,
      source: 'tatoeba',
      ref: p.id,
      review: 'pending',
    });
    tatoebaUsed++;
  }
}

// ───────────────────────── frases segmentadas ─────────────────────────
// Nombres propios permitidos en frases (no son vocabulario HSK; nunca son objetivo de un ejercicio).
const PROPER: Record<string, [string, string]> = {
  西班牙: ['Xībānyá', 'España'],
  墨西哥: ['Mòxīgē', 'México'],
  上海: ['Shànghǎi', 'Shanghái'],
  北京: ['Běijīng', 'Pekín'],
  王明: ['Wáng Míng', 'Wang Ming (nombre)'],
  李: ['Lǐ', 'Li (apellido)'],
  李大: ['Lǐ Dà', 'Li Da (nombre)'],
  李安: ['Lǐ Ān', 'Li An (nombre)'],
  安娜: ['Ānnà', 'Ana (nombre)'],
  小白: ['Xiǎobái', 'Xiaobai (nombre de mascota)'],
  除夕: ['chúxī', 'Nochevieja del calendario chino'],
};
const wordsBySimp = new Map<string, Word[]>();
for (const w of words) {
  if (!wordsBySimp.has(w.simp)) wordsBySimp.set(w.simp, []);
  wordsBySimp.get(w.simp)!.push(w);
}
const tokenDict = new Set([...vocab, ...Object.keys(PROPER)]);

/** Segmenta una frase en palabras HSK con su pinyin (oficial si es palabra del temario). */
function tokenize(zh: string): { tokens: SentenceToken[]; unknown: string[]; level: number } {
  const charPy = pinyinPro(zh, { type: 'array' });
  const tokens: SentenceToken[] = [];
  const unknown: string[] = [];
  let level = 1;
  let i = 0;
  for (const { text } of segment(zh, tokenDict)) {
    const n = [...text].length;
    const py = charPy.slice(i, i + n);
    i += n;
    if (!isHan(text[0])) {
      tokens.push({ t: text, p: '' });
      continue;
    }
    if (PROPER[text]) {
      tokens.push({ t: text, p: PROPER[text][0], g: PROPER[text][1] });
      continue;
    }
    const cands = wordsBySimp.get(text);
    if (!cands) {
      unknown.push(text);
      tokens.push({ t: text, p: py.join('') });
      level = 99;
      continue;
    }
    // homógrafos (得 de/dé/děi): el que coincide con la lectura en contexto; si no, el de menor nivel
    const ctx = plainKey(py.join(''));
    const w = cands.find((c) => plainKey(c.syllables.join('')) === ctx) ?? [...cands].sort((a, b) => a.level - b.level)[0];
    tokens.push({ t: text, p: w.syllables.join(''), w: w.id });
    level = Math.max(level, w.level);
  }
  return { tokens, unknown, level };
}

for (const w of words) for (const e of w.examples) e.tokens = tokenize(e.zh).tokens;

type AuthoredPhrases = Record<string, [string, string][]>;
const phrases: Phrase[] = [];
for (const [tema, list] of Object.entries(readAuthored<AuthoredPhrases>('phrases.json', {}))) {
  list.forEach(([zh, es], i) => {
    const { tokens, unknown, level } = tokenize(zh);
    if (unknown.length) {
      problems.push(`Frase útil fuera del HSK 1–3 («${unknown.join('», «')}»): ${zh}`);
      return;
    }
    const pinyin = tokens
      .map((t) => t.p || t.t)
      .join(' ')
      .replace(/ ([，。？！、：；])/g, '$1');
    const slug = tema.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z]+/g, '-');
    phrases.push({ id: `${slug}-${i + 1}`, zh, es, tema, level: level as HskLevel, tokens, pinyin });
  });
}

// ───────────────────────── lecturas graduadas ─────────────────────────
type AuthoredReading = Omit<Reading, 'paragraphs' | 'words' | 'length'> & { paragraphs: [string, string][] };
const readings: Reading[] = [];
const wordIndex = new Map(words.map((w) => [w.id, w]));
for (const r of readAuthored<AuthoredReading[]>('readings.json', [])) {
  const paragraphs = r.paragraphs.map(([zh, es]) => ({ zh, es, ...tokenize(zh) }));
  const unknown = [...new Set(paragraphs.flatMap((p) => p.unknown))];
  const level = Math.max(...paragraphs.map((p) => p.level));
  if (unknown.length) problems.push(`Lectura ${r.id}: palabras fuera del HSK 1–3: ${unknown.join(' ')}`);
  else if (level > r.level) {
    const above = paragraphs.flatMap((p) => p.tokens).filter((t) => t.w && wordIndex.get(t.w)!.level > r.level).map((t) => t.t);
    problems.push(`Lectura ${r.id} (HSK${r.level}) usa vocabulario de nivel superior: ${[...new Set(above)].join(' ')}`);
  }
  if (r.questions.some((q) => q.answer < 0 || q.answer >= q.options.length)) problems.push(`Lectura ${r.id}: respuesta fuera de rango`);
  readings.push({
    ...r,
    paragraphs: paragraphs.map(({ zh, es, tokens }) => ({ zh, es, tokens })),
    words: [...new Set(paragraphs.flatMap((p) => p.tokens).filter((t) => t.w).map((t) => t.w!))],
    length: paragraphs.reduce((a, p) => a + [...p.zh].filter(isHan).length, 0),
  });
}

// ───────────────────────── caracteres ─────────────────────────
const strokesDir = dirname(require.resolve('hanzi-writer-data/我.json'));
const charList = [...recogLevel.keys()];
const chars: Char[] = charList.map((ch) => {
  const m = mmah.get(ch);
  const inWords = words.filter((w) => w.chars.includes(ch));
  // lecturas usadas en el vocabulario HSK (con tono), ordenadas por uso
  const useCount = new Map<string, number>();
  const standalone = new Set<string>();
  for (const w of inWords) {
    const s = w.syllables[w.chars.indexOf(ch)];
    if (!s || s === 'r') continue;
    useCount.set(s, (useCount.get(s) ?? 0) + 1);
    if (w.chars.length === 1) standalone.add(s);
  }
  const citation = m?.pinyin ?? [];
  const used = [...useCount.entries()].sort((a, b) => b[1] - a[1]).map(([s]) => s);
  // Las formas con tono neutro o con sandhi (不 bú, 一 yì) se reducen a la forma de cita,
  // salvo partículas que son palabra por sí solas (得 de).
  const key = (s: string) => toneless(toNumbered(s));
  const readings = [
    ...new Set(
      used.map((u) => {
        if (citation.includes(u) || (toneOf(u) === 5 && standalone.has(u))) return u;
        const cit = citation.find((c) => key(c) === key(u));
        return cit && (toneOf(u) === 5 || ch === '不' || ch === '一') ? cit : u;
      }),
    ),
  ];
  if (!readings.length && citation.length) readings.push(citation[0]);
  let strokes = 0;
  const strokeFile = join(strokesDir, `${ch}.json`);
  if (existsSync(strokeFile)) strokes = readJson<{ strokes: string[] }>(strokeFile).strokes.length;
  else problems.push(`Sin datos de trazos: ${ch}`);
  const ced = (cedict.get(ch) ?? []).filter((e) => !e.proper);
  const en = m?.definition
    ? m.definition.split(/;\s*/).slice(0, 5)
    : [...new Set(ced.flatMap((e) => e.defs).filter((d) => !isNoiseDef(d)))].slice(0, 5);
  const decomposition = m?.decomposition ?? '';
  return {
    char: ch,
    trad: ced[0]?.trad ?? ch,
    pinyin: readings,
    es: esChars[ch]?.es ?? [],
    en,
    radical: m?.radical ?? '',
    decomposition,
    components: [...new Set([...decomposition].filter((c) => isHan(c) && c !== ch))],
    strokes,
    freqRank: charRank.get(ch) ?? 9999,
    level: recogLevel.get(ch)!,
    handwritingLevel: writeLevel.get(ch) ?? null,
    words: inWords.map((w) => w.id),
    etymology: m?.etymology?.hint,
    review: esChars[ch]?.review ?? 'pending',
  };
});

// ───────────────────────── gramática ─────────────────────────
const grammar: GrammarPoint[] = officialGrammar.map((g, i) => {
  const id = `g${hskLevelOf(g.examLevelId)}-${String(i + 1).padStart(3, '0')}`;
  return {
    id,
    level: hskLevelOf(g.examLevelId),
    type: g.grammarType,
    category: g.categoryType,
    detail: g.grammarDetail,
    content: g.content,
    officialExamples: g.cases.split(/\r?\n/).map((s) => s.trim()).filter(Boolean),
    title: esGrammar[id]?.title,
    es: esGrammar[id]?.es,
    review: 'pending',
  };
});

// ───────────────────────── validación, salida y reporte ─────────────────────────
const { errors, gaps } = validateAll(words, chars);
const lock = readJson<{ fetchedAt: string }>(join(ROOT, 'data/sources.lock.json'));
const count = (lvl: number) => words.filter((w) => w.level === lvl).length;
const meta: ContentMeta = {
  version: `hsk2025-${lock.fetchedAt.slice(0, 10)}`,
  generatedAt: new Date().toISOString(),
  syllabus: 'HSK 考试大纲 (CLEC, nov. 2025; en vigor desde jul. 2026) — chinesetest.cn',
  counts: {
    words1: count(1), words2: count(2), words3: count(3),
    chars1: chars.filter((c) => c.level === 1).length,
    chars2: chars.filter((c) => c.level === 2).length,
    chars3: chars.filter((c) => c.level === 3).length,
    grammar: grammar.length,
    phrases: phrases.length,
  },
  sources: [
    { name: 'Temario oficial HSK 3.0 (CLEC)', url: 'https://www.chinesetest.cn/', license: '© CLEC — lista oficial', use: 'Palabras, niveles, pinyin, categoría, caracteres, gramática' },
    { name: 'CC-CEDICT', url: 'https://www.mdbg.net/chinese/dictionary?page=cc-cedict', license: 'CC BY-SA 4.0', use: 'Significados en inglés, tradicional' },
    { name: 'Make Me a Hanzi', url: 'https://github.com/skishore/makemeahanzi', license: 'Arphic Public License / LGPL', use: 'Radical, descomposición, etimología' },
    { name: 'Hanzi Writer data', url: 'https://github.com/chanind/hanzi-writer-data', license: 'Arphic Public License', use: 'Trazos y orden de trazos' },
    { name: 'Tatoeba', url: 'https://tatoeba.org/', license: 'CC BY 2.0 FR', use: 'Oraciones de ejemplo chino–español; frecuencia de caracteres' },
    { name: 'complete-hsk-vocabulary', url: 'https://github.com/drkameleon/complete-hsk-vocabulary', license: 'MIT', use: 'Frecuencia de palabras' },
    { name: 'pinyin-pro', url: 'https://github.com/zh-lx/pinyin-pro', license: 'MIT', use: 'Pinyin de oraciones y alineación' },
  ],
};

// ───────────────────────── estabilidad de ids ─────────────────────────
// El progreso de los usuarios está enganchado a estos ids (w:我们, c:我, frase, lectura).
// Si uno que ya existía desaparece, el progreso guardado quedaría huérfano: se bloquea el build
// salvo que se autorice expresamente (ALLOW_ID_CHANGES=1) junto con una migración.
function previousIds(file: string, key: (x: Record<string, unknown>) => string): string[] {
  const p = join(OUT, file);
  return existsSync(p) ? readJson<Record<string, unknown>[]>(p).map(key) : [];
}
const idChecks: [string, string[], Set<string>][] = [
  ['palabras', previousIds('words.json', (x) => x.id as string), new Set(words.map((w) => w.id))],
  ['caracteres', previousIds('chars.json', (x) => x.char as string), new Set(chars.map((c) => c.char))],
  ['frases útiles', previousIds('phrases.json', (x) => x.id as string), new Set(phrases.map((p) => p.id))],
  ['lecturas', previousIds('readings.json', (x) => x.id as string), new Set(readings.map((r) => r.id))],
];
for (const [label, before, now] of idChecks) {
  const lost = before.filter((id) => !now.has(id));
  if (lost.length && process.env.ALLOW_ID_CHANGES !== '1')
    errors.push(`Desaparecen ids de ${label} con progreso posible (${lost.slice(0, 10).join(', ')}${lost.length > 10 ? '…' : ''}). Haz una migración y usa ALLOW_ID_CHANGES=1.`);
}

mkdirSync(OUT, { recursive: true });
// Un registro por línea: diffs legibles en git.
// Con errores no se sobrescribe nada: el contenido publicado sigue siendo el último válido.
const write = (name: string, data: unknown) =>
  errors.length ||
  writeFileSync(
    join(OUT, name),
    Array.isArray(data)
      ? `[\n${data.map((d) => JSON.stringify(d)).join(',\n')}\n]\n`
      : JSON.stringify(data, null, 2) + '\n',
  );
write('words.json', words);
write('chars.json', chars);
write('grammar.json', grammar);
if (new Set(phrases.map((p) => p.id)).size !== phrases.length) errors.push('Ids de frases útiles duplicados');
write('phrases.json', phrases);
write('readings.json', readings);
write('meta.json', meta);

mkdirSync(STROKES_OUT, { recursive: true });
for (const c of chars) {
  const f = join(strokesDir, `${c.char}.json`);
  if (existsSync(f)) copyFileSync(f, join(STROKES_OUT, `${c.char}.json`));
}
copyFileSync(join(strokesDir, 'ARPHICPL.TXT'), join(STROKES_OUT, 'ARPHICPL.TXT'));

// ───────────────────────── tipografía (subconjunto) ─────────────────────────
// LXGW WenKai reducida a los caracteres que usa el contenido + pinyin + puntuación.
const glyphs = new Set<string>();
const addText = (t: string | undefined) => {
  for (const ch of t ?? '') glyphs.add(ch);
};
for (const w of words) {
  addText(w.simp);
  addText(w.trad);
  addText(w.pinyin);
  for (const e of w.examples) addText(e.zh + e.pinyin);
}
for (const c of chars) addText(c.char + c.trad + c.pinyin.join('') + c.components.join('') + c.radical);
for (const g of grammar) addText(g.content + g.officialExamples.join(''));
for (const ph of phrases) addText(ph.zh + ph.pinyin);
for (const r of readings) addText(r.titleZh + r.paragraphs.map((p) => p.zh + p.tokens.map((t) => t.p).join('')).join(''));
addText(' abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜüńňǹ’\'-·…');
addText('，。？！、：；“”‘’（）《》—～·');
const fontSrc = join(RAW, 'LXGWWenKai-Regular.ttf');
if (existsSync(fontSrc)) {
  const { default: subsetFont } = await import('subset-font');
  const woff2 = await subsetFont(readFileSync(fontSrc), [...glyphs].join(''), { targetFormat: 'woff2' });
  mkdirSync(join(ROOT, 'public/fonts'), { recursive: true });
  writeFileSync(join(ROOT, 'public/fonts/wenkai-hsk.woff2'), woff2);
  copyFileSync(join(RAW, 'LXGWWenKai-OFL.txt'), join(ROOT, 'public/fonts/LXGWWenKai-OFL.txt'));
  console.log(`Tipografía: ${glyphs.size} glifos → ${(woff2.length / 1024).toFixed(0)} KB`);
} else problems.push('No está data/raw/LXGWWenKai-Regular.ttf: no se regeneró la tipografía');

const report = [
  '# Reporte de huecos de datos',
  '',
  `Generado: ${meta.generatedAt} · versión \`${meta.version}\``,
  '',
  '## Recuentos (temario oficial)',
  '',
  '| Nivel | Palabras nuevas | Caracteres nuevos | Escritura (书写字) |',
  '|---|---|---|---|',
  ...[1, 2, 3].map((l) => `| HSK ${l} | ${count(l)} | ${meta.counts[`chars${l}`]} | ${chars.filter((c) => c.handwritingLevel === l).length} |`),
  '',
  `Puntos de gramática HSK 1–3: ${grammar.length}. Ejemplos de Tatoeba asignados: ${tatoebaUsed}. Frases útiles: ${phrases.length} (HSK1 ${phrases.filter((p) => p.level === 1).length} · HSK2 ${phrases.filter((p) => p.level === 2).length} · HSK3 ${phrases.filter((p) => p.level === 3).length}).`,
  '',
  `## Errores bloqueantes (${errors.length})`,
  '',
  ...(errors.length ? errors.map((e) => `- ${e}`) : ['Ninguno.']),
  '',
  `## Avisos del pipeline (${problems.length})`,
  '',
  ...(problems.length ? problems.map((e) => `- ${e}`) : ['Ninguno.']),
  '',
  ...Object.entries(gaps).flatMap(([k, v]) => [`## ${k} (${v.length})`, '', v.length ? v.join(' ') : 'Ninguno.', '']),
].join('\n');
mkdirSync(join(ROOT, 'reports'), { recursive: true });
writeFileSync(join(ROOT, 'reports/data-gaps.md'), report);

console.log(`Palabras ${words.length} (${count(1)}/${count(2)}/${count(3)}) · caracteres ${chars.length} · gramática ${grammar.length}`);
console.log(`Ejemplos Tatoeba: ${tatoebaUsed} · avisos: ${problems.length} · errores: ${errors.length}`);
for (const [k, v] of Object.entries(gaps)) console.log(`  ${k}: ${v.length}`);
if (errors.length) {
  console.error(errors.slice(0, 20).join('\n'));
  process.exitCode = 1;
}
