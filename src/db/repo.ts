// Repositorio de progreso: la única puerta a la persistencia local.
// La sincronización (src/sync) lee y reemplaza datos a través de él: el registro es
// append-only y cada estado lleva updatedAt, lo que permite fusionar dispositivos.
import type { ReviewLogEntry, ReviewOutcome, SkillState } from '../core/engine';
import { reviveCard } from '../core/scheduler';
import type { ItemId, Skill } from '../core/skills';
import { DEFAULT_SETTINGS, HanziDB, type DailyStat, type Settings } from './db';

export const BACKUP_SCHEMA = 1;

export interface Backup {
  app: 'hanzi-xp';
  schema: number;
  exportedAt: string;
  contentVersion: string;
  deviceId: string;
  settings: Settings;
  skillStates: SkillState[];
  reviewLog: ReviewLogEntry[];
  dailyStats: DailyStat[];
}

export interface ProgressRepo {
  deviceId(): Promise<string>;
  allStates(): Promise<SkillState[]>;
  statesFor(itemIds: ItemId[]): Promise<SkillState[]>;
  apply(outcome: ReviewOutcome, opts?: { newItem?: boolean; countReview?: boolean }): Promise<void>;
  logsFor(itemId: ItemId): Promise<ReviewLogEntry[]>;
  daily(): Promise<DailyStat[]>;
  getSettings(): Promise<Settings>;
  saveSettings(patch: Partial<Settings>): Promise<Settings>;
  exportAll(contentVersion: string): Promise<Backup>;
  importAll(backup: unknown): Promise<{ states: number; logs: number }>;
  allLogs(): Promise<ReviewLogEntry[]>;
  /** Escribe el resultado de una fusión: estados y registros nuevos, estadísticas recalculadas. */
  writeMerged(m: { states: SkillState[]; logs: ReviewLogEntry[]; daily: DailyStat[]; settings: Settings }): Promise<void>;
}

export function localDate(ts: number): string {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export class DexieProgressRepo implements ProgressRepo {
  constructor(readonly db = new HanziDB()) {}

  async deviceId(): Promise<string> {
    const row = await this.db.kv.get('deviceId');
    if (row) return row.value as string;
    const id = crypto.randomUUID();
    await this.db.kv.put({ key: 'deviceId', value: id });
    return id;
  }

  allStates() {
    return this.db.skillStates.toArray();
  }

  statesFor(itemIds: ItemId[]) {
    return this.db.skillStates.where('itemId').anyOf(itemIds).toArray();
  }

  async apply(outcome: ReviewOutcome, opts: { newItem?: boolean; countReview?: boolean } = {}) {
    const ts = outcome.logs[0]?.ts ?? Date.now();
    const date = localDate(ts);
    const direct = outcome.logs.find((l) => l.direct);
    await this.db.transaction('rw', this.db.skillStates, this.db.reviewLog, this.db.dailyStats, async () => {
      await this.db.skillStates.bulkPut(outcome.states);
      await this.db.reviewLog.bulkAdd(outcome.logs);
      const day = (await this.db.dailyStats.get(date)) ?? { date, xp: 0, reviews: 0, correct: 0, newItems: 0, updatedAt: ts };
      const counts = opts.countReview ?? Boolean(direct);
      await this.db.dailyStats.put({
        ...day,
        xp: day.xp + outcome.xpGained,
        reviews: day.reviews + (counts ? 1 : 0),
        correct: day.correct + (counts && direct?.correct ? 1 : 0),
        newItems: day.newItems + (opts.newItem ? 1 : 0),
        updatedAt: ts,
      });
    });
  }

  logsFor(itemId: ItemId) {
    return this.db.reviewLog.where('itemId').equals(itemId).sortBy('ts');
  }

  daily() {
    return this.db.dailyStats.orderBy('date').toArray();
  }

  async getSettings(): Promise<Settings> {
    const row = await this.db.kv.get('settings');
    return { ...DEFAULT_SETTINGS, ...((row?.value as Partial<Settings>) ?? {}) };
  }

  async saveSettings(patch: Partial<Settings>): Promise<Settings> {
    const next = { ...(await this.getSettings()), ...patch, updatedAt: Date.now() };
    await this.db.kv.put({ key: 'settings', value: next });
    return next;
  }

  allLogs() {
    return this.db.reviewLog.toArray();
  }

  async writeMerged(m: { states: SkillState[]; logs: ReviewLogEntry[]; daily: DailyStat[]; settings: Settings }) {
    await this.db.transaction('rw', [this.db.skillStates, this.db.reviewLog, this.db.dailyStats, this.db.kv], async () => {
      if (m.states.length) await this.db.skillStates.bulkPut(m.states);
      if (m.logs.length) await this.db.reviewLog.bulkPut(m.logs);
      await this.db.dailyStats.clear();
      await this.db.dailyStats.bulkPut(m.daily);
      await this.db.kv.put({ key: 'settings', value: m.settings });
    });
  }

  async exportAll(contentVersion: string): Promise<Backup> {
    return {
      app: 'hanzi-xp',
      schema: BACKUP_SCHEMA,
      exportedAt: new Date().toISOString(),
      contentVersion,
      deviceId: await this.deviceId(),
      settings: await this.getSettings(),
      skillStates: await this.db.skillStates.toArray(),
      reviewLog: await this.db.reviewLog.toArray(),
      dailyStats: await this.db.dailyStats.toArray(),
    };
  }

  /** Reemplaza todo el progreso por el del respaldo (tras validarlo). */
  async importAll(raw: unknown) {
    const b = parseBackup(raw);
    await this.db.transaction('rw', [this.db.skillStates, this.db.reviewLog, this.db.dailyStats, this.db.kv], async () => {
      await Promise.all([this.db.skillStates.clear(), this.db.reviewLog.clear(), this.db.dailyStats.clear()]);
      await this.db.skillStates.bulkPut(b.skillStates);
      await this.db.reviewLog.bulkPut(b.reviewLog);
      await this.db.dailyStats.bulkPut(b.dailyStats);
      await this.db.kv.put({ key: 'settings', value: { ...DEFAULT_SETTINGS, ...b.settings } });
    });
    return { states: b.skillStates.length, logs: b.reviewLog.length };
  }
}

export function parseBackup(raw: unknown): Backup {
  const b = (typeof raw === 'string' ? JSON.parse(raw) : raw) as Partial<Backup>;
  if (!b || b.app !== 'hanzi-xp') throw new Error('El archivo no es un respaldo de Hanzi XP.');
  if (typeof b.schema !== 'number' || b.schema > BACKUP_SCHEMA)
    throw new Error('El respaldo es de una versión más nueva de la app.');
  if (!Array.isArray(b.skillStates) || !Array.isArray(b.reviewLog) || !Array.isArray(b.dailyStats))
    throw new Error('El respaldo está incompleto.');
  const skillStates = b.skillStates.map((s) => ({ ...s, card: s.card ? reviveCard(s.card) : undefined }));
  return { ...(b as Backup), skillStates };
}

export function serializeBackup(b: Backup): string {
  return JSON.stringify(b);
}

export type { DailyStat, Settings };
export type StateKey = [ItemId, Skill];
