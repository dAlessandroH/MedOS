"use client";

import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

/**
 * Registra el service worker (solo en producción) para que MedOS funcione
 * sin internet. Cuando hay una versión nueva, ofrece actualizar sin interrumpir.
 */
export function ServiceWorkerManager() {
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    let refreshing = false;
    // Primera instalación: no recargar. Solo al cambiar de una versión a otra.
    const hadController = !!navigator.serviceWorker.controller;
    const onControllerChange = () => {
      if (refreshing || !hadController) return;
      refreshing = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    navigator.serviceWorker
      .register(`${BASE}/sw.js`, { scope: `${BASE}/` })
      .then((reg) => {
        if (reg.waiting && navigator.serviceWorker.controller) setWaiting(reg.waiting);
        reg.addEventListener("updatefound", () => {
          const sw = reg.installing;
          sw?.addEventListener("statechange", () => {
            if (sw.state === "installed" && navigator.serviceWorker.controller) setWaiting(sw);
          });
        });
        // buscar actualizaciones al volver a la app
        const check = () => document.visibilityState === "visible" && void reg.update().catch(() => {});
        document.addEventListener("visibilitychange", check);
      })
      .catch(() => {
        /* sin service worker: la app sigue funcionando en línea */
      });

    return () => navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
  }, []);

  if (!waiting) return null;
  return (
    <div className="fixed inset-x-4 bottom-20 z-40 mx-auto flex max-w-sm items-center gap-3 rounded-xl border border-line bg-surface p-3 shadow-2xl lg:bottom-6" role="status">
      <RefreshCw size={18} className="shrink-0 text-info" aria-hidden />
      <p className="flex-1 text-sm">Hay una versión nueva de MedOS.</p>
      <button
        type="button"
        onClick={() => waiting.postMessage("SKIP_WAITING")}
        className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-hover"
      >
        Actualizar
      </button>
    </div>
  );
}
