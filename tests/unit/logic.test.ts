import { describe, expect, it } from "vitest";
import { rankObjectives } from "@/features/dashboard/objective";
import type { DashboardData } from "@/db/repos/stats";
import { formatLongDate, formatMinutes, greetingFor } from "@/lib/time";
import { formatBytes } from "@/lib/storage";
import { DEFAULT_PREFS, readPrefs, writePrefs } from "@/lib/prefs";
import { isActive, normalizePath } from "@/components/layout/nav";
import { csvField, detectCsvFormat, parseCsv } from "@/lib/csv";
import { escapeHtml, htmlToText, isBlankHtml, textToHtml } from "@/lib/html";
import { contentKey, hashString } from "@/lib/hash";
import { clock, fromDateInput, toDateInput } from "@/lib/format";
import { formatInterval } from "@/features/recall/fsrs";
import type { Exam, FocusSession, Subject } from "@/db/types";

class MemoryStorage implements Storage {
  private map = new Map<string, string>();
  get length() {
    return this.map.size;
  }
  clear() {
    this.map.clear();
  }
  getItem(k: string) {
    return this.map.get(k) ?? null;
  }
  key(i: number) {
    return [...this.map.keys()][i] ?? null;
  }
  removeItem(k: string) {
    this.map.delete(k);
  }
  setItem(k: string, v: string) {
    this.map.set(k, v);
  }
}

const NOW = new Date(2026, 9, 30, 16, 0, 0).getTime();
const subject = (id: string, name: string): Subject => ({ id, name, color: "#3b82f6", archived: false, createdAt: 0, updatedAt: 0 });

function dash(patch: Partial<DashboardData> = {}): DashboardData {
  return {
    now: NOW,
    subjects: [subject("s1", "Fisiología II"), subject("s2", "Farmacología")],
    focusedMinutesToday: 0,
    focusedMinutesWeek: 0,
    reviewsDue: 0,
    newAvailable: 0,
    totalCards: 10,
    retention30: null,
    progress: [],
    exams: [],
    activeSession: undefined,
    openCase: undefined,
    weak: [],
    activity: [],
    casesCount: 0,
    casesCompleted: 0,
    dueBySubject: new Map(),
    lastBackupAt: null,
    ...patch,
  };
}

describe("Mi siguiente objetivo (reglas)", () => {
  it("sin materias → crear la primera", () => {
    expect(rankObjectives(dash({ subjects: [] }))[0].id).toBe("create-subject");
  });
  it("una sesión abierta de FocusMD va primero", () => {
    const s = { id: "f", goal: "Bloque 3", kind: "focus", status: "paused" } as FocusSession;
    const list = rankObjectives(dash({ activeSession: s, reviewsDue: 5 }));
    expect(list[0].id).toBe("resume-focus");
    expect(list[1].id).toBe("review");
  });
  it("con examen cercano, el repaso se dirige a esa materia", () => {
    const exam: Exam = { id: "e", subjectId: "s2", title: "Parcial", date: NOW + 2 * 86_400_000, createdAt: 0, updatedAt: 0 };
    const list = rankObjectives(dash({ reviewsDue: 8, exams: [exam], dueBySubject: new Map([["s1", 5], ["s2", 3]]) }));
    expect(list[0].id).toBe("review-exam");
    expect(list[0].title).toBe("Repasar 3 tarjetas de Farmacología");
    expect(list[0].href).toBe("/recall/estudiar?subject=s2");
  });
  it("tarjetas vencidas sin examen → repaso mixto", () => {
    const [first] = rankObjectives(dash({ reviewsDue: 1 }));
    expect(first.title).toBe("Repasar 1 tarjeta");
    expect(first.href).toBe("/recall/estudiar?mix=1");
  });
  it("sin vencidas: nuevas del día; sin tarjetas: importar", () => {
    expect(rankObjectives(dash({ newAvailable: 4 }))[0].id).toBe("learn-new");
    expect(rankObjectives(dash({ totalCards: 0 }))[0].id).toBe("import-first");
  });
  it("todo al día → lista vacía (sin presión)", () => {
    expect(rankObjectives(dash())).toEqual([]);
  });
});

describe("CSV", () => {
  it("comillas, comas, saltos de línea, comillas escapadas, CRLF y BOM", () => {
    const text = '﻿"pregunta","respuesta"\r\n"¿Qué es la ""PO₂""?","Presión parcial, de O₂\nen sangre"\r\n\r\n';
    expect(parseCsv(text)).toEqual([
      ["pregunta", "respuesta"],
      ['¿Qué es la "PO₂"?', "Presión parcial, de O₂\nen sangre"],
    ]);
  });
  it("detecta formatos sin importar acentos o mayúsculas", () => {
    expect(detectCsvFormat(["Pregunta", "Respuesta"])).toBe("flashcards");
    expect(detectCsvFormat(["pregunta", "opcion_a", "opcion_b", "opcion_c", "opcion_d", "respuesta", "categoría", "explicación"])).toBe("plataforma");
    expect(detectCsvFormat(["front", "back"])).toBeNull();
  });
  it("escapa campos", () => {
    expect(csvField('di "hola"')).toBe('"di ""hola"""');
  });
});

describe("HTML", () => {
  it("texto plano → HTML seguro", () => {
    expect(textToHtml("a < b\nc\n\nd")).toBe("<p>a &lt; b<br>c</p><p>d</p>");
    expect(escapeHtml(`<script>"x"</script>`)).not.toContain("<script>");
  });
  it("HTML → texto y vacíos", () => {
    expect(htmlToText("<p>Hola <strong>mundo</strong></p><ul><li>a</li></ul>")).toBe("Hola mundo\na");
    expect(isBlankHtml("<p></p>")).toBe(true);
  });
});

describe("hash de contenido", () => {
  it("determinista y tolerante a espacios, acentos y mayúsculas", () => {
    expect(hashString("abc")).toBe(hashString("abc"));
    expect(contentKey("  Fisiología  II ")).toBe(contentKey("fisiologia ii"));
    expect(contentKey("a", "b")).not.toBe(contentKey("ab", ""));
  });
});

describe("formato", () => {
  it("saludo por hora", () => {
    expect(greetingFor(8)).toBe("Buenos días");
    expect(greetingFor(13)).toBe("Buenas tardes");
    expect(greetingFor(21)).toBe("Buenas noches");
    expect(greetingFor(2)).toBe("Buenas noches");
  });
  it("fecha larga en español", () => {
    expect(formatLongDate(new Date(2026, 9, 30))).toBe("Viernes, 30 de octubre de 2026");
  });
  it("minutos, bytes, reloj e intervalos", () => {
    expect(formatMinutes(95)).toBe("1 h 35 min");
    expect(formatBytes(2 * 1024 * 1024)).toBe("2.0 MB");
    expect(clock(25 * 60_000)).toBe("25:00");
    expect(clock(61_500)).toBe("01:02");
    expect(clock(3_600_000 + 5000)).toBe("1:00:05");
    expect(formatInterval(10 * 60_000)).toBe("10 min");
    expect(formatInterval(3 * 86_400_000)).toBe("3 d");
    expect(formatInterval(400 * 86_400_000)).toBe("1.1 a");
  });
  it("fechas de <input type=date> en hora local", () => {
    const at = fromDateInput("2026-11-14");
    expect(new Date(at).getDate()).toBe(14);
    expect(toDateInput(at)).toBe("2026-11-14");
    expect(Number.isNaN(fromDateInput(""))).toBe(true);
  });
});

describe("preferencias (localStorage)", () => {
  it("valores por defecto si no hay nada o el JSON está dañado", () => {
    const st = new MemoryStorage();
    expect(readPrefs(st)).toEqual(DEFAULT_PREFS);
    st.setItem("medos:prefs", "{roto");
    expect(readPrefs(st)).toEqual(DEFAULT_PREFS);
  });
  it("guarda y combina cambios parciales; ignora valores inválidos", () => {
    const st = new MemoryStorage();
    writePrefs({ name: "Ale" }, st);
    writePrefs({ soundEnabled: false, sessionSize: 30 }, st);
    expect(readPrefs(st)).toEqual({ ...DEFAULT_PREFS, name: "Ale", soundEnabled: false, sessionSize: 30 });
    st.setItem("medos:prefs", JSON.stringify({ sessionSize: 9999 }));
    expect(readPrefs(st).sessionSize).toBe(DEFAULT_PREFS.sessionSize);
  });
  it("funciona sin almacenamiento disponible", () => {
    expect(readPrefs(undefined)).toEqual(DEFAULT_PREFS);
  });
});

describe("navegación", () => {
  it("normaliza la barra final", () => {
    expect(normalizePath("/recall/")).toBe("/recall");
    expect(normalizePath(null)).toBe("/");
  });
  it("marca activo el módulo correcto", () => {
    expect(isActive("/", "/")).toBe(true);
    expect(isActive("/recall/", "/")).toBe(false);
    expect(isActive("/recall/mazo/", "/recall")).toBe(true);
    expect(isActive("/recallx", "/recall")).toBe(false);
  });
});
