// Estadísticas derivadas: racha, XP por periodo y preparación para el examen.

export interface DayLike {
  date: string;
  xp: number;
}

const toDate = (s: string) => new Date(`${s}T12:00:00`);
const fmt = (d: Date) => {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};
export const addDays = (s: string, n: number) => {
  const d = toDate(s);
  d.setDate(d.getDate() + n);
  return fmt(d);
};

/** Días seguidos con XP > 0 hasta hoy (si hoy aún no se ha practicado, cuenta hasta ayer). */
export function streak(days: DayLike[], today: string): number {
  const active = new Set(days.filter((d) => d.xp > 0).map((d) => d.date));
  let cursor = active.has(today) ? today : addDays(today, -1);
  let n = 0;
  while (active.has(cursor)) {
    n++;
    cursor = addDays(cursor, -1);
  }
  return n;
}

export function xpInRange(days: DayLike[], from: string, to: string): number {
  return days.filter((d) => d.date >= from && d.date <= to).reduce((a, d) => a + d.xp, 0);
}

/** Lunes de la semana de `date`. */
export function weekStart(date: string): string {
  const d = toDate(date);
  const dow = (d.getDay() + 6) % 7;
  return addDays(date, -dow);
}

/**
 * Estimación de días para tener todo el nivel en "Familiar" o más,
 * según los ítems que pasaron a Familiar en los últimos 14 días.
 */
export function daysToReady(total: number, familiar: number, gainedLast14: number): number | null {
  const remaining = total - familiar;
  if (remaining <= 0) return 0;
  if (gainedLast14 <= 0) return null;
  return Math.ceil(remaining / (gainedLast14 / 14));
}
