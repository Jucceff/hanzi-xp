import { describe, expect, it } from 'vitest';
import { blankState, type ReviewLogEntry, type SkillState } from '../core/engine';
import { DEFAULT_SETTINGS } from '../db/db';
import { dailyFromLogs, mergeLogs, mergeSettings, mergeSnapshots, mergeStates } from './merge';

const T = Date.parse('2026-11-01T10:00:00');
const log = (id: string, p: Partial<ReviewLogEntry> = {}): ReviewLogEntry => ({
  id, ts: T, itemId: 'w:我', skill: 'recognition', exercise: 'flashcard', grade: 3, correct: true,
  xpDelta: 6, direct: true, sessionId: 's', deviceId: 'd', ...p,
});
const st = (itemId: SkillState['itemId'], updatedAt: number, xp: number): SkillState => ({ ...blankState(itemId, 'recognition', updatedAt), xp });

describe('fusión', () => {
  it('une los registros sin duplicar', () => {
    expect(mergeLogs([log('a'), log('b')], [log('b'), log('c')]).map((l) => l.id)).toEqual(['a', 'b', 'c']);
  });
  it('en los estados gana el más reciente', () => {
    const m = mergeStates([st('w:我', 1, 10), st('w:你', 5, 3)], [st('w:我', 2, 20), st('w:你', 4, 99)]);
    expect(Object.fromEntries(m.map((s) => [s.itemId, s.xp]))).toEqual({ 'w:我': 20, 'w:你': 3 });
  });
  it('en los ajustes gana el más reciente', () => {
    const a = { ...DEFAULT_SETTINGS, dailyGoalXp: 60, updatedAt: 1 };
    const b = { ...DEFAULT_SETTINGS, dailyGoalXp: 90, updatedAt: 2 };
    expect(mergeSettings(a, b).dailyGoalXp).toBe(90);
    expect(mergeSettings(b, a).dailyGoalXp).toBe(90);
  });
  it('recalcula el día: XP positivo, repasos directos y palabras nuevas', () => {
    const [d] = dailyFromLogs([
      log('a'),
      log('b', { itemId: 'c:我', direct: false, xpDelta: 2 }),
      log('c', { ts: T + 1000, correct: false, grade: 1, xpDelta: -2 }),
    ]);
    expect(d).toMatchObject({ xp: 8, reviews: 2, correct: 1, newItems: 1 });
  });
  it('indica qué escribir en local y si hay que subir', () => {
    const local = { states: [st('w:我', 1, 10)], logs: [log('a')], settings: DEFAULT_SETTINGS };
    const remote = { states: [st('w:我', 2, 20)], logs: [log('a'), log('b', { ts: T + 5 })], settings: DEFAULT_SETTINGS };
    const r = mergeSnapshots(local, remote);
    expect(r.localChanges.logs.map((l) => l.id)).toEqual(['b']);
    expect(r.localChanges.states.map((s) => s.xp)).toEqual([20]);
    expect(r.remoteOutdated).toBe(false);
    expect(mergeSnapshots(remote, local).remoteOutdated).toBe(true); // al "remoto" (el local viejo) le falta 'b'
    expect(mergeSnapshots(remote, structuredClone(remote)).remoteOutdated).toBe(false); // copias iguales
    expect(mergeSnapshots({ ...local, logs: [log('z')] }, remote).remoteOutdated).toBe(true);
  });
});
