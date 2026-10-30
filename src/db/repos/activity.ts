import { db as defaultDb, type MedOSDB } from "../schema";
import type { ActivityEvent, ActivityType, ID, WeakConcept } from "../types";
import { newId } from "@/lib/ids";

export async function logActivity(
  e: { type: ActivityType; subjectId?: ID | null; refId?: ID | null; summary: string; at?: number },
  database: MedOSDB = defaultDb,
): Promise<void> {
  await database.activity.add({
    id: newId(),
    type: e.type,
    subjectId: e.subjectId ?? null,
    refId: e.refId ?? null,
    at: e.at ?? Date.now(),
    summary: e.summary,
  });
}

export async function recentActivity(limit = 6, database: MedOSDB = defaultDb): Promise<ActivityEvent[]> {
  return database.activity.orderBy("at").reverse().limit(limit).toArray();
}

// ── Conceptos débiles ───────────────────────────────────────────────────

function sameLabel(a: string, b: string) {
  return a.trim().toLocaleLowerCase("es-MX") === b.trim().toLocaleLowerCase("es-MX");
}

/** Registra (o suma) un concepto débil. Si ya estaba resuelto, se reabre. */
export async function recordWeakConcept(
  input: { label: string; subjectId: ID | null; source: WeakConcept["source"]; refId: ID },
  database: MedOSDB = defaultDb,
): Promise<void> {
  const label = input.label.replace(/\s+/g, " ").trim().slice(0, 160);
  if (!label) return;
  const now = Date.now();
  const existing = await database.weakConcepts
    .where("source")
    .equals(input.source)
    .filter((w) => w.subjectId === input.subjectId && sameLabel(w.label, label))
    .first();
  if (existing) {
    await database.weakConcepts.update(existing.id, {
      hits: existing.hits + 1,
      lastSeenAt: now,
      resolved: false,
      refId: input.refId,
    });
  } else {
    await database.weakConcepts.add({
      id: newId(),
      label,
      subjectId: input.subjectId,
      source: input.source,
      refId: input.refId,
      hits: 1,
      lastSeenAt: now,
      resolved: false,
    });
  }
}

export async function listWeakConcepts(
  opts: { includeResolved?: boolean } = {},
  database: MedOSDB = defaultDb,
): Promise<WeakConcept[]> {
  const all = await database.weakConcepts.orderBy("lastSeenAt").reverse().toArray();
  return all
    .filter((w) => opts.includeResolved || !w.resolved)
    .sort((a, b) => b.hits - a.hits || b.lastSeenAt - a.lastSeenAt);
}

export async function setWeakResolved(id: ID, resolved: boolean, database: MedOSDB = defaultDb) {
  await database.weakConcepts.update(id, { resolved, lastSeenAt: Date.now() });
}
