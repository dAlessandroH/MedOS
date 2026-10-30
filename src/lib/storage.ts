/** Estado del almacenamiento del navegador (StorageManager API). */
export interface StorageStatus {
  supported: boolean;
  persisted: boolean | null;
  usageBytes: number | null;
  quotaBytes: number | null;
}

export async function getStorageStatus(): Promise<StorageStatus> {
  const sm = typeof navigator !== "undefined" ? navigator.storage : undefined;
  if (!sm) return { supported: false, persisted: null, usageBytes: null, quotaBytes: null };

  const [persisted, estimate] = await Promise.all([
    typeof sm.persisted === "function" ? sm.persisted().catch(() => null) : Promise.resolve(null),
    typeof sm.estimate === "function" ? sm.estimate().catch(() => null) : Promise.resolve(null),
  ]);

  return {
    supported: true,
    persisted,
    usageBytes: estimate?.usage ?? null,
    quotaBytes: estimate?.quota ?? null,
  };
}

/** Pide al navegador que no borre los datos de MedOS. Devuelve si se concedió. */
export async function requestPersistence(): Promise<boolean> {
  const sm = typeof navigator !== "undefined" ? navigator.storage : undefined;
  if (!sm || typeof sm.persist !== "function") return false;
  try {
    return await sm.persist();
  } catch {
    return false;
  }
}

/** ¿Se está ejecutando como app instalada (pantalla de inicio)? */
export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return iosStandalone || window.matchMedia?.("(display-mode: standalone)").matches === true;
}

export function formatBytes(bytes: number | null): string {
  if (bytes === null) return "—";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[i]}`;
}
