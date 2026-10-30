"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * Preferencias sencillas en localStorage (nada de datos de estudio aquí).
 * Si localStorage falla (modo privado, bloqueo), se usan los valores por defecto.
 */
export interface Prefs {
  name: string;
  soundEnabled: boolean;
  /** Tarjetas por sesión de repaso (sesiones cortas) */
  sessionSize: number;
  /** Mostrar caja para escribir la respuesta antes de voltear */
  typeAnswer: boolean;
}

export const DEFAULT_PREFS: Prefs = {
  name: "Alessandro",
  soundEnabled: true,
  sessionSize: 20,
  typeAnswer: true,
};

export const SESSION_SIZES = [10, 20, 30, 50] as const;

const KEY = "medos:prefs";
const EVENT = "medos:prefs-change";

export function readPrefs(storage: Storage | undefined = safeStorage()): Prefs {
  if (!storage) return DEFAULT_PREFS;
  try {
    const raw = storage.getItem(KEY);
    if (!raw) return DEFAULT_PREFS;
    const parsed = JSON.parse(raw) as Partial<Prefs>;
    return {
      name: typeof parsed.name === "string" ? parsed.name : DEFAULT_PREFS.name,
      soundEnabled:
        typeof parsed.soundEnabled === "boolean" ? parsed.soundEnabled : DEFAULT_PREFS.soundEnabled,
      sessionSize:
        typeof parsed.sessionSize === "number" && parsed.sessionSize >= 5 && parsed.sessionSize <= 200
          ? Math.round(parsed.sessionSize)
          : DEFAULT_PREFS.sessionSize,
      typeAnswer: typeof parsed.typeAnswer === "boolean" ? parsed.typeAnswer : DEFAULT_PREFS.typeAnswer,
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

export function writePrefs(patch: Partial<Prefs>, storage: Storage | undefined = safeStorage()): Prefs {
  const next = { ...readPrefs(storage), ...patch };
  if (storage) {
    try {
      storage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* almacenamiento lleno o bloqueado: se mantiene en memoria esta sesión */
    }
  }
  cache = next;
  if (typeof window !== "undefined") window.dispatchEvent(new Event(EVENT));
  return next;
}

function safeStorage(): Storage | undefined {
  try {
    return typeof window !== "undefined" ? window.localStorage : undefined;
  } catch {
    return undefined;
  }
}

// useSyncExternalStore exige una referencia estable entre lecturas.
let cache: Prefs | null = null;

function getSnapshot(): Prefs {
  if (!cache) cache = readPrefs();
  return cache;
}

function subscribe(callback: () => void) {
  const onChange = () => {
    cache = readPrefs();
    callback();
  };
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onChange); // otras pestañas
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function usePrefs(): [Prefs, (patch: Partial<Prefs>) => void] {
  const prefs = useSyncExternalStore(subscribe, getSnapshot, () => DEFAULT_PREFS);
  const update = useCallback((patch: Partial<Prefs>) => {
    writePrefs(patch);
  }, []);
  return [prefs, update];
}
