export const DAY_MS = 86_400_000;

/** Medianoche local del día que contiene `at`. */
export function startOfDay(at: number = Date.now()): number {
  const d = new Date(at);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Suma días respetando cambios de horario. */
export function addDays(at: number, days: number): number {
  const d = new Date(at);
  d.setDate(d.getDate() + days);
  return d.getTime();
}

/** Lunes 00:00 de la semana de `at`. */
export function startOfWeek(at: number = Date.now()): number {
  const d = new Date(startOfDay(at));
  const dow = (d.getDay() + 6) % 7; // 0 = lunes
  d.setDate(d.getDate() - dow);
  return d.getTime();
}

/** Clave "AAAA-MM-DD" en hora local. */
export function dayKey(at: number): string {
  const d = new Date(at);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
