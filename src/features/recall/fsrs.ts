/**
 * Puente entre MedOS y ts-fsrs (implementación oficial de FSRS,
 * https://github.com/open-spaced-repetition/ts-fsrs). Aquí NO se simula
 * el algoritmo: solo se convierten tipos (fechas ↔ milisegundos).
 */
import {
  createEmptyCard,
  fsrs,
  generatorParameters,
  Rating as FsrsRating,
  type Card as TsCard,
  type Grade,
} from "ts-fsrs";
import type { FsrsState, Rating } from "@/db/types";

export const DESIRED_RETENTION = 0.9;

const scheduler = fsrs(
  generatorParameters({
    request_retention: DESIRED_RETENTION,
    maximum_interval: 3650,
    enable_fuzz: true,
  }),
);

export function toTsCard(s: FsrsState): TsCard {
  const base = createEmptyCard(new Date(s.due));
  return {
    ...base,
    due: new Date(s.due),
    stability: s.stability,
    difficulty: s.difficulty,
    elapsed_days: s.elapsedDays,
    scheduled_days: s.scheduledDays,
    learning_steps: s.learningSteps,
    reps: s.reps,
    lapses: s.lapses,
    state: s.state,
    last_review: s.lastReview === null ? undefined : new Date(s.lastReview),
  } as TsCard;
}

export function fromTsCard(c: TsCard): FsrsState {
  const extra = c as TsCard & { learning_steps?: number; elapsed_days?: number };
  return {
    due: c.due.getTime(),
    stability: c.stability,
    difficulty: c.difficulty,
    elapsedDays: extra.elapsed_days ?? 0,
    scheduledDays: c.scheduled_days,
    learningSteps: extra.learning_steps ?? 0,
    reps: c.reps,
    lapses: c.lapses,
    state: c.state as FsrsState["state"],
    lastReview: c.last_review ? new Date(c.last_review).getTime() : null,
  };
}

/** Estado inicial de una tarjeta nueva. */
export function newFsrsState(now: number = Date.now()): FsrsState {
  return fromTsCard(createEmptyCard(new Date(now)));
}

const GRADE: Record<Rating, Grade> = {
  1: FsrsRating.Again as Grade,
  2: FsrsRating.Hard as Grade,
  3: FsrsRating.Good as Grade,
  4: FsrsRating.Easy as Grade,
};

/** Aplica una calificación y devuelve el nuevo estado según FSRS. */
export function schedule(state: FsrsState, rating: Rating, now: number = Date.now()): FsrsState {
  const result = scheduler.next(toTsCard(state), new Date(now), GRADE[rating]);
  return fromTsCard(result.card);
}

/** Próxima fecha para cada uno de los 4 botones (vista previa). */
export function previewDue(state: FsrsState, now: number = Date.now()): Record<Rating, number> {
  return {
    1: schedule(state, 1, now).due,
    2: schedule(state, 2, now).due,
    3: schedule(state, 3, now).due,
    4: schedule(state, 4, now).due,
  };
}

/** Probabilidad (0–1) de recordar la tarjeta ahora. Nueva = 0. */
export function retrievability(state: FsrsState, now: number = Date.now()): number {
  if (state.state === 0) return 0;
  const r = scheduler.get_retrievability(toTsCard(state), new Date(now), false);
  return typeof r === "number" && Number.isFinite(r) ? r : 0;
}

/** "10 min", "3 h", "4 d", "2 m", "1.5 a" */
export function formatInterval(ms: number): string {
  const min = Math.max(1, Math.round(ms / 60_000));
  if (min < 60) return `${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} h`;
  const d = Math.round(h / 24);
  if (d < 31) return `${d} d`;
  const m = d / 30.4;
  if (m < 12) return `${Math.round(m)} m`;
  const y = d / 365;
  return `${y < 10 ? y.toFixed(1).replace(/\.0$/, "") : Math.round(y)} a`;
}
