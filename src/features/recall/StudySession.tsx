"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, Eye, Undo2, X } from "lucide-react";
import { db } from "@/db/schema";
import { buildQueue, logReviewSession, mixQueue, reviewCard, undoReview, type QueueScope } from "@/db/repos/cards";
import { deckWithChildrenIds } from "@/db/repos/decks";
import type { Card, OptionKey, Rating } from "@/db/types";
import { usePrefs } from "@/lib/prefs";
import { formatInterval, previewDue } from "./fsrs";
import { Button, buttonClasses } from "@/components/ui/Button";
import { ProgressBar, Textarea } from "@/components/ui/Fields";
import { MediaImage, RichContent } from "@/components/ui/RichText";
import { EmptyState } from "@/components/ui/EmptyState";

/** Si tras calificar la tarjeta vuelve en menos de esto, se repite en esta misma sesión. */
const REQUEUE_WINDOW_MS = 20 * 60_000;

const RATINGS: { rating: Rating; label: string; key: string; cls: string }[] = [
  { rating: 1, label: "Otra vez", key: "1", cls: "bg-danger/15 text-danger hover:bg-danger/25 border-danger/30" },
  { rating: 2, label: "Difícil", key: "2", cls: "bg-warning/15 text-warning hover:bg-warning/25 border-warning/30" },
  { rating: 3, label: "Bien", key: "3", cls: "bg-primary/20 text-fg hover:bg-primary/30 border-primary/40" },
  { rating: 4, label: "Fácil", key: "4", cls: "bg-success/15 text-success hover:bg-success/25 border-success/30" },
];

interface HistoryEntry {
  logId: string;
  before: Card;
  requeued: boolean;
}

function useScope(): { scope: QueueScope | null; label: string | null; subjectId: string | null } {
  const params = useSearchParams();
  const deckId = params.get("deck");
  const subjectId = params.get("subject");
  const [state, setState] = useState<{ scope: QueueScope | null; label: string | null; subjectId: string | null }>({
    scope: null,
    label: null,
    subjectId: null,
  });
  useEffect(() => {
    let alive = true;
    (async () => {
      if (deckId) {
        const deck = await db.decks.get(deckId);
        const ids = await deckWithChildrenIds(deckId);
        if (alive) setState({ scope: { deckIds: ids }, label: deck?.name ?? "Mazo", subjectId: deck?.subjectId ?? null });
      } else if (subjectId) {
        const s = await db.subjects.get(subjectId);
        if (alive) setState({ scope: { subjectId }, label: s?.name ?? "Materia", subjectId });
      } else if (alive) {
        setState({ scope: {}, label: "Repaso mixto", subjectId: null });
      }
    })();
    return () => {
      alive = false;
    };
  }, [deckId, subjectId]);
  return state;
}

export function StudySession() {
  const { scope, label, subjectId } = useScope();
  const [prefs] = usePrefs();
  const [queue, setQueue] = useState<Card[] | null>(null);
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [typed, setTyped] = useState("");
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [ratings, setRatings] = useState<Rating[]>([]);
  const [busy, setBusy] = useState(false);
  const [more, setMore] = useState(0);
  const shownAt = useRef(Date.now());
  const sessionStart = useRef(Date.now());
  const logged = useRef(false);

  const load = useCallback(async () => {
    if (!scope) return;
    const q = await buildQueue(scope);
    setQueue(mixQueue(q, prefs.sessionSize));
    setIndex(0);
    setRevealed(false);
    setTyped("");
    setHistory([]);
    setRatings([]);
    logged.current = false;
    sessionStart.current = Date.now();
    shownAt.current = Date.now();
  }, [scope, prefs.sessionSize]);

  useEffect(() => {
    void load();
  }, [load]);

  const card = queue?.[index];
  const finished = queue !== null && index >= queue.length;
  const preview = useMemo(() => (card ? previewDue(card.fsrs) : null), [card]);

  // Al terminar: registrar la sesión y ver si quedan más tarjetas
  useEffect(() => {
    if (!finished || !scope) return;
    if (!logged.current && ratings.length > 0) {
      logged.current = true;
      void logReviewSession({ count: ratings.length, correct: ratings.filter((r) => r > 1).length, subjectId, label: label ?? "" });
    }
    void buildQueue(scope).then((q) => setMore(q.reviews.length + q.fresh.length));
  }, [finished, scope, ratings, subjectId, label]);

  const reveal = useCallback(() => {
    if (!card || revealed) return;
    setRevealed(true);
  }, [card, revealed]);

  const rate = useCallback(
    async (rating: Rating) => {
      if (!card || !revealed || busy || !queue) return;
      setBusy(true);
      try {
        const { card: updated, log } = await reviewCard({
          cardId: card.id,
          rating,
          durationMs: Date.now() - shownAt.current,
          typedAnswer: typed,
        });
        const requeue = updated.due - Date.now() < REQUEUE_WINDOW_MS;
        setQueue(requeue ? [...queue, updated] : queue);
        setHistory((h) => [...h, { logId: log.id, before: card, requeued: requeue }]);
        setRatings((r) => [...r, rating]);
        setIndex((i) => i + 1);
        setRevealed(false);
        setTyped("");
        shownAt.current = Date.now();
      } finally {
        setBusy(false);
      }
    },
    [card, revealed, busy, queue, typed],
  );

  const undo = useCallback(async () => {
    const last = history[history.length - 1];
    if (!last || !queue || busy) return;
    setBusy(true);
    try {
      await undoReview(last.logId);
      const q = last.requeued ? queue.slice(0, -1) : queue.slice();
      q[index - 1] = last.before;
      setQueue(q);
      setHistory((h) => h.slice(0, -1));
      setRatings((r) => r.slice(0, -1));
      setIndex((i) => i - 1);
      setRevealed(true);
      logged.current = false;
    } finally {
      setBusy(false);
    }
  }, [history, queue, index, busy]);

  // Atajos: Espacio/Enter muestra · 1–4 califica · Ctrl/⌘+Z deshace
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement)?.tagName === "TEXTAREA";
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        void undo();
        return;
      }
      if (!revealed) {
        if ((e.key === "Enter" && (!typing || e.metaKey || e.ctrlKey)) || (e.key === " " && !typing)) {
          e.preventDefault();
          reveal();
        }
        return;
      }
      if (typing) return;
      const r = RATINGS.find((x) => x.key === e.key);
      if (r) {
        e.preventDefault();
        void rate(r.rating);
      } else if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        void rate(3);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [revealed, reveal, rate, undo]);

  if (!queue || !label) return <div className="h-72 animate-pulse rounded-xl bg-surface" />;

  if (queue.length === 0) {
    return (
      <EmptyState icon={CheckCircle2} title="Nada pendiente aquí" description="No hay tarjetas vencidas ni nuevas disponibles hoy en este grupo.">
        <Link href="/recall" className={buttonClasses("secondary")}>Volver a NeuroRecall</Link>
      </EmptyState>
    );
  }

  if (finished) {
    const recalled = ratings.filter((r) => r > 1).length;
    const minutes = Math.max(1, Math.round((Date.now() - sessionStart.current) / 60_000));
    return (
      <div className="mx-auto max-w-lg py-6 text-center">
        <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-full bg-success/15 text-success">
          <CheckCircle2 size={28} aria-hidden />
        </div>
        <h1 className="text-2xl font-semibold">Sesión terminada</h1>
        <p className="mt-2 text-muted">
          {ratings.length} {ratings.length === 1 ? "repaso" : "repasos"} en {minutes} min · recordaste {ratings.length ? Math.round((recalled / ratings.length) * 100) : 0} %
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          {history.length > 0 && (
            <Button variant="ghost" onClick={undo} disabled={busy}>
              <Undo2 size={16} aria-hidden /> Deshacer última
            </Button>
          )}
          <Link href="/recall" className={buttonClasses("secondary")}>Volver</Link>
          {more > 0 && (
            <Button onClick={load}>Seguir ({Math.min(more, prefs.sessionSize)} más)</Button>
          )}
        </div>
      </div>
    );
  }

  if (!card) return null;
  const mcq = card.type === "mcq" && card.options && card.correct;

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-4 flex items-center gap-3">
        <Link href="/recall" aria-label="Salir del repaso" className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-muted hover:bg-surface hover:text-fg">
          <X size={20} aria-hidden />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="mb-1.5 flex items-center justify-between text-xs text-muted">
            <span className="truncate">{label}</span>
            <span className="tabular-nums">{index + 1} / {queue.length}</span>
          </div>
          <ProgressBar value={index} max={queue.length} label="Progreso de la sesión" />
        </div>
        <Button variant="ghost" size="sm" onClick={undo} disabled={history.length === 0 || busy} aria-label="Deshacer última calificación" title="Deshacer (⌘Z)">
          <Undo2 size={16} aria-hidden />
        </Button>
      </div>

      <article className="rounded-2xl border border-line bg-surface p-5 sm:p-7" aria-live="polite">
        <div className="mb-3 flex items-center gap-2 text-xs text-muted">
          {card.fsrs.state === 0 ? <span className="text-success">Nueva</span> : <span>Repaso</span>}
          {card.lapses >= 3 && <span className="text-danger">· {card.lapses} fallos</span>}
        </div>
        <RichContent html={card.front} className="text-lg text-fg" />

        {!revealed && prefs.typeAnswer && (
          <Textarea
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder="Escribe tu respuesta antes de ver la correcta (opcional)"
            aria-label="Tu respuesta"
            className="mt-5"
            rows={3}
          />
        )}

        {revealed && (
          <div className="mt-5 space-y-4 border-t border-line pt-5">
            {typed.trim() && (
              <div className="rounded-lg bg-canvas p-3 text-sm">
                <p className="mb-1 text-xs font-medium text-muted">Tu respuesta</p>
                <p className="whitespace-pre-wrap text-fg">{typed}</p>
              </div>
            )}
            {mcq ? (
              <>
                <div className="rounded-lg border border-success/30 bg-success/10 p-3">
                  <p className="mb-1 text-xs font-medium text-success">Respuesta correcta ({card.correct!.toUpperCase()})</p>
                  <p className="text-fg">{card.options![card.correct as OptionKey]}</p>
                </div>
                {card.explanation && <p className="text-sm leading-relaxed text-muted">{card.explanation}</p>}
                <details className="text-sm">
                  <summary className="cursor-pointer text-muted hover:text-fg">Ver las 4 opciones</summary>
                  <ul className="mt-2 space-y-1.5">
                    {(["a", "b", "c", "d"] as OptionKey[]).map((k) => (
                      <li key={k} className={`flex gap-2 rounded-md px-2 py-1 ${k === card.correct ? "bg-success/10 text-fg" : "text-muted"}`}>
                        <span className="font-semibold uppercase">{k}</span> {card.options![k]}
                      </li>
                    ))}
                  </ul>
                </details>
              </>
            ) : (
              <RichContent html={card.back} className="text-fg" />
            )}
            {card.imageIds.length > 0 && (
              <div className="flex flex-wrap gap-3">
                {card.imageIds.map((id) => (
                  <MediaImage key={id} id={id} />
                ))}
              </div>
            )}
          </div>
        )}
      </article>

      <div className="sticky bottom-20 mt-4 lg:bottom-4">
        {!revealed ? (
          <Button size="lg" className="w-full" onClick={reveal}>
            <Eye size={18} aria-hidden /> Mostrar respuesta
          </Button>
        ) : (
          <div className="grid grid-cols-4 gap-2" role="group" aria-label="¿Qué tan bien lo recordaste?">
            {RATINGS.map((r) => (
              <button
                key={r.rating}
                type="button"
                disabled={busy}
                onClick={() => rate(r.rating)}
                className={`flex h-16 flex-col items-center justify-center rounded-xl border text-sm font-semibold transition-colors disabled:opacity-50 ${r.cls}`}
              >
                {r.label}
                <span className="mt-0.5 text-[11px] font-normal tabular-nums opacity-80">
                  {preview ? formatInterval(preview[r.rating] - Date.now()) : ""}
                </span>
              </button>
            ))}
          </div>
        )}
        <p className="mt-2 hidden text-center text-xs text-muted lg:block">
          {revealed ? "Teclas 1–4 para calificar · ⌘Z deshace" : "Espacio para mostrar la respuesta"}
        </p>
      </div>
    </div>
  );
}
