import Dexie, { type EntityTable, type Table } from "dexie";
import type {
  ActivityEvent,
  Card,
  CaseAttempt,
  ClinicalCase,
  Deck,
  Exam,
  FocusSession,
  Media,
  MetaEntry,
  ReviewLog,
  Subject,
  WeakConcept,
} from "./types";

import { SCHEMA_VERSION } from "./version";

export const DB_NAME = "medos";
export { SCHEMA_VERSION };

/**
 * Base de datos local (IndexedDB vía Dexie).
 *
 * Reglas para versiones futuras:
 * - Nunca editar una versión existente: agregar this.version(N+1) con su .upgrade().
 * - Solo se declaran los campos indexados; el resto del objeto se guarda igual.
 * - Booleanos y null no son claves válidas en IndexedDB → no se indexan.
 */
export class MedOSDB extends Dexie {
  subjects!: EntityTable<Subject, "id">;
  decks!: EntityTable<Deck, "id">;
  exams!: EntityTable<Exam, "id">;
  cards!: EntityTable<Card, "id">;
  reviewLogs!: EntityTable<ReviewLog, "id">;
  media!: EntityTable<Media, "id">;
  focusSessions!: EntityTable<FocusSession, "id">;
  clinicalCases!: EntityTable<ClinicalCase, "id">;
  caseAttempts!: EntityTable<CaseAttempt, "id">;
  weakConcepts!: EntityTable<WeakConcept, "id">;
  activity!: EntityTable<ActivityEvent, "id">;
  meta!: Table<MetaEntry, string>;

  constructor(name: string = DB_NAME) {
    super(name);

    this.version(SCHEMA_VERSION).stores({
      subjects: "id, name, createdAt",
      decks: "id, subjectId, parentId, updatedAt",
      exams: "id, subjectId, date",
      cards: "id, deckId, subjectId, due, sourceHash, [deckId+due], [subjectId+due]",
      reviewLogs: "id, cardId, deckId, subjectId, reviewedAt",
      media: "id, createdAt",
      focusSessions: "id, subjectId, startedAt, status",
      clinicalCases: "id, specialty, difficulty, subjectId, sourceHash",
      caseAttempts: "id, caseId, startedAt, finishedAt",
      weakConcepts: "id, subjectId, source, lastSeenAt",
      activity: "id, at, type, subjectId",
      meta: "key",
    });

    this.on("populate", (tx) => {
      const now = Date.now();
      tx.table("meta").bulkAdd([
        { key: "schemaVersion", value: SCHEMA_VERSION },
        { key: "createdAt", value: now },
        { key: "lastBackupAt", value: null },
      ]);
    });
  }
}

/**
 * Instancia única. Dexie abre la base de forma perezosa en la primera
 * consulta, así que importarla durante la compilación estática es seguro.
 */
export const db = new MedOSDB();
