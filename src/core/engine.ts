// Motor de repaso: calcula (sin efectos secundarios) qué estados y registros produce una respuesta.
import { exposureRetention } from './mastery';
import { cardRetention, reviewCard, type FsrsCard, type Scheduler } from './scheduler';
import { charItem, type ItemId, type Skill } from './skills';
import {
  BASE_XP,
  applyDirect,
  applyPropagated,
  emptyXpState,
  propagatedDelta,
  xpDelta,
  type Exercise,
  type Grade,
  type XpState,
} from './xp';

export interface SkillState extends XpState {
  itemId: ItemId;
  skill: Skill;
  /** tarjeta FSRS (solo si el ítem se ha practicado directamente en esta habilidad) */
  card?: FsrsCard;
  /** vencimiento (ms) para indexar; null si no hay tarjeta */
  due: number | null;
  lastSeen: number | null;
  updatedAt: number;
}

export interface ReviewLogEntry {
  id: string;
  ts: number;
  itemId: ItemId;
  skill: Skill;
  exercise: Exercise;
  grade: Grade;
  correct: boolean;
  xpDelta: number;
  /** false = XP propagado desde una palabra o exposición en lectura */
  direct: boolean;
  /** palabra de origen si es propagado */
  via?: ItemId;
  sessionId: string;
  deviceId: string;
}

export interface ReviewInput {
  itemId: ItemId;
  skill: Skill;
  exercise: Exercise;
  grade: Grade;
  /** caracteres de la palabra (para repartir XP); vacío para caracteres sueltos */
  chars?: string[];
  sessionId: string;
}

export interface ReviewContext {
  now: Date;
  deviceId: string;
  scheduler: Scheduler;
  get: (itemId: ItemId, skill: Skill) => SkillState | undefined;
  uuid: () => string;
}

export interface ReviewOutcome {
  states: SkillState[];
  logs: ReviewLogEntry[];
  /** XP positivo ganado (para la meta diaria) */
  xpGained: number;
  /** delta del ítem practicado */
  delta: number;
}

export function blankState(itemId: ItemId, skill: Skill, now: number): SkillState {
  return { ...emptyXpState(), itemId, skill, due: null, lastSeen: null, updatedAt: now };
}

export function computeReview(input: ReviewInput, ctx: ReviewContext): ReviewOutcome {
  const now = ctx.now.getTime();
  const correct = input.grade > 1;
  const delta = xpDelta(input.exercise, input.grade);
  const base = ctx.get(input.itemId, input.skill) ?? blankState(input.itemId, input.skill, now);
  const card = reviewCard(ctx.scheduler, base.card, input.grade, ctx.now);
  const main: SkillState = {
    ...base,
    ...applyDirect(base, delta, correct),
    card,
    due: card.dueAt.getTime(),
    lastSeen: now,
    updatedAt: now,
  };
  const log = (itemId: ItemId, d: number, direct: boolean, via?: ItemId): ReviewLogEntry => ({
    id: ctx.uuid(),
    ts: now,
    itemId,
    skill: input.skill,
    exercise: input.exercise,
    grade: input.grade,
    correct,
    xpDelta: d,
    direct,
    via,
    sessionId: input.sessionId,
    deviceId: ctx.deviceId,
  });

  const states = [main];
  const logs = [log(input.itemId, main.xp - base.xp, true)];
  let xpGained = Math.max(0, main.xp - base.xp);

  // Reparto a los caracteres de la palabra (cada carácter distinto una vez).
  const cd = propagatedDelta(delta, correct);
  for (const ch of new Set(input.chars ?? [])) {
    const id = charItem(ch);
    const prev = ctx.get(id, input.skill) ?? blankState(id, input.skill, now);
    const next: SkillState = { ...prev, ...applyPropagated(prev, cd), lastSeen: now, updatedAt: now };
    states.push(next);
    logs.push(log(id, next.xp - prev.xp, false, input.itemId));
    xpGained += Math.max(0, next.xp - prev.xp);
  }
  return { states, logs, xpGained, delta };
}

/**
 * Exposición en lectura: cada carácter leído sin consultar recibe XP de reconocimiento
 * sin crear tarjeta FSRS (no es una evaluación).
 */
export function computeExposure(
  chars: string[],
  sessionId: string,
  ctx: Omit<ReviewContext, 'scheduler'>,
): ReviewOutcome {
  const now = ctx.now.getTime();
  const states: SkillState[] = [];
  const logs: ReviewLogEntry[] = [];
  let xpGained = 0;
  for (const ch of new Set(chars)) {
    const id = charItem(ch);
    const prev = ctx.get(id, 'recognition') ?? blankState(id, 'recognition', now);
    const next: SkillState = { ...prev, ...applyPropagated(prev, BASE_XP.reading), lastSeen: now, updatedAt: now };
    states.push(next);
    logs.push({
      id: ctx.uuid(), ts: now, itemId: id, skill: 'recognition', exercise: 'reading', grade: 3,
      correct: true, xpDelta: next.xp - prev.xp, direct: false, sessionId, deviceId: ctx.deviceId,
    });
    xpGained += next.xp - prev.xp;
  }
  return { states, logs, xpGained, delta: BASE_XP.reading };
}

/** Retención actual de una habilidad: FSRS si hay tarjeta; si no, curva por exposición. */
export function retentionOf(s: SkillState | undefined, scheduler: Scheduler, now: Date): number {
  if (!s) return 0;
  if (s.card?.lastReviewAt) {
    const fsrsR = cardRetention(scheduler, s.card, now);
    // el XP propagado posterior al último repaso también refresca la memoria
    return Math.max(fsrsR, exposureRetention(s.xp, s.lastSeen, now.getTime()) * 0.9);
  }
  return exposureRetention(s.xp, s.lastSeen, now.getTime());
}
