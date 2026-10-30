"use client";

import { useEffect, useId, useRef } from "react";
import { X } from "lucide-react";

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  size?: "md" | "lg";
  /** Cerrar al tocar fuera (desactivar en editores) */
  dismissible?: boolean;
}

/**
 * Modal basado en <dialog> nativo (Safari ≥ 15.4): trampa de foco,
 * tecla Esc y accesibilidad incluidas sin dependencias.
 */
export function Dialog({ open, onClose, title, description, children, size = "md", dismissible = true }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        // clic en el fondo oscuro cierra (no en diálogos con trabajo sin guardar)
        if (dismissible && e.target === ref.current) onClose();
      }}
      aria-labelledby={titleId}
      className={`m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] ${size === "lg" ? "max-w-2xl" : "max-w-md"} overflow-y-auto overscroll-contain rounded-2xl border border-line bg-surface p-0 text-fg shadow-2xl`}
    >
      {open && (
        <div className="p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 id={titleId} className="text-base font-semibold">
                {title}
              </h2>
              {description && <p className="mt-1 text-sm text-muted">{description}</p>}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar"
              className="-m-1 rounded-md p-1 text-muted hover:bg-surface-2 hover:text-fg"
            >
              <X size={18} aria-hidden />
            </button>
          </div>
          <div className="mt-5">{children}</div>
        </div>
      )}
    </dialog>
  );
}
