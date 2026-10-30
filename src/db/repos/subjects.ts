import { db as defaultDb, type MedOSDB } from "../schema";
import type { ID, Subject } from "../types";
import { newId } from "@/lib/ids";

/** Colores de identificación de materias, legibles sobre el fondo oscuro. */
export const SUBJECT_COLORS = [
  "#3b82f6", // azul
  "#38bdf8", // celeste
  "#2dd4bf", // turquesa
  "#10b981", // esmeralda
  "#a3e635", // lima
  "#f59e0b", // ámbar
  "#f472b6", // rosa
  "#a78bfa", // violeta
] as const;

export const SUBJECT_NAME_MAX = 60;

export type SubjectErrorCode = "invalid" | "duplicate" | "not_found" | "has_content";

export class SubjectError extends Error {
  constructor(
    message: string,
    public readonly code: SubjectErrorCode = "invalid",
  ) {
    super(message);
    this.name = "SubjectError";
  }
}

function cleanName(raw: string): string {
  const name = raw.replace(/\s+/g, " ").trim();
  if (!name) throw new SubjectError("Escribe un nombre para la materia.");
  if (name.length > SUBJECT_NAME_MAX) {
    throw new SubjectError(`El nombre no puede pasar de ${SUBJECT_NAME_MAX} caracteres.`);
  }
  return name;
}

function cleanColor(color: string): string {
  return /^#[0-9a-f]{6}$/i.test(color) ? color.toLowerCase() : SUBJECT_COLORS[0];
}

async function assertUniqueName(database: MedOSDB, name: string, exceptId?: ID) {
  const key = name.toLocaleLowerCase("es-MX");
  const clash = await database.subjects
    .filter((s) => s.id !== exceptId && s.name.toLocaleLowerCase("es-MX") === key)
    .first();
  if (clash) {
    throw new SubjectError(
      clash.archived
        ? `Ya existe "${clash.name}" en materias archivadas. Restáurala en lugar de crear otra.`
        : `Ya tienes una materia llamada "${clash.name}".`,
      "duplicate",
    );
  }
}

/** Ordenadas alfabéticamente; las archivadas solo si se piden. */
export async function listSubjects(
  opts: { includeArchived?: boolean } = {},
  database: MedOSDB = defaultDb,
): Promise<Subject[]> {
  const all = await database.subjects.toArray();
  return all
    .filter((s) => opts.includeArchived || !s.archived)
    .sort((a, b) => a.name.localeCompare(b.name, "es-MX", { sensitivity: "base" }));
}

export async function createSubject(
  input: { name: string; color?: string },
  database: MedOSDB = defaultDb,
): Promise<Subject> {
  const name = cleanName(input.name);
  const now = Date.now();
  const subject: Subject = {
    id: newId(),
    name,
    color: cleanColor(input.color ?? SUBJECT_COLORS[0]),
    archived: false,
    createdAt: now,
    updatedAt: now,
  };

  await database.transaction("rw", database.subjects, database.activity, async () => {
    await assertUniqueName(database, name);
    await database.subjects.add(subject);
    await database.activity.add({
      id: newId(),
      type: "subject_created",
      subjectId: subject.id,
      refId: subject.id,
      at: now,
      summary: `Nueva materia: ${name}`,
    });
  });

  return subject;
}

export async function updateSubject(
  id: ID,
  patch: { name?: string; color?: string },
  database: MedOSDB = defaultDb,
): Promise<void> {
  await database.transaction("rw", database.subjects, async () => {
    const current = await database.subjects.get(id);
    if (!current) throw new SubjectError("La materia ya no existe.", "not_found");
    const changes: Partial<Subject> = { updatedAt: Date.now() };
    if (patch.name !== undefined) {
      const name = cleanName(patch.name);
      await assertUniqueName(database, name, id);
      changes.name = name;
    }
    if (patch.color !== undefined) changes.color = cleanColor(patch.color);
    await database.subjects.update(id, changes);
  });
}

export async function setSubjectArchived(
  id: ID,
  archived: boolean,
  database: MedOSDB = defaultDb,
): Promise<void> {
  const updated = await database.subjects.update(id, { archived, updatedAt: Date.now() });
  if (!updated) throw new SubjectError("La materia ya no existe.", "not_found");
}

/** Cuántos registros dependen de una materia (mazos, tarjetas, sesiones, casos, exámenes). */
export async function countSubjectDependents(id: ID, database: MedOSDB = defaultDb) {
  const [decks, cards, focusSessions, clinicalCases, exams] = await Promise.all([
    database.decks.where("subjectId").equals(id).count(),
    database.cards.where("subjectId").equals(id).count(),
    database.focusSessions.where("subjectId").equals(id).count(),
    database.clinicalCases.where("subjectId").equals(id).count(),
    database.exams.where("subjectId").equals(id).count(),
  ]);
  return { decks, cards, focusSessions, clinicalCases, exams, total: decks + cards + focusSessions + clinicalCases + exams };
}

/**
 * Elimina una materia solo si no tiene nada asociado.
 * Si tiene contenido, la UI ofrece archivarla: nunca se borra estudio por accidente.
 */
export async function deleteSubject(id: ID, database: MedOSDB = defaultDb): Promise<void> {
  const deps = await countSubjectDependents(id, database);
  if (deps.total > 0) {
    throw new SubjectError(
      "Esta materia tiene contenido asociado. Archívala para ocultarla sin perder nada.",
      "has_content",
    );
  }
  await database.subjects.delete(id);
}
