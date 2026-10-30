"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { ChevronLeft, FileUp, FolderPlus, Pause, Pencil, Play, Plus, RotateCcw, Search, Settings2, Trash2 } from "lucide-react";
import { db } from "@/db/schema";
import { deckCounts, deleteCard, listCards, resetCard, setCardSuspended, sumCounts } from "@/db/repos/cards";
import { listDecks } from "@/db/repos/decks";
import type { Card } from "@/db/types";
import { htmlToText } from "@/lib/html";
import { relativeTime } from "@/lib/format";
import { formatInterval } from "./fsrs";
import { Badge } from "@/components/ui/Badge";
import { Button, buttonClasses } from "@/components/ui/Button";
import { Card as Panel } from "@/components/ui/Card";
import { Dialog } from "@/components/ui/Dialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { CardEditor } from "./CardEditor";
import { DeckSettingsForm, NewDeckForm } from "./DeckForms";
import { ImportCsv } from "./ImportDialog";

const STATE_LABEL = ["Nueva", "Aprendiendo", "Repaso", "Reaprendiendo"] as const;

function CardRow({ card, onEdit, now }: { card: Card; onEdit: () => void; now: number }) {
  const [confirm, setConfirm] = useState(false);
  const text = htmlToText(card.front);
  const due = card.fsrs.state === 0 ? null : card.due <= now ? "Vencida" : `en ${formatInterval(card.due - now)}`;
  return (
    <li className={`flex items-center gap-3 px-3 py-2.5 ${card.suspended ? "opacity-50" : ""}`}>
      <button type="button" onClick={onEdit} className="min-w-0 flex-1 text-left">
        <span className="line-clamp-2 text-sm text-fg">{text}</span>
        <span className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted">
          <Badge tone={card.fsrs.state === 0 ? "success" : card.fsrs.state === 2 ? "neutral" : "info"}>{STATE_LABEL[card.fsrs.state]}</Badge>
          {due && <span>{due}</span>}
          {card.lapses >= 3 && <Badge tone="danger">{card.lapses} fallos</Badge>}
          {card.suspended && <Badge>Suspendida</Badge>}
          {card.type === "mcq" && <Badge>Opción múltiple</Badge>}
        </span>
      </button>
      {confirm ? (
        <div className="flex shrink-0 gap-1">
          <Button size="sm" variant="secondary" onClick={() => setConfirm(false)}>No</Button>
          <Button size="sm" variant="danger" onClick={() => deleteCard(card.id)} aria-label="Confirmar eliminar">Eliminar</Button>
        </div>
      ) : (
        <div className="flex shrink-0">
          <Button size="sm" variant="ghost" onClick={onEdit} aria-label="Editar tarjeta" title="Editar"><Pencil size={15} aria-hidden /></Button>
          <Button size="sm" variant="ghost" onClick={() => setCardSuspended(card.id, !card.suspended)} aria-label={card.suspended ? "Reactivar" : "Suspender"} title={card.suspended ? "Reactivar" : "Suspender"}>
            {card.suspended ? <Play size={15} aria-hidden /> : <Pause size={15} aria-hidden />}
          </Button>
          {card.fsrs.state !== 0 && (
            <Button size="sm" variant="ghost" onClick={() => resetCard(card.id)} aria-label="Reiniciar aprendizaje" title="Reiniciar aprendizaje"><RotateCcw size={15} aria-hidden /></Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => setConfirm(true)} aria-label="Eliminar tarjeta" title="Eliminar"><Trash2 size={15} aria-hidden /></Button>
        </div>
      )}
    </li>
  );
}

export function DeckView() {
  const params = useSearchParams();
  const router = useRouter();
  const id = params.get("id") ?? "";
  const deck = useLiveQuery(() => db.decks.get(id).then((d) => d ?? null), [id]);
  const subject = useLiveQuery(async () => (deck ? ((await db.subjects.get(deck.subjectId)) ?? null) : null), [deck?.subjectId]);
  const allDecks = useLiveQuery(() => (deck ? listDecks(deck.subjectId) : Promise.resolve([])), [deck?.subjectId]);
  const subdecks = (allDecks ?? []).filter((d) => d.parentId === id);
  const parent = (allDecks ?? []).find((d) => d.id === deck?.parentId);
  const cards = useLiveQuery(() => listCards([id]), [id]);
  const counts = useLiveQuery(() => deckCounts(), []);
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(100);
  const [dialog, setDialog] = useState<"new" | "import" | "sub" | "settings" | null>(null);
  const [editing, setEditing] = useState<Card | null>(null);
  const now = Date.now();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (cards ?? []).filter((c) => !q || htmlToText(`${c.front} ${c.back}`).toLowerCase().includes(q));
  }, [cards, query]);

  if (deck === null) {
    return (
      <EmptyState icon={Search} title="Mazo no encontrado" description="Puede que lo hayas eliminado.">
        <Link href="/recall" className={buttonClasses("secondary")}>Volver a NeuroRecall</Link>
      </EmptyState>
    );
  }
  if (!deck || !cards || !counts) return <div className="h-60 animate-pulse rounded-xl bg-surface" />;

  const total = sumCounts(counts.get(deck.id), ...subdecks.map((d) => counts.get(d.id)));

  return (
    <>
      <Link href="/recall" className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-fg">
        <ChevronLeft size={16} aria-hidden /> NeuroRecall
      </Link>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-xs font-medium text-muted">
            {subject && <span className="h-2 w-2 rounded-full" style={{ backgroundColor: subject.color }} aria-hidden />}
            {subject?.name}
            {parent && <> · <Link href={`/recall/mazo?id=${parent.id}`} className="hover:text-fg">{parent.name}</Link></>}
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight lg:text-3xl">{deck.name}</h1>
          <p className="mt-1 text-sm text-muted">
            {total.total} tarjetas · {total.due} vencidas · {total.fresh} nuevas · {deck.newPerDay} nuevas/día
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" onClick={() => setDialog("settings")} aria-label="Ajustes del mazo" title="Ajustes del mazo">
            <Settings2 size={16} aria-hidden />
          </Button>
          <Button variant="secondary" onClick={() => setDialog("import")} aria-label="Importar CSV en este mazo">
            <FileUp size={16} aria-hidden /> <span className="hidden sm:inline">Importar</span>
          </Button>
          <Button variant="secondary" onClick={() => setDialog("new")}>
            <Plus size={16} aria-hidden /> Tarjeta
          </Button>
          {total.due + total.fresh > 0 && (
            <Link href={`/recall/estudiar?deck=${deck.id}`} className={buttonClasses("primary")}>
              <Play size={16} aria-hidden /> Estudiar
            </Link>
          )}
        </div>
      </header>

      {!deck.parentId && (
        <section className="mb-5" aria-label="Subtemas">
          <div className="mb-2 flex items-center justify-between px-1">
            <h2 className="text-sm font-semibold">Subtemas</h2>
            <Button size="sm" variant="ghost" onClick={() => setDialog("sub")}>
              <FolderPlus size={15} aria-hidden /> Subtema
            </Button>
          </div>
          {subdecks.length === 0 ? (
            <p className="px-1 text-sm text-muted">Sin subtemas. Puedes organizar este tema en partes más pequeñas.</p>
          ) : (
            <Panel className="p-1.5">
              <ul>
                {subdecks.map((d) => {
                  const c = counts.get(d.id);
                  return (
                    <li key={d.id}>
                      <Link href={`/recall/mazo?id=${d.id}`} className="flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm hover:bg-surface-2">
                        <span className="truncate">{d.name}</span>
                        <span className="text-xs tabular-nums text-muted">{c?.total ?? 0} tarjetas{c?.due ? ` · ${c.due} vencidas` : ""}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </Panel>
          )}
        </section>
      )}

      <section aria-label="Tarjetas">
        <div className="mb-2 flex items-center justify-between gap-3 px-1">
          <h2 className="text-sm font-semibold">Tarjetas de este {deck.parentId ? "subtema" : "tema"}</h2>
          {cards.length > 8 && (
            <div className="relative w-full max-w-60">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar" aria-label="Buscar tarjetas" className="h-9 pl-9" />
            </div>
          )}
        </div>
        {cards.length === 0 ? (
          <p className="px-1 text-sm text-muted">Sin tarjetas todavía. Agrega una o importa un CSV.</p>
        ) : (
          <Panel className="p-0">
            <ul className="divide-y divide-line">
              {filtered.slice(0, limit).map((c) => (
                <CardRow key={c.id} card={c} onEdit={() => setEditing(c)} now={now} />
              ))}
            </ul>
            {filtered.length > limit && (
              <div className="border-t border-line p-2 text-center">
                <Button size="sm" variant="ghost" onClick={() => setLimit((l) => l + 100)}>Mostrar más ({filtered.length - limit})</Button>
              </div>
            )}
          </Panel>
        )}
      </section>

      <Dialog open={dialog === "new"} onClose={() => setDialog(null)} title="Nueva tarjeta" size="lg" dismissible={false}>
        <CardEditor deck={deck} decks={allDecks ?? [deck]} onDone={() => setDialog(null)} />
      </Dialog>
      <Dialog open={editing !== null} onClose={() => setEditing(null)} title="Editar tarjeta" size="lg" dismissible={false}>
        {editing && <CardEditor key={editing.id} deck={deck} decks={allDecks ?? [deck]} card={editing} onDone={() => setEditing(null)} />}
      </Dialog>
      <Dialog open={dialog === "import"} onClose={() => setDialog(null)} title={`Importar en «${deck.name}»`} size="lg" dismissible={false}>
        <ImportCsv initialSubjectId={deck.subjectId} initialDeckId={deck.id} onClose={() => setDialog(null)} />
      </Dialog>
      <Dialog open={dialog === "sub"} onClose={() => setDialog(null)} title="Nuevo subtema">
        <NewDeckForm parent={deck} onDone={() => setDialog(null)} />
      </Dialog>
      <Dialog open={dialog === "settings"} onClose={() => setDialog(null)} title="Ajustes del mazo">
        <DeckSettingsForm
          deck={deck}
          onDone={() => setDialog(null)}
          onDeleted={() => router.push(parent ? `/recall/mazo?id=${parent.id}` : "/recall")}
        />
      </Dialog>
    </>
  );
}
