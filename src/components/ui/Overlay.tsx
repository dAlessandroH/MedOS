"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

/**
 * Pantalla completa por encima de toda la app (navegación incluida).
 * Se monta en <body> para que ninguna animación o contenedor la recorte.
 */
export function Overlay({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);
  return mounted ? createPortal(children, document.body) : null;
}
