import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { MedOSDB } from "@/db/schema";
import { createSubject } from "@/db/repos/subjects";
import { createDeck, deleteDeck, getOrCreateDeck } from "@/db/repos/decks";
import {
  buildQueue,
  commitCsvImport,
  createCard,
  deckCounts,
  LEECH_LAPSES,
  mixQueue,
  prepareCsvImport,
  reviewCard,
  undoReview,
} from "@/db/repos/cards";
import { listWeakConcepts } from "@/db/repos/activity";
import { getRecallStats } from "@/db/repos/stats";
import { newFsrsState, previewDue, schedule } from "@/features/recall/fsrs";
import { DAY, freshDb } from "./helpers";

let db: MedOSDB;
beforeEach(async () => {
  db = await freshDb();
});
afterEach(async () => {
  await db.delete();
});

async function setup(newPerDay = 8) {
  const s = await createSubject({ name: "Fisiología II" }, db);
  const d = await createDeck({ subjectId: s.id, name: "Respiratoria", newPerDay }, db);
  return { s, d };
}

const FLASH = `"pregunta","respuesta"
"¿Qué desplaza la curva de disociación de la Hb a la derecha?","↑ CO₂, ↑ H⁺, ↑ temperatura y ↑ 2,3-BPG"
"¿Qué es la capacidad residual funcional?","Volumen que queda en los pulmones al final de una espiración normal"
"","sin pregunta"
`;

const PLATFORM = `"pregunta","opcion_a","opcion_b","opcion_c","opcion_d","respuesta","categoria","explicacion"
"Explica qué pasa con la PaCO₂ si la ventilación alveolar se duplica","Se duplica","Se reduce a la mitad","No cambia","Aumenta 25 %","b","Ventilación","PaCO₂ es inversamente proporcional a la ventilación alveolar."
"¿Qué receptor detecta la hipoxemia?","Quimiorreceptores centrales","Barorreceptores","Cuerpos carotídeos","Receptores J","C","Control","Los periféricos responden a la PaO₂."
"Pregunta con letra inválida","a","b","c","d","e","Control",""
`;

describe("FSRS (ts-fsrs real)", () => {
  it("una tarjeta nueva calificada 'Bien' se programa a futuro y 'Otra vez' antes", () => {
    const now = Date.now();
    const s0 = newFsrsState(now);
    expect(s0.state).toBe(0);
    const again = schedule(s0, 1, now);
    const good = schedule(s0, 3, now);
    const easy = schedule(s0, 4, now);
    expect(again.due).toBeGreaterThan(now - 1);
    expect(good.due).toBeGreaterThanOrEqual(again.due);
    expect(easy.due).toBeGreaterThan(good.due);
    expect(easy.reps).toBe(1);
    const preview = previewDue(s0, now);
    expect(Object.keys(preview)).toEqual(["1", "2", "3", "4"]);
  });
});

describe("importar CSV", () => {
  it("flashcards: valida filas y reporta errores con número de fila", () => {
    const p = prepareCsvImport(FLASH);
    expect(p.format).toBe("flashcards");
    expect(p.items).toHaveLength(2);
    expect(p.errors).toEqual([{ row: 4, message: "Pregunta o respuesta vacía." }]);
  });

  it("plataforma: opción correcta, categoría y explicación; letra inválida = error", () => {
    const p = prepareCsvImport(PLATFORM);
    expect(p.format).toBe("plataforma");
    expect(p.items).toHaveLength(2);
    expect(p.items[1].correct).toBe("c");
    expect(p.items[1].back).toBe("Cuerpos carotídeos");
    expect(p.items[0].category).toBe("Ventilación");
    expect(p.errors[0].row).toBe(4);
  });

  it("encabezados desconocidos → error claro", () => {
    expect(() => prepareCsvImport('"front","back"\n"a","b"')).toThrow(/Encabezados no reconocidos/);
  });

  it("guarda, crea subtemas por categoría y no duplica al reimportar", async () => {
    const { d } = await setup();
    const p = prepareCsvImport(PLATFORM);
    const r1 = await commitCsvImport({ items: p.items, deckId: d.id, splitByCategory: true }, db);
    expect(r1).toEqual({ added: 2, duplicates: 0, decksCreated: 2 });
    const subs = await db.decks.where("parentId").equals(d.id).toArray();
    expect(subs.map((x) => x.name).sort()).toEqual(["Control", "Ventilación"]);
    const r2 = await commitCsvImport({ items: p.items, deckId: d.id, splitByCategory: true }, db);
    expect(r2.added).toBe(0);
    expect(r2.duplicates).toBe(2);
    expect(await db.cards.count()).toBe(2);
    const card = (await db.cards.toArray()).find((c) => c.correct === "c")!;
    expect(card.type).toBe("mcq");
    expect(card.front).toContain("hipoxemia");
  });

  it("getOrCreateDeck reutiliza el subtema existente", async () => {
    const { s, d } = await setup();
    const a = await getOrCreateDeck({ subjectId: s.id, parentId: d.id, name: "Control" }, db);
    const b = await getOrCreateDeck({ subjectId: s.id, parentId: d.id, name: "control" }, db);
    expect(a.id).toBe(b.id);
  });
});

describe("cola de estudio y calificación", () => {
  it("respeta el límite de nuevas por día del mazo", async () => {
    const { d } = await setup(2);
    for (let i = 0; i < 5; i++) await createCard({ deckId: d.id, front: `<p>P${i}</p>`, back: `<p>R${i}</p>` }, db);
    const q = await buildQueue({ deckIds: [d.id] }, Date.now(), db);
    expect(q.fresh).toHaveLength(2);
    // tras estudiar 1 nueva hoy, solo queda 1 disponible
    await reviewCard({ cardId: q.fresh[0].id, rating: 3, durationMs: 4000 }, db);
    const q2 = await buildQueue({ deckIds: [d.id] }, Date.now(), db);
    expect(q2.fresh).toHaveLength(1);
  });

  it("prioriza vencidas y las intercala con nuevas", async () => {
    const { d } = await setup(10);
    const now = Date.now();
    const cards = [];
    for (let i = 0; i < 6; i++) cards.push(await createCard({ deckId: d.id, front: `<p>Q${i}</p>`, back: "<p>A</p>" }, db));
    // 4 pasan a repaso y vencen ayer
    for (const c of cards.slice(0, 4)) {
      await reviewCard({ cardId: c.id, rating: 4, durationMs: 1000, now: now - 30 * DAY }, db);
      await db.cards.update(c.id, { due: now - DAY });
    }
    const q = await buildQueue({ deckIds: [d.id] }, now, db);
    expect(q.reviews).toHaveLength(4);
    expect(q.fresh).toHaveLength(2);
    const mixed = mixQueue(q, 5);
    expect(mixed).toHaveLength(5);
    expect(mixed.filter((c) => c.fsrs.state === 0)).toHaveLength(1);
  });

  it("registra historial, permite deshacer y cuenta por mazo", async () => {
    const { d } = await setup();
    const c = await createCard({ deckId: d.id, front: "<p>¿Ley de Fick?</p>", back: "<p>Difusión ∝ área × gradiente / grosor</p>" }, db);
    const { card, log } = await reviewCard({ cardId: c.id, rating: 1, durationMs: 5000, typedAnswer: "no sé" }, db);
    expect(card.fsrs.reps).toBe(1);
    expect(log.typedAnswer).toBe("no sé");
    expect(log.prev.state).toBe(0);
    expect(await db.reviewLogs.where("cardId").equals(c.id).count()).toBe(1);

    const restored = await undoReview(log.id, db);
    expect(restored?.fsrs.state).toBe(0);
    expect(await db.reviewLogs.count()).toBe(0);

    const counts = await deckCounts(Date.now(), db);
    expect(counts.get(d.id)).toEqual({ total: 1, due: 0, fresh: 1 });
  });

  it(`al llegar a ${LEECH_LAPSES} fallos, la tarjeta se vuelve concepto débil`, async () => {
    const { d } = await setup();
    const c = await createCard({ deckId: d.id, front: "<p>Valor normal de PaO₂</p>", back: "<p>80–100 mmHg</p>" }, db);
    const now = Date.now();
    await reviewCard({ cardId: c.id, rating: 4, durationMs: 1000, now: now - 20 * DAY }, db);
    const inReview = (await db.cards.get(c.id))!;
    expect(inReview.fsrs.state).toBe(2);
    await db.cards.update(c.id, { fsrs: { ...inReview.fsrs, lapses: LEECH_LAPSES - 1 }, lapses: LEECH_LAPSES - 1 });
    const { card } = await reviewCard({ cardId: c.id, rating: 1, durationMs: 1000, now }, db);
    expect(card.lapses).toBe(LEECH_LAPSES);
    const weak = await listWeakConcepts({}, db);
    expect(weak).toHaveLength(1);
    expect(weak[0].label).toBe("Valor normal de PaO₂");
    expect(weak[0].source).toBe("recall");
  });

  it("estadísticas: retención y errores recientes", async () => {
    const { d } = await setup();
    const c = await createCard({ deckId: d.id, front: "<p>X</p>", back: "<p>Y</p>" }, db);
    await reviewCard({ cardId: c.id, rating: 1, durationMs: 1000 }, db);
    const stats = await getRecallStats(Date.now(), db);
    expect(stats.totals.cards).toBe(1);
    expect(stats.reviewsToday).toBe(1);
    expect(stats.recentMistakes).toHaveLength(1);
    expect(stats.perDay).toHaveLength(14);
    expect(stats.forecast).toHaveLength(7);
  });

  it("borrar un tema borra subtemas, tarjetas e historial", async () => {
    const { s, d } = await setup();
    const sub = await createDeck({ subjectId: s.id, parentId: d.id, name: "Sub" }, db);
    const c = await createCard({ deckId: sub.id, front: "<p>a</p>", back: "<p>b</p>" }, db);
    await reviewCard({ cardId: c.id, rating: 3, durationMs: 1 }, db);
    await deleteDeck(d.id, db);
    expect(await db.decks.count()).toBe(0);
    expect(await db.cards.count()).toBe(0);
    expect(await db.reviewLogs.count()).toBe(0);
  });

  it("no permite subtemas de subtemas ni nombres repetidos", async () => {
    const { s, d } = await setup();
    const sub = await createDeck({ subjectId: s.id, parentId: d.id, name: "Sub" }, db);
    await expect(createDeck({ subjectId: s.id, parentId: sub.id, name: "Nieto" }, db)).rejects.toThrow(/subtemas/);
    await expect(createDeck({ subjectId: s.id, name: "respiratoria" }, db)).rejects.toThrow(/Ya existe/);
  });
});
