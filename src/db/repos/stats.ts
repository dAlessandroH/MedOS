import { db as defaultDb, type MedOSDB } from "../schema";
import type { ActivityEvent, Card, ClinicalCase, Exam, FocusSession, ID, ReviewLog, Subject, WeakConcept } from "../types";
import { buildQueue, MASTERED_STABILITY } from "./cards";
import { getActiveSession, sessionFocusedMs, weeklyFocus } from "./focus";
import { latestOpenAttempt } from "./cases";
import { listWeakConcepts, recentActivity } from "./activity";
import { upcomingExams } from "./exams";
import { addDays, dayKey, startOfDay, startOfWeek } from "./time";

export { sessionFocusedMs } from "./focus";
export { startOfDay } from "./time";

// ── NeuroRecall ─────────────────────────────────────────────────────────

/** Retención real: % de repasos (tarjetas en estado Review) que recordaste. */
export function retentionOf(logs: ReviewLog[]): number | null {
  const reviews = logs.filter((l) => l.stateBefore === 2);
  if (reviews.length === 0) return null;
  return Math.round((reviews.filter((l) => l.rating > 1).length / reviews.length) * 100);
}

export interface SubjectProgress {
  subject: Subject;
  total: number;
  fresh: number;
  learning: number;
  mastered: number;
  due: number;
  /** 0–100 */
  masteredPct: number;
}

export function progressOf(subject: Subject, cards: Card[], now: number): SubjectProgress {
  const mine = cards.filter((c) => c.subjectId === subject.id && !c.suspended);
  const fresh = mine.filter((c) => c.fsrs.state === 0).length;
  const mastered = mine.filter((c) => c.fsrs.state === 2 && c.fsrs.stability >= MASTERED_STABILITY).length;
  const due = mine.filter((c) => c.fsrs.state !== 0 && c.due <= now).length;
  return {
    subject,
    total: mine.length,
    fresh,
    learning: mine.length - fresh - mastered,
    mastered,
    due,
    masteredPct: mine.length ? Math.round((mastered / mine.length) * 100) : 0,
  };
}

export interface RecallStats {
  totals: { cards: number; fresh: number; learning: number; review: number; suspended: number };
  retention30: number | null;
  reviewsToday: number;
  perDay: { key: string; label: string; reviews: number; recalled: number }[];
  forecast: { key: string; label: string; due: number }[];
  problematic: Card[];
  recentMistakes: { log: ReviewLog; card: Card }[];
}

export async function getRecallStats(now: number = Date.now(), database: MedOSDB = defaultDb): Promise<RecallStats> {
  const today = startOfDay(now);
  const [cards, logs30] = await Promise.all([
    database.cards.toArray(),
    database.reviewLogs.where("reviewedAt").aboveOrEqual(addDays(today, -29)).toArray(),
  ]);
  const byId = new Map<string, Card>(cards.map((c) => [c.id, c] as const));
  const dayFmt = new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "short" });

  const perDay = Array.from({ length: 14 }, (_, i) => {
    const at = addDays(today, i - 13);
    return { key: dayKey(at), label: dayFmt.format(new Date(at)).replace(".", ""), reviews: 0, recalled: 0 };
  });
  for (const l of logs30) {
    const d = perDay.find((p) => p.key === dayKey(l.reviewedAt));
    if (!d) continue;
    d.reviews++;
    if (l.rating > 1) d.recalled++;
  }

  const forecast = Array.from({ length: 7 }, (_, i) => {
    const at = addDays(today, i);
    return { key: dayKey(at), label: i === 0 ? "Hoy" : dayFmt.format(new Date(at)).replace(".", ""), due: 0 };
  });
  const active = cards.filter((c) => !c.suspended);
  for (const c of active) {
    if (c.fsrs.state === 0) continue;
    const idx = c.due <= now ? 0 : Math.floor((startOfDay(c.due) - today) / 86_400_000);
    if (idx >= 0 && idx < 7) forecast[idx].due++;
  }

  const recentMistakes = logs30
    .filter((l) => l.rating === 1 && byId.has(l.cardId))
    .sort((a, b) => b.reviewedAt - a.reviewedAt)
    .slice(0, 12)
    .map((log) => ({ log, card: byId.get(log.cardId)! }));

  return {
    totals: {
      cards: cards.length,
      fresh: active.filter((c) => c.fsrs.state === 0).length,
      learning: active.filter((c) => c.fsrs.state === 1 || c.fsrs.state === 3).length,
      review: active.filter((c) => c.fsrs.state === 2).length,
      suspended: cards.length - active.length,
    },
    retention30: retentionOf(logs30),
    reviewsToday: logs30.filter((l) => l.reviewedAt >= today).length,
    perDay,
    forecast,
    problematic: active.filter((c) => c.lapses >= 3).sort((a, b) => b.lapses - a.lapses).slice(0, 15),
    recentMistakes,
  };
}

// ── Dashboard ───────────────────────────────────────────────────────────

export interface DashboardData {
  now: number;
  subjects: Subject[];
  focusedMinutesToday: number;
  focusedMinutesWeek: number;
  reviewsDue: number;
  newAvailable: number;
  totalCards: number;
  retention30: number | null;
  progress: SubjectProgress[];
  exams: Exam[];
  activeSession: FocusSession | undefined;
  openCase: ClinicalCase | undefined;
  weak: WeakConcept[];
  activity: ActivityEvent[];
  casesCount: number;
  casesCompleted: number;
  /** Materia con más repasos vencidos (para dirigir el repaso) */
  dueBySubject: Map<ID, number>;
  lastBackupAt: number | null;
}

export async function getDashboardData(now: number = Date.now(), database: MedOSDB = defaultDb): Promise<DashboardData> {
  const today = startOfDay(now);
  const [subjectsAll, cards, queue, focusToday, week, exams, activeSession, open, weak, activity, logs30, casesCount, attempts, backupMeta] =
    await Promise.all([
      database.subjects.toArray(),
      database.cards.toArray(),
      buildQueue({}, now, database),
      database.focusSessions.where("startedAt").aboveOrEqual(today).toArray(),
      weeklyFocus(now, database),
      upcomingExams(now, 5, database),
      getActiveSession(database),
      latestOpenAttempt(database),
      listWeakConcepts({}, database),
      recentActivity(6, database),
      database.reviewLogs.where("reviewedAt").aboveOrEqual(addDays(today, -29)).toArray(),
      database.clinicalCases.count(),
      database.caseAttempts.toArray(),
      database.meta.get("lastBackupAt"),
    ]);

  const subjects = subjectsAll
    .filter((s) => !s.archived)
    .sort((a, b) => a.name.localeCompare(b.name, "es-MX", { sensitivity: "base" }));
  const focusedMs = focusToday
    .filter((s) => s.kind === "focus")
    .reduce((acc, s) => acc + (s.endedAt === null ? sessionFocusedMs(s, now) : s.focusedMs), 0);

  const dueBySubject = new Map<ID, number>();
  for (const c of queue.reviews) dueBySubject.set(c.subjectId, (dueBySubject.get(c.subjectId) ?? 0) + 1);

  return {
    now,
    subjects,
    focusedMinutesToday: Math.round(focusedMs / 60_000),
    focusedMinutesWeek: week.days
      .filter((d) => d.key >= dayKey(startOfWeek(now)))
      .reduce((a, d) => a + d.minutes, 0),
    reviewsDue: queue.reviews.length,
    newAvailable: queue.fresh.length,
    totalCards: cards.length,
    retention30: retentionOf(logs30),
    progress: subjects.map((s) => progressOf(s, cards, now)).filter((p) => p.total > 0),
    exams,
    activeSession,
    openCase: open ? await database.clinicalCases.get(open.caseId) : undefined,
    weak,
    activity,
    casesCount,
    casesCompleted: attempts.filter((a) => a.finishedAt !== null).length,
    dueBySubject,
    lastBackupAt: typeof backupMeta?.value === "number" ? backupMeta.value : null,
  };
}
