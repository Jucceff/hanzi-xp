import { beforeAll, describe, expect, it } from 'vitest';
import { computeExposure, computeReview, retentionOf, type SkillState } from './engine';
import { getScheduler, type Scheduler } from './scheduler';
import type { ItemId, Skill } from './skills';

let scheduler: Scheduler;
beforeAll(async () => {
  scheduler = await getScheduler();
});

function makeCtx(now: Date, store = new Map<string, SkillState>()) {
  let n = 0;
  return {
    store,
    ctx: {
      now,
      deviceId: 'test',
      scheduler,
      get: (id: ItemId, skill: Skill) => store.get(`${id}|${skill}`),
      uuid: () => `id${n++}`,
    },
  };
}
const save = (store: Map<string, SkillState>, states: SkillState[]) =>
  states.forEach((s) => store.set(`${s.itemId}|${s.skill}`, s));

describe('computeReview', () => {
  it('practicar 我们 sube 我 y 们', () => {
    const { ctx } = makeCtx(new Date('2026-11-01T10:00:00Z'));
    const out = computeReview(
      { itemId: 'w:我们', skill: 'recognition', exercise: 'flashcard', grade: 3, chars: ['我', '们'], sessionId: 's' },
      ctx,
    );
    const byId = Object.fromEntries(out.states.map((s) => [s.itemId, s]));
    expect(byId['w:我们'].xp).toBe(6);
    expect(byId['c:我'].xp).toBe(2);
    expect(byId['c:们'].xp).toBe(2);
    expect(byId['w:我们'].card).toBeDefined();
    expect(byId['c:我'].card).toBeUndefined(); // propagado: sin tarjeta propia
    expect(out.xpGained).toBe(10);
    expect(out.logs.filter((l) => l.direct)).toHaveLength(1);
    expect(out.logs.find((l) => l.itemId === 'c:我')?.via).toBe('w:我们');
  });

  it('un carácter repetido en la palabra cuenta una vez (谢谢)', () => {
    const { ctx } = makeCtx(new Date('2026-11-01T10:00:00Z'));
    const out = computeReview(
      { itemId: 'w:谢谢', skill: 'recognition', exercise: 'flashcard', grade: 3, chars: ['谢', '谢'], sessionId: 's' },
      ctx,
    );
    expect(out.states).toHaveLength(2);
  });

  it('fallar resta, marca débil y programa el repaso pronto', () => {
    const now = new Date('2026-11-01T10:00:00Z');
    const { ctx, store } = makeCtx(now);
    save(store, computeReview({ itemId: 'w:茶', skill: 'pinyin', exercise: 'choice', grade: 3, chars: ['茶'], sessionId: 's' }, ctx).states);
    const later = { ...ctx, now: new Date('2026-11-05T10:00:00Z') };
    const out = computeReview({ itemId: 'w:茶', skill: 'pinyin', exercise: 'choice', grade: 1, chars: ['茶'], sessionId: 's' }, later);
    const word = out.states[0];
    expect(word.xp).toBe(2); // 4 - 2
    expect(word.weak).toBe(true);
    expect(word.due! - later.now.getTime()).toBeLessThan(86_400_000);
    expect(out.states[1].weak).toBe(false); // el carácter no se marca débil
  });

  it('acertar aleja el siguiente repaso', () => {
    const now = new Date('2026-11-01T10:00:00Z');
    const { ctx } = makeCtx(now);
    const out = computeReview({ itemId: 'w:书', skill: 'recognition', exercise: 'flashcard', grade: 4, sessionId: 's' }, ctx);
    expect(out.states[0].due! - now.getTime()).toBeGreaterThan(86_400_000);
  });
});

describe('retención', () => {
  it('decae si no se repasa', () => {
    const now = new Date('2026-11-01T10:00:00Z');
    const { ctx } = makeCtx(now);
    const s = computeReview({ itemId: 'w:书', skill: 'recognition', exercise: 'flashcard', grade: 3, sessionId: 's' }, ctx).states[0];
    const r1 = retentionOf(s, scheduler, new Date('2026-11-02T10:00:00Z'));
    const r30 = retentionOf(s, scheduler, new Date('2026-12-01T10:00:00Z'));
    expect(r1).toBeGreaterThan(r30);
    expect(r30).toBeLessThan(0.9); // por debajo de la retención objetivo
  });
});

describe('computeExposure', () => {
  it('leer da +1 de reconocimiento a cada carácter distinto', () => {
    const { ctx } = makeCtx(new Date('2026-11-01T10:00:00Z'));
    const out = computeExposure(['我', '是', '我'], 's', ctx);
    expect(out.states.map((s) => [s.itemId, s.xp])).toEqual([['c:我', 1], ['c:是', 1]]);
  });
});
