// Niveles 0–10 y dominio efectivo (XP × retención estimada).
import { SKILL_WEIGHT, type ItemKind, type Skill, skillsFor } from './skills';

/**
 * XP acumulado necesario para cada nivel (índice = nivel), por habilidad.
 * Calibrado para que ~12–15 repasos bien espaciados lleven una habilidad a "Dominado".
 */
export const LEVEL_THRESHOLDS = [0, 5, 15, 30, 50, 75, 105, 140, 180, 225, 275] as const;
export const MAX_LEVEL = LEVEL_THRESHOLDS.length - 1;

export type Stage = 'nuevo' | 'visto' | 'aprendiendo' | 'familiar' | 'dominado';

export const STAGE_LABEL: Record<Stage, string> = {
  nuevo: 'Nuevo',
  visto: 'Visto',
  aprendiendo: 'Aprendiendo',
  familiar: 'Familiar',
  dominado: 'Dominado',
};

export function levelFromXp(xp: number): number {
  let lvl = 0;
  for (let i = 0; i < LEVEL_THRESHOLDS.length; i++) if (xp >= LEVEL_THRESHOLDS[i]) lvl = i;
  return lvl;
}

export function stageOf(level: number): Stage {
  if (level <= 0) return 'nuevo';
  if (level <= 2) return 'visto';
  if (level <= 5) return 'aprendiendo';
  if (level <= 8) return 'familiar';
  return 'dominado';
}

/** Progreso dentro del nivel actual (0–1). */
export function levelProgress(xp: number): number {
  const lvl = levelFromXp(xp);
  if (lvl >= MAX_LEVEL) return 1;
  const lo = LEVEL_THRESHOLDS[lvl];
  const hi = LEVEL_THRESHOLDS[lvl + 1];
  return (xp - lo) / (hi - lo);
}

const DAY = 86_400_000;

/**
 * Retención estimada para habilidades sin tarjeta FSRS propia (p. ej. un carácter que
 * solo ha recibido XP por sus palabras). Curva de potencia de FSRS con una estabilidad
 * que crece con el XP: S = 1 + 0.6·XP días (máx. 365).
 */
export function exposureRetention(xp: number, lastSeen: number | null, now: number): number {
  if (!lastSeen || xp <= 0) return xp > 0 ? 1 : 0;
  const days = Math.max(0, (now - lastSeen) / DAY);
  const stability = Math.min(365, 1 + 0.6 * xp);
  return Math.pow(1 + days / (9 * stability), -1);
}

export interface SkillSnapshot {
  xp: number;
  /** retención estimada 0–1 en este momento */
  retention: number;
}

export function effectiveXp(s: SkillSnapshot | undefined): number {
  if (!s) return 0;
  return s.xp * Math.max(0, Math.min(1, s.retention));
}

/**
 * Dominio global del ítem: media ponderada del XP efectivo de las habilidades
 * aplicables (la escritura solo cuenta en caracteres).
 */
export function itemEffectiveXp(kind: ItemKind, skills: Partial<Record<Skill, SkillSnapshot>>): number {
  const applicable = skillsFor(kind);
  const total = applicable.reduce((a, s) => a + SKILL_WEIGHT[s], 0);
  return applicable.reduce((a, s) => a + effectiveXp(skills[s]) * SKILL_WEIGHT[s], 0) / total;
}

export function itemPeakXp(kind: ItemKind, skills: Partial<Record<Skill, { xp: number }>>): number {
  const applicable = skillsFor(kind);
  const total = applicable.reduce((a, s) => a + SKILL_WEIGHT[s], 0);
  return applicable.reduce((a, s) => a + (skills[s]?.xp ?? 0) * SKILL_WEIGHT[s], 0) / total;
}
