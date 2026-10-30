import { db as defaultDb, type MedOSDB } from "../schema";
import type { Card, Deck, FsrsState, ID, OptionKey, Rating, ReviewLog } from "../types";
import { newId } from "@/lib/ids";
import { contentKey } from "@/lib/hash";
import { htmlToText, isBlankHtml, sanitizeHtml, textToHtml } from "@/lib/html";
import { detectCsvFormat, parseCsv, type CsvFormat } from "@/lib/csv";
import { newFsrsState, retrievability, schedule } from "@/features/recall/fsrs";
import { getOrCreateDeck } from "./decks";
import { logActivity, recordWeakConcept } from "./activity";
import { startOfDay } from "./time";

/** Fallos a partir de los cuales una tarjeta se considera problemática. */
export const LEECH_LAPSES = 4;
/** Estabilidad (días) a partir de la cual una tarjeta cuenta como "dominada". */
export const MASTERED_STABILITY = 21;

export class CardError extends Error {}

// ── Crear / editar / borrar ─────────────────────────────────────────────

export interface CardInput {
  deckId: ID;
  front: string; // HTML
  back: string; // HTML
  imageIds?: ID[];
  tags?: string[];
  type?: Card["type"];
  options?: Record<OptionKey, string>;
  correct?: OptionKey;
  explanation?: string;
}

function cardHash(type: Card["type"], front: string, back: string, options?: Record<OptionKey, string>) {
  return contentKey(
    type,
    htmlToText(front),
    htmlToText(back),
    options ? [options.a, options.b, options.c, options.d].join("|") : "",
  );
}

export async function createCard(input: CardInput, database: MedOSDB = defaultDb): Promise<Card> {
  const deck = await database.decks.get(input.deckId);
  if (!deck) throw new CardError("El mazo no existe.");
  const front = sanitizeHtml(input.front);
  const back = sanitizeHtml(input.back);
  if (isBlankHtml(front)) throw new CardError("La pregunta no puede estar vacía.");
  if (isBlankHtml(back) && (input.imageIds?.length ?? 0) === 0) {
    throw new CardError("La respuesta no puede estar vacía.");
  }
  const now = Date.now();
  const type = input.type ?? "basic";
  const fsrs = newFsrsState(now);
  const card: Card = {
    id: newId(),
    deckId: deck.id,
    subjectId: deck.subjectId,
    type,
    front,
    back,
    options: input.options,
    correct: input.correct,
    explanation: input.explanation?.trim() || undefined,
    imageIds: input.imageIds ?? [],
    tags: input.tags ?? [],
    fsrs,
    due: fsrs.due,
    lapses: 0,
    suspended: false,
    sourceHash: cardHash(type, front, back, input.options),
    createdAt: now,
    updatedAt: now,
  };
  await database.cards.add(card);
  return card;
}

export async function updateCard(
  id: ID,
  patch: Partial<Pick<CardInput, "front" | "back" | "imageIds" | "options" | "correct" | "explanation" | "deckId">>,
  database: MedOSDB = defaultDb,
): Promise<void> {
  const card = await database.cards.get(id);
  if (!card) throw new CardError("La tarjeta ya no existe.");
  const changes: Partial<Card> = { updatedAt: Date.now() };
  if (patch.front !== undefined) {
    changes.front = sanitizeHtml(patch.front);
    if (isBlankHtml(changes.front)) throw new CardError("La pregunta no puede estar vacía.");
  }
  if (patch.back !== undefined) changes.back = sanitizeHtml(patch.back);
  if (patch.imageIds !== undefined) {
    const removed = card.imageIds.filter((m) => !patch.imageIds!.includes(m));
    if (removed.length) await database.media.bulkDelete(removed);
    changes.imageIds = patch.imageIds;
  }
  if (patch.options !== undefined) changes.options = patch.options;
  if (patch.correct !== undefined) changes.correct = patch.correct;
  if (patch.explanation !== undefined) changes.explanation = patch.explanation.trim() || undefined;
  if (patch.deckId !== undefined && patch.deckId !== card.deckId) {
    const deck = await database.decks.get(patch.deckId);
    if (!deck) throw new CardError("El mazo destino no existe.");
    changes.deckId = deck.id;
    changes.subjectId = deck.subjectId;
  }
  const merged = { ...card, ...changes };
  changes.sourceHash = cardHash(merged.type, merged.front, merged.back, merged.options);
  await database.cards.update(id, changes);
}

export async function setCardSuspended(id: ID, suspended: boolean, database: MedOSDB = defaultDb) {
  await database.cards.update(id, { suspended, updatedAt: Date.now() });
}

/** Reinicia el aprendizaje de una tarjeta (vuelve a "nueva"). Conserva el historial. */
export async function resetCard(id: ID, database: MedOSDB = defaultDb) {
  const fsrs = newFsrsState();
  await database.cards.update(id, { fsrs, due: fsrs.due, lapses: 0, updatedAt: Date.now() });
}

export async function deleteCard(id: ID, database: MedOSDB = defaultDb): Promise<void> {
  await database.transaction("rw", [database.cards, database.reviewLogs, database.media], async () => {
    const card = await database.cards.get(id);
    if (!card) return;
    await database.reviewLogs.where("cardId").equals(id).delete();
    await database.media.bulkDelete(card.imageIds);
    await database.cards.delete(id);
  });
}

export async function listCards(deckIds: ID[], database: MedOSDB = defaultDb): Promise<Card[]> {
  const cards = await database.cards.where("deckId").anyOf(deckIds).toArray();
  return cards.sort((a, b) => a.createdAt - b.createdAt);
}

// ── Imágenes ────────────────────────────────────────────────────────────

export async function addMedia(
  input: { blob: Blob; width: number; height: number },
  database: MedOSDB = defaultDb,
): Promise<ID> {
  const id = newId();
  await database.media.add({
    id,
    blob: input.blob,
    mime: input.blob.type || "image/jpeg",
    width: input.width,
    height: input.height,
    bytes: input.blob.size,
    createdAt: Date.now(),
  });
  return id;
}

// ── Importar CSV ────────────────────────────────────────────────────────

export interface ImportItem {
  row: number; // fila del archivo (1 = encabezados)
  type: Card["type"];
  front: string; // texto plano
  back: string; // texto plano
  options?: Record<OptionKey, string>;
  correct?: OptionKey;
  category?: string;
  explanation?: string;
}

export interface ImportPreview {
  format: CsvFormat;
  items: ImportItem[];
  errors: { row: number; message: string }[];
}

export function prepareCsvImport(text: string): ImportPreview {
  const rows = parseCsv(text);
  if (rows.length === 0) throw new CardError("El archivo está vacío.");
  const format = detectCsvFormat(rows[0]);
  if (!format) {
    throw new CardError(
      'Encabezados no reconocidos. Usa "pregunta","respuesta" (flashcards) o ' +
        '"pregunta","opcion_a","opcion_b","opcion_c","opcion_d","respuesta","categoria","explicacion" (plataforma).',
    );
  }
  const items: ImportItem[] = [];
  const errors: ImportPreview["errors"] = [];
  const expected = format === "flashcards" ? 2 : 8;

  rows.slice(1).forEach((cols, i) => {
    const row = i + 2;
    if (cols.length !== expected) {
      errors.push({ row, message: `Tiene ${cols.length} columnas; se esperaban ${expected}.` });
      return;
    }
    const c = cols.map((v) => v.trim());
    if (format === "flashcards") {
      if (!c[0] || !c[1]) {
        errors.push({ row, message: "Pregunta o respuesta vacía." });
        return;
      }
      items.push({ row, type: "basic", front: c[0], back: c[1] });
      return;
    }
    const [pregunta, a, b, cc, d, respuesta, categoria, explicacion] = c;
    if (!pregunta) return void errors.push({ row, message: "Pregunta vacía." });
    if (!a || !b || !cc || !d) return void errors.push({ row, message: "Falta alguna de las 4 opciones." });
    const letter = respuesta.toLowerCase().match(/^[\s(]*([a-d])\b/)?.[1] as OptionKey | undefined;
    if (!letter) return void errors.push({ row, message: `"respuesta" debe ser a, b, c o d (recibido: "${respuesta}").` });
    const options = { a, b, c: cc, d };
    items.push({
      row,
      type: "mcq",
      front: pregunta,
      back: options[letter],
      options,
      correct: letter,
      category: categoria || undefined,
      explanation: explicacion || undefined,
    });
  });

  return { format, items, errors };
}

export interface ImportResult {
  added: number;
  duplicates: number;
  decksCreated: number;
}

/**
 * Guarda las tarjetas. Evita duplicados dentro de la materia (mismo contenido = misma tarjeta).
 * Con `splitByCategory`, la columna "categoria" crea subtemas dentro del tema elegido.
 */
export async function commitCsvImport(
  input: { items: ImportItem[]; deckId: ID; splitByCategory: boolean },
  database: MedOSDB = defaultDb,
): Promise<ImportResult> {
  const root = await database.decks.get(input.deckId);
  if (!root) throw new CardError("El mazo no existe.");
  const now = Date.now();
  const existingHashes = new Set(
    (await database.cards.where("subjectId").equals(root.subjectId).toArray()).map((c) => c.sourceHash),
  );
  const deckCache = new Map<string, Deck>();
  const decksBefore = await database.decks.count();
  let added = 0;
  let duplicates = 0;
  const batch: Card[] = [];

  // Un subtema solo puede colgar de un tema (no de otro subtema)
  const topic = root.parentId ? await database.decks.get(root.parentId) : root;

  for (const item of input.items) {
    const front = textToHtml(item.front);
    const back = textToHtml(item.back);
    const hash = cardHash(item.type, front, back, item.options);
    if (existingHashes.has(hash)) {
      duplicates++;
      continue;
    }
    existingHashes.add(hash);

    let deck: Deck = root;
    if (input.splitByCategory && item.category && topic) {
      const key = item.category.toLocaleLowerCase("es-MX");
      deck =
        deckCache.get(key) ??
        (await getOrCreateDeck({ subjectId: topic.subjectId, parentId: topic.id, name: item.category }, database));
      deckCache.set(key, deck);
    }

    const fsrs = newFsrsState(now);
    batch.push({
      id: newId(),
      deckId: deck.id,
      subjectId: deck.subjectId,
      type: item.type,
      front,
      back,
      options: item.options,
      correct: item.correct,
      explanation: item.explanation,
      imageIds: [],
      tags: item.category ? [item.category] : [],
      fsrs,
      due: fsrs.due,
      lapses: 0,
      suspended: false,
      sourceHash: hash,
      createdAt: now + added, // conserva el orden del archivo
      updatedAt: now,
    });
    added++;
  }

  await database.cards.bulkAdd(batch);
  const decksCreated = (await database.decks.count()) - decksBefore;
  if (added > 0) {
    await logActivity(
      { type: "import", subjectId: root.subjectId, refId: root.id, summary: `Importaste ${added} tarjetas en ${root.name}` },
      database,
    );
  }
  return { added, duplicates, decksCreated };
}

// ── Cola de estudio ─────────────────────────────────────────────────────

export interface QueueScope {
  deckIds?: ID[];
  subjectId?: ID;
}

async function cardsInScope(scope: QueueScope, database: MedOSDB): Promise<Card[]> {
  if (scope.deckIds) return database.cards.where("deckId").anyOf(scope.deckIds).toArray();
  if (scope.subjectId) return database.cards.where("subjectId").equals(scope.subjectId).toArray();
  return database.cards.toArray();
}

/** Tarjetas nuevas ya introducidas hoy, por mazo (para respetar el límite diario). */
async function newIntroducedToday(now: number, database: MedOSDB): Promise<Map<ID, number>> {
  const logs = await database.reviewLogs.where("reviewedAt").aboveOrEqual(startOfDay(now)).toArray();
  const seen = new Set<ID>();
  const perDeck = new Map<ID, number>();
  for (const l of logs) {
    if (l.stateBefore !== 0 || seen.has(l.cardId)) continue;
    seen.add(l.cardId);
    perDeck.set(l.deckId, (perDeck.get(l.deckId) ?? 0) + 1);
  }
  return perDeck;
}

export interface StudyQueue {
  /** Repasos vencidos, del menor al mayor dominio */
  reviews: Card[];
  /** Nuevas permitidas hoy */
  fresh: Card[];
}

/**
 * Prioridad: 1) vencidas con menor probabilidad de recuerdo (bajo dominio),
 * 2) nuevas hasta el límite diario de cada mazo.
 */
export async function buildQueue(
  scope: QueueScope,
  now: number = Date.now(),
  database: MedOSDB = defaultDb,
): Promise<StudyQueue> {
  const cards = (await cardsInScope(scope, database)).filter((c) => !c.suspended);
  const reviews = cards
    .filter((c) => c.fsrs.state !== 0 && c.due <= now)
    .map((c) => ({ c, r: retrievability(c.fsrs, now) }))
    .sort((a, b) => a.r - b.r || a.c.due - b.c.due)
    .map((x) => x.c);

  const decks = new Map<ID, Deck>((await database.decks.toArray()).map((d) => [d.id, d] as const));
  const introduced = await newIntroducedToday(now, database);
  const remaining = new Map<ID, number>();
  const fresh: Card[] = [];
  for (const c of cards.filter((c) => c.fsrs.state === 0).sort((a, b) => a.createdAt - b.createdAt)) {
    const limit = remaining.get(c.deckId) ?? Math.max(0, (decks.get(c.deckId)?.newPerDay ?? 8) - (introduced.get(c.deckId) ?? 0));
    if (limit <= 0) {
      remaining.set(c.deckId, 0);
      continue;
    }
    fresh.push(c);
    remaining.set(c.deckId, limit - 1);
  }
  return { reviews, fresh };
}

/** Intercala nuevas entre repasos (1 nueva cada 4 repasos) y recorta al tamaño de sesión. */
export function mixQueue(q: StudyQueue, size: number): Card[] {
  const out: Card[] = [];
  let r = 0;
  let n = 0;
  while (out.length < size && (r < q.reviews.length || n < q.fresh.length)) {
    const takeNew = n < q.fresh.length && (r >= q.reviews.length || (out.length + 1) % 5 === 0);
    out.push(takeNew ? q.fresh[n++] : q.reviews[r++]);
  }
  return out;
}

// ── Calificar ───────────────────────────────────────────────────────────

export async function reviewCard(
  input: { cardId: ID; rating: Rating; durationMs: number; typedAnswer?: string; now?: number },
  database: MedOSDB = defaultDb,
): Promise<{ card: Card; log: ReviewLog }> {
  const now = input.now ?? Date.now();
  return database.transaction(
    "rw",
    [database.cards, database.reviewLogs, database.weakConcepts],
    async () => {
      const card = await database.cards.get(input.cardId);
      if (!card) throw new CardError("La tarjeta ya no existe.");
      const prev: FsrsState = card.fsrs;
      const next = schedule(prev, input.rating, now);
      const log: ReviewLog = {
        id: newId(),
        cardId: card.id,
        deckId: card.deckId,
        subjectId: card.subjectId,
        rating: input.rating,
        stateBefore: prev.state,
        stability: next.stability,
        difficulty: next.difficulty,
        scheduledDays: next.scheduledDays,
        reviewedAt: now,
        durationMs: Math.max(0, Math.round(input.durationMs)),
        typedAnswer: input.typedAnswer?.trim() || undefined,
        prev,
      };
      const updated: Card = { ...card, fsrs: next, due: next.due, lapses: next.lapses, updatedAt: now };
      await database.cards.put(updated);
      await database.reviewLogs.add(log);
      if (input.rating === 1 && next.lapses >= LEECH_LAPSES) {
        await recordWeakConcept(
          { label: htmlToText(card.front).slice(0, 140), subjectId: card.subjectId, source: "recall", refId: card.id },
          database,
        );
      }
      return { card: updated, log };
    },
  );
}

/** Deshace una calificación: restaura el estado FSRS anterior y borra el registro. */
export async function undoReview(logId: ID, database: MedOSDB = defaultDb): Promise<Card | null> {
  return database.transaction("rw", [database.cards, database.reviewLogs], async () => {
    const log = await database.reviewLogs.get(logId);
    if (!log) return null;
    const card = await database.cards.get(log.cardId);
    await database.reviewLogs.delete(logId);
    if (!card) return null;
    const restored: Card = { ...card, fsrs: log.prev, due: log.prev.due, lapses: log.prev.lapses, updatedAt: Date.now() };
    await database.cards.put(restored);
    return restored;
  });
}

/** Registra en "Actividad reciente" una sesión de repaso terminada. */
export async function logReviewSession(
  input: { count: number; correct: number; subjectId: ID | null; label: string },
  database: MedOSDB = defaultDb,
) {
  if (input.count === 0) return;
  await logActivity(
    {
      type: "review_session",
      subjectId: input.subjectId,
      summary: `Repasaste ${input.count} ${input.count === 1 ? "tarjeta" : "tarjetas"} · ${input.label} (${Math.round((input.correct / input.count) * 100)} % recordadas)`,
    },
    database,
  );
}

// ── Conteos por mazo ────────────────────────────────────────────────────

export interface DeckCount {
  total: number;
  due: number;
  fresh: number;
}

/** Totales, repasos vencidos y nuevas por mazo (sin contar subtemas). */
export async function deckCounts(now: number = Date.now(), database: MedOSDB = defaultDb): Promise<Map<ID, DeckCount>> {
  const map = new Map<ID, DeckCount>();
  await database.cards.each((c) => {
    const entry = map.get(c.deckId) ?? { total: 0, due: 0, fresh: 0 };
    entry.total++;
    if (!c.suspended) {
      if (c.fsrs.state === 0) entry.fresh++;
      else if (c.due <= now) entry.due++;
    }
    map.set(c.deckId, entry);
  });
  return map;
}

export function sumCounts(...counts: (DeckCount | undefined)[]): DeckCount {
  return counts.reduce<DeckCount>(
    (acc, c) => ({ total: acc.total + (c?.total ?? 0), due: acc.due + (c?.due ?? 0), fresh: acc.fresh + (c?.fresh ?? 0) }),
    { total: 0, due: 0, fresh: 0 },
  );
}
