import { db as defaultDb, type MedOSDB } from "../schema";
import type { Deck, ID } from "../types";
import { newId } from "@/lib/ids";

export const DEFAULT_NEW_PER_DAY = 8;
export const DECK_NAME_MAX = 80;

export class DeckError extends Error {}

function cleanName(raw: string): string {
  const name = raw.replace(/\s+/g, " ").trim();
  if (!name) throw new DeckError("Escribe un nombre para el mazo.");
  if (name.length > DECK_NAME_MAX) throw new DeckError(`Máximo ${DECK_NAME_MAX} caracteres.`);
  return name;
}

function cleanNewPerDay(n: number | undefined): number {
  if (n === undefined || !Number.isFinite(n)) return DEFAULT_NEW_PER_DAY;
  return Math.min(100, Math.max(0, Math.round(n)));
}

async function findSibling(database: MedOSDB, subjectId: ID, parentId: ID | null, name: string, exceptId?: ID) {
  const key = name.toLocaleLowerCase("es-MX");
  return database.decks
    .where("subjectId")
    .equals(subjectId)
    .filter((d) => d.id !== exceptId && d.parentId === parentId && d.name.toLocaleLowerCase("es-MX") === key)
    .first();
}

export async function createDeck(
  input: { subjectId: ID; parentId?: ID | null; name: string; newPerDay?: number },
  database: MedOSDB = defaultDb,
): Promise<Deck> {
  const name = cleanName(input.name);
  const parentId = input.parentId ?? null;
  if (!(await database.subjects.get(input.subjectId))) throw new DeckError("La materia no existe.");
  if (parentId) {
    const parent = await database.decks.get(parentId);
    if (!parent) throw new DeckError("El tema no existe.");
    if (parent.parentId) throw new DeckError("Los subtemas no pueden tener más subtemas.");
    if (parent.subjectId !== input.subjectId) throw new DeckError("El tema pertenece a otra materia.");
  }
  if (await findSibling(database, input.subjectId, parentId, name)) {
    throw new DeckError(`Ya existe "${name}" aquí.`);
  }
  const now = Date.now();
  const deck: Deck = {
    id: newId(),
    subjectId: input.subjectId,
    parentId,
    name,
    newPerDay: cleanNewPerDay(input.newPerDay),
    createdAt: now,
    updatedAt: now,
  };
  await database.decks.add(deck);
  return deck;
}

/** Devuelve el mazo con ese nombre o lo crea (usado al importar por categoría). */
export async function getOrCreateDeck(
  input: { subjectId: ID; parentId: ID | null; name: string },
  database: MedOSDB = defaultDb,
): Promise<Deck> {
  const name = cleanName(input.name);
  const existing = await findSibling(database, input.subjectId, input.parentId, name);
  return existing ?? createDeck({ ...input, name }, database);
}

export async function updateDeck(
  id: ID,
  patch: { name?: string; newPerDay?: number },
  database: MedOSDB = defaultDb,
): Promise<void> {
  const deck = await database.decks.get(id);
  if (!deck) throw new DeckError("El mazo ya no existe.");
  const changes: Partial<Deck> = { updatedAt: Date.now() };
  if (patch.name !== undefined) {
    const name = cleanName(patch.name);
    if (await findSibling(database, deck.subjectId, deck.parentId, name, id)) {
      throw new DeckError(`Ya existe "${name}" aquí.`);
    }
    changes.name = name;
  }
  if (patch.newPerDay !== undefined) changes.newPerDay = cleanNewPerDay(patch.newPerDay);
  await database.decks.update(id, changes);
}

export async function listDecks(subjectId?: ID, database: MedOSDB = defaultDb): Promise<Deck[]> {
  const decks = subjectId
    ? await database.decks.where("subjectId").equals(subjectId).toArray()
    : await database.decks.toArray();
  return decks.sort((a, b) => a.name.localeCompare(b.name, "es-MX", { numeric: true, sensitivity: "base" }));
}

/** El mazo y todos sus subtemas. */
export async function deckWithChildrenIds(id: ID, database: MedOSDB = defaultDb): Promise<ID[]> {
  const children = await database.decks.where("parentId").equals(id).primaryKeys();
  return [id, ...children];
}

export async function countDeckContents(id: ID, database: MedOSDB = defaultDb) {
  const ids = await deckWithChildrenIds(id, database);
  const cards = await database.cards.where("deckId").anyOf(ids).count();
  return { subdecks: ids.length - 1, cards };
}

/** Borra el mazo, sus subtemas, tarjetas, historial e imágenes. */
export async function deleteDeck(id: ID, database: MedOSDB = defaultDb): Promise<void> {
  const ids = await deckWithChildrenIds(id, database);
  await database.transaction(
    "rw",
    [database.decks, database.cards, database.reviewLogs, database.media],
    async () => {
      const cards = await database.cards.where("deckId").anyOf(ids).toArray();
      const cardIds = cards.map((c) => c.id);
      const mediaIds = cards.flatMap((c) => c.imageIds);
      await database.reviewLogs.where("cardId").anyOf(cardIds).delete();
      await database.media.bulkDelete(mediaIds);
      await database.cards.bulkDelete(cardIds);
      await database.decks.bulkDelete(ids);
    },
  );
}
