import 'fake-indexeddb/auto';
import { beforeAll, describe, expect, it } from 'vitest';
import { computeReview, type SkillState } from '../core/engine';
import { getScheduler, type Scheduler } from '../core/scheduler';
import type { ItemId, Skill } from '../core/skills';
import { HanziDB } from './db';
import { DexieProgressRepo, localDate, parseBackup, serializeBackup } from './repo';

let scheduler: Scheduler;
beforeAll(async () => {
  scheduler = await getScheduler();
});

async function practice(repo: DexieProgressRepo, now: Date, grade: 1 | 3 = 3) {
  const existing = new Map((await repo.allStates()).map((s) => [`${s.itemId}|${s.skill}`, s] as const));
  let n = 0;
  const out = computeReview(
    { itemId: 'w:我们', skill: 'recognition', exercise: 'flashcard', grade, chars: ['我', '们'], sessionId: 's1' },
    {
      now,
      deviceId: await repo.deviceId(),
      scheduler,
      get: (id: ItemId, sk: Skill) => existing.get(`${id}|${sk}`) as SkillState | undefined,
      uuid: () => `${now.getTime()}-${n++}`,
    },
  );
  await repo.apply(out, { newItem: true });
}

describe('DexieProgressRepo', () => {
  it('guarda estados, registro y estadística diaria', async () => {
    const repo = new DexieProgressRepo(new HanziDB('t1'));
    const now = new Date('2026-11-01T10:00:00');
    await practice(repo, now);
    const states = await repo.allStates();
    expect(states).toHaveLength(3);
    expect((await repo.logsFor('c:我'))[0].via).toBe('w:我们');
    const [day] = await repo.daily();
    expect(day).toMatchObject({ date: localDate(now.getTime()), xp: 10, reviews: 1, correct: 1, newItems: 1 });
  });

  it('exportar → importar conserva el progreso y las fechas de las tarjetas', async () => {
    const a = new DexieProgressRepo(new HanziDB('t2'));
    await practice(a, new Date('2026-11-01T10:00:00'));
    await practice(a, new Date('2026-11-03T10:00:00'), 1);
    await a.saveSettings({ dailyGoalXp: 90 });
    const json = serializeBackup(await a.exportAll('test'));

    const b = new DexieProgressRepo(new HanziDB('t3'));
    const res = await b.importAll(json);
    expect(res.states).toBe(3);
    const word = (await b.statesFor(['w:我们'])).find((s) => s.skill === 'recognition')!;
    expect(word.card?.dueAt).toBeInstanceOf(Date);
    expect(word.weak).toBe(true);
    expect((await b.getSettings()).dailyGoalXp).toBe(90);
    expect(await b.daily()).toHaveLength(2);
    // la tarjeta importada sigue siendo utilizable por el planificador
    expect(() => scheduler.review({ card: word.card!, grade: 3, now: new Date('2026-11-04T10:00:00') })).not.toThrow();
  });

  it('rechaza archivos que no son respaldos', () => {
    expect(() => parseBackup({ foo: 1 })).toThrow(/no es un respaldo/);
    expect(() => parseBackup({ app: 'hanzi-xp', schema: 99, skillStates: [], reviewLog: [], dailyStats: [] })).toThrow(/más nueva/);
  });
});
