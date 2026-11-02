import { describe, expect, it } from 'vitest';
import { blankState, type SkillState } from './engine';
import { buildDailySession, buildWeaknessSession, interleave } from './queue';
import type { FsrsCard } from './scheduler';
import type { ItemId, Skill } from './skills';

const NOW = Date.parse('2026-11-01T10:00:00Z');
function st(itemId: ItemId, skill: Skill, p: Partial<SkillState> = {}): SkillState {
  return { ...blankState(itemId, skill, NOW), card: {} as FsrsCard, due: NOW - 1, xp: 10, ...p };
}

describe('buildDailySession', () => {
  const base = { now: NOW, newLimit: 2, reviewLimit: 50, skills: ['recognition', 'pinyin', 'production'] as Skill[] };
  it('vencidas primero (débiles y menor retención), luego nuevas intercaladas', () => {
    const states = [
      st('w:a', 'recognition', { xp: 50 }),
      st('w:b', 'recognition', { weak: true }),
      st('w:c', 'pinyin', { due: NOW + 99999 }), // no vence
    ];
    const q = buildDailySession({
      ...base,
      states,
      newOrder: ['w:a', 'w:x', 'w:y', 'w:z'],
      retention: (s) => (s.xp > 20 ? 0.9 : 0.5),
    });
    expect(q[0]).toEqual({ itemId: 'w:b', skill: 'recognition', reason: 'weak' });
    expect(q[1].itemId).toBe('w:a');
    const fresh = q.filter((x) => x.reason === 'new');
    expect(new Set(fresh.map((x) => x.itemId))).toEqual(new Set(['w:x', 'w:y'])); // w:a ya practicada; límite 2
    expect(fresh.map((x) => x.skill)).toEqual(['recognition', 'recognition', 'pinyin', 'pinyin', 'production', 'production']);
  });
  it('respeta las habilidades permitidas', () => {
    const q = buildDailySession({ ...base, skills: ['recognition'], states: [st('w:a', 'pinyin')], newOrder: [], retention: () => 0.5 });
    expect(q).toEqual([]);
  });
});

describe('interleave', () => {
  it('inserta cada n', () => {
    expect(interleave<number | string>([1, 2, 3, 4], ['a', 'b', 'c'], 2)).toEqual([1, 2, 'a', 3, 4, 'b', 'c']);
  });
});

describe('buildWeaknessSession', () => {
  it('ordena por débil y luego por menor dominio', () => {
    const states = [
      st('w:fuerte', 'recognition', { xp: 500 }),
      st('w:flojo', 'recognition', { xp: 20 }),
      st('w:debil', 'recognition', { xp: 300, weak: true }),
      { ...blankState('c:x', 'recognition', NOW), xp: 1 }, // sin tarjeta: no practicado directamente
    ];
    const q = buildWeaknessSession(states, () => 1, { limit: 2, skills: ['recognition'] });
    expect(q.map((x) => x.itemId)).toEqual(['w:debil', 'w:flojo']);
  });
});
