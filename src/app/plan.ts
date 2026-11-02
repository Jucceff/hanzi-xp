// Planificación de sesiones a partir del estado guardado.
import { charByChar, charItem, chars, newWordOrder, phrases, viewOf, wordItem, words } from '../content';
import { retentionOf, type SkillState } from '../core/engine';
import { NEW_ITEM_SKILLS, buildDailySession, buildWeaknessSession, interleave, type QueueItem } from '../core/queue';
import type { Scheduler } from '../core/scheduler';
import { itemKind, type ItemId, type Skill } from '../core/skills';
import type { DailyStat, Settings } from '../db/db';
import { localDate } from '../db/repo';
import { minimalPairs } from './exercises';

export type SessionMode = 'hoy' | 'debilidades' | 'tonos' | 'frases' | 'escritura';

export interface PlanOptions {
  /** hay audio (voz zh-CN): se incluyen ejercicios de escucha */
  audio: boolean;
  now?: Date;
}

/** Habilidades de la sesión diaria. La escritura entra solo como repaso (lo nuevo, en su sesión). */
export function sessionSkills(audio: boolean): readonly Skill[] {
  return [...NEW_ITEM_SKILLS, ...(audio ? (['listening'] as const) : []), 'writing'];
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
  if (mode === 'frases') return buildPhraseSession(states, retention, settings.levels, 12);
  if (mode === 'escritura') return buildWritingSession(states, retention, settings.levels, now.getTime(), 6, 20);
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

/**
 * Sesión de frases útiles: frases de los niveles activos, primero las que más palabras
 * conocidas tienen. En cada una se practica su palabra más floja, alternando
 * "ordena la frase" y "encuentra la palabra" (por significado o en pinyin).
 */
export function buildPhraseSession(
  states: SkillState[],
  retention: (s: SkillState) => number,
  levels: number[],
  limit: number,
  rnd = Math.random,
): QueueItem[] {
  const maxLevel = Math.max(...levels);
  const xp = new Map<ItemId, number>();
  for (const s of states) {
    if (!s.card || itemKind(s.itemId) !== 'w') continue;
    xp.set(s.itemId, Math.max(xp.get(s.itemId) ?? 0, s.xp * retention(s)));
  }
  const ranked = phrases
    .filter((p) => p.level <= maxLevel)
    .map((p) => {
      const ws = p.tokens.filter((t) => t.w).map((t) => wordItem(t.w!));
      const known = ws.filter((id) => xp.has(id)).length / Math.max(1, ws.length);
      return { p, ws, score: known + rnd() * 0.35 };
    })
    .filter((x) => x.ws.length >= 2)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
  const cycle: Skill[] = ['production', 'recognition', 'production', 'pinyin'];
  return ranked.map(({ p, ws }, i) => {
    const target = [...ws].sort((a, b) => (xp.get(a) ?? 0) - (xp.get(b) ?? 0))[0];
    const skill = cycle[i % cycle.length];
    return { itemId: target, skill: skill === 'production' && ws.length < 3 ? 'recognition' : skill, reason: 'drill', phraseId: p.id };
  });
}

/**
 * Sesión de escritura: repasos de escritura vencidos (los más olvidados primero) y
 * hasta `newLimit` caracteres nuevos. Los nuevos salen de las palabras que ya practicas,
 * primero los de la lista oficial de escritura (书写字) y los más frecuentes.
 */
export function buildWritingSession(
  states: SkillState[],
  retention: (s: SkillState) => number,
  levels: number[],
  now: number,
  newLimit: number,
  limit: number,
): QueueItem[] {
  const due = states
    .filter((s) => s.skill === 'writing' && s.card && s.due !== null && s.due <= now)
    .sort((a, b) => Number(b.weak) - Number(a.weak) || retention(a) - retention(b))
    .map<QueueItem>((s) => ({ itemId: s.itemId, skill: 'writing', reason: s.weak ? 'weak' : 'due' }));
  const hasWriting = new Set(states.filter((s) => s.skill === 'writing' && s.card).map((s) => s.itemId));
  const practicedWords = new Set(states.filter((s) => s.card && itemKind(s.itemId) === 'w').map((s) => s.itemId));
  const maxLevel = Math.max(...levels);
  const fromWords = new Set<string>();
  for (const w of words) if (practicedWords.has(wordItem(w.id))) for (const ch of w.chars) fromWords.add(ch);
  // si aún no practicas palabras, empezar por los caracteres más frecuentes de tus niveles
  const pool = fromWords.size ? [...fromWords] : chars.filter((c) => c.level <= maxLevel).map((c) => c.char);
  const fresh = pool
    .map((ch) => charByChar.get(ch)!)
    .filter((c) => c && !hasWriting.has(charItem(c.char)))
    .sort((a, b) => Number(b.handwritingLevel !== null) - Number(a.handwritingLevel !== null) || a.freqRank - b.freqRank)
    .slice(0, newLimit)
    .map<QueueItem>((c) => ({ itemId: charItem(c.char), skill: 'writing', reason: 'new' }));
  return interleave(due.slice(0, limit - fresh.length), fresh, 2);
}
