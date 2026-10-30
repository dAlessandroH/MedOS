"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Coffee, PartyPopper, Play, Timer, Trash2 } from "lucide-react";
import {
  BREAK_PRESETS,
  deleteSession,
  FOCUS_PRESETS,
  FocusError,
  getActiveSession,
  reconcileActiveSession,
  recentSessions,
  startSession,
  weeklyFocus,
} from "@/db/repos/focus";
import { listSubjects } from "@/db/repos/subjects";
import { db } from "@/db/schema";
import type { FocusKind, FocusSession } from "@/db/types";
import { formatMinutes } from "@/lib/time";
import { relativeTime } from "@/lib/format";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardDescription, CardTitle } from "@/components/ui/Card";
import { Alert, Segmented, Select } from "@/components/ui/Fields";
import { Input, Label } from "@/components/ui/Input";
import { PageHeader } from "@/components/ui/PageHeader";
import { SimpleBars } from "@/components/ui/Charts";
import { FocusRunner } from "./FocusRunner";
import { Overlay } from "@/components/ui/Overlay";

const STATUS: Record<FocusSession["status"], { label: string; tone: "success" | "info" | "neutral" }> = {
  completed: { label: "Completada", tone: "success" },
  ended_early: { label: "Terminada antes", tone: "info" },
  interrupted: { label: "Interrumpida", tone: "neutral" },
  running: { label: "En curso", tone: "info" },
  paused: { label: "En pausa", tone: "neutral" },
};

const KIND_LABEL: Record<FocusKind, string> = { focus: "Enfoque", short_break: "Descanso corto", long_break: "Descanso largo" };

function Completion({
  session,
  completedToday,
  onBreak,
  onAgain,
  onClose,
}: {
  session: FocusSession;
  completedToday: number;
  onBreak: (kind: "short_break" | "long_break") => void;
  onAgain: () => void;
  onClose: () => void;
}) {
  const minutes = Math.round(session.focusedMs / 60_000);
  const isFocus = session.kind === "focus";
  const longBreak = completedToday > 0 && completedToday % 4 === 0;
  return (
    <Overlay>
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-canvas px-6 text-center text-fg animate-enter" role="dialog" aria-label="Sesión terminada">
      <div className="mb-4 grid h-16 w-16 place-items-center rounded-full bg-success/15 text-success">
        {isFocus ? <PartyPopper size={30} aria-hidden /> : <Coffee size={30} aria-hidden />}
      </div>
      <h1 className="text-2xl font-semibold">
        {!isFocus ? "Descanso terminado" : session.status === "completed" ? "¡Sesión completada!" : "Sesión guardada"}
      </h1>
      <p className="mt-2 max-w-sm text-muted">
        {isFocus
          ? minutes > 0
            ? `${formatMinutes(minutes)} de enfoque en «${session.goal}». Cada minuto cuenta.`
            : "Menos de un minuto esta vez. Está bien: lo importante es volver a empezar."
          : "Listo para otra sesión cuando quieras."}
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-2">
        {isFocus && (
          <Button size="lg" onClick={() => onBreak(longBreak ? "long_break" : "short_break")}>
            <Coffee size={18} aria-hidden /> Descanso de {longBreak ? BREAK_PRESETS.long_break : BREAK_PRESETS.short_break} min
          </Button>
        )}
        <Button size="lg" variant={isFocus ? "secondary" : "primary"} onClick={onAgain}>
          <Play size={18} aria-hidden /> Otra sesión
        </Button>
        <Button size="lg" variant="ghost" onClick={onClose}>Listo</Button>
      </div>
    </div>
    </Overlay>
  );
}

export function FocusView() {
  const params = useSearchParams();
  const subjects = useLiveQuery(() => listSubjects(), []);
  const active = useLiveQuery(() => getActiveSession().then((s) => s ?? null), []);
  const history = useLiveQuery(() => recentSessions(12), []);
  const week = useLiveQuery(() => weeklyFocus(), []);
  const completedToday = useLiveQuery(async () => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return db.focusSessions
      .where("startedAt")
      .aboveOrEqual(d.getTime())
      .filter((s) => s.kind === "focus" && s.status === "completed")
      .count();
  }, []);

  const [kind, setKind] = useState<FocusKind>("focus");
  const [subjectId, setSubjectId] = useState<string>(params.get("subject") ?? "");
  const [goal, setGoal] = useState("");
  const [preset, setPreset] = useState<number | "custom">(25);
  const [custom, setCustom] = useState("30");
  const [error, setError] = useState<string | null>(null);
  const [finished, setFinished] = useState<FocusSession | null>(null);

  // Al abrir o volver a la app, cerrar sesiones que terminaron mientras no mirabas
  useEffect(() => {
    const sync = () => {
      void reconcileActiveSession().then((closed) => {
        if (closed && closed.status === "completed") setFinished(closed);
      });
    };
    sync();
    document.addEventListener("visibilitychange", sync);
    return () => document.removeEventListener("visibilitychange", sync);
  }, []);

  const minutes = kind === "focus" ? (preset === "custom" ? Number(custom) : preset) : BREAK_PRESETS[kind];
  const subjectFor = (id: string | null) => subjects?.find((s) => s.id === id);

  async function start(e?: FormEvent) {
    e?.preventDefault();
    setError(null);
    try {
      await startSession({ kind, subjectId: subjectId || null, goal, plannedMin: minutes });
      setFinished(null);
    } catch (err) {
      setError(err instanceof FocusError ? err.message : "No se pudo iniciar la sesión.");
    }
  }

  const startBreak = useCallback(async (k: "short_break" | "long_break") => {
    await startSession({ kind: k, subjectId: null, goal: "", plannedMin: BREAK_PRESETS[k] });
    setFinished(null);
  }, []);

  const onFinished = useCallback((s: FocusSession) => setFinished(s), []);

  if (active) {
    return <FocusRunner key={active.id} session={active} subject={subjectFor(active.subjectId)} onFinished={onFinished} />;
  }
  if (finished) {
    return (
      <Completion
        session={finished}
        completedToday={completedToday ?? 0}
        onBreak={startBreak}
        onAgain={() => {
          setFinished(null);
          setKind("focus");
          setGoal("");
        }}
        onClose={() => setFinished(null)}
      />
    );
  }

  return (
    <>
      <PageHeader eyebrow="Módulo 03" title="FocusMD" description="Una materia, un objetivo concreto, un temporizador. Nada más." />

      <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        <Card>
          <form onSubmit={start} className="space-y-5">
            <Segmented
              label="Tipo de sesión"
              value={kind}
              onChange={setKind}
              options={[
                { value: "focus", label: "Enfoque" },
                { value: "short_break", label: `Descanso ${BREAK_PRESETS.short_break} min` },
                { value: "long_break", label: `Descanso ${BREAK_PRESETS.long_break} min` },
              ]}
            />

            {kind === "focus" && (
              <>
                <div>
                  <Label htmlFor="focus-subject">Materia</Label>
                  <Select id="focus-subject" value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
                    <option value="">Sin materia</option>
                    {subjects?.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </Select>
                </div>
                <div>
                  <Label htmlFor="focus-goal">Objetivo concreto</Label>
                  <Input
                    id="focus-goal"
                    value={goal}
                    onChange={(e) => setGoal(e.target.value)}
                    placeholder="Ej. Resolver las 12 preguntas de transporte de O₂"
                    maxLength={160}
                    autoComplete="off"
                  />
                  <p className="mt-1 text-xs text-muted">Algo que sabrás si lograste al terminar.</p>
                </div>
                <div>
                  <span className="mb-1.5 block text-xs font-medium text-muted">Duración</span>
                  <Segmented
                    label="Duración en minutos"
                    value={preset}
                    onChange={setPreset}
                    options={[...FOCUS_PRESETS.map((m) => ({ value: m as number | "custom", label: `${m}` })), { value: "custom", label: "Otra" }]}
                  />
                  {preset === "custom" && (
                    <div className="mt-3 flex items-center gap-2">
                      <Input
                        type="number"
                        inputMode="numeric"
                        min={1}
                        max={180}
                        value={custom}
                        onChange={(e) => setCustom(e.target.value)}
                        aria-label="Minutos personalizados"
                        className="max-w-24"
                      />
                      <span className="text-sm text-muted">minutos</span>
                    </div>
                  )}
                </div>
              </>
            )}

            {error && <Alert>{error}</Alert>}

            <Button type="submit" size="lg" className="w-full" disabled={kind === "focus" && !goal.trim()}>
              <Play size={18} aria-hidden />
              {kind === "focus" ? `Comenzar ${Number.isFinite(minutes) ? minutes : ""} min` : `Comenzar descanso`}
            </Button>
          </form>
        </Card>

        <Card>
          <CardTitle>Esta semana</CardTitle>
          {!week ? (
            <div className="mt-4 h-40 animate-pulse rounded bg-surface-2" />
          ) : (
            <>
              <p className="mt-2 text-2xl font-semibold tabular-nums">{formatMinutes(week.totalMinutes)}</p>
              <p className="text-xs text-muted">
                {week.sessions} {week.sessions === 1 ? "sesión" : "sesiones"} · {week.completed} completadas · últimos 7 días
              </p>
              <div className="mt-4">
                <SimpleBars label="Minutos de enfoque por día" data={week.days} xKey="label" unit=" min" height={150} series={[{ key: "minutes", name: "Minutos", color: "#0052ff" }]} />
              </div>
              {week.bySubject.length > 0 && (
                <ul className="mt-3 space-y-1 text-sm">
                  {week.bySubject.slice(0, 4).map((b) => (
                    <li key={b.subjectId ?? "none"} className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-2 truncate text-muted">
                        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: subjectFor(b.subjectId)?.color ?? "#94a3b8" }} aria-hidden />
                        {subjectFor(b.subjectId)?.name ?? "Sin materia"}
                      </span>
                      <span className="tabular-nums">{formatMinutes(b.minutes)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </Card>
      </div>

      <Card className="mt-4">
        <CardTitle>Historial</CardTitle>
        <CardDescription>Terminar antes también cuenta: se guarda lo que hiciste.</CardDescription>
        {!history || history.length === 0 ? (
          <div className="mt-4 flex items-center gap-2 text-sm text-muted">
            <Timer size={16} aria-hidden /> Aún no hay sesiones.
          </div>
        ) : (
          <ul className="mt-3 divide-y divide-line">
            {history.map((s) => (
              <li key={s.id} className="flex items-center gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-fg">{s.kind === "focus" ? s.goal : KIND_LABEL[s.kind]}</p>
                  <p className="mt-0.5 text-xs text-muted">
                    {subjectFor(s.subjectId)?.name ?? (s.kind === "focus" ? "Sin materia" : "Descanso")} · {formatMinutes(Math.round(s.focusedMs / 60_000))} de {s.plannedMin} · {relativeTime(s.startedAt)}
                  </p>
                </div>
                <Badge tone={STATUS[s.status].tone}>{STATUS[s.status].label}</Badge>
                <Button size="sm" variant="ghost" onClick={() => deleteSession(s.id)} aria-label="Eliminar del historial" title="Eliminar">
                  <Trash2 size={14} aria-hidden />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
