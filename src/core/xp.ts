// Reglas de XP: cuánto suma un acierto, cuánto resta un fallo y cuándo algo es "débil".

export type Exercise =
  | 'choice' // opción múltiple
  | 'flashcard'
  | 'tone'
  | 'listening'
  | 'production'
  | 'writing'
  | 'sentence'
  | 'reading';

/** Valoración tipo FSRS: 1 Otra vez · 2 Difícil · 3 Bien · 4 Fácil */
export type Grade = 1 | 2 | 3 | 4;

export const BASE_XP: Record<Exercise, number> = {
  choice: 4,
  flashcard: 6,
  tone: 6,
  listening: 7,
  production: 10,
  writing: 12,
  sentence: 8,
  reading: 1,
};

export const GRADE_MULTIPLIER: Record<Grade, number> = { 1: 0, 2: 0.6, 3: 1, 4: 1.2 };

export const FAIL_PENALTY = 2;
/** Aciertos seguidos necesarios para dejar de ser "débil". */
export const WEAK_RECOVERY_STREAK = 2;
/** Parte del XP de una palabra que reciben sus caracteres. */
export const CHAR_SHARE = 0.4;
export const CHAR_FAIL_PENALTY = 1;

/**
 * Bonus por repaso espaciado: acertar algo que no veías desde hace días vale más
 * que acertarlo dos veces seguidas (premia la memoria a largo plazo, no el atracón).
 * 0 días ×1 · 1 día ×1.5 · 3 días ×2 · 7 días ×2.5 · ≥15 días ×3
 */
export function spacingMultiplier(elapsedDays: number): number {
  if (elapsedDays <= 0) return 1;
  return 1 + Math.min(2, Math.log2(1 + elapsedDays) / 2);
}

export function xpDelta(exercise: Exercise, grade: Grade, elapsedDays = 0): number {
  if (grade === 1) return -FAIL_PENALTY;
  return Math.round(BASE_XP[exercise] * GRADE_MULTIPLIER[grade] * spacingMultiplier(elapsedDays));
}

export interface XpState {
  xp: number;
  peakXp: number;
  weak: boolean;
  streakCorrect: number;
  correct: number;
  wrong: number;
}

export const emptyXpState = (): XpState => ({ xp: 0, peakXp: 0, weak: false, streakCorrect: 0, correct: 0, wrong: 0 });

/** Aplica un resultado directo (el usuario practicó este ítem en esta habilidad). */
export function applyDirect(s: XpState, delta: number, correct: boolean): XpState {
  const xp = Math.max(0, s.xp + delta);
  const streakCorrect = correct ? s.streakCorrect + 1 : 0;
  return {
    xp,
    peakXp: Math.max(s.peakXp, xp),
    weak: correct ? s.weak && streakCorrect < WEAK_RECOVERY_STREAK : true,
    streakCorrect,
    correct: s.correct + (correct ? 1 : 0),
    wrong: s.wrong + (correct ? 0 : 1),
  };
}

/**
 * Aplica XP propagado (desde una palabra a sus caracteres): suma o resta,
 * pero nunca marca como débil ni cuenta como acierto/fallo propio.
 */
export function applyPropagated(s: XpState, delta: number): XpState {
  const xp = Math.max(0, s.xp + delta);
  return { ...s, xp, peakXp: Math.max(s.peakXp, xp) };
}

/** XP que recibe cada carácter cuando se practica una palabra. */
export function propagatedDelta(wordDelta: number, correct: boolean): number {
  if (!correct) return -CHAR_FAIL_PENALTY;
  return Math.max(1, Math.round(wordDelta * CHAR_SHARE));
}

export interface WritingResult {
  /** errores de trazo contados por el quiz */
  mistakes: number;
  /** nº de trazos del carácter */
  strokes: number;
  /** escribió con el contorno visible (modo guiado, primera vez) */
  guided: boolean;
  /** pidió una pista o pulsó "no lo sé" */
  gaveUp: boolean;
}

/**
 * Valoración de un ejercicio de escritura a partir de los errores, relativa al
 * número de trazos (3 errores en 我 no es lo mismo que en 谢).
 * Con contorno visible como mucho "Bien": copiar no es recordar.
 */
export function writingGrade(r: WritingResult): Grade {
  if (r.gaveUp) return 1;
  const rate = r.mistakes / Math.max(1, r.strokes);
  let g: Grade = r.mistakes === 0 ? 4 : rate <= 0.25 ? 3 : rate <= 0.6 ? 2 : 1;
  if (r.guided && g > 3) g = 3;
  return g;
}
