"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { ImagePlus, Loader2, X } from "lucide-react";
import { addMedia, CardError, createCard, updateCard } from "@/db/repos/cards";
import type { Card, Deck, OptionKey } from "@/db/types";
import { db } from "@/db/schema";
import { compressImage } from "@/lib/browser";
import { isBlankHtml, textToHtml } from "@/lib/html";
import { Button } from "@/components/ui/Button";
import { Alert, FileButton, Select, Textarea } from "@/components/ui/Fields";
import { Input, Label } from "@/components/ui/Input";
import { MediaImage } from "@/components/ui/RichText";

const RichEditor = dynamic(() => import("./RichEditor"), {
  ssr: false,
  loading: () => <div className="h-[8rem] animate-pulse rounded-lg border border-line bg-canvas" />,
});

const KEYS: OptionKey[] = ["a", "b", "c", "d"];

/**
 * Crear o editar una tarjeta. Las tarjetas de opción múltiple (formato de plataforma)
 * conservan sus 4 opciones; la "respuesta" mostrada es la opción correcta.
 */
export function CardEditor({
  deck,
  decks,
  card,
  onDone,
}: {
  deck: Deck;
  decks: Deck[];
  card?: Card;
  onDone: () => void;
}) {
  const isMcq = card?.type === "mcq";
  const [front, setFront] = useState(card?.front ?? "");
  const [back, setBack] = useState(card?.back ?? "");
  const [options, setOptions] = useState<Record<OptionKey, string>>(card?.options ?? { a: "", b: "", c: "", d: "" });
  const [correct, setCorrect] = useState<OptionKey>(card?.correct ?? "a");
  const [explanation, setExplanation] = useState(card?.explanation ?? "");
  const [imageIds, setImageIds] = useState<string[]>(card?.imageIds ?? []);
  const [deckId, setDeckId] = useState(card?.deckId ?? deck.id);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [editorKey, setEditorKey] = useState(0);
  const [savedCount, setSavedCount] = useState(0);
  const [newImages, setNewImages] = useState<string[]>([]);

  const sameSubject = decks.filter((d) => d.subjectId === deck.subjectId);

  async function onImage(file: File) {
    if (!file.type.startsWith("image/")) return setError("Elige un archivo de imagen.");
    setUploading(true);
    setError(null);
    try {
      const compressed = await compressImage(file);
      const id = await addMedia(compressed);
      setImageIds((ids) => [...ids, id]);
      setNewImages((ids) => [...ids, id]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo agregar la imagen.");
    } finally {
      setUploading(false);
    }
  }

  async function removeImage(id: string) {
    setImageIds((ids) => ids.filter((x) => x !== id));
    // imágenes recién subidas y aún no guardadas se borran de inmediato
    if (newImages.includes(id)) {
      await db.media.delete(id);
      setNewImages((ids) => ids.filter((x) => x !== id));
    }
  }

  async function cancel() {
    if (newImages.length) await db.media.bulkDelete(newImages);
    onDone();
  }

  async function save(addAnother: boolean) {
    setBusy(true);
    setError(null);
    try {
      const mcqBack = isMcq ? textToHtml(options[correct]) : back;
      if (isMcq && KEYS.some((k) => !options[k].trim())) throw new CardError("Completa las 4 opciones.");
      if (card) {
        await updateCard(card.id, {
          front,
          back: isMcq ? mcqBack : back,
          imageIds,
          deckId,
          ...(isMcq ? { options, correct, explanation } : {}),
        });
        onDone();
        return;
      }
      if (isBlankHtml(back) && imageIds.length === 0) throw new CardError("La respuesta no puede estar vacía.");
      await createCard({ deckId, front, back, imageIds });
      setNewImages([]);
      if (addAnother) {
        setFront("");
        setBack("");
        setImageIds([]);
        setEditorKey((k) => k + 1);
        setSavedCount((n) => n + 1);
      } else {
        onDone();
      }
    } catch (e) {
      setError(e instanceof CardError ? e.message : "No se pudo guardar la tarjeta.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <span className="mb-1.5 block text-xs font-medium text-muted">Pregunta</span>
        <RichEditor key={`f${editorKey}`} value={front} onChange={setFront} label="Pregunta" autoFocus />
      </div>

      {isMcq ? (
        <>
          <fieldset className="space-y-2">
            <legend className="mb-1.5 text-xs font-medium text-muted">Opciones (marca la correcta)</legend>
            {KEYS.map((k) => (
              <div key={k} className="flex items-center gap-2">
                <input
                  type="radio"
                  name="correct"
                  checked={correct === k}
                  onChange={() => setCorrect(k)}
                  aria-label={`Opción ${k.toUpperCase()} correcta`}
                  className="h-4 w-4 accent-[var(--color-success)]"
                />
                <span className="w-4 text-sm font-semibold uppercase text-muted">{k}</span>
                <Input value={options[k]} onChange={(e) => setOptions({ ...options, [k]: e.target.value })} aria-label={`Opción ${k.toUpperCase()}`} />
              </div>
            ))}
          </fieldset>
          <div>
            <Label htmlFor="card-expl">Explicación</Label>
            <Textarea id="card-expl" value={explanation} onChange={(e) => setExplanation(e.target.value)} rows={3} />
          </div>
        </>
      ) : (
        <div>
          <span className="mb-1.5 block text-xs font-medium text-muted">Respuesta</span>
          <RichEditor key={`b${editorKey}`} value={back} onChange={setBack} label="Respuesta" />
        </div>
      )}

      <div>
        <span className="mb-1.5 block text-xs font-medium text-muted">Imágenes (se muestran con la respuesta)</span>
        <div className="flex flex-wrap items-start gap-3">
          {imageIds.map((id) => (
            <div key={id} className="relative">
              <MediaImage id={id} className="max-h-28" />
              <button
                type="button"
                onClick={() => removeImage(id)}
                aria-label="Quitar imagen"
                className="absolute -right-2 -top-2 grid h-6 w-6 place-items-center rounded-full bg-danger text-white"
              >
                <X size={14} aria-hidden />
              </button>
            </div>
          ))}
          <FileButton accept="image/*" onFile={onImage} label="Agregar imagen">
            {uploading ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <ImagePlus size={16} aria-hidden />}
            Imagen
          </FileButton>
        </div>
      </div>

      {sameSubject.length > 1 && (
        <div>
          <Label htmlFor="card-deck">Mazo</Label>
          <Select id="card-deck" value={deckId} onChange={(e) => setDeckId(e.target.value)}>
            {sameSubject
              .filter((d) => !d.parentId)
              .flatMap((t) => [t, ...sameSubject.filter((s) => s.parentId === t.id)])
              .map((d) => (
                <option key={d.id} value={d.id}>
                  {d.parentId ? `   ↳ ${d.name}` : d.name}
                </option>
              ))}
          </Select>
        </div>
      )}

      {error && <Alert>{error}</Alert>}
      {savedCount > 0 && !error && <Alert tone="success">{savedCount === 1 ? "1 tarjeta guardada." : `${savedCount} tarjetas guardadas.`}</Alert>}

      <div className="flex flex-wrap justify-end gap-2 pt-1">
        <Button variant="secondary" onClick={cancel} disabled={busy}>
          {savedCount > 0 ? "Listo" : "Cancelar"}
        </Button>
        {!card && (
          <Button variant="secondary" onClick={() => save(true)} disabled={busy || uploading || isBlankHtml(front)}>
            Guardar y otra
          </Button>
        )}
        <Button onClick={() => save(false)} disabled={busy || uploading || isBlankHtml(front)}>
          Guardar
        </Button>
      </div>
    </div>
  );
}
