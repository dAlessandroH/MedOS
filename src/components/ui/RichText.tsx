"use client";

import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { ImageOff } from "lucide-react";
import { db } from "@/db/schema";
import { sanitizeHtml } from "@/lib/html";

/** Muestra HTML de una tarjeta, siempre saneado. */
export function RichContent({ html, className = "" }: { html: string; className?: string }) {
  return <div className={`rich ${className}`} dangerouslySetInnerHTML={{ __html: sanitizeHtml(html) }} />;
}

/** Imagen guardada en IndexedDB (Blob → URL temporal). */
export function MediaImage({ id, className = "", alt = "" }: { id: string; className?: string; alt?: string }) {
  // null = no existe (p. ej. respaldo JSON sin imágenes); undefined = cargando
  const media = useLiveQuery(() => db.media.get(id).then((m) => m ?? null), [id]);
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!media) return;
    const u = URL.createObjectURL(media.blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [media]);

  if (media === null) {
    return (
      <div className={`flex items-center gap-2 rounded-lg border border-dashed border-line px-3 py-2 text-xs text-muted ${className}`}>
        <ImageOff size={14} aria-hidden /> Imagen no disponible en este dispositivo
      </div>
    );
  }
  if (!url) return <div className={`h-32 w-48 animate-pulse rounded-lg bg-surface-2 ${className}`} aria-hidden />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt={alt} className={`max-h-80 w-auto max-w-full rounded-lg border border-line object-contain ${className}`} />;
}
