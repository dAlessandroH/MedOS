import { z } from "zod";
import { db as defaultDb, type MedOSDB } from "../schema";
import type { CaseAttempt, CaseStep, ClinicalCase, ID, OptionKey } from "../types";
import { newId } from "@/lib/ids";
import { contentKey } from "@/lib/hash";
import { logActivity, recordWeakConcept } from "./activity";

/**
 * Formato de importación de casos de ClinicalLab (JSON, claves en español).
 * Documentado en docs/FORMATO-CASOS.md y en la plantilla descargable.
 */
const texto = (campo: string, max = 4000) =>
  z.string({ required_error: `Falta "${campo}".`, invalid_type_error: `"${campo}" debe ser texto.` })
    .trim()
    .min(1, `"${campo}" no puede estar vacío.`)
    .max(max, `"${campo}" es demasiado largo.`);

const opcional = (max = 4000) => z.string().trim().max(max).optional();
const letra = z.enum(["a", "b", "c", "d"], { errorMap: () => ({ message: '"correcta" debe ser "a", "b", "c" o "d".' }) });

const pasoSchema = z.object({
  tipo: z.enum(["opcion_multiple", "diagnostico_diferencial", "laboratorios", "fisiopatologia"], {
    errorMap: () => ({
      message: '"tipo" debe ser opcion_multiple, diagnostico_diferencial, laboratorios o fisiopatologia.',
    }),
  }),
  revelar: opcional(),
  pregunta: texto("pregunta", 1000),
  opciones: z.object({ a: texto("opciones.a", 400), b: texto("opciones.b", 400), c: texto("opciones.c", 400), d: texto("opciones.d", 400) }),
  correcta: letra,
  explicacion: texto("explicacion"),
  concepto: texto("concepto", 160),
});

const casoSchema = z.object({
  titulo: texto("titulo", 120),
  especialidad: texto("especialidad", 60),
  dificultad: z.union([z.literal(1), z.literal(2), z.literal(3)], {
    errorMap: () => ({ message: '"dificultad" debe ser 1, 2 o 3.' }),
  }),
  materia: opcional(60),
  paciente: z.object({
    edad: z.number({ invalid_type_error: '"paciente.edad" debe ser un número.' }).int().min(0).max(120),
    sexo: z.enum(["F", "M"], { errorMap: () => ({ message: '"paciente.sexo" debe ser "F" o "M".' }) }),
  }),
  motivoConsulta: texto("motivoConsulta", 400),
  padecimientoActual: texto("padecimientoActual"),
  antecedentes: z
    .object({
      personales: opcional(),
      familiares: opcional(),
      medicamentos: opcional(),
      alergias: opcional(),
      otros: opcional(),
    })
    .default({}),
  exploracionFisica: texto("exploracionFisica"),
  signosVitales: z.object({
    ta: z.string().trim().regex(/^\d{2,3}\/\d{2,3}$/, '"signosVitales.ta" debe tener formato "120/80".').optional(),
    fc: z.number().min(0).max(300).optional(),
    fr: z.number().min(0).max(80).optional(),
    temp: z.number().min(25).max(45).optional(),
    spo2: z.number().min(0).max(100).optional(),
    peso: z.number().min(0).max(400).optional(),
    talla: z.number().min(0).max(250).optional(),
  }),
  laboratorios: z
    .array(
      z.object({
        estudio: texto("laboratorios.estudio", 80),
        valor: z.union([z.string(), z.number()]).transform(String),
        unidad: z.string().trim().max(30).default(""),
        referencia: z.string().trim().max(60).default(""),
        bandera: z.enum(["H", "L", "N"]).default("N"),
      }),
    )
    .optional(),
  pasos: z.array(pasoSchema).min(1, "Cada caso necesita al menos un paso con pregunta."),
  referencias: z
    .array(z.object({ cita: texto("referencias.cita", 400), url: z.string().url('"url" no es una URL válida.').optional() }))
    .min(1, "Cada caso necesita al menos una referencia verificable."),
  etiquetas: z.array(z.string().trim().min(1).max(40)).default([]),
});

export type CaseJson = z.input<typeof casoSchema>;

const STEP_KIND: Record<z.infer<typeof pasoSchema>["tipo"], CaseStep["kind"]> = {
  opcion_multiple: "mcq",
  diagnostico_diferencial: "ddx",
  laboratorios: "labs",
  fisiopatologia: "physio",
};

export const STEP_KIND_LABEL: Record<CaseStep["kind"], string> = {
  mcq: "Opción múltiple",
  ddx: "Diagnóstico diferencial",
  labs: "Interpretación de laboratorios",
  physio: "Fisiopatología",
};

export interface ParsedCases {
  cases: (ClinicalCase & { subjectName?: string })[];
  errors: string[];
}

function formatIssue(caseIndex: number, title: string | undefined, issue: z.ZodIssue): string {
  const where = issue.path.length ? ` (en ${issue.path.join(".")})` : "";
  return `Caso ${caseIndex + 1}${title ? ` «${title}»` : ""}: ${issue.message}${where}`;
}

/** Acepta { "casos": [...] }, una lista de casos o un solo caso. */
export function parseCasesJson(text: string): ParsedCases {
  let raw: unknown;
  try {
    raw = JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);
  } catch {
    return { cases: [], errors: ["El archivo no es un JSON válido."] };
  }
  const list: unknown[] = Array.isArray(raw)
    ? raw
    : raw && typeof raw === "object" && Array.isArray((raw as { casos?: unknown }).casos)
      ? (raw as { casos: unknown[] }).casos
      : [raw];

  const cases: ParsedCases["cases"] = [];
  const errors: string[] = [];
  const now = Date.now();

  list.forEach((item, i) => {
    const title = (item as { titulo?: unknown })?.titulo;
    const result = casoSchema.safeParse(item);
    if (!result.success) {
      errors.push(...result.error.issues.slice(0, 3).map((iss) => formatIssue(i, typeof title === "string" ? title : undefined, iss)));
      return;
    }
    const c = result.data;
    cases.push({
      id: newId(),
      title: c.titulo,
      specialty: c.especialidad,
      difficulty: c.dificultad,
      subjectName: c.materia,
      patient: { age: c.paciente.edad, sex: c.paciente.sexo },
      chiefComplaint: c.motivoConsulta,
      hpi: c.padecimientoActual,
      history: {
        personal: c.antecedentes.personales,
        family: c.antecedentes.familiares,
        medications: c.antecedentes.medicamentos,
        allergies: c.antecedentes.alergias,
        other: c.antecedentes.otros,
      },
      physicalExam: c.exploracionFisica,
      vitals: {
        ta: c.signosVitales.ta,
        fc: c.signosVitales.fc,
        fr: c.signosVitales.fr,
        temp: c.signosVitales.temp,
        spo2: c.signosVitales.spo2,
        weightKg: c.signosVitales.peso,
        heightCm: c.signosVitales.talla,
      },
      labs: c.laboratorios?.map((l) => ({ name: l.estudio, value: l.valor, unit: l.unidad, reference: l.referencia, flag: l.bandera })),
      steps: c.pasos.map((p) => ({
        id: newId(),
        kind: STEP_KIND[p.tipo],
        reveal: p.revelar || undefined,
        question: p.pregunta,
        options: p.opciones,
        correct: p.correcta,
        explanation: p.explicacion,
        concept: p.concepto,
      })),
      references: c.referencias.map((r) => ({ citation: r.cita, url: r.url })),
      tags: c.etiquetas,
      sourceHash: contentKey(c.titulo, c.motivoConsulta, c.padecimientoActual),
      createdAt: now,
      updatedAt: now,
    });
  });

  if (list.length === 0) errors.push("El archivo no contiene casos.");
  return { cases, errors };
}

/** Guarda casos nuevos (omite los que ya existen). Asocia "materia" por nombre si coincide. */
export async function importCases(
  cases: ParsedCases["cases"],
  database: MedOSDB = defaultDb,
): Promise<{ added: number; duplicates: number }> {
  const existing = new Set((await database.clinicalCases.toArray()).map((c) => c.sourceHash));
  const subjects = await database.subjects.toArray();
  const byName = new Map<string, ID>(subjects.map((s) => [s.name.toLocaleLowerCase("es-MX"), s.id] as const));
  let added = 0;
  let duplicates = 0;
  for (const { subjectName, ...c } of cases) {
    if (existing.has(c.sourceHash)) {
      duplicates++;
      continue;
    }
    existing.add(c.sourceHash);
    const subjectId = subjectName ? byName.get(subjectName.toLocaleLowerCase("es-MX")) : undefined;
    await database.clinicalCases.add({ ...c, subjectId });
    added++;
  }
  if (added > 0) {
    await logActivity({ type: "import", summary: `Importaste ${added} ${added === 1 ? "caso clínico" : "casos clínicos"}` }, database);
  }
  return { added, duplicates };
}

export async function deleteCase(id: ID, database: MedOSDB = defaultDb) {
  await database.transaction("rw", [database.clinicalCases, database.caseAttempts], async () => {
    await database.caseAttempts.where("caseId").equals(id).delete();
    await database.clinicalCases.delete(id);
  });
}

export async function setCaseSubject(id: ID, subjectId: ID | undefined, database: MedOSDB = defaultDb) {
  await database.clinicalCases.update(id, { subjectId, updatedAt: Date.now() });
}

// ── Intentos ────────────────────────────────────────────────────────────

export async function getOpenAttempt(caseId: ID, database: MedOSDB = defaultDb): Promise<CaseAttempt | undefined> {
  const attempts = await database.caseAttempts.where("caseId").equals(caseId).toArray();
  return attempts.filter((a) => a.finishedAt === null).sort((a, b) => b.startedAt - a.startedAt)[0];
}

export async function startAttempt(caseId: ID, database: MedOSDB = defaultDb): Promise<CaseAttempt> {
  const open = await getOpenAttempt(caseId, database);
  if (open) return open;
  const attempt: CaseAttempt = { id: newId(), caseId, startedAt: Date.now(), finishedAt: null, answers: [], score: null };
  await database.caseAttempts.add(attempt);
  return attempt;
}

export function scoreOf(attempt: Pick<CaseAttempt, "answers">, totalSteps: number): number {
  if (totalSteps === 0) return 0;
  return Math.round((attempt.answers.filter((a) => a.correct).length / totalSteps) * 100);
}

/** Registra la respuesta de un paso. Un error se envía a "conceptos débiles". */
export async function answerStep(
  input: { attemptId: ID; stepId: ID; chosen: OptionKey; ms: number },
  database: MedOSDB = defaultDb,
): Promise<{ correct: boolean; attempt: CaseAttempt }> {
  return database.transaction("rw", [database.caseAttempts, database.clinicalCases, database.weakConcepts], async () => {
    const attempt = await database.caseAttempts.get(input.attemptId);
    if (!attempt || attempt.finishedAt !== null) throw new Error("El intento ya terminó.");
    const c = await database.clinicalCases.get(attempt.caseId);
    const step = c?.steps.find((s) => s.id === input.stepId);
    if (!c || !step) throw new Error("El paso no existe.");
    if (attempt.answers.some((a) => a.stepId === step.id)) {
      return { correct: attempt.answers.find((a) => a.stepId === step.id)!.correct, attempt };
    }
    const correct = input.chosen === step.correct;
    const updated: CaseAttempt = {
      ...attempt,
      answers: [...attempt.answers, { stepId: step.id, chosen: input.chosen, correct, ms: Math.max(0, Math.round(input.ms)) }],
    };
    await database.caseAttempts.put(updated);
    if (!correct) {
      await recordWeakConcept({ label: step.concept, subjectId: c.subjectId ?? null, source: "lab", refId: c.id }, database);
    }
    return { correct, attempt: updated };
  });
}

export async function finishAttempt(attemptId: ID, database: MedOSDB = defaultDb): Promise<CaseAttempt> {
  const attempt = await database.caseAttempts.get(attemptId);
  if (!attempt) throw new Error("El intento no existe.");
  if (attempt.finishedAt !== null) return attempt;
  const c = await database.clinicalCases.get(attempt.caseId);
  const finished: CaseAttempt = { ...attempt, finishedAt: Date.now(), score: scoreOf(attempt, c?.steps.length ?? 0) };
  await database.caseAttempts.put(finished);
  await logActivity(
    { type: "case_completed", subjectId: c?.subjectId ?? null, refId: attempt.caseId, summary: `Caso «${c?.title ?? "clínico"}»: ${finished.score} %` },
    database,
  );
  return finished;
}

export async function abandonAttempt(attemptId: ID, database: MedOSDB = defaultDb) {
  await database.caseAttempts.delete(attemptId);
}

export async function finishedAttempts(limit = 20, database: MedOSDB = defaultDb): Promise<CaseAttempt[]> {
  const list = await database.caseAttempts.orderBy("startedAt").reverse().toArray();
  return list.filter((a) => a.finishedAt !== null).slice(0, limit);
}

/** Intento abierto más reciente de cualquier caso (para "Mi siguiente objetivo"). */
export async function latestOpenAttempt(database: MedOSDB = defaultDb): Promise<CaseAttempt | undefined> {
  const list = await database.caseAttempts.orderBy("startedAt").reverse().toArray();
  return list.find((a) => a.finishedAt === null && a.answers.length > 0);
}
