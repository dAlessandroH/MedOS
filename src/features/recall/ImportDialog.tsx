"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { CheckCircle2, FileUp } from "lucide-react";
import { commitCsvImport, prepareCsvImport, CardError, type ImportPreview, type ImportResult } from "@/db/repos/cards";
import { createDeck, DeckError, listDecks } from "@/db/repos/decks";
import { listSubjects } from "@/db/repos/subjects";
import { readFileAsText } from "@/lib/browser";
import { Button } from "@/components/ui/Button";
import { Alert, FileButton, Select } from "@/components/ui/Fields";
import { Input, Label } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";

const NEW = "__new__";

export function ImportCsv({
  initialSubjectId,
  initialDeckId,
  onClose,
}: {
  initialSubjectId?: string;
  initialDeckId?: string;
  onClose: () => void;
}) {
  const subjects = useLiveQuery(() => listSubjects(), []);
  const [fileName, setFileName] = useState<string | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [subjectId, setSubjectId] = useState(initialSubjectId ?? "");
  const decks = useLiveQuery(() => (subjectId ? listDecks(subjectId) : Promise.resolve([])), [subjectId]);
  const [deckChoice, setDeckChoice] = useState(initialDeckId ?? "");
  const [newDeckName, setNewDeckName] = useState("");
  const [split, setSplit] = useState(true);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  const effectiveSubject = subjectId || subjects?.[0]?.id || "";
  const topics = (decks ?? []).filter((d) => !d.parentId);
  const effectiveDeck = deckChoice || (topics[0]?.id ?? NEW);
  const categories = useMemo(
    () => new Set((preview?.items ?? []).map((i) => i.category).filter(Boolean)).size,
    [preview],
  );

  async function onFile(file: File) {
    setError(null);
    setResult(null);
    setPreview(null);
    setFileName(file.name);
    try {
      const text = await readFileAsText(file);
      const p = prepareCsvImport(text);
      setPreview(p);
      if (!newDeckName) setNewDeckName(file.name.replace(/\.csv$/i, "").replace(/[_-]+/g, " ").trim());
    } catch (e) {
      setError(e instanceof CardError ? e.message : "No se pudo leer el archivo.");
    }
  }

  async function onImport() {
    if (!preview) return;
    setBusy(true);
    setError(null);
    try {
      let deckId = effectiveDeck;
      if (deckId === NEW) {
        const deck = await createDeck({ subjectId: effectiveSubject, name: newDeckName });
        deckId = deck.id;
      }
      const r = await commitCsvImport({ items: preview.items, deckId, splitByCategory: preview.format === "plataforma" && split });
      setResult(r);
      setDeckChoice(deckId);
    } catch (e) {
      setError(e instanceof CardError || e instanceof DeckError ? e.message : "No se pudo importar.");
    } finally {
      setBusy(false);
    }
  }

  if (subjects && subjects.length === 0) {
    return (
      <div className="space-y-4">
        <Alert tone="info">Primero crea una materia para guardar tus tarjetas.</Alert>
        <div className="flex justify-end">
          <Link href="/ajustes#materias" className="text-sm font-medium text-info hover:underline">
            Ir a Ajustes → Materias
          </Link>
        </div>
      </div>
    );
  }

  if (result) {
    return (
      <div className="space-y-4">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="mt-0.5 shrink-0 text-success" size={22} aria-hidden />
          <div className="text-sm">
            <p className="font-semibold text-fg">
              {result.added} {result.added === 1 ? "tarjeta importada" : "tarjetas importadas"}
            </p>
            {result.duplicates > 0 && <p className="text-muted">{result.duplicates} ya existían y se omitieron.</p>}
            {result.decksCreated > 0 && <p className="text-muted">Se crearon {result.decksCreated} subtemas por categoría.</p>}
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => { setResult(null); setPreview(null); setFileName(null); }}>
            Importar otro
          </Button>
          <Button onClick={onClose}>Listo</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-dashed border-line p-4 text-sm text-muted">
        <p>Formatos aceptados (todo entre comillas dobles):</p>
        <ul className="mt-2 space-y-1 text-xs">
          <li><span className="font-medium text-fg">Flashcards:</span> pregunta, respuesta</li>
          <li><span className="font-medium text-fg">Plataforma:</span> pregunta, opcion_a…opcion_d, respuesta (a–d), categoria, explicacion</li>
        </ul>
        <FileButton accept=".csv,text/csv" onFile={onFile} className="mt-3" label="Archivo CSV">
          <FileUp size={16} aria-hidden />
          {fileName ? "Elegir otro archivo" : "Elegir archivo CSV"}
        </FileButton>
        {fileName && <p className="mt-2 truncate text-xs">{fileName}</p>}
      </div>

      {error && <Alert>{error}</Alert>}

      {preview && (
        <>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Badge tone="info">{preview.format === "plataforma" ? "Formato plataforma" : "Flashcards"}</Badge>
            <span className="text-fg">{preview.items.length} tarjetas válidas</span>
            {preview.errors.length > 0 && <Badge tone="warning">{preview.errors.length} filas con error</Badge>}
          </div>
          {preview.errors.length > 0 && (
            <details className="rounded-lg bg-warning/10 px-3 py-2 text-xs text-warning">
              <summary className="cursor-pointer">Ver filas que no se importarán</summary>
              <ul className="mt-2 space-y-1">
                {preview.errors.slice(0, 20).map((e) => (
                  <li key={e.row}>Fila {e.row}: {e.message}</li>
                ))}
              </ul>
            </details>
          )}
          {preview.items[0] && (
            <div className="rounded-lg border border-line bg-canvas p-3 text-sm">
              <p className="text-xs text-muted">Primera tarjeta</p>
              <p className="mt-1 font-medium text-fg">{preview.items[0].front}</p>
              <p className="mt-1 text-muted">→ {preview.items[0].back}</p>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="imp-subject">Materia</Label>
              <Select id="imp-subject" value={effectiveSubject} onChange={(e) => { setSubjectId(e.target.value); setDeckChoice(""); }}>
                {subjects?.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="imp-deck">Tema (mazo)</Label>
              <Select id="imp-deck" value={effectiveDeck} onChange={(e) => setDeckChoice(e.target.value)}>
                {topics.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
                {(decks ?? []).filter((d) => d.parentId).map((d) => (
                  <option key={d.id} value={d.id}>↳ {d.name}</option>
                ))}
                <option value={NEW}>+ Nuevo tema…</option>
              </Select>
            </div>
          </div>
          {effectiveDeck === NEW && (
            <div>
              <Label htmlFor="imp-new">Nombre del nuevo tema</Label>
              <Input id="imp-new" value={newDeckName} onChange={(e) => setNewDeckName(e.target.value)} placeholder="Ej. Transporte de O₂ y CO₂" />
            </div>
          )}
          {preview.format === "plataforma" && categories > 0 && (
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" checked={split} onChange={(e) => setSplit(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[var(--color-primary)]" />
              <span>
                Crear subtemas por <span className="font-medium">categoria</span>
                <span className="block text-xs text-muted">{categories} {categories === 1 ? "categoría encontrada" : "categorías encontradas"}</span>
              </span>
            </label>
          )}
        </>
      )}

      <div className="flex justify-end gap-2 pt-1">
        <Button variant="secondary" onClick={onClose} disabled={busy}>Cancelar</Button>
        <Button
          onClick={onImport}
          disabled={!preview || preview.items.length === 0 || busy || !effectiveSubject || (effectiveDeck === NEW && !newDeckName.trim())}
        >
          Importar {preview ? preview.items.length : ""}
        </Button>
      </div>
    </div>
  );
}
