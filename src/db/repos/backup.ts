import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { z } from "zod";
import { db as defaultDb, type MedOSDB } from "../schema";
import { SCHEMA_VERSION } from "../version";
import type { ID, Media } from "../types";
import { logActivity } from "./activity";

export const BACKUP_FORMAT = 1;

/** Tablas incluidas en el respaldo, en orden de restauración. */
export const BACKUP_TABLES = [
  "subjects",
  "decks",
  "exams",
  "cards",
  "reviewLogs",
  "focusSessions",
  "clinicalCases",
  "caseAttempts",
  "weakConcepts",
  "activity",
] as const;
export type BackupTable = (typeof BACKUP_TABLES)[number];

export const TABLE_LABEL: Record<BackupTable | "media", string> = {
  subjects: "Materias",
  decks: "Mazos",
  exams: "Exámenes",
  cards: "Tarjetas",
  reviewLogs: "Revisiones",
  focusSessions: "Sesiones de enfoque",
  clinicalCases: "Casos clínicos",
  caseAttempts: "Intentos de casos",
  weakConcepts: "Conceptos débiles",
  activity: "Actividad",
  media: "Imágenes",
};

type AnyRecord = Record<string, unknown> & { id: string };

export interface MediaMeta {
  id: ID;
  mime: string;
  width: number;
  height: number;
  bytes: number;
  createdAt: number;
  file?: string;
}

export interface BackupFile {
  app: "MedOS";
  format: number;
  schemaVersion: number;
  exportedAt: number;
  data: Record<BackupTable, AnyRecord[]>;
  media: MediaMeta[];
}

export interface BackupPreview {
  backup: BackupFile;
  /** Imágenes contenidas en el ZIP, por id */
  mediaBlobs: Map<ID, Blob>;
  counts: Record<BackupTable | "media", number>;
  hasImages: boolean;
}

// ── Exportar ────────────────────────────────────────────────────────────

const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" };

export async function buildBackup(database: MedOSDB = defaultDb, now: number = Date.now()): Promise<{ backup: BackupFile; media: Media[] }> {
  const data = {} as Record<BackupTable, AnyRecord[]>;
  await database.transaction("r", [...BACKUP_TABLES.map((t) => database.table(t)), database.media], async () => {
    for (const t of BACKUP_TABLES) data[t] = (await database.table(t).toArray()) as AnyRecord[];
  });
  const media = await database.media.toArray();
  return {
    backup: {
      app: "MedOS",
      format: BACKUP_FORMAT,
      schemaVersion: SCHEMA_VERSION,
      exportedAt: now,
      data,
      media: media.map((m) => ({
        id: m.id,
        mime: m.mime,
        width: m.width,
        height: m.height,
        bytes: m.bytes,
        createdAt: m.createdAt,
        file: `media/${m.id}.${EXT[m.mime] ?? "bin"}`,
      })),
    },
    media,
  };
}

async function markBackedUp(database: MedOSDB, at: number) {
  await database.meta.put({ key: "lastBackupAt", value: at });
  await logActivity({ type: "backup", summary: "Respaldo exportado", at }, database);
}

/** Solo datos (sin imágenes). Ligero, ideal para pasar entre dispositivos. */
export async function exportJson(database: MedOSDB = defaultDb): Promise<Blob> {
  const now = Date.now();
  const { backup } = await buildBackup(database, now);
  const blob = new Blob([JSON.stringify(backup)], { type: "application/json" });
  await markBackedUp(database, now);
  return blob;
}

/** Respaldo completo: backup.json + carpeta media/ con las imágenes. */
export async function exportZip(database: MedOSDB = defaultDb): Promise<Blob> {
  const now = Date.now();
  const { backup, media } = await buildBackup(database, now);
  const files: Record<string, Uint8Array> = { "backup.json": strToU8(JSON.stringify(backup, null, 1)) };
  for (const m of media) {
    const meta = backup.media.find((x) => x.id === m.id);
    if (meta?.file) files[meta.file] = new Uint8Array(await m.blob.arrayBuffer());
  }
  const zipped = zipSync(files, { level: 6 });
  const blob = new Blob([zipped as BlobPart], { type: "application/zip" });
  await markBackedUp(database, now);
  return blob;
}

export function backupFilename(ext: "json" | "zip", now: number = Date.now()): string {
  const d = new Date(now);
  const p = (n: number) => String(n).padStart(2, "0");
  return `medos-respaldo-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.${ext}`;
}

// ── Leer y validar ──────────────────────────────────────────────────────

export class BackupError extends Error {}

const record = z.object({ id: z.string().min(1) }).passthrough();
const backupSchema = z.object({
  app: z.literal("MedOS", { errorMap: () => ({ message: "No es un respaldo de MedOS." }) }),
  format: z.number().int().min(1),
  schemaVersion: z.number().int().min(1),
  exportedAt: z.number(),
  data: z.object(Object.fromEntries(BACKUP_TABLES.map((t) => [t, z.array(record).default([])])) as Record<BackupTable, z.ZodDefault<z.ZodArray<typeof record>>>),
  media: z
    .array(
      z.object({
        id: z.string().min(1),
        mime: z.string(),
        width: z.number(),
        height: z.number(),
        bytes: z.number(),
        createdAt: z.number(),
        file: z.string().optional(),
      }),
    )
    .default([]),
});

/** Reglas mínimas por tabla para no importar registros rotos. */
const REQUIRED: Record<BackupTable, string[]> = {
  subjects: ["name", "createdAt"],
  decks: ["subjectId", "name"],
  exams: ["subjectId", "title", "date"],
  cards: ["deckId", "subjectId", "front", "back", "fsrs", "due"],
  reviewLogs: ["cardId", "rating", "reviewedAt"],
  focusSessions: ["startedAt", "plannedMin", "status", "kind"],
  clinicalCases: ["title", "steps", "references"],
  caseAttempts: ["caseId", "startedAt", "answers"],
  weakConcepts: ["label", "source"],
  activity: ["type", "at", "summary"],
};

function isZip(bytes: Uint8Array) {
  return bytes.length > 3 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
}

export async function readBackup(file: Blob): Promise<BackupPreview> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let jsonText: string;
  let entries: Record<string, Uint8Array> = {};

  if (isZip(bytes)) {
    try {
      entries = unzipSync(bytes);
    } catch {
      throw new BackupError("El ZIP está dañado.");
    }
    const json = entries["backup.json"];
    if (!json) throw new BackupError("El ZIP no contiene backup.json.");
    jsonText = strFromU8(json);
  } else {
    jsonText = new TextDecoder().decode(bytes);
  }

  let raw: unknown;
  try {
    raw = JSON.parse(jsonText);
  } catch {
    throw new BackupError("El archivo no es un JSON válido.");
  }
  const parsed = backupSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new BackupError(`${issue.message}${issue.path.length ? ` (${issue.path.join(".")})` : ""}`);
  }
  const backup = parsed.data as unknown as BackupFile;
  if (backup.format > BACKUP_FORMAT || backup.schemaVersion > SCHEMA_VERSION) {
    throw new BackupError("Este respaldo viene de una versión más nueva de MedOS. Actualiza la app primero.");
  }
  for (const t of BACKUP_TABLES) {
    const bad = backup.data[t].find((r) => REQUIRED[t].some((k) => r[k] === undefined || r[k] === null));
    if (bad) throw new BackupError(`Registro incompleto en ${TABLE_LABEL[t]} (id ${bad.id}).`);
  }

  const mediaBlobs = new Map<ID, Blob>();
  for (const m of backup.media) {
    const content = m.file ? entries[m.file] : undefined;
    if (content) mediaBlobs.set(m.id, new Blob([content as BlobPart], { type: m.mime }));
  }

  const counts = Object.fromEntries(BACKUP_TABLES.map((t) => [t, backup.data[t].length])) as BackupPreview["counts"];
  counts.media = mediaBlobs.size;
  return { backup, mediaBlobs, counts, hasImages: backup.media.length > 0 };
}

// ── Importar ────────────────────────────────────────────────────────────

/** Marca de tiempo para decidir qué versión de un registro es más reciente. */
function stamp(r: AnyRecord): number {
  for (const k of ["updatedAt", "finishedAt", "endedAt", "lastSeenAt", "reviewedAt", "at", "startedAt", "createdAt"]) {
    const v = r[k];
    if (typeof v === "number") return v;
  }
  return 0;
}

const lower = (s: unknown) => String(s ?? "").toLocaleLowerCase("es-MX").trim();

export interface ImportSummary {
  added: number;
  updated: number;
  unchanged: number;
  images: number;
}

/**
 * Fusionar (recomendado): agrega lo que falta y, si un registro existe en ambos lados,
 * conserva la versión más reciente. Une materias y mazos con el mismo nombre creados
 * por separado en dos dispositivos, y evita tarjetas duplicadas por contenido.
 */
export async function mergeBackup(preview: BackupPreview, database: MedOSDB = defaultDb): Promise<ImportSummary> {
  const { backup, mediaBlobs } = preview;
  const summary: ImportSummary = { added: 0, updated: 0, unchanged: 0, images: 0 };
  const data = structuredClone(backup.data) as Record<BackupTable, AnyRecord[]>;

  await database.transaction("rw", [...BACKUP_TABLES.map((t) => database.table(t)), database.media, database.meta], async () => {
    // 1) Materias con el mismo nombre → misma materia
    const subjectMap = new Map<string, string>();
    const localSubjects = await database.subjects.toArray();
    for (const s of data.subjects) {
      if (await database.subjects.get(s.id)) continue;
      const twin = localSubjects.find((l) => lower(l.name) === lower(s.name));
      if (twin) subjectMap.set(s.id, twin.id);
    }
    // 2) Mazos con mismo nombre dentro de la misma materia/tema → mismo mazo
    const deckMap = new Map<string, string>();
    const localDecks = await database.decks.toArray();
    const remapSubject = (id: unknown) => (typeof id === "string" ? subjectMap.get(id) ?? id : id);
    const remapDeck = (id: unknown) => (typeof id === "string" ? deckMap.get(id) ?? id : id);
    for (const d of [...data.decks].sort((a, b) => (a.parentId ? 1 : 0) - (b.parentId ? 1 : 0))) {
      if (await database.decks.get(d.id)) continue;
      const twin = localDecks.find(
        (l) => l.subjectId === remapSubject(d.subjectId) && (l.parentId ?? null) === (remapDeck(d.parentId) ?? null) && lower(l.name) === lower(d.name),
      );
      if (twin) deckMap.set(d.id, twin.id);
    }
    // 3) Tarjetas con el mismo contenido en la misma materia → misma tarjeta
    const cardMap = new Map<string, string>();
    const localCards = await database.cards.toArray();
    const byHash = new Map<string, string>(localCards.map((c) => [`${c.subjectId}|${c.sourceHash}`, c.id] as const));
    for (const c of data.cards) {
      if (await database.cards.get(c.id)) continue;
      const twin = byHash.get(`${remapSubject(c.subjectId)}|${c.sourceHash}`);
      if (twin) cardMap.set(c.id, twin);
    }

    const remap = (r: AnyRecord): AnyRecord => {
      const out: AnyRecord = { ...r };
      if ("subjectId" in out) out.subjectId = remapSubject(out.subjectId);
      if ("deckId" in out) out.deckId = remapDeck(out.deckId);
      if ("parentId" in out && out.parentId) out.parentId = remapDeck(out.parentId);
      if ("cardId" in out && typeof out.cardId === "string") out.cardId = cardMap.get(out.cardId) ?? out.cardId;
      return out;
    };

    for (const t of BACKUP_TABLES) {
      const table = database.table(t);
      for (const incoming of data[t]) {
        if (t === "subjects" && subjectMap.has(incoming.id)) { summary.unchanged++; continue; }
        if (t === "decks" && deckMap.has(incoming.id)) { summary.unchanged++; continue; }
        if (t === "cards" && cardMap.has(incoming.id)) { summary.unchanged++; continue; }
        const rec = remap(incoming);
        const existing = (await table.get(rec.id)) as AnyRecord | undefined;
        if (!existing) {
          await table.add(rec);
          summary.added++;
        } else if (stamp(rec) > stamp(existing)) {
          await table.put(rec);
          summary.updated++;
        } else {
          summary.unchanged++;
        }
      }
    }

    for (const m of backup.media) {
      const blob = mediaBlobs.get(m.id);
      if (!blob || (await database.media.get(m.id))) continue;
      await database.media.add({ id: m.id, blob, mime: m.mime, width: m.width, height: m.height, bytes: m.bytes, createdAt: m.createdAt });
      summary.images++;
    }
  });

  await logActivity({ type: "backup", summary: `Respaldo fusionado: ${summary.added} nuevos, ${summary.updated} actualizados` }, database);
  return summary;
}

/** Reemplaza TODO por el respaldo. La UI exporta antes un respaldo de seguridad. */
export async function replaceWithBackup(preview: BackupPreview, database: MedOSDB = defaultDb): Promise<ImportSummary> {
  const { backup, mediaBlobs } = preview;
  let added = 0;
  await database.transaction("rw", [...BACKUP_TABLES.map((t) => database.table(t)), database.media], async () => {
    for (const t of BACKUP_TABLES) {
      await database.table(t).clear();
      await database.table(t).bulkAdd(backup.data[t]);
      added += backup.data[t].length;
    }
    await database.media.clear();
    for (const m of backup.media) {
      const blob = mediaBlobs.get(m.id);
      if (blob) await database.media.add({ id: m.id, blob, mime: m.mime, width: m.width, height: m.height, bytes: m.bytes, createdAt: m.createdAt });
    }
  });
  await logActivity({ type: "backup", summary: "Datos reemplazados desde un respaldo" }, database);
  return { added, updated: 0, unchanged: 0, images: mediaBlobs.size };
}

export async function getLastBackupAt(database: MedOSDB = defaultDb): Promise<number | null> {
  const meta = await database.meta.get("lastBackupAt");
  return typeof meta?.value === "number" ? meta.value : null;
}

/** ¿Hay algo que valga la pena respaldar? */
export async function hasStudyData(database: MedOSDB = defaultDb): Promise<boolean> {
  const counts = await Promise.all([database.cards.count(), database.focusSessions.count(), database.clinicalCases.count()]);
  return counts.some((n) => n > 0);
}
