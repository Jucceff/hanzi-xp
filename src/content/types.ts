// Tipos del contenido estático (generado por scripts/data/build.ts).
// Los usa tanto la app como el pipeline de datos.

export type HskLevel = 1 | 2 | 3;
/** 1–4 = tonos; 5 = neutro */
export type Tone = 1 | 2 | 3 | 4 | 5;
export type ReviewStatus = 'pending' | 'ok';

export interface Example {
  zh: string;
  pinyin: string;
  es: string;
  en?: string;
  source: 'tatoeba' | 'claude';
  /** id de la frase en Tatoeba */
  ref?: number;
  review: ReviewStatus;
}

export interface Word {
  /** id estable; incluye el índice de homógrafo oficial (p. ej. "点1") */
  id: string;
  simp: string;
  trad: string;
  /** pinyin oficial del temario (con marcas de tono) */
  pinyin: string;
  /** una sílaba por carácter, con marcas de tono */
  syllables: string[];
  /** pinyin numérico, sílabas separadas por espacio ("wo3 men5") */
  pinyinNum: string;
  tones: Tone[];
  /** categorías gramaticales oficiales (abreviatura china: 名, 动…) */
  pos: string[];
  level: HskLevel;
  /** niveles en los que el temario añade acepciones (p. ej. 好: [2, 4]) */
  senseLevels: number[];
  /** rango de frecuencia (1 = más frecuente); null si no hay dato */
  freqRank: number | null;
  es: string[];
  en: string[];
  chars: string[];
  examples: Example[];
  review: ReviewStatus;
}

export interface Char {
  char: string;
  trad: string;
  /** lecturas con marcas de tono; la primera es la principal en HSK 1–3 */
  pinyin: string[];
  es: string[];
  en: string[];
  radical: string;
  /** descripción IDS de Make Me a Hanzi (⿰亻尔…) */
  decomposition: string;
  components: string[];
  strokes: number;
  /** rango de frecuencia del carácter en el corpus chino de Tatoeba */
  freqRank: number;
  /** nivel de reconocimiento oficial (认读字) */
  level: HskLevel;
  /** nivel oficial de escritura a mano (书写字), si aplica */
  handwritingLevel: HskLevel | null;
  /** ids de palabras HSK 1–3 donde aparece */
  words: string[];
  etymology?: string;
  review: ReviewStatus;
}

export interface GrammarPoint {
  id: string;
  level: HskLevel;
  /** campos oficiales */
  type: string;
  category: string;
  detail: string;
  content: string;
  officialExamples: string[];
  /** capa redactada en español */
  title?: string;
  es?: string;
  review: ReviewStatus;
}

export interface ContentMeta {
  version: string;
  generatedAt: string;
  syllabus: string;
  counts: Record<string, number>;
  sources: { name: string; url: string; license: string; use: string }[];
}
