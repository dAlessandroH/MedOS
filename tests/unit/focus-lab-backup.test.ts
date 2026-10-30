import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { MedOSDB } from "@/db/schema";
import { createSubject } from "@/db/repos/subjects";
import { createDeck } from "@/db/repos/decks";
import { createCard, reviewCard } from "@/db/repos/cards";
import {
  finishSession,
  getActiveSession,
  pauseSession,
  reconcileActiveSession,
  remainingMs,
  resumeSession,
  sessionFocusedMs,
  STALE_PAUSE_MS,
  startSession,
  weeklyFocus,
} from "@/db/repos/focus";
import { answerStep, finishAttempt, importCases, parseCasesJson, startAttempt } from "@/db/repos/cases";
import { listWeakConcepts } from "@/db/repos/activity";
import { createExam, daysUntil, upcomingExams } from "@/db/repos/exams";
import { buildBackup, mergeBackup, readBackup, replaceWithBackup, exportZip, exportJson, getLastBackupAt } from "@/db/repos/backup";
import { getDashboardData } from "@/db/repos/stats";
import { DAY, freshDb, MIN } from "./helpers";

let db: MedOSDB;
beforeEach(async () => {
  db = await freshDb();
});
afterEach(async () => {
  await db.delete();
});

describe("FocusMD (tiempo por timestamps)", () => {
  it("exige objetivo y duración válida", async () => {
    await expect(startSession({ kind: "focus", subjectId: null, goal: "  ", plannedMin: 25 }, db)).rejects.toThrow(/objetivo/);
    await expect(startSession({ kind: "focus", subjectId: null, goal: "x", plannedMin: 0 }, db)).rejects.toThrow(/duración/);
  });

  it("descuenta pausas y termina antes guardando lo hecho", async () => {
    const t0 = Date.now() - 30 * MIN;
    const s = await startSession({ kind: "focus", subjectId: null, goal: "Bloque 3", plannedMin: 25 }, db, t0);
    await pauseSession(s.id, db, t0 + 5 * MIN);
    await resumeSession(s.id, db, t0 + 8 * MIN);
    const mid = (await db.focusSessions.get(s.id))!;
    expect(sessionFocusedMs(mid, t0 + 10 * MIN)).toBe(7 * MIN);
    expect(remainingMs(mid, t0 + 10 * MIN)).toBe(18 * MIN);
    const closed = await finishSession(s.id, "ended_early", db, t0 + 12 * MIN);
    expect(closed?.status).toBe("ended_early");
    expect(closed?.focusedMs).toBe(9 * MIN);
    expect(await getActiveSession(db)).toBeUndefined();
  });

  it("si la app estuvo cerrada, la sesión se completa en el minuto exacto en que terminó", async () => {
    const t0 = Date.now() - 2 * 60 * MIN;
    const s = await startSession({ kind: "focus", subjectId: null, goal: "Repaso", plannedMin: 25 }, db, t0);
    await pauseSession(s.id, db, t0 + 10 * MIN);
    await resumeSession(s.id, db, t0 + 15 * MIN);
    const closed = await reconcileActiveSession(db, t0 + 90 * MIN);
    expect(closed?.status).toBe("completed");
    expect(closed?.endedAt).toBe(t0 + 30 * MIN);
    expect(closed?.focusedMs).toBe(25 * MIN);
  });

  it("una pausa muy larga se guarda como interrumpida sin perder el tiempo hecho", async () => {
    const t0 = Date.now() - STALE_PAUSE_MS - 60 * MIN;
    const s = await startSession({ kind: "focus", subjectId: null, goal: "Repaso", plannedMin: 45 }, db, t0);
    await pauseSession(s.id, db, t0 + 20 * MIN);
    const closed = await reconcileActiveSession(db);
    expect(closed?.status).toBe("interrupted");
    expect(closed?.focusedMs).toBe(20 * MIN);
  });

  it("iniciar otra sesión cierra la anterior como interrumpida", async () => {
    const t0 = Date.now() - 10 * MIN;
    const a = await startSession({ kind: "focus", subjectId: null, goal: "A", plannedMin: 25 }, db, t0);
    await startSession({ kind: "short_break", subjectId: null, goal: "", plannedMin: 5 }, db, t0 + 6 * MIN);
    expect((await db.focusSessions.get(a.id))?.status).toBe("interrupted");
    expect((await getActiveSession(db))?.kind).toBe("short_break");
  });

  it("estadística semanal y Dashboard", async () => {
    const s = await createSubject({ name: "Farmacología" }, db);
    const now = Date.now();
    const a = await startSession({ kind: "focus", subjectId: s.id, goal: "Autonómico", plannedMin: 25 }, db, now - 40 * MIN);
    await finishSession(a.id, "completed", db, now - 10 * MIN);
    const w = await weeklyFocus(now, db);
    expect(w.days).toHaveLength(7);
    expect(w.totalMinutes).toBe(25);
    expect(w.completed).toBe(1);
    expect(w.bySubject[0]).toEqual({ subjectId: s.id, minutes: 25 });
    const dash = await getDashboardData(now, db);
    expect(dash.focusedMinutesToday).toBe(new Date(now - 40 * MIN).getDate() === new Date(now).getDate() ? 25 : dash.focusedMinutesToday);
    expect(dash.activity.some((x) => x.type === "focus_session")).toBe(true);
  });
});

describe("ClinicalLab", () => {
  const template = readFileSync(join(process.cwd(), "public/plantillas/casos-ejemplo.json"), "utf8");

  it("la plantilla incluida es válida", () => {
    const p = parseCasesJson(template);
    expect(p.errors).toEqual([]);
    expect(p.cases).toHaveLength(1);
    expect(p.cases[0].steps).toHaveLength(4);
    expect(p.cases[0].references.length).toBeGreaterThan(0);
    expect(p.cases[0].labs?.find((l) => l.name === "Potasio")?.flag).toBe("H");
  });

  it("rechaza casos sin referencias o con campos inválidos y explica por qué", () => {
    const raw = JSON.parse(template);
    const bad = { ...raw.casos[0], titulo: "Sin refs", referencias: [] };
    const bad2 = { ...raw.casos[0], titulo: "Sexo raro", paciente: { edad: 30, sexo: "X" } };
    const p = parseCasesJson(JSON.stringify([bad, bad2]));
    expect(p.cases).toHaveLength(0);
    expect(p.errors.join(" ")).toMatch(/referencia verificable/);
    expect(p.errors.join(" ")).toMatch(/sexo/);
    expect(parseCasesJson("{no es json").errors[0]).toMatch(/JSON válido/);
  });

  it("importa sin duplicar, califica y envía errores a conceptos débiles", async () => {
    await createSubject({ name: "Fisiología II" }, db);
    const p = parseCasesJson(template);
    expect(await importCases(p.cases, db)).toEqual({ added: 1, duplicates: 0 });
    expect(await importCases(parseCasesJson(template).cases, db)).toEqual({ added: 0, duplicates: 1 });
    const c = (await db.clinicalCases.toArray())[0];
    expect(c.subjectId).toBeDefined(); // "materia": "Fisiología II" se asoció por nombre

    const attempt = await startAttempt(c.id, db);
    const wrongKey = (["a", "b", "c", "d"] as const).find((k) => k !== c.steps[0].correct)!;
    expect((await answerStep({ attemptId: attempt.id, stepId: c.steps[0].id, chosen: wrongKey, ms: 1000 }, db)).correct).toBe(false);
    for (const s of c.steps.slice(1)) {
      await answerStep({ attemptId: attempt.id, stepId: s.id, chosen: s.correct, ms: 1000 }, db);
    }
    const done = await finishAttempt(attempt.id, db);
    expect(done.score).toBe(75);
    const weak = await listWeakConcepts({}, db);
    expect(weak.map((w) => w.label)).toEqual([c.steps[0].concept]);
    expect(weak[0].source).toBe("lab");
  });
});

describe("exámenes", () => {
  it("ordena próximos y calcula días", async () => {
    const s = await createSubject({ name: "Genética" }, db);
    const now = Date.now();
    await createExam({ subjectId: s.id, title: "Final", date: now + 20 * DAY }, db);
    await createExam({ subjectId: s.id, title: "Parcial", date: now + 3 * DAY }, db);
    await createExam({ subjectId: s.id, title: "Pasado", date: now - 3 * DAY }, db);
    const up = await upcomingExams(now, 10, db);
    expect(up.map((e) => e.title)).toEqual(["Parcial", "Final"]);
    expect(daysUntil(up[0].date, now)).toBe(3);
  });
});

describe("respaldos", () => {
  async function seed(target: MedOSDB) {
    const s = await createSubject({ name: "Fisiología II" }, target);
    const d = await createDeck({ subjectId: s.id, name: "Respiratoria" }, target);
    const c = await createCard({ deckId: d.id, front: "<p>¿Qué es la PAO₂?</p>", back: "<p>Presión alveolar de O₂</p>" }, target);
    await reviewCard({ cardId: c.id, rating: 3, durationMs: 1000 }, target);
    return { s, d, c };
  }

  it("JSON: exportar → leer → fusionar en otro dispositivo", async () => {
    await seed(db);
    const blob = await exportJson(db);
    expect(await getLastBackupAt(db)).not.toBeNull();
    const preview = await readBackup(blob);
    expect(preview.counts.cards).toBe(1);
    expect(preview.counts.reviewLogs).toBe(1);

    const other = await freshDb();
    try {
      const r = await mergeBackup(preview, other);
      expect(r.added).toBeGreaterThan(0);
      expect(await other.cards.count()).toBe(1);
      expect(await other.reviewLogs.count()).toBe(1);
      // fusionar dos veces no duplica
      const r2 = await mergeBackup(preview, other);
      expect(r2.added).toBe(0);
      expect(await other.cards.count()).toBe(1);
    } finally {
      await other.delete();
    }
  });

  it("fusiona materias, mazos y tarjetas creados por separado en dos dispositivos", async () => {
    await seed(db);
    const other = await freshDb();
    try {
      await seed(other); // mismo contenido, otros ids
      const preview = await readBackup(new Blob([JSON.stringify((await buildBackup(db)).backup)]));
      await mergeBackup(preview, other);
      expect(await other.subjects.count()).toBe(1);
      expect(await other.decks.count()).toBe(1);
      expect(await other.cards.count()).toBe(1);
      expect(await other.reviewLogs.count()).toBe(2); // historial de ambos dispositivos
      const logs = await other.reviewLogs.toArray();
      const cardId = (await other.cards.toArray())[0].id;
      expect(logs.every((l) => l.cardId === cardId)).toBe(true);
    } finally {
      await other.delete();
    }
  });

  it("ZIP y reemplazo total", async () => {
    await seed(db);
    const zip = await exportZip(db);
    const preview = await readBackup(zip);
    expect(preview.counts.subjects).toBe(1);
    const other = await freshDb();
    try {
      await createSubject({ name: "Se borrará" }, other);
      await replaceWithBackup(preview, other);
      expect((await other.subjects.toArray()).map((s) => s.name)).toEqual(["Fisiología II"]);
    } finally {
      await other.delete();
    }
  });

  it("rechaza archivos que no son respaldos de MedOS", async () => {
    await expect(readBackup(new Blob(["hola"]))).rejects.toThrow(/JSON válido/);
    await expect(readBackup(new Blob([JSON.stringify({ app: "Otra" })]))).rejects.toThrow(/MedOS/);
    const broken = { app: "MedOS", format: 1, schemaVersion: 1, exportedAt: 1, data: { cards: [{ id: "x" }] }, media: [] };
    await expect(readBackup(new Blob([JSON.stringify(broken)]))).rejects.toThrow(/incompleto/);
    const future = { ...broken, schemaVersion: 99, data: {} };
    await expect(readBackup(new Blob([JSON.stringify(future)]))).rejects.toThrow(/más nueva/);
  });
});
