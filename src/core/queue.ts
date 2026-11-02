// Construcción de sesiones: qué practicar hoy y en qué orden.
import type { SkillState } from './engine';
import { itemEffectiveXp, type SkillSnapshot } from './mastery';
import { itemKind, type ItemId, type Skill } from './skills';

export type QueueReason = 'due' | 'weak' | 'new' | 'weakness';

export interface QueueItem {
  itemId: ItemId;
  skill: Skill;
  reason: QueueReason;
}

export interface SessionOptions {
  states: SkillState[];
  /** palabras/caracteres candidatos a ser nuevos, en el orden en que deben presentarse */
  newOrder: ItemId[];
  now: number;
  newLimit: number;
  reviewLimit: number;
  /** habilidades que este tipo de sesión puede practicar */
  skills: readonly Skill[];
  retention: (s: SkillState) => number;
}

/** Habilidades con que se presenta un ítem nuevo, en orden. */
export const NEW_ITEM_SKILLS: readonly Skill[] = ['recognition', 'pinyin', 'production'];

export function buildDailySession(o: SessionOptions): QueueItem[] {
  const allowed = new Set(o.skills);
  const due = o.states
    .filter((s) => s.card && allowed.has(s.skill) && s.due !== null && s.due <= o.now)
    .map((s) => ({ s, r: o.retention(s) }))
    .sort((a, b) => Number(b.s.weak) - Number(a.s.weak) || a.r - b.r)
    .slice(0, o.reviewLimit)
    .map<QueueItem>(({ s }) => ({ itemId: s.itemId, skill: s.skill, reason: s.weak ? 'weak' : 'due' }));

  const practiced = new Set(o.states.filter((s) => s.card).map((s) => s.itemId));
  const fresh = o.newOrder.filter((id) => !practiced.has(id)).slice(0, o.newLimit);
  const newItems: QueueItem[] = [];
  // primero todas las palabras nuevas en reconocimiento, luego pinyin, luego producción:
  // así cada palabra reaparece separada por otras.
  for (const skill of NEW_ITEM_SKILLS) {
    if (!allowed.has(skill)) continue;
    for (const itemId of fresh) newItems.push({ itemId, skill, reason: 'new' });
  }
  return interleave(due, newItems, 3);
}

/** Inserta un elemento de `b` cada `every` elementos de `a`. */
export function interleave<T>(a: T[], b: T[], every: number): T[] {
  const out: T[] = [];
  let j = 0;
  a.forEach((x, i) => {
    out.push(x);
    if ((i + 1) % every === 0 && j < b.length) out.push(b[j++]);
  });
  while (j < b.length) out.push(b[j++]);
  return out;
}

export interface ItemMastery {
  itemId: ItemId;
  effectiveXp: number;
  weak: boolean;
  weakestSkill: Skill;
}

/** Dominio efectivo de cada ítem practicado. */
export function masteryByItem(states: SkillState[], retention: (s: SkillState) => number): ItemMastery[] {
  const byItem = new Map<ItemId, SkillState[]>();
  for (const s of states) {
    if (!byItem.has(s.itemId)) byItem.set(s.itemId, []);
    byItem.get(s.itemId)!.push(s);
  }
  const out: ItemMastery[] = [];
  for (const [itemId, list] of byItem) {
    const snaps: Partial<Record<Skill, SkillSnapshot>> = {};
    for (const s of list) snaps[s.skill] = { xp: s.xp, retention: retention(s) };
    const weakest = [...list].sort(
      (a, b) => Number(b.weak) - Number(a.weak) || a.xp * retention(a) - b.xp * retention(b),
    )[0];
    out.push({
      itemId,
      effectiveXp: itemEffectiveXp(itemKind(itemId), snaps),
      weak: list.some((s) => s.weak),
      weakestSkill: weakest.skill,
    });
  }
  return out;
}

/** Sesión de debilidades: los ítems practicados con menor dominio (los "débiles" primero). */
export function buildWeaknessSession(
  states: SkillState[],
  retention: (s: SkillState) => number,
  opts: { limit: number; skills: readonly Skill[]; kinds?: ('w' | 'c')[] },
): QueueItem[] {
  const allowed = new Set(opts.skills);
  const practiced = new Set(states.filter((s) => s.card).map((s) => s.itemId));
  return masteryByItem(states.filter((s) => practiced.has(s.itemId)), retention)
    .filter((m) => !opts.kinds || opts.kinds.includes(itemKind(m.itemId)))
    .sort((a, b) => Number(b.weak) - Number(a.weak) || a.effectiveXp - b.effectiveXp)
    .slice(0, opts.limit)
    .map((m) => ({
      itemId: m.itemId,
      skill: allowed.has(m.weakestSkill) ? m.weakestSkill : opts.skills[0],
      reason: 'weakness' as const,
    }));
}
