"use client";

import { useState, type FormEvent } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { createDeck, DeckError, deleteDeck, countDeckContents, updateDeck, DEFAULT_NEW_PER_DAY } from "@/db/repos/decks";
import { listSubjects } from "@/db/repos/subjects";
import type { Deck } from "@/db/types";
import { Button } from "@/components/ui/Button";
import { Alert, Select } from "@/components/ui/Fields";
import { Input, Label } from "@/components/ui/Input";

export function NewDeckForm({
  subjectId,
  parent,
  onDone,
}: {
  subjectId?: string;
  parent?: Deck;
  onDone: (deck?: Deck) => void;
}) {
  const subjects = useLiveQuery(() => listSubjects(), []);
  const [chosen, setChosen] = useState(subjectId ?? "");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const effective = parent?.subjectId ?? (chosen || subjects?.[0]?.id || "");

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const deck = await createDeck({ subjectId: effective, parentId: parent?.id ?? null, name });
      onDone(deck);
    } catch (err) {
      setError(err instanceof DeckError ? err.message : "No se pudo crear.");
    }
  }

  if (subjects && subjects.length === 0) {
    return <Alert tone="info">Primero crea una materia en Ajustes.</Alert>;
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {!parent && (
        <div>
          <Label htmlFor="deck-subject">Materia</Label>
          <Select id="deck-subject" value={effective} onChange={(e) => setChosen(e.target.value)}>
            {subjects?.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </Select>
        </div>
      )}
      <div>
        <Label htmlFor="deck-name">{parent ? `Subtema dentro de «${parent.name}»` : "Nombre del tema"}</Label>
        <Input id="deck-name" value={name} onChange={(e) => setName(e.target.value)} autoFocus placeholder={parent ? "Ej. Curva de disociación" : "Ej. Fisiología respiratoria"} />
      </div>
      {error && <Alert>{error}</Alert>}
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={() => onDone()}>Cancelar</Button>
        <Button type="submit" disabled={!name.trim() || !effective}>Crear</Button>
      </div>
    </form>
  );
}

export function DeckSettingsForm({ deck, onDone, onDeleted }: { deck: Deck; onDone: () => void; onDeleted: () => void }) {
  const [name, setName] = useState(deck.name);
  const [perDay, setPerDay] = useState(String(deck.newPerDay ?? DEFAULT_NEW_PER_DAY));
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const contents = useLiveQuery(() => countDeckContents(deck.id), [deck.id]);

  async function save(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await updateDeck(deck.id, { name, newPerDay: Number(perDay) });
      onDone();
    } catch (err) {
      setError(err instanceof DeckError ? err.message : "No se pudo guardar.");
    }
  }

  if (confirming) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted">
          Se borrarán <strong className="text-fg">{deck.name}</strong>
          {contents && contents.subdecks > 0 ? `, ${contents.subdecks} subtemas` : ""} y {contents?.cards ?? 0} tarjetas con su historial.
          Esta acción no se puede deshacer.
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setConfirming(false)}>Cancelar</Button>
          <Button variant="danger" onClick={async () => { await deleteDeck(deck.id); onDeleted(); }}>
            Eliminar definitivamente
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={save} className="space-y-4">
      <div>
        <Label htmlFor="ds-name">Nombre</Label>
        <Input id="ds-name" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div>
        <Label htmlFor="ds-new">Tarjetas nuevas por día</Label>
        <Input id="ds-new" type="number" inputMode="numeric" min={0} max={100} value={perDay} onChange={(e) => setPerDay(e.target.value)} className="max-w-28" />
        <p className="mt-1 text-xs text-muted">Límite de tarjetas que verás por primera vez cada día en este mazo.</p>
      </div>
      {error && <Alert>{error}</Alert>}
      <div className="flex items-center justify-between gap-2">
        <Button variant="ghost" className="text-danger hover:text-danger" onClick={() => setConfirming(true)}>
          Eliminar mazo
        </Button>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={onDone}>Cancelar</Button>
          <Button type="submit" disabled={!name.trim()}>Guardar</Button>
        </div>
      </div>
    </form>
  );
}
