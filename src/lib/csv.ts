/**
 * Lector CSV (RFC 4180) sin dependencias: comillas dobles, comillas
 * escapadas (""), comas y saltos de línea dentro de campos, CRLF y BOM.
 */
export function parseCsv(input: string): string[][] {
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;

  while (i < text.length) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += ch;
      i++;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      i++;
    } else if (ch === ",") {
      row.push(field);
      field = "";
      i++;
    } else if (ch === "\r" || ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      i += ch === "\r" && text[i + 1] === "\n" ? 2 : 1;
    } else {
      field += ch;
      i++;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  // descarta filas totalmente vacías (líneas en blanco)
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

/** Escribe un campo CSV entre comillas dobles. */
export function csvField(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

export type CsvFormat = "flashcards" | "plataforma";

export const FLASHCARD_HEADERS = ["pregunta", "respuesta"] as const;
export const PLATFORM_HEADERS = [
  "pregunta",
  "opcion_a",
  "opcion_b",
  "opcion_c",
  "opcion_d",
  "respuesta",
  "categoria",
  "explicacion",
] as const;

function normalizeHeader(h: string): string {
  return h
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, "_");
}

/** Detecta el formato por los encabezados exactos (sin importar acentos/mayúsculas). */
export function detectCsvFormat(headers: string[]): CsvFormat | null {
  const h = headers.map(normalizeHeader);
  const same = (expected: readonly string[]) =>
    h.length === expected.length && expected.every((e, i) => h[i] === e);
  if (same(PLATFORM_HEADERS)) return "plataforma";
  if (same(FLASHCARD_HEADERS)) return "flashcards";
  return null;
}
