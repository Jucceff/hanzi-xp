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

export function xpDelta(exercise: Exercise, grade: Grade): number {
  if (grade === 1) return -FAIL_PENALTY;
  return Math.round(BASE_XP[exercise] * GRADE_MULTIPLIER[grade]);
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
