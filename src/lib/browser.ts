"use client";

/** Descarga un archivo generado en el navegador (funciona en Safari iOS ≥ 13). */
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function readFileAsText(file: File): Promise<string> {
  if (typeof file.text === "function") return file.text();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file, "utf-8");
  });
}

/** Comprime una imagen a JPEG (máx. 1600 px) para no inflar la base local. */
export async function compressImage(
  file: Blob,
  maxSide = 1600,
  quality = 0.85,
): Promise<{ blob: Blob; width: number; height: number }> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("No se pudo leer la imagen."));
      el.src = url;
    });
    const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    const width = Math.max(1, Math.round(img.naturalWidth * scale));
    const height = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("No se pudo procesar la imagen.");
    ctx.fillStyle = "#ffffff"; // PNG con transparencia → fondo blanco legible
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("No se pudo comprimir."))), "image/jpeg", quality),
    );
    return { blob, width, height };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Dos tonos suaves (Web Audio). Sin archivos de audio, funciona offline. */
export function playChime() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const tone = (freq: number, start: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + start);
      gain.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + 0.5);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + start);
      osc.stop(ctx.currentTime + start + 0.55);
    };
    tone(660, 0);
    tone(880, 0.25);
    window.setTimeout(() => void ctx.close(), 1500);
  } catch {
    /* sin sonido disponible */
  }
}

/** Mantiene la pantalla encendida durante una sesión (Safari ≥ 16.4). */
export function createWakeLock() {
  type Sentinel = { release: () => Promise<void>; released?: boolean };
  let sentinel: Sentinel | null = null;
  let wanted = false;

  const acquire = async () => {
    const wl = (navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<Sentinel> } }).wakeLock;
    if (!wl || !wanted || document.visibilityState !== "visible") return;
    try {
      sentinel = await wl.request("screen");
    } catch {
      sentinel = null;
    }
  };
  const onVisibility = () => {
    if (document.visibilityState === "visible") void acquire();
  };

  return {
    async enable() {
      wanted = true;
      document.addEventListener("visibilitychange", onVisibility);
      await acquire();
    },
    async disable() {
      wanted = false;
      document.removeEventListener("visibilitychange", onVisibility);
      try {
        await sentinel?.release();
      } catch {
        /* ya liberado */
      }
      sentinel = null;
    },
  };
}
