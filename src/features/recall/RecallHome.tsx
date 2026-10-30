"use client";

import Link from "next/link";
import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { BarChart3, Brain, ChevronRight, FileUp, FolderPlus, Play, Shuffle } from "lucide-react";
import { buildQueue, deckCounts, sumCounts, type DeckCount } from "@/db/repos/cards";
import { listDecks } from "@/db/repos/decks";
import { listSubjects } from "@/db/repos/subjects";
import type { Deck } from "@/db/types";
import { Button, buttonClasses } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Dialog } from "@/components/ui/Dialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { ImportCsv } from "./ImportDialog";
import { NewDeckForm } from "./DeckForms";

function Counts({ c }: { c: DeckCount }) {
  return (
    <span className="flex shrink-0 items-center gap-2 text-xs tabular-nums">
      {c.due > 0 && <span className="rounded-full bg-info/12 px-2 py-0.5 font-medium text-info" title="Repasos vencidos">{c.due}</span>}
      {c.fresh > 0 && <span className="rounded-full bg-success/12 px-2 py-0.5 font-medium text-success" title="Nuevas">{c.fresh} nuevas</span>}
      <span className="text-muted">{c.total}</span>
    </span>
  );
}

function DeckRow({ deck, count, sub = false }: { deck: Deck; count: DeckCount; sub?: boolean }) {
  return (
    <li>
      <Link
        href={`/recall/mazo?id=${deck.id}`}
        className={`flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-surface-2 ${sub ? "ml-5 border-l border-line pl-4" : ""}`}
      >
        <span className={`min-w-0 flex-1 truncate text-sm ${sub ? "text-muted" : "font-medium text-fg"}`}>{deck.name}</span>
        <Counts c={count} />
        <ChevronRight size={16} className="text-muted" aria-hidden />
      </Link>
    </li>
  );
}

export function RecallHome() {
  const subjects = useLiveQuery(() => listSubjects(), []);
  const decks = useLiveQuery(() => listDecks(), []);
  const counts = useLiveQuery(() => deckCounts(), []);
  const queue = useLiveQuery(() => buildQueue({}), []);
  const [dialog, setDialog] = useState<"import" | "deck" | null>(null);

  const loading = !subjects || !decks || !counts;
  const dueTotal = queue?.reviews.length ?? 0;
  const newTotal = queue?.fresh.length ?? 0;

  return (
    <>
      <PageHeader
        eyebrow="Módulo 02"
        title="NeuroRecall"
        description="Repetición espaciada con FSRS. Primero lo que menos dominas."
        actions={
          <>
            <Link href="/recall/estadisticas" className={buttonClasses("ghost", "md")} aria-label="Estadísticas">
              <BarChart3 size={16} aria-hidden />
              <span className="hidden sm:inline">Estadísticas</span>
            </Link>
            <Button variant="secondary" onClick={() => setDialog("deck")} aria-label="Nuevo tema">
              <FolderPlus size={16} aria-hidden />
              <span className="hidden sm:inline">Nuevo tema</span>
            </Button>
            <Button onClick={() => setDialog("import")}>
              <FileUp size={16} aria-hidden />
              Importar
            </Button>
          </>
        }
      />

      {loading ? (
        <div className="h-40 animate-pulse rounded-xl bg-surface" />
      ) : decks.length === 0 ? (
        <EmptyState icon={Brain} title="Aún no tienes mazos" description="Importa un CSV (flashcards o formato de plataforma) o crea un tema y escribe tus tarjetas.">
          <div className="flex flex-wrap justify-center gap-2">
            <Button onClick={() => setDialog("import")}>
              <FileUp size={16} aria-hidden /> Importar CSV
            </Button>
            <Button variant="secondary" onClick={() => setDialog("deck")}>
              <FolderPlus size={16} aria-hidden /> Nuevo tema
            </Button>
          </div>
        </EmptyState>
      ) : (
        <div className="space-y-5">
          <Card className="flex flex-wrap items-center justify-between gap-4 border-primary/30 bg-linear-to-br from-primary/10 to-surface">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-info">Repaso de hoy</p>
              <p className="mt-1 text-lg font-semibold text-fg">
                {dueTotal + newTotal === 0 ? "Estás al día" : `${dueTotal} vencidas · ${newTotal} nuevas`}
              </p>
              {dueTotal + newTotal === 0 && <p className="text-sm text-muted">Vuelve más tarde o agrega tarjetas nuevas.</p>}
            </div>
            {dueTotal + newTotal > 0 && (
              <Link href="/recall/estudiar?mix=1" className={buttonClasses("primary", "lg")}>
                <Shuffle size={18} aria-hidden />
                Repaso mixto
              </Link>
            )}
          </Card>

          {subjects
            .map((s) => ({ s, topics: decks.filter((d) => d.subjectId === s.id && !d.parentId) }))
            .filter((x) => x.topics.length > 0)
            .map(({ s, topics }) => {
              const subjectDecks = decks.filter((d) => d.subjectId === s.id);
              const total = sumCounts(...subjectDecks.map((d) => counts.get(d.id)));
              return (
                <section key={s.id} aria-labelledby={`subj-${s.id}`}>
                  <div className="mb-2 flex items-center justify-between gap-3 px-1">
                    <h2 id={`subj-${s.id}`} className="flex items-center gap-2 text-sm font-semibold text-fg">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: s.color }} aria-hidden />
                      {s.name}
                    </h2>
                    {total.due + total.fresh > 0 && (
                      <Link href={`/recall/estudiar?subject=${s.id}`} className="inline-flex items-center gap-1 text-sm font-medium text-info hover:underline">
                        <Play size={14} aria-hidden /> Estudiar materia
                      </Link>
                    )}
                  </div>
                  <Card className="p-1.5">
                    <ul>
                      {topics.map((t) => {
                        const subs = decks.filter((d) => d.parentId === t.id);
                        return [
                          <DeckRow key={t.id} deck={t} count={sumCounts(counts.get(t.id), ...subs.map((d) => counts.get(d.id)))} />,
                          ...subs.map((d) => <DeckRow key={d.id} deck={d} count={sumCounts(counts.get(d.id))} sub />),
                        ];
                      })}
                    </ul>
                  </Card>
                </section>
              );
            })}
        </div>
      )}

      <Dialog open={dialog === "import"} onClose={() => setDialog(null)} title="Importar tarjetas (CSV)" size="lg" dismissible={false}>
        <ImportCsv onClose={() => setDialog(null)} />
      </Dialog>
      <Dialog open={dialog === "deck"} onClose={() => setDialog(null)} title="Nuevo tema">
        <NewDeckForm onDone={() => setDialog(null)} />
      </Dialog>
    </>
  );
}
