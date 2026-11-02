import { describe, expect, it } from 'vitest';
import { viewOf } from '../content';
import { blankState, type SkillState } from '../core/engine';
import { stripTones } from '../core/pinyin';
import { buildDailySession } from '../core/queue';
import type { FsrsCard } from '../core/scheduler';
import { minimalPairs, specFor } from './exercises';
import { buildToneDrill } from './plan';

const seeded = (seed = 1) => () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;

describe('pares mínimos', () => {
  it('买 mǎi y 卖 mài son pareja', () => {
    expect(minimalPairs(viewOf('w:买')!).map((v) => v.hanzi)).toContain('卖');
  });
  it('escuchar y elegir el hanzi ofrece primero la pareja de tonos', () => {
    const spec = specFor({ itemId: 'w:买', skill: 'listening', reason: 'due' }, { audio: true }, seeded(3));
    expect(spec.type).toBe('choice');
    if (spec.type !== 'choice') return;
    expect(spec.prompt).toBe('audio');
    expect(spec.options[spec.correct]).toBe('买');
    expect(spec.options).toContain('卖');
    expect(new Set(spec.options).size).toBe(4);
  });
  it('nunca ofrece homófonos al escuchar (他/她/它 suenan igual)', () => {
    for (let seed = 1; seed < 30; seed++) {
      const spec = specFor({ itemId: 'w:他', skill: 'listening', reason: 'due' }, { audio: true }, seeded(seed));
      if (spec.type !== 'choice') throw new Error('esperaba opción múltiple');
      expect(spec.options.filter((o) => ['他', '她', '它'].includes(o))).toEqual(['他']);
    }
  });
  it('sin audio no hay ejercicios de escucha', () => {
    const spec = specFor({ itemId: 'w:买', skill: 'pinyin', reason: 'drill' }, { audio: false }, seeded(5));
    expect(spec.type === 'choice' && spec.prompt).toBe('hanzi');
  });
  it('el ejercicio de tonos muestra el pinyin sin tonos y opciones con distintos tonos', () => {
    const spec = specFor({ itemId: 'w:你好', skill: 'pinyin', reason: 'drill' }, { audio: true }, seeded(7));
    if (spec.type !== 'choice') throw new Error('esperaba opción múltiple');
    expect(spec.prompt).toBe('audio-pinyin');
    expect(spec.toneless).toBe('nihao');
    expect(spec.options.every((o) => stripTones(o) === 'nihao')).toBe(true);
    expect(spec.options[spec.correct]).toBe('nǐhǎo');
  });
});

const NOW = new Date('2026-11-02T10:00:00');
const reviewed = (itemId: SkillState['itemId'], skill: SkillState['skill'], when: Date): SkillState => ({
  ...blankState(itemId, skill, when.getTime()),
  xp: 6,
  card: { lastReviewAt: when, dueAt: new Date(NOW.getTime() + 86_400_000) } as unknown as FsrsCard,
  due: NOW.getTime() + 86_400_000,
});

describe('desbloqueo de la escucha', () => {
  const base = { newOrder: [], now: NOW.getTime(), newLimit: 0, reviewLimit: 50, skills: ['recognition', 'pinyin', 'production', 'listening'] as const, retention: () => 0.9 };
  it('solo para palabras vistas otro día', () => {
    const states = [reviewed('w:茶', 'recognition', new Date('2026-11-01T09:00:00')), reviewed('w:书', 'recognition', new Date('2026-11-02T09:00:00'))];
    const q = buildDailySession({ ...base, states, unlock: { skills: ['listening'], limit: 10, before: new Date('2026-11-02T00:00:00').getTime() } });
    expect(q).toEqual([{ itemId: 'w:茶', skill: 'listening', reason: 'new' }]);
  });
  it('no se repite si ya tiene tarjeta de escucha', () => {
    const d = new Date('2026-11-01T09:00:00');
    const states = [reviewed('w:茶', 'recognition', d), reviewed('w:茶', 'listening', d)];
    const q = buildDailySession({ ...base, states, unlock: { skills: ['listening'], limit: 10, before: new Date('2026-11-02T00:00:00').getTime() } });
    expect(q.filter((x) => x.reason === 'new')).toEqual([]);
  });
});

describe('entrenamiento de tonos', () => {
  it('alterna escucha y tonos, prioriza lo practicado más flojo y completa con pares mínimos', () => {
    const states = [reviewed('w:是', 'pinyin', new Date('2026-11-01T09:00:00'))];
    const q = buildToneDrill(states, () => 1, [1], 6);
    expect(q[0]).toEqual({ itemId: 'w:是', skill: 'listening', reason: 'drill' });
    expect(q.map((x) => x.skill)).toEqual(['listening', 'pinyin', 'listening', 'pinyin', 'listening', 'pinyin']);
    expect(q.slice(1).every((x) => minimalPairs(viewOf(x.itemId)!).length > 0)).toBe(true);
  });
});
