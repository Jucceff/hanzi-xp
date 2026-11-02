import 'fake-indexeddb/auto';
import { beforeAll, describe, expect, it } from 'vitest';
import { computeReview, type SkillState } from '../core/engine';
import { getScheduler, type Scheduler } from '../core/scheduler';
import type { ItemId, Skill } from '../core/skills';
import { HanziDB } from '../db/db';
import { DexieProgressRepo } from '../db/repo';
import { STATE_FILE, decodeState, encode, decode } from './codec';
import { syncOnce } from './sync';

let scheduler: Scheduler;
beforeAll(async () => {
  scheduler = await getScheduler();
});

/** Servidor de gists en memoria que imita la API de GitHub. */
function fakeGitHub() {
  const gists = new Map<string, { id: string; description: string; files: Record<string, { filename: string; content: string }> }>();
  let n = 0;
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
  const fetchFn = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? 'GET';
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    if ((init?.headers as Record<string, string>)?.Authorization !== 'Bearer tok') return json({}, 401);
    if (url.pathname === '/user') return json({ login: 'yo' });
    if (url.pathname === '/gists' && method === 'GET') return json([...gists.values()]);
    if (url.pathname === '/gists' && method === 'POST') {
      const id = `g${++n}`;
      const files = Object.fromEntries(Object.entries(body.files as Record<string, { content: string }>).map(([k, v]) => [k, { filename: k, content: v.content }]));
      gists.set(id, { id, description: body.description, files });
      return json(gists.get(id));
    }
    const id = url.pathname.split('/')[2];
    const g = gists.get(id);
    if (!g) return json({}, 404);
    if (method === 'PATCH') for (const [k, v] of Object.entries(body.files as Record<string, { content: string }>)) g.files[k] = { filename: k, content: v.content };
    return json(g);
  }) as typeof fetch;
  return { fetchFn, gists };
}

async function practice(repo: DexieProgressRepo, itemId: ItemId, chars: string[], now: Date) {
  const existing = new Map((await repo.allStates()).map((s) => [`${s.itemId}|${s.skill}`, s] as const));
  let i = 0;
  const out = computeReview(
    { itemId, skill: 'recognition', exercise: 'flashcard', grade: 3, chars, sessionId: 's' },
    { now, deviceId: await repo.deviceId(), scheduler, get: (id: ItemId, sk: Skill) => existing.get(`${id}|${sk}`) as SkillState | undefined, uuid: () => `${itemId}-${now.getTime()}-${i++}` },
  );
  await repo.apply(out, { newItem: true });
}

describe('sincronización con gist', () => {
  it('el progreso del móvil aparece en el PC y viceversa', async () => {
    const gh = fakeGitHub();
    const movil = new DexieProgressRepo(new HanziDB('movil'));
    const pc = new DexieProgressRepo(new HanziDB('pc'));
    const cfg = { token: 'tok' };

    await practice(movil, 'w:我们', ['我', '们'], new Date('2026-11-01T09:00:00'));
    const first = await syncOnce(movil, cfg, gh.fetchFn);
    expect(first.pushed).toBe(true);
    expect(gh.gists.size).toBe(1);

    // el PC encuentra el gist por su descripción y recibe el progreso
    const r = await syncOnce(pc, cfg, gh.fetchFn);
    expect(r.gistId).toBe(first.gistId);
    expect(r.pulled.logs).toBe(3);
    expect((await pc.statesFor(['c:我']))[0].xp).toBe(2);
    expect((await pc.daily())[0]).toMatchObject({ xp: 10, reviews: 1, newItems: 1 });

    // el PC practica otra palabra; el móvil la recibe
    await practice(pc, 'w:你', ['你'], new Date('2026-11-01T20:00:00'));
    await syncOnce(pc, { ...cfg, gistId: r.gistId }, gh.fetchFn);
    await syncOnce(movil, { ...cfg, gistId: r.gistId }, gh.fetchFn);
    const ids = new Set((await movil.allStates()).map((s) => s.itemId));
    expect(ids.has('w:你')).toBe(true);
    expect((await movil.allLogs()).length).toBe(5);

    // sin cambios no se vuelve a subir nada
    expect((await syncOnce(movil, { ...cfg, gistId: r.gistId }, gh.fetchFn)).pushed).toBe(false);

    // las tarjetas FSRS llegan con fechas válidas
    const doc = await decodeState(gh.gists.get(r.gistId)!.files[STATE_FILE].content);
    expect(doc.states.find((s) => s.card)?.card?.dueAt).toBeInstanceOf(Date);
  });

  it('un token inválido da un error claro', async () => {
    const gh = fakeGitHub();
    const repo = new DexieProgressRepo(new HanziDB('malo'));
    await expect(syncOnce(repo, { token: 'otro' }, gh.fetchFn)).rejects.toThrow(/token/);
  });

  it('el formato comprimido ida y vuelta', async () => {
    const data = { a: '我们', n: [1, 2, 3] };
    expect(await decode(await encode(data))).toEqual(data);
  });
});
