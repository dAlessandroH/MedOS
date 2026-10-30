"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { ArrowDown, ArrowUp, CheckCircle2, ChevronLeft, ExternalLink, Play, RotateCcw, Search, Trash2, XCircle } from "lucide-react";
import { db } from "@/db/schema";
import { abandonAttempt, answerStep, deleteCase, finishAttempt, getOpenAttempt, scoreOf, setCaseSubject, startAttempt, STEP_KIND_LABEL } from "@/db/repos/cases";
import { listSubjects } from "@/db/repos/subjects";
import type { CaseAttempt, CaseStep, ClinicalCase, OptionKey } from "@/db/types";
import { Badge } from "@/components/ui/Badge";
import { Button, buttonClasses } from "@/components/ui/Button";
import { Card, CardTitle } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ProgressBar, Select } from "@/components/ui/Fields";
import { Difficulty } from "./LabHome";

const KEYS: OptionKey[] = ["a", "b", "c", "d"];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted">{title}</h3>
      <div className="text-sm leading-relaxed text-fg">{children}</div>
    </div>
  );
}

function PatientChart({ c }: { c: ClinicalCase }) {
  const v = c.vitals;
  const vitals = [
    v.ta && { k: "TA", v: `${v.ta} mmHg` },
    v.fc !== undefined && { k: "FC", v: `${v.fc} lpm` },
    v.fr !== undefined && { k: "FR", v: `${v.fr} rpm` },
    v.temp !== undefined && { k: "Temp", v: `${v.temp} °C` },
    v.spo2 !== undefined && { k: "SpO₂", v: `${v.spo2} %` },
    v.weightKg !== undefined && { k: "Peso", v: `${v.weightKg} kg` },
    v.heightCm !== undefined && { k: "Talla", v: `${v.heightCm} cm` },
  ].filter(Boolean) as { k: string; v: string }[];
  const history = [
    ["Personales", c.history.personal],
    ["Familiares", c.history.family],
    ["Medicamentos", c.history.medications],
    ["Alergias", c.history.allergies],
    ["Otros", c.history.other],
  ].filter(([, t]) => t) as [string, string][];

  return (
    <Card className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Badge tone="info">{c.patient.sex === "F" ? "Mujer" : "Hombre"} · {c.patient.age} años</Badge>
        <span className="text-xs text-muted">Paciente ficticio</span>
      </div>
      <Section title="Motivo de consulta">{c.chiefComplaint}</Section>
      <Section title="Padecimiento actual">{c.hpi}</Section>
      {history.length > 0 && (
        <Section title="Antecedentes relevantes">
          <dl className="space-y-1">
            {history.map(([k, t]) => (
              <div key={k}>
                <dt className="inline font-medium text-muted">{k}: </dt>
                <dd className="inline">{t}</dd>
              </div>
            ))}
          </dl>
        </Section>
      )}
      {vitals.length > 0 && (
        <Section title="Signos vitales">
          <dl className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {vitals.map((x) => (
              <div key={x.k} className="rounded-lg bg-canvas px-2.5 py-2">
                <dt className="text-[11px] text-muted">{x.k}</dt>
                <dd className="font-medium tabular-nums">{x.v}</dd>
              </div>
            ))}
          </dl>
        </Section>
      )}
      <Section title="Exploración física">{c.physicalExam}</Section>
      {c.labs && c.labs.length > 0 && (
        <Section title="Laboratorios">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted">
                  <th className="py-1.5 pr-3 font-medium">Estudio</th>
                  <th className="py-1.5 pr-3 font-medium">Resultado</th>
                  <th className="py-1.5 font-medium">Referencia</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {c.labs.map((l) => (
                  <tr key={l.name}>
                    <td className="py-1.5 pr-3">{l.name}</td>
                    <td className={`py-1.5 pr-3 font-medium tabular-nums ${l.flag === "H" ? "text-warning" : l.flag === "L" ? "text-info" : ""}`}>
                      <span className="inline-flex items-center gap-1">
                        {l.value} {l.unit}
                        {l.flag === "H" && <ArrowUp size={13} aria-label="alto" />}
                        {l.flag === "L" && <ArrowDown size={13} aria-label="bajo" />}
                      </span>
                    </td>
                    <td className="py-1.5 text-xs text-muted">{l.reference}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}
    </Card>
  );
}

function StepCard({
  step,
  number,
  answer,
  onAnswer,
}: {
  step: CaseStep;
  number: number;
  answer: CaseAttempt["answers"][number] | undefined;
  onAnswer?: (k: OptionKey) => void;
}) {
  return (
    <Card className={answer ? (answer.correct ? "border-success/30" : "border-danger/30") : "border-primary/40"}>
      <div className="mb-2 flex items-center justify-between gap-2 text-xs text-muted">
        <span>Pregunta {number} · {STEP_KIND_LABEL[step.kind]}</span>
        {answer && (answer.correct ? <Badge tone="success">Correcta</Badge> : <Badge tone="danger">Incorrecta</Badge>)}
      </div>
      {step.reveal && <p className="mb-3 rounded-lg bg-info/10 p-3 text-sm text-fg">{step.reveal}</p>}
      <p className="font-medium text-fg">{step.question}</p>
      <ul className="mt-3 space-y-2" role="list">
        {KEYS.map((k) => {
          const chosen = answer?.chosen === k;
          const isCorrect = step.correct === k;
          const state = !answer ? "idle" : isCorrect ? "correct" : chosen ? "wrong" : "dim";
          return (
            <li key={k}>
              <button
                type="button"
                disabled={!!answer || !onAnswer}
                onClick={() => onAnswer?.(k)}
                className={[
                  "flex w-full items-start gap-3 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors",
                  state === "idle" && "border-line bg-canvas hover:border-primary/60",
                  state === "correct" && "border-success/50 bg-success/10",
                  state === "wrong" && "border-danger/50 bg-danger/10",
                  state === "dim" && "border-line bg-canvas opacity-60",
                ].filter(Boolean).join(" ")}
              >
                <span className="mt-px font-semibold uppercase text-muted">{k}</span>
                <span className="flex-1 text-fg">{step.options[k]}</span>
                {state === "correct" && <CheckCircle2 size={18} className="shrink-0 text-success" aria-label="Respuesta correcta" />}
                {state === "wrong" && <XCircle size={18} className="shrink-0 text-danger" aria-label="Tu respuesta" />}
              </button>
            </li>
          );
        })}
      </ul>
      {answer && (
        <div className="mt-4 rounded-lg bg-canvas p-3 text-sm leading-relaxed">
          <p className="mb-1 text-xs font-semibold text-muted">Explicación</p>
          <p className="text-fg">{step.explanation}</p>
        </div>
      )}
    </Card>
  );
}

export function CaseView() {
  const params = useSearchParams();
  const router = useRouter();
  const id = params.get("id") ?? "";
  const c = useLiveQuery(() => db.clinicalCases.get(id).then((x) => x ?? null), [id]);
  const subjects = useLiveQuery(() => listSubjects(), []);
  const [attempt, setAttempt] = useState<CaseAttempt | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const shownAt = useRef(Date.now());
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    void getOpenAttempt(id).then((a) => {
      if (!alive) return;
      setAttempt(a ?? null);
      setLoaded(true);
    });
    return () => {
      alive = false;
    };
  }, [id]);

  if (c === null) {
    return (
      <EmptyState icon={Search} title="Caso no encontrado" description="Puede que lo hayas eliminado.">
        <Link href="/lab" className={buttonClasses("secondary")}>Volver a la biblioteca</Link>
      </EmptyState>
    );
  }
  if (!c || !loaded) return <div className="h-72 animate-pulse rounded-xl bg-surface" />;

  const answered = attempt?.answers ?? [];
  const finished = attempt?.finishedAt != null;
  const current = attempt && !finished ? c.steps[answered.length] : undefined;
  const allAnswered = attempt !== null && answered.length >= c.steps.length;

  async function begin() {
    const a = await startAttempt(c!.id);
    setAttempt(a);
    shownAt.current = Date.now();
  }

  async function choose(step: CaseStep, k: OptionKey) {
    if (!attempt) return;
    const { attempt: updated } = await answerStep({ attemptId: attempt.id, stepId: step.id, chosen: k, ms: Date.now() - shownAt.current });
    setAttempt(updated);
    shownAt.current = Date.now();
    window.setTimeout(() => bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" }), 50);
  }

  async function finish() {
    if (!attempt) return;
    setAttempt(await finishAttempt(attempt.id));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function retry() {
    setAttempt(null);
    await begin();
  }

  const score = attempt ? (finished ? attempt.score ?? 0 : scoreOf(attempt, c.steps.length)) : 0;
  const failed = c.steps.filter((s) => answered.find((a) => a.stepId === s.id && !a.correct));

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/lab" className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-fg">
        <ChevronLeft size={16} aria-hidden /> Biblioteca
      </Link>
      <header className="mb-4">
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <span className="font-medium text-info">{c.specialty}</span>
          <Difficulty level={c.difficulty} />
        </div>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight lg:text-3xl">{c.title}</h1>
        <p className="mt-1 text-xs text-muted">Caso ficticio con fines educativos. No corresponde a un paciente real.</p>
      </header>

      {finished && (
        <Card className="mb-4 border-primary/40 bg-linear-to-br from-primary/10 to-surface text-center">
          <p className="text-xs font-semibold uppercase tracking-wider text-info">Calificación</p>
          <p className="mt-1 text-4xl font-semibold tabular-nums">{score} %</p>
          <p className="mt-1 text-sm text-muted">
            {answered.filter((a) => a.correct).length} de {c.steps.length} correctas
          </p>
          {failed.length > 0 && (
            <div className="mx-auto mt-4 max-w-md text-left text-sm">
              <p className="font-medium text-fg">Para repasar (agregados a conceptos débiles):</p>
              <ul className="mt-1 list-disc pl-5 text-muted">
                {failed.map((s) => (
                  <li key={s.id}>{s.concept}</li>
                ))}
              </ul>
            </div>
          )}
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <Button variant="secondary" onClick={retry}>
              <RotateCcw size={16} aria-hidden /> Reintentar
            </Button>
            <Link href="/lab" className={buttonClasses("primary")}>Otro caso</Link>
          </div>
        </Card>
      )}

      <PatientChart c={c} />

      <div className="mt-4 space-y-4">
        {!attempt ? (
          <Button size="lg" className="w-full" onClick={begin}>
            <Play size={18} aria-hidden /> Comenzar caso ({c.steps.length} {c.steps.length === 1 ? "pregunta" : "preguntas"})
          </Button>
        ) : (
          <>
            {!finished && (
              <div className="flex items-center gap-3">
                <ProgressBar value={answered.length} max={c.steps.length} label="Progreso del caso" />
                <span className="shrink-0 text-xs tabular-nums text-muted">{answered.length}/{c.steps.length}</span>
              </div>
            )}
            {c.steps.map((s, i) => {
              const a = answered.find((x) => x.stepId === s.id);
              if (!a && s !== current) return null;
              return <StepCard key={s.id} step={s} number={i + 1} answer={a} onAnswer={a ? undefined : (k) => choose(s, k)} />;
            })}
            {allAnswered && !finished && (
              <Button size="lg" className="w-full" onClick={finish}>
                <CheckCircle2 size={18} aria-hidden /> Ver calificación
              </Button>
            )}
          </>
        )}
        <div ref={bottom} />
      </div>

      <Card className="mt-4">
        <CardTitle>Referencias</CardTitle>
        <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-sm text-muted">
          {c.references.map((r, i) => (
            <li key={i}>
              {r.citation}
              {r.url && (
                <a href={r.url} target="_blank" rel="noopener noreferrer" className="ml-1 inline-flex items-center gap-0.5 text-info hover:underline">
                  enlace <ExternalLink size={12} aria-hidden />
                </a>
              )}
            </li>
          ))}
        </ol>
      </Card>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 px-1 text-sm">
        <label className="flex items-center gap-2 text-muted">
          Materia:
          <span className="w-48">
            <Select value={c.subjectId ?? ""} onChange={(e) => setCaseSubject(c.id, e.target.value || undefined)} aria-label="Materia del caso">
              <option value="">Sin materia</option>
              {subjects?.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </Select>
          </span>
        </label>
        <div className="flex gap-2">
          {attempt && !finished && answered.length > 0 && (
            <Button size="sm" variant="ghost" onClick={async () => { await abandonAttempt(attempt.id); setAttempt(null); }}>
              Reiniciar intento
            </Button>
          )}
          {confirmDelete ? (
            <>
              <Button size="sm" variant="secondary" onClick={() => setConfirmDelete(false)}>Cancelar</Button>
              <Button size="sm" variant="danger" onClick={async () => { await deleteCase(c.id); router.push("/lab"); }}>Eliminar caso</Button>
            </>
          ) : (
            <Button size="sm" variant="ghost" className="text-danger hover:text-danger" onClick={() => setConfirmDelete(true)}>
              <Trash2 size={14} aria-hidden /> Eliminar
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
