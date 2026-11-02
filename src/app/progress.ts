// Servicios de progreso para la UI: responder ejercicios y leer el dominio actual.
import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useState } from 'react';
import { charItem, viewOf } from '../content';
import { computeExposure, computeReview, retentionOf, type ReviewOutcome, type SkillState } from '../core/engine';
import { itemEffectiveXp, itemPeakXp, levelFromXp, stageOf, type SkillSnapshot, type Stage } from '../core/mastery';
import type { QueueItem } from '../core/queue';
import { getScheduler, type Scheduler } from '../core/scheduler';
import { itemKind, type ItemId, type Skill } from '../core/skills';
import type { Exercise, Grade } from '../core/xp';
import { DEFAULT_SETTINGS } from '../db/db';
import { DexieProgressRepo } from '../db/repo';

export const repo = new DexieProgressRepo();

const keyOf = (s: { itemId: ItemId; skill: Skill }) => `${s.itemId}|${s.skill}`;

export async function answer(q: QueueItem, exercise: Exercise, grade: Grade, sessionId: string): Promise<ReviewOutcome> {
  const scheduler = await getScheduler();
  const view = viewOf(q.itemId);
  const chars = view && view.kind === 'w' ? view.chars : [];
  const existing = await repo.statesFor([q.itemId, ...chars.map(charItem)]);
  const map = new Map(existing.map((s) => [keyOf(s), s]));
  const wasNew = !existing.some((s) => s.itemId === q.itemId && s.card);
  const out = computeReview(
    { itemId: q.itemId, skill: q.skill, exercise, grade, chars, sessionId },
    {
      now: new Date(),
      deviceId: await repo.deviceId(),
      scheduler,
      get: (id, skill) => map.get(`${id}|${skill}`),
      uuid: () => crypto.randomUUID(),
    },
  );
  await repo.apply(out, { newItem: wasNew });
  return out;
}

/** Lectura: los caracteres leídos (sin consultar) reciben XP de exposición. */
export async function readExposure(chars: string[], sessionId: string) {
  const existing = await repo.statesFor(chars.map(charItem));
  const map = new Map(existing.map((s) => [keyOf(s), s]));
  const out = computeExposure(chars, sessionId, {
    now: new Date(),
    deviceId: await repo.deviceId(),
    get: (id, skill) => map.get(`${id}|${skill}`),
    uuid: () => crypto.randomUUID(),
  });
  await repo.apply(out, { countReview: false });
  return out;
}

export function useScheduler(): Scheduler | null {
  const [s, setS] = useState<Scheduler | null>(null);
  useEffect(() => {
    getScheduler().then(setS);
  }, []);
  return s;
}

export function useSettings() {
  return useLiveQuery(() => repo.getSettings(), [], DEFAULT_SETTINGS);
}

export function useAllStates(): SkillState[] | undefined {
  return useLiveQuery(() => repo.allStates(), []);
}

export function useDaily() {
  return useLiveQuery(() => repo.daily(), [], []);
}

export interface SkillMastery {
  xp: number;
  retention: number;
  effective: number;
  level: number;
  weak: boolean;
  due: number | null;
  correct: number;
  wrong: number;
  direct: boolean;
}

export interface Mastery {
  itemId: ItemId;
  effectiveXp: number;
  peakXp: number;
  level: number;
  peakLevel: number;
  stage: Stage;
  weak: boolean;
  nextDue: number | null;
  skills: Partial<Record<Skill, SkillMastery>>;
}

export function computeMastery(states: SkillState[], scheduler: Scheduler, now = new Date()): Map<ItemId, Mastery> {
  const byItem = new Map<ItemId, SkillState[]>();
  for (const s of states) {
    if (!byItem.has(s.itemId)) byItem.set(s.itemId, []);
    byItem.get(s.itemId)!.push(s);
  }
  const out = new Map<ItemId, Mastery>();
  for (const [itemId, list] of byItem) {
    const skills: Partial<Record<Skill, SkillMastery>> = {};
    const snaps: Partial<Record<Skill, SkillSnapshot>> = {};
    for (const s of list) {
      const retention = retentionOf(s, scheduler, now);
      snaps[s.skill] = { xp: s.xp, retention };
      skills[s.skill] = {
        xp: s.xp,
        retention,
        effective: s.xp * retention,
        level: Math.max(levelFromXp(s.xp * retention), s.xp * retention > 0.5 ? 1 : 0),
        weak: s.weak,
        due: s.due,
        correct: s.correct,
        wrong: s.wrong,
        direct: Boolean(s.card),
      };
    }
    const kind = itemKind(itemId);
    const effectiveXp = itemEffectiveXp(kind, snaps);
    const peakXp = itemPeakXp(kind, skills as Record<Skill, { xp: number }>);
    // Cualquier ítem ya visto (con XP vigente) cuenta al menos como nivel 1, "Visto";
    // el promedio de cinco habilidades tardaría demasiado en reflejar la primera exposición.
    const level = Math.max(levelFromXp(effectiveXp), effectiveXp > 0.5 ? 1 : 0);
    const dues = list.map((s) => s.due).filter((d): d is number => d !== null);
    out.set(itemId, {
      itemId,
      effectiveXp,
      peakXp,
      level,
      peakLevel: Math.max(levelFromXp(peakXp), peakXp > 0 ? 1 : 0),
      stage: stageOf(level),
      weak: list.some((s) => s.weak),
      nextDue: dues.length ? Math.min(...dues) : null,
      skills,
    });
  }
  return out;
}

/** Dominio de todos los ítems, recalculado cuando cambia la base de datos. */
export function useMastery() {
  const states = useAllStates();
  const scheduler = useScheduler();
  const mastery = useMemo(
    () => (states && scheduler ? computeMastery(states, scheduler) : null),
    [states, scheduler],
  );
  return { states, scheduler, mastery };
}
