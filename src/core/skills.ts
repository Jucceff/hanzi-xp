export const SKILLS = ['recognition', 'pinyin', 'listening', 'writing', 'production'] as const;
export type Skill = (typeof SKILLS)[number];

export const SKILL_LABEL: Record<Skill, string> = {
  recognition: 'Reconocimiento',
  pinyin: 'Pinyin y tono',
  listening: 'Escucha',
  writing: 'Escritura',
  production: 'Producción',
};

export const SKILL_HINT: Record<Skill, string> = {
  recognition: 'Ver el hanzi → saber qué significa',
  pinyin: 'Ver el hanzi → pinyin y tono',
  listening: 'Oír → identificar',
  writing: 'Escribir con el orden de trazos',
  production: 'Significado → hanzi',
};

/** Peso de cada habilidad en el dominio global del ítem. */
export const SKILL_WEIGHT: Record<Skill, number> = {
  recognition: 0.3,
  pinyin: 0.2,
  production: 0.2,
  listening: 0.15,
  writing: 0.15,
};

export type ItemKind = 'w' | 'c';
/** `w:我们` (palabra) o `c:我` (carácter) */
export type ItemId = `${ItemKind}:${string}`;

export const wordItem = (id: string): ItemId => `w:${id}`;
export const charItem = (ch: string): ItemId => `c:${ch}`;
export const itemKind = (id: ItemId): ItemKind => id[0] as ItemKind;
export const itemKey = (id: ItemId): string => id.slice(2);

/** La escritura se practica (y se mide) por carácter. */
export function skillsFor(kind: ItemKind): readonly Skill[] {
  return kind === 'c' ? SKILLS : SKILLS.filter((s) => s !== 'writing');
}
