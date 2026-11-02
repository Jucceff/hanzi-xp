import { describe, expect, it } from 'vitest';
import { exposureRetention, itemEffectiveXp, levelFromXp, levelProgress, stageOf } from './mastery';

describe('niveles', () => {
  it('umbrales', () => {
    expect(levelFromXp(0)).toBe(0);
    expect(levelFromXp(9)).toBe(0);
    expect(levelFromXp(10)).toBe(1);
    expect(levelFromXp(829)).toBe(9);
    expect(levelFromXp(5000)).toBe(10);
  });
  it('nombres de etapa', () => {
    expect([0, 1, 3, 6, 9, 10].map(stageOf)).toEqual(['nuevo', 'visto', 'aprendiendo', 'familiar', 'dominado', 'dominado']);
  });
  it('progreso dentro del nivel', () => {
    expect(levelProgress(20)).toBeCloseTo(0.5);
    expect(levelProgress(9999)).toBe(1);
  });
});

describe('decaimiento', () => {
  const DAY = 86_400_000;
  it('la retención baja con el tiempo y más despacio con más XP', () => {
    const now = 100 * DAY;
    const fresh = exposureRetention(20, now, now);
    const week = exposureRetention(20, now - 7 * DAY, now);
    const weekStrong = exposureRetention(400, now - 7 * DAY, now);
    expect(fresh).toBe(1);
    expect(week).toBeLessThan(0.9);
    expect(weekStrong).toBeGreaterThan(week);
  });
  it('dominio de palabra ignora la escritura; el de carácter la incluye', () => {
    const skills = { recognition: { xp: 100, retention: 1 } };
    expect(itemEffectiveXp('w', skills)).toBeCloseTo((100 * 0.3) / 0.85);
    expect(itemEffectiveXp('c', skills)).toBeCloseTo(30);
  });
});
