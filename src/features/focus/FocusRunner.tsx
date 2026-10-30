"use client";

import { useEffect, useRef, useState } from "react";
import { Pause, Play, Square } from "lucide-react";
import { finishSession, pauseSession, remainingMs, resumeSession } from "@/db/repos/focus";
import type { FocusSession, Subject } from "@/db/types";
import { clock } from "@/lib/format";
import { createWakeLock, playChime } from "@/lib/browser";
import { usePrefs } from "@/lib/prefs";
import { Button } from "@/components/ui/Button";
import { Overlay } from "@/components/ui/Overlay";

/**
 * Pantalla limpia de sesión: SOLO materia, objetivo, temporizador, pausar y finalizar.
 * El tiempo se calcula con marcas de tiempo guardadas en IndexedDB: si cambias de
 * pestaña, bloqueas el iPhone o cierras la app, al volver el tiempo es exacto.
 */
export function FocusRunner({
  session,
  subject,
  onFinished,
}: {
  session: FocusSession;
  subject: Subject | undefined;
  onFinished: (s: FocusSession) => void;
}) {
  const [prefs] = usePrefs();
  const [now, setNow] = useState(() => Date.now());
  const [confirmEnd, setConfirmEnd] = useState(false);
  const completing = useRef(false);
  const wakeLock = useRef<ReturnType<typeof createWakeLock> | null>(null);

  const running = session.status === "running";
  const remaining = remainingMs(session, now);
  const total = session.plannedMin * 60_000;
  const progress = total > 0 ? 1 - remaining / total : 0;
  const isBreak = session.kind !== "focus";

  // Reloj de pantalla (solo refresca la vista; la verdad está en los timestamps)
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const id = window.setInterval(tick, 250);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, []);

  // Mantener la pantalla encendida mientras corre
  useEffect(() => {
    if (!wakeLock.current) wakeLock.current = createWakeLock();
    if (running) void wakeLock.current.enable();
    else void wakeLock.current.disable();
  }, [running]);
  useEffect(() => () => void wakeLock.current?.disable(), []);

  // Título de la pestaña con el tiempo restante
  useEffect(() => {
    const prev = document.title;
    return () => {
      document.title = prev.includes("·") ? "MedOS" : prev;
    };
  }, []);
  useEffect(() => {
    document.title = `${running ? "" : "⏸ "}${clock(remaining)} · MedOS`;
  }, [remaining, running]);

  // Fin natural de la sesión
  useEffect(() => {
    if (!running || remaining > 0 || completing.current) return;
    completing.current = true;
    void finishSession(session.id, "completed").then((s) => {
      if (prefs.soundEnabled) playChime();
      if (s) onFinished(s);
    });
  }, [running, remaining, session.id, prefs.soundEnabled, onFinished]);

  async function endNow() {
    completing.current = true;
    const s = await finishSession(session.id, "ended_early");
    if (s) onFinished(s);
  }

  const R = 120;
  const C = 2 * Math.PI * R;

  return (
    <Overlay>
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-canvas px-6 text-fg animate-enter"
      style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}
      role="region"
      aria-label="Sesión en curso"
    >
      {/* 1. Materia */}
      <p className="flex items-center gap-2 text-sm font-medium text-muted">
        {subject && <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: subject.color }} aria-hidden />}
        {isBreak ? "Descanso" : subject?.name ?? "Sin materia"}
      </p>

      {/* 2. Objetivo */}
      <h1 className="mt-3 max-w-xl text-center text-xl font-semibold leading-snug text-fg sm:text-2xl">{session.goal}</h1>

      {/* 3. Temporizador */}
      <div className="relative mt-10 h-[min(72vw,288px)] w-[min(72vw,288px)]">
        <svg viewBox="0 0 280 280" className="h-full w-full -rotate-90" aria-hidden>
          <circle cx="140" cy="140" r={R} fill="none" stroke="var(--color-line)" strokeWidth="8" />
          <circle
            cx="140"
            cy="140"
            r={R}
            fill="none"
            stroke={isBreak ? "var(--color-success)" : "var(--color-primary)"}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={C}
            strokeDashoffset={C * (1 - Math.min(1, Math.max(0, progress)))}
            style={{ transition: "stroke-dashoffset 300ms linear" }}
          />
        </svg>
        <div className="absolute inset-0 grid place-items-center">
          <div className="text-center">
            <p className="text-5xl font-semibold tabular-nums tracking-tight sm:text-6xl" role="timer" aria-live="off" aria-label="Tiempo restante">
              {clock(remaining)}
            </p>
            {!running && <p className="mt-2 text-sm font-medium text-warning">En pausa</p>}
          </div>
        </div>
      </div>

      {/* 4 y 5. Pausar / Finalizar */}
      <div className="mt-10 flex items-center gap-3">
        {confirmEnd ? (
          <>
            <span className="text-sm text-muted">¿Terminar ahora?</span>
            <Button variant="secondary" onClick={() => setConfirmEnd(false)}>No</Button>
            <Button variant="danger" onClick={endNow}>Sí, terminar</Button>
          </>
        ) : (
          <>
            {running ? (
              <Button size="lg" variant="secondary" onClick={() => pauseSession(session.id)} className="w-36">
                <Pause size={18} aria-hidden /> Pausar
              </Button>
            ) : (
              <Button size="lg" onClick={() => resumeSession(session.id)} className="w-36">
                <Play size={18} aria-hidden /> Reanudar
              </Button>
            )}
            <Button size="lg" variant="ghost" onClick={() => setConfirmEnd(true)} className="w-36">
              <Square size={16} aria-hidden /> Finalizar
            </Button>
          </>
        )}
      </div>
    </div>
    </Overlay>
  );
}
