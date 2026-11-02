import { describe, expect, it } from 'vitest';
import { addDays, daysToReady, streak, weekStart, xpInRange } from './stats';

describe('racha', () => {
  const days = [
    { date: '2026-10-29', xp: 10 },
    { date: '2026-10-30', xp: 5 },
    { date: '2026-10-31', xp: 20 },
  ];
  it('cuenta hasta ayer si hoy no se ha practicado', () => {
    expect(streak(days, '2026-11-01')).toBe(3);
  });
  it('incluye hoy', () => {
    expect(streak([...days, { date: '2026-11-01', xp: 3 }], '2026-11-01')).toBe(4);
  });
  it('se rompe con un día vacío', () => {
    expect(streak(days, '2026-11-02')).toBe(0);
  });
});

describe('fechas y periodos', () => {
  it('suma días cruzando meses', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
  });
  it('semana empieza el lunes', () => {
    expect(weekStart('2026-11-01')).toBe('2026-10-26'); // domingo → lunes anterior
  });
  it('XP en rango', () => {
    expect(xpInRange([{ date: '2026-10-30', xp: 5 }, { date: '2026-11-01', xp: 7 }], '2026-10-31', '2026-11-01')).toBe(7);
  });
});

describe('preparación para el examen', () => {
  it('estima días según el ritmo', () => {
    expect(daysToReady(300, 160, 28)).toBe(70);
    expect(daysToReady(300, 300, 0)).toBe(0);
    expect(daysToReady(300, 10, 0)).toBeNull();
  });
});
