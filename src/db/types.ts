/**
 * Modelo de datos de MedOS.
 *
 * Convenciones:
 * - Todas las fechas son epoch en milisegundos (number): se indexan bien
 *   en IndexedDB y viajan sin pérdida en los respaldos JSON.
 * - Los IDs son UUID v4 (string).
 * - IndexedDB NO indexa booleanos ni null: esos campos se filtran en memoria.
 */

export type ID = string;
export type Millis = number;

// ── Organización (compartida por los 4 módulos) ──────────────────────────

export interface Subject {
  id: ID;
  name: string;
  /** Color de identificación (hex) */
  color: string;
  archived: boolean;
  createdAt: Millis;
  updatedAt: Millis;
}

/** Tema (parentId = null) o subtema (parentId = id del tema). */
export interface Deck {
  id: ID;
  subjectId: ID;
  parentId: ID | null;
  name: string;
  /** Límite de tarjetas nuevas por día */
  newPerDay: number;
  createdAt: Millis;
  updatedAt: Millis;
}

export interface Exam {
  id: ID;
  subjectId: ID;
  title: string;
  date: Millis;
  notes?: string;
  createdAt: Millis;
  updatedAt: Millis;
}

// ── 02 NeuroRecall ───────────────────────────────────────────────────────

/** Estado FSRS serializado (se convierte desde/hacia ts-fsrs en la Fase 3). */
export interface FsrsState {
  due: Millis;
  stability: number;
  difficulty: number;
  elapsedDays: number;
  scheduledDays: number;
  learningSteps: number;
  reps: number;
  lapses: number;
  /** 0 New · 1 Learning · 2 Review · 3 Relearning */
  state: 0 | 1 | 2 | 3;
  lastReview: Millis | null;
}

export type OptionKey = "a" | "b" | "c" | "d";

export interface Card {
  id: ID;
  deckId: ID;
  subjectId: ID;
  /** basic = flashcard pregunta/respuesta · mcq = formato de plataforma (8 columnas) */
  type: "basic" | "mcq";
  /** HTML saneado */
  front: string;
  back: string;
  options?: Record<OptionKey, string>;
  correct?: OptionKey;
  explanation?: string;
  imageIds: ID[];
  tags: string[];
  fsrs: FsrsState;
  /** Copia de fsrs.due en primer nivel para poder indexarla */
  due: Millis;
  lapses: number;
  suspended: boolean;
  /** Hash del contenido original: evita duplicados al reimportar */
  sourceHash: string;
  createdAt: Millis;
  updatedAt: Millis;
}

export type Rating = 1 | 2 | 3 | 4; // Otra vez · Difícil · Bien · Fácil

export interface ReviewLog {
  id: ID;
  cardId: ID;
  deckId: ID;
  subjectId: ID;
  rating: Rating;
  stateBefore: FsrsState["state"];
  stability: number;
  difficulty: number;
  scheduledDays: number;
  reviewedAt: Millis;
  durationMs: number;
  typedAnswer?: string;
  /** Estado FSRS previo: permite "Deshacer" la última calificación */
  prev: FsrsState;
}

export interface Media {
  id: ID;
  blob: Blob;
  mime: string;
  width: number;
  height: number;
  bytes: number;
  createdAt: Millis;
}

// ── 03 FocusMD ───────────────────────────────────────────────────────────

export interface Pause {
  start: Millis;
  end: Millis | null;
}

export type FocusKind = "focus" | "short_break" | "long_break";
export type FocusStatus = "running" | "paused" | "completed" | "ended_early" | "interrupted";

export interface FocusSession {
  id: ID;
  subjectId: ID | null;
  goal: string;
  plannedMin: number;
  kind: FocusKind;
  startedAt: Millis;
  endedAt: Millis | null;
  pauses: Pause[];
  status: FocusStatus;
  /** Tiempo efectivo; se calcula con timestamps, nunca con un contador */
  focusedMs: number;
}

// ── 04 ClinicalLab ───────────────────────────────────────────────────────

export interface Vitals {
  /** Tensión arterial, p. ej. "120/80" */
  ta?: string;
  fc?: number;
  fr?: number;
  temp?: number;
  spo2?: number;
  weightKg?: number;
  heightCm?: number;
}

export interface LabResult {
  name: string;
  value: string;
  unit: string;
  reference: string;
  flag: "H" | "L" | "N";
}

export type CaseStepKind = "mcq" | "ddx" | "labs" | "physio";

export interface CaseStep {
  id: ID;
  kind: CaseStepKind;
  /** Información nueva que se revela antes de la pregunta (casos seriados) */
  reveal?: string;
  question: string;
  options: Record<OptionKey, string>;
  correct: OptionKey;
  explanation: string;
  /** Concepto evaluado → alimenta "conceptos débiles" si fallas */
  concept: string;
}

export interface Reference {
  citation: string;
  url?: string;
}

export interface ClinicalCase {
  id: ID;
  title: string;
  specialty: string;
  difficulty: 1 | 2 | 3;
  subjectId?: ID;
  patient: { age: number; sex: "F" | "M" };
  chiefComplaint: string;
  hpi: string;
  history: {
    personal?: string;
    family?: string;
    medications?: string;
    allergies?: string;
    other?: string;
  };
  physicalExam: string;
  vitals: Vitals;
  labs?: LabResult[];
  steps: CaseStep[];
  references: Reference[];
  tags: string[];
  sourceHash: string;
  createdAt: Millis;
  updatedAt: Millis;
}

export interface CaseAnswer {
  stepId: ID;
  chosen: OptionKey;
  correct: boolean;
  ms: number;
}

export interface CaseAttempt {
  id: ID;
  caseId: ID;
  startedAt: Millis;
  finishedAt: Millis | null;
  answers: CaseAnswer[];
  /** 0–100 */
  score: number | null;
}

// ── Transversal ──────────────────────────────────────────────────────────

export interface WeakConcept {
  id: ID;
  label: string;
  subjectId: ID | null;
  source: "recall" | "lab";
  refId: ID;
  hits: number;
  lastSeenAt: Millis;
  resolved: boolean;
}

export type ActivityType =
  | "subject_created"
  | "review_session"
  | "focus_session"
  | "case_completed"
  | "import"
  | "backup";

export interface ActivityEvent {
  id: ID;
  type: ActivityType;
  subjectId: ID | null;
  refId: ID | null;
  at: Millis;
  summary: string;
}

export interface MetaEntry {
  key: string;
  value: unknown;
}
