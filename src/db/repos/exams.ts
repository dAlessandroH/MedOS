import { db as defaultDb, type MedOSDB } from "../schema";
import type { Exam, ID } from "../types";
import { newId } from "@/lib/ids";
import { startOfDay } from "./time";

export class ExamError extends Error {}

export async function createExam(
  input: { subjectId: ID; title: string; date: number; notes?: string },
  database: MedOSDB = defaultDb,
): Promise<Exam> {
  const title = input.title.replace(/\s+/g, " ").trim();
  if (!title) throw new ExamError("Escribe un nombre para el examen.");
  if (!Number.isFinite(input.date)) throw new ExamError("Elige una fecha válida.");
  if (!(await database.subjects.get(input.subjectId))) throw new ExamError("Elige una materia.");
  const now = Date.now();
  const exam: Exam = {
    id: newId(),
    subjectId: input.subjectId,
    title: title.slice(0, 80),
    date: startOfDay(input.date),
    notes: input.notes?.trim() || undefined,
    createdAt: now,
    updatedAt: now,
  };
  await database.exams.add(exam);
  return exam;
}

export async function deleteExam(id: ID, database: MedOSDB = defaultDb) {
  await database.exams.delete(id);
}

/** Exámenes de hoy en adelante, del más cercano al más lejano. */
export async function upcomingExams(
  now: number = Date.now(),
  limit = 10,
  database: MedOSDB = defaultDb,
): Promise<Exam[]> {
  return database.exams.where("date").aboveOrEqual(startOfDay(now)).limit(limit).sortBy("date");
}

export async function pastExams(now: number = Date.now(), database: MedOSDB = defaultDb): Promise<Exam[]> {
  const list = await database.exams.where("date").below(startOfDay(now)).sortBy("date");
  return list.reverse();
}

/** Días naturales que faltan (0 = hoy). */
export function daysUntil(date: number, now: number = Date.now()): number {
  return Math.round((startOfDay(date) - startOfDay(now)) / 86_400_000);
}

export function daysUntilLabel(days: number): string {
  if (days === 0) return "Hoy";
  if (days === 1) return "Mañana";
  return `En ${days} días`;
}
