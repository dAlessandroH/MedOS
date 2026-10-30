"use client";

import { useEffect, useState } from "react";

/**
 * Hora actual que se refresca cada `intervalMs`. Devuelve null en el
 * primer render para evitar diferencias entre el HTML estático y el cliente.
 */
export function useNow(intervalMs = 60_000): Date | null {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const id = window.setInterval(() => setNow(new Date()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}
