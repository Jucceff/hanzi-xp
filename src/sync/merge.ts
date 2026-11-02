// Fusión de progreso entre dispositivos (funciones puras).
//
// - Registro de repasos: unión por id (es append-only, nunca se edita).
// - Estado por (ítem, habilidad): gana el más reciente (updatedAt).
// - Ajustes: gana el más reciente.
// - Estadísticas diarias: se recalculan a partir del registro fusionado.
import type { ReviewLogEntry, SkillState } from '../core/engine';
import type { DailyStat, Settings } from '../db/db';
import { localDate } from '../db/repo';

export interface Snapshot {
  states: SkillState[];
  logs: ReviewLogEntry[];
  settings: Settings;
}

const key = (s: { itemId: string; skill: string }) => `${s.itemId}|${s.skill}`;

export function mergeLogs(a: ReviewLogEntry[], b: ReviewLogEntry[]): ReviewLogEntry[] {
  const byId = new Map(a.map((l) => [l.id, l]));
  for (const l of b) if (!byId.has(l.id)) byId.set(l.id, l);
  return [...byId.values()].sort((x, y) => x.ts - y.ts);
}

export function mergeStates(a: SkillState[], b: SkillState[]): SkillState[] {
  const out = new Map(a.map((s) => [key(s), s]));
  for (const s of b) {
    const cur = out.get(key(s));
    if (!cur || s.updatedAt > cur.updatedAt) out.set(key(s), s);
  }
  return [...out.values()];
}

export function mergeSettings(a: Settings, b: Settings): Settings {
  return (b.updatedAt ?? 0) > (a.updatedAt ?? 0) ? b : a;
}

/** Recalcula las estadísticas diarias desde el registro (fecha local del dispositivo). */
export function dailyFromLogs(logs: ReviewLogEntry[]): DailyStat[] {
  const days = new Map<string, DailyStat>();
  const seenItems = new Set<string>();
  for (const l of [...logs].sort((x, y) => x.ts - y.ts)) {
    const date = localDate(l.ts);
    const d = days.get(date) ?? { date, xp: 0, reviews: 0, correct: 0, newItems: 0, updatedAt: l.ts };
    d.xp += Math.max(0, l.xpDelta);
    if (l.direct) {
      d.reviews++;
      if (l.correct) d.correct++;
      if (!seenItems.has(l.itemId)) {
        seenItems.add(l.itemId);
        d.newItems++;
      }
    }
    d.updatedAt = Math.max(d.updatedAt, l.ts);
    days.set(date, d);
  }
  return [...days.values()];
}

export interface MergeResult {
  merged: Snapshot;
  daily: DailyStat[];
  /** lo que hay que escribir en local */
  localChanges: { states: SkillState[]; logs: ReviewLogEntry[] };
  /** true si el remoto no tiene todo lo local (hay que subir) */
  remoteOutdated: boolean;
}

export function mergeSnapshots(local: Snapshot, remote: Snapshot): MergeResult {
  const logs = mergeLogs(local.logs, remote.logs);
  const states = mergeStates(local.states, remote.states);
  const settings = mergeSettings(local.settings, remote.settings);

  const localIds = new Set(local.logs.map((l) => l.id));
  const remoteIds = new Set(remote.logs.map((l) => l.id));
  const localByKey = new Map(local.states.map((s) => [key(s), s]));
  const remoteByKey = new Map(remote.states.map((s) => [key(s), s]));

  // se compara por updatedAt, no por identidad: lo descargado son objetos nuevos
  const newer = (s: SkillState, other: SkillState | undefined) => !other || s.updatedAt > other.updatedAt;
  const newLocalStates = states.filter((s) => newer(s, localByKey.get(key(s))));
  const remoteOutdated =
    logs.some((l) => !remoteIds.has(l.id)) ||
    states.some((s) => newer(s, remoteByKey.get(key(s)))) ||
    (settings.updatedAt ?? 0) > (remote.settings.updatedAt ?? 0);

  return {
    merged: { states, logs, settings },
    daily: dailyFromLogs(logs),
    localChanges: { states: newLocalStates, logs: logs.filter((l) => !localIds.has(l.id)) },
    remoteOutdated,
  };
}
