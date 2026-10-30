import { db as defaultDb, type MedOSDB } from "../schema";
import type { FocusKind, FocusSession, FocusStatus, ID } from "../types";
import { newId } from "@/lib/ids";
import { logActivity } from "./activity";
import { addDays, dayKey, startOfDay } from "./time";

/** Una pausa más larga que esto se considera sesión abandonada (sin castigo: se guarda lo hecho). */
export const STALE_PAUSE_MS = 6 * 60 * 60 * 1000;
export const FOCUS_PRESETS = [5, 10, 15, 25, 45] as const;
export const BREAK_PRESETS: Record<Exclude<FocusKind, "focus">, number> = { short_break: 5, long_break: 15 };

export class FocusError extends Error {}

// ── Matemática con timestamps (sin contadores) ─────────────────────────

export function pausedMs(s: FocusSession, now: number = Date.now()): number {
  return s.pauses.reduce((acc, p) => acc + Math.max(0, (p.end ?? now) - p.start), 0);
}

/** Tiempo efectivo transcurrido. */
export function sessionFocusedMs(s: FocusSession, now: number = Date.now()): number {
  const end = s.endedAt ?? now;
  return Math.max(0, end - s.startedAt - pausedMs(s, end));
}

export function remainingMs(s: FocusSession, now: number = Date.now()): number {
  return Math.max(0, s.plannedMin * 60_000 - sessionFocusedMs(s, now));
}

/** Momento exacto en que la sesión llega a su duración planeada (si nunca se pausara de nuevo). */
export function plannedEndAt(s: FocusSession, now: number = Date.now()): number {
  return s.startedAt + s.plannedMin * 60_000 + pausedMs(s, now);
}

// ── Operaciones ─────────────────────────────────────────────────────────

export async function getActiveSession(database: MedOSDB = defaultDb): Promise<FocusSession | undefined> {
  const active = await database.focusSessions
    .where("status")
    .anyOf(["running", "paused"])
    .toArray();
  return active.sort((a, b) => b.startedAt - a.startedAt)[0];
}

async function close(
  database: MedOSDB,
  s: FocusSession,
  status: FocusStatus,
  endedAt: number,
): Promise<FocusSession> {
  const pauses = s.pauses.map((p) => (p.end === null ? { ...p, end: endedAt } : p));
  const closed: FocusSession = { ...s, pauses, status, endedAt };
  closed.focusedMs = Math.min(sessionFocusedMs(closed), s.plannedMin * 60_000);
  await database.focusSessions.put(closed);

  if (closed.kind === "focus" && closed.focusedMs >= 60_000) {
    const subject = closed.subjectId ? await database.subjects.get(closed.subjectId) : undefined;
    const minutes = Math.round(closed.focusedMs / 60_000);
    await logActivity(
      {
        type: "focus_session",
        subjectId: closed.subjectId,
        refId: closed.id,
        at: endedAt,
        summary: `${minutes} min de enfoque${subject ? ` · ${subject.name}` : ""}`,
      },
      database,
    );
  }
  return closed;
}

export async function startSession(
  input: { subjectId: ID | null; goal: string; plannedMin: number; kind: FocusKind },
  database: MedOSDB = defaultDb,
  now: number = Date.now(),
): Promise<FocusSession> {
  const goal = input.goal.replace(/\s+/g, " ").trim();
  if (input.kind === "focus" && !goal) throw new FocusError("Escribe un objetivo concreto para esta sesión.");
  const plannedMin = Math.round(input.plannedMin);
  if (!Number.isFinite(plannedMin) || plannedMin < 1 || plannedMin > 180) {
    throw new FocusError("La duración debe estar entre 1 y 180 minutos.");
  }
  const previous = await getActiveSession(database);
  if (previous) await close(database, previous, "interrupted", now);

  const session: FocusSession = {
    id: newId(),
    subjectId: input.kind === "focus" ? input.subjectId : null,
    goal: input.kind === "focus" ? goal.slice(0, 160) : input.kind === "short_break" ? "Descanso corto" : "Descanso largo",
    plannedMin,
    kind: input.kind,
    startedAt: now,
    endedAt: null,
    pauses: [],
    status: "running",
    focusedMs: 0,
  };
  await database.focusSessions.add(session);
  return session;
}

export async function pauseSession(id: ID, database: MedOSDB = defaultDb, now: number = Date.now()) {
  const s = await database.focusSessions.get(id);
  if (!s || s.status !== "running") return;
  await database.focusSessions.update(id, { status: "paused", pauses: [...s.pauses, { start: now, end: null }] });
}

export async function resumeSession(id: ID, database: MedOSDB = defaultDb, now: number = Date.now()) {
  const s = await database.focusSessions.get(id);
  if (!s || s.status !== "paused") return;
  const pauses = s.pauses.map((p) => (p.end === null ? { ...p, end: now } : p));
  await database.focusSessions.update(id, { status: "running", pauses });
}

export async function finishSession(
  id: ID,
  status: "completed" | "ended_early",
  database: MedOSDB = defaultDb,
  now: number = Date.now(),
): Promise<FocusSession | null> {
  const s = await database.focusSessions.get(id);
  if (!s || (s.status !== "running" && s.status !== "paused")) return null;
  const endedAt = status === "completed" ? Math.min(now, plannedEndAt(s, now)) : now;
  return close(database, s, status, endedAt);
}

/**
 * Ajusta una sesión activa al volver a la app (pestaña cerrada, iPhone bloqueado…):
 * - si el tiempo ya se cumplió, se marca completada en el momento exacto en que terminó;
 * - si lleva demasiado tiempo en pausa, se guarda como interrumpida con lo ya hecho.
 * Devuelve la sesión cerrada, si la hubo.
 */
export async function reconcileActiveSession(
  database: MedOSDB = defaultDb,
  now: number = Date.now(),
): Promise<FocusSession | null> {
  const s = await getActiveSession(database);
  if (!s) return null;
  if (s.status === "running" && remainingMs(s, now) <= 0) {
    return close(database, s, "completed", plannedEndAt(s, now));
  }
  const openPause = s.pauses.find((p) => p.end === null);
  if (s.status === "paused" && openPause && now - openPause.start > STALE_PAUSE_MS) {
    return close(database, s, "interrupted", openPause.start);
  }
  return null;
}

export async function recentSessions(limit = 15, database: MedOSDB = defaultDb): Promise<FocusSession[]> {
  const list = await database.focusSessions.orderBy("startedAt").reverse().limit(limit + 5).toArray();
  return list.filter((s) => s.status !== "running" && s.status !== "paused").slice(0, limit);
}

export interface WeeklyFocus {
  days: { key: string; label: string; minutes: number }[];
  totalMinutes: number;
  sessions: number;
  completed: number;
  bySubject: { subjectId: ID | null; minutes: number }[];
}

/** Últimos 7 días (incluido hoy), solo sesiones de enfoque. */
export async function weeklyFocus(now: number = Date.now(), database: MedOSDB = defaultDb): Promise<WeeklyFocus> {
  const from = addDays(startOfDay(now), -6);
  const sessions = (await database.focusSessions.where("startedAt").aboveOrEqual(from).toArray()).filter(
    (s) => s.kind === "focus",
  );
  const fmt = new Intl.DateTimeFormat("es-MX", { weekday: "short" });
  const days = Array.from({ length: 7 }, (_, i) => {
    const at = addDays(from, i);
    const label = fmt.format(new Date(at)).replace(".", "");
    return { key: dayKey(at), label: label.charAt(0).toUpperCase() + label.slice(1), minutes: 0 };
  });
  const bySubject = new Map<ID | null, number>();
  let completed = 0;
  for (const s of sessions) {
    const ms = s.endedAt === null ? sessionFocusedMs(s, now) : s.focusedMs;
    const min = ms / 60_000;
    const day = days.find((d) => d.key === dayKey(s.startedAt));
    if (day) day.minutes += min;
    bySubject.set(s.subjectId, (bySubject.get(s.subjectId) ?? 0) + min);
    if (s.status === "completed") completed++;
  }
  for (const d of days) d.minutes = Math.round(d.minutes);
  return {
    days,
    totalMinutes: days.reduce((a, d) => a + d.minutes, 0),
    sessions: sessions.length,
    completed,
    bySubject: [...bySubject.entries()]
      .map(([subjectId, m]) => ({ subjectId, minutes: Math.round(m) }))
      .sort((a, b) => b.minutes - a.minutes),
  };
}

export async function deleteSession(id: ID, database: MedOSDB = defaultDb) {
  await database.focusSessions.delete(id);
}
