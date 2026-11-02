// Esquema IndexedDB (Dexie). Toda la app accede a través de ProgressRepo (repo.ts).
import Dexie, { type Table } from 'dexie';
import type { ReviewLogEntry, SkillState } from '../core/engine';
import type { ItemId, Skill } from '../core/skills';

export interface DailyStat {
  /** fecha local YYYY-MM-DD */
  date: string;
  xp: number;
  reviews: number;
  correct: number;
  newItems: number;
  updatedAt: number;
}

export type ThemePref = 'system' | 'light' | 'dark';

export interface Settings {
  dailyGoalXp: number;
  newPerDay: number;
  reviewLimit: number;
  theme: ThemePref;
  showPinyin: boolean;
  /** niveles HSK activos para presentar palabras nuevas */
  levels: number[];
  /** velocidad de la voz (Web Speech) */
  speechRate: number;
}

export const DEFAULT_SETTINGS: Settings = {
  dailyGoalXp: 60,
  newPerDay: 10,
  reviewLimit: 120,
  theme: 'system',
  showPinyin: true,
  levels: [1],
  speechRate: 0.85,
};

export interface KV {
  key: string;
  value: unknown;
}

export class HanziDB extends Dexie {
  skillStates!: Table<SkillState, [ItemId, Skill]>;
  reviewLog!: Table<ReviewLogEntry, string>;
  dailyStats!: Table<DailyStat, string>;
  kv!: Table<KV, string>;

  constructor(name = 'hanzi-xp') {
    super(name);
    this.version(1).stores({
      skillStates: '[itemId+skill], itemId, skill, due, weak, updatedAt',
      reviewLog: 'id, ts, itemId, [itemId+skill], sessionId',
      dailyStats: 'date',
      kv: 'key',
    });
  }
}
