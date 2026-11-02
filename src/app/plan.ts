// Planificación de sesiones a partir del estado guardado.
import { newWordOrder } from '../content';
import { retentionOf, type SkillState } from '../core/engine';
import { NEW_ITEM_SKILLS, buildDailySession, buildWeaknessSession, type QueueItem } from '../core/queue';
import type { Scheduler } from '../core/scheduler';
import type { Skill } from '../core/skills';
import type { DailyStat, Settings } from '../db/db';
import { localDate } from '../db/repo';

export type SessionMode = 'hoy' | 'debilidades';

/** Habilidades disponibles en las sesiones del MVP (flashcards + opción múltiple). */
export const SESSION_SKILLS: readonly Skill[] = NEW_ITEM_SKILLS;

export function newLeftToday(settings: Settings, daily: DailyStat[], now = Date.now()) {
  const today = daily.find((d) => d.date === localDate(now));
  return Math.max(0, settings.newPerDay - (today?.newItems ?? 0));
}

export function planSession(
  mode: SessionMode,
  states: SkillState[],
  settings: Settings,
  daily: DailyStat[],
  scheduler: Scheduler,
  now = new Date(),
): QueueItem[] {
  const retention = (s: SkillState) => retentionOf(s, scheduler, now);
  if (mode === 'debilidades') return buildWeaknessSession(states, retention, { limit: 20, skills: SESSION_SKILLS });
  return buildDailySession({
    states,
    newOrder: newWordOrder(settings.levels),
    now: now.getTime(),
    newLimit: newLeftToday(settings, daily, now.getTime()),
    reviewLimit: settings.reviewLimit,
    skills: SESSION_SKILLS,
    retention,
  });
}
