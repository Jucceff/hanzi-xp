import { describe, expect, it } from 'vitest';
import { applyDirect, applyPropagated, emptyXpState, propagatedDelta, spacingMultiplier, xpDelta } from './xp';

describe('xpDelta', () => {
  it('escala por ejercicio y valoración', () => {
    expect(xpDelta('flashcard', 3)).toBe(6);
    expect(xpDelta('flashcard', 4)).toBe(7);
    expect(xpDelta('flashcard', 2)).toBe(4);
    expect(xpDelta('writing', 3)).toBe(12);
  });
  it('un fallo resta 2 (sin importar el tiempo transcurrido)', () => {
    expect(xpDelta('production', 1)).toBe(-2);
    expect(xpDelta('production', 1, 30)).toBe(-2);
  });
  it('acertar tras más días da más XP (repaso espaciado)', () => {
    expect(spacingMultiplier(0)).toBe(1);
    expect(spacingMultiplier(1)).toBeCloseTo(1.5);
    expect(spacingMultiplier(3)).toBeCloseTo(2);
    expect(spacingMultiplier(365)).toBe(3);
    expect(xpDelta('flashcard', 3, 3)).toBe(12);
  });
});

describe('applyDirect', () => {
  it('suma XP y cuenta aciertos', () => {
    const s = applyDirect(emptyXpState(), 6, true);
    expect(s).toMatchObject({ xp: 6, peakXp: 6, correct: 1, wrong: 0, weak: false, streakCorrect: 1 });
  });
  it('fallar resta sin bajar de 0 y marca como débil', () => {
    const s = applyDirect({ ...emptyXpState(), xp: 1, peakXp: 1 }, -2, false);
    expect(s).toMatchObject({ xp: 0, peakXp: 1, weak: true, wrong: 1, streakCorrect: 0 });
  });
  it('deja de ser débil tras 2 aciertos seguidos', () => {
    let s = applyDirect({ ...emptyXpState(), xp: 20, peakXp: 20 }, -2, false);
    s = applyDirect(s, 6, true);
    expect(s.weak).toBe(true);
    s = applyDirect(s, 6, true);
    expect(s.weak).toBe(false);
  });
});

describe('propagación a caracteres', () => {
  it('reparte el 40 % (mínimo 1)', () => {
    expect(propagatedDelta(10, true)).toBe(4);
    expect(propagatedDelta(1, true)).toBe(1);
  });
  it('un fallo resta 1 pero no marca débil', () => {
    expect(propagatedDelta(-2, false)).toBe(-1);
    const s = applyPropagated({ ...emptyXpState(), xp: 5, peakXp: 5 }, -1);
    expect(s).toMatchObject({ xp: 4, weak: false, wrong: 0 });
  });
});
