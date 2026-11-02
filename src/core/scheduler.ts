// Envoltorio fino sobre ts-fsrs (FSRS-7). Una tarjeta por (ítem, habilidad).
import { DefaultScheduler } from 'ts-fsrs';
import type { Grade } from './xp';

export type Scheduler = Awaited<ReturnType<typeof DefaultScheduler<'FSRS-7'>>>;
/** Tarjeta FSRS-7 tal como la acepta `review()` (incluye stabilityFast). */
export type FsrsCard = Parameters<Scheduler['review']>[0]['card'];

let instance: Promise<Scheduler> | null = null;

export function getScheduler(): Promise<Scheduler> {
  instance ??= DefaultScheduler({ version: 'FSRS-7', desiredRetention: 0.9, enableFuzz: true, maximumInterval: 3650 });
  return instance;
}

export function reviewCard(s: Scheduler, card: FsrsCard | undefined, grade: Grade, now: Date): FsrsCard {
  const current = card ?? s.newCard({ now });
  return s.review({ card: current, grade, now }).card;
}

/** Probabilidad estimada de recordar ahora (0–1). Tarjeta nueva = 0. */
export function cardRetention(s: Scheduler, card: FsrsCard | undefined, now: Date): number {
  if (!card?.lastReviewAt) return 0;
  const elapsed = Math.max(0, s.chrono.difference(card.lastReviewAt, now));
  return s.model.forgettingCurve(card, elapsed);
}

/** Reconstruye las fechas de una tarjeta que viene de JSON (importación). */
export function reviveCard(raw: unknown): FsrsCard {
  const c = { ...(raw as Record<string, unknown>) };
  for (const k of ['dueAt', 'lastReviewAt'] as const) {
    if (typeof c[k] === 'string' || typeof c[k] === 'number') c[k] = new Date(c[k] as string);
  }
  return c as unknown as FsrsCard;
}
