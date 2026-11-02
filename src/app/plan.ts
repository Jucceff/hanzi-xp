// Planificación de sesiones a partir del estado guardado.
import { newWordOrder, viewOf, wordItem, words } from '../content';
import { retentionOf, type SkillState } from '../core/engine';
import { NEW_ITEM_SKILLS, buildDailySession, buildWeaknessSession, interleave, type QueueItem } from '../core/queue';
import type { Scheduler } from '../core/scheduler';
import { itemKind, type ItemId, type Skill } from '../core/skills';
import type { DailyStat, Settings } from '../db/db';
import { localDate } from '../db/repo';
import { minimalPairs } from './exercises';

export type SessionMode = 'hoy' | 'debilidades' | 'tonos';

export interface PlanOptions {
  /** hay audio (voz zh-CN): se incluyen ejercicios de escucha */
  audio: boolean;
  now?: Date;
}

export function sessionSkills(audio: boolean): readonly Skill[] {
  return audio ? [...NEW_ITEM_SKILLS, 'listening'] : NEW_ITEM_SKILLS;
}

export function newLeftToday(settings: Settings, daily: DailyStat[], now = Date.now()) {
  const today = daily.find((d) => d.date === localDate(now));
  return Math.max(0, settings.newPerDay - (today?.newItems ?? 0));
}

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

export function planSession(
  mode: SessionMode,
  states: SkillState[],
  settings: Settings,
  daily: DailyStat[],
  scheduler: Scheduler,
  opts: PlanOptions,
): QueueItem[] {
  const now = opts.now ?? new Date();
  const retention = (s: SkillState) => retentionOf(s, scheduler, now);
  const skills = sessionSkills(opts.audio);
  if (mode === 'debilidades') return buildWeaknessSession(states, retention, { limit: 20, skills });
  if (mode === 'tonos') return buildToneDrill(states, retention, settings.levels, 20);
  return buildDailySession({
    states,
    newOrder: newWordOrder(settings.levels),
    now: now.getTime(),
    newLimit: newLeftToday(settings, daily, now.getTime()),
    reviewLimit: settings.reviewLimit,
    skills,
    retention,
    // la escucha se desbloquea para palabras que ya viste otro día
    unlock: opts.audio ? { skills: ['listening'], limit: settings.newPerDay, before: startOfDay(now) } : undefined,
  });
}

/**
 * Entrenamiento de tonos: palabras ya practicadas con menos dominio de pinyin/escucha,
 * completadas con palabras frecuentes que tienen pares mínimos (买/卖, 是/十…).
 * Alterna "escucha y elige el hanzi" y "escucha y elige los tonos".
 */
export function buildToneDrill(states: SkillState[], retention: (s: SkillState) => number, levels: number[], limit: number): QueueItem[] {
  const score = new Map<ItemId, number>();
  for (const s of states) {
    if (!s.card || itemKind(s.itemId) !== 'w') continue;
    const sk = s.skill === 'pinyin' || s.skill === 'listening' ? s.xp * retention(s) : 50;
    score.set(s.itemId, Math.min(score.get(s.itemId) ?? Infinity, sk));
  }
  const practiced = [...score.entries()].sort((a, b) => a[1] - b[1]).map(([id]) => id);
  const withPairs = newWordOrder(levels).filter((id) => !score.has(id) && minimalPairs(viewOf(id)!).length > 0);
  const pick = [...practiced, ...withPairs].slice(0, limit);
  const listen = pick.filter((_, i) => i % 2 === 0).map<QueueItem>((itemId) => ({ itemId, skill: 'listening', reason: 'drill' }));
  const tone = pick.filter((_, i) => i % 2 === 1).map<QueueItem>((itemId) => ({ itemId, skill: 'pinyin', reason: 'drill' }));
  return interleave(listen, tone, 1);
}

/** Cuántas palabras activas tienen pareja de tonos (para mostrarlo en la UI). */
export const minimalPairCount = words.filter((w) => w.es.length && minimalPairs(viewOf(wordItem(w.id))!).length).length;
