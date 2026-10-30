"use client";

import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { Check, ChevronLeft, RotateCcw } from "lucide-react";
import { getRecallStats } from "@/db/repos/stats";
import { listWeakConcepts, setWeakResolved } from "@/db/repos/activity";
import { listSubjects } from "@/db/repos/subjects";
import { htmlToText } from "@/lib/html";
import { relativeTime } from "@/lib/format";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardDescription, CardTitle } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { SimpleBars } from "@/components/ui/Charts";

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card className="p-4">
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className="mt-1.5 text-2xl font-semibold tabular-nums">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
    </Card>
  );
}

export function StatsView() {
  const stats = useLiveQuery(() => getRecallStats(), []);
  const weak = useLiveQuery(() => listWeakConcepts(), []);
  const subjects = useLiveQuery(() => listSubjects({ includeArchived: true }), []);
  const subjectName = (id: string | null) => subjects?.find((s) => s.id === id)?.name;

  return (
    <>
      <Link href="/recall" className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-fg">
        <ChevronLeft size={16} aria-hidden /> NeuroRecall
      </Link>
      <PageHeader title="Estadísticas" description="Cómo va tu memoria: retención, carga de repasos y lo que más te cuesta." />

      {!stats ? (
        <div className="h-64 animate-pulse rounded-xl bg-surface" />
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Tile label="Retención (30 días)" value={stats.retention30 === null ? "—" : `${stats.retention30} %`} hint="Meta FSRS: 90 %" />
            <Tile label="Repasos hoy" value={String(stats.reviewsToday)} />
            <Tile label="Tarjetas" value={String(stats.totals.cards)} hint={`${stats.totals.fresh} nuevas`} />
            <Tile label="En repaso" value={String(stats.totals.review)} hint={`${stats.totals.learning} aprendiendo`} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardTitle>Repasos de los últimos 14 días</CardTitle>
              <div className="mt-4">
                <SimpleBars
                  label="Repasos por día"
                  data={stats.perDay.map((d) => ({ ...d, failed: d.reviews - d.recalled }))}
                  xKey="label"
                  series={[
                    { key: "recalled", name: "Recordadas", color: "#10b981" },
                    { key: "failed", name: "Otra vez", color: "#ef4444" },
                  ]}
                />
              </div>
            </Card>
            <Card>
              <CardTitle>Próximos repasos</CardTitle>
              <div className="mt-4">
                <SimpleBars label="Repasos previstos por día" data={stats.forecast} xKey="label" series={[{ key: "due", name: "Tarjetas", color: "#38bdf8" }]} />
              </div>
            </Card>
          </div>

          <Card id="debiles" className="scroll-mt-24">
            <CardTitle>Conceptos débiles</CardTitle>
            <CardDescription>Se agregan cuando fallas un caso en ClinicalLab o una tarjeta muchas veces. Márcalos cuando ya los domines.</CardDescription>
            {!weak || weak.length === 0 ? (
              <p className="mt-4 text-sm text-muted">Ninguno por ahora.</p>
            ) : (
              <ul className="mt-3 divide-y divide-line">
                {weak.map((w) => (
                  <li key={w.id} className="flex items-center gap-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-fg">{w.label}</p>
                      <p className="mt-0.5 text-xs text-muted">
                        {w.source === "lab" ? "ClinicalLab" : "NeuroRecall"} · {w.hits} {w.hits === 1 ? "fallo" : "fallos"}
                        {subjectName(w.subjectId) ? ` · ${subjectName(w.subjectId)}` : ""} · {relativeTime(w.lastSeenAt)}
                      </p>
                    </div>
                    <Button size="sm" variant="secondary" onClick={() => setWeakResolved(w.id, true)}>
                      <Check size={14} aria-hidden /> Dominado
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardTitle>Tarjetas problemáticas</CardTitle>
              <CardDescription>3 fallos o más. Considera reescribirlas o dividirlas.</CardDescription>
              {stats.problematic.length === 0 ? (
                <p className="mt-4 text-sm text-muted">Ninguna. 👌</p>
              ) : (
                <ul className="mt-3 divide-y divide-line">
                  {stats.problematic.map((c) => (
                    <li key={c.id} className="flex items-center gap-3 py-2">
                      <Link href={`/recall/mazo?id=${c.deckId}`} className="min-w-0 flex-1 truncate text-sm hover:text-info">
                        {htmlToText(c.front)}
                      </Link>
                      <Badge tone="danger">{c.lapses}</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <Card>
              <CardTitle>Respuestas incorrectas recientes</CardTitle>
              <CardDescription>Lo que calificaste como «Otra vez» en los últimos 30 días.</CardDescription>
              {stats.recentMistakes.length === 0 ? (
                <p className="mt-4 text-sm text-muted">Sin errores registrados.</p>
              ) : (
                <ul className="mt-3 divide-y divide-line">
                  {stats.recentMistakes.map(({ log, card }) => (
                    <li key={log.id} className="py-2">
                      <p className="line-clamp-2 text-sm text-fg">{htmlToText(card.front)}</p>
                      {log.typedAnswer && <p className="mt-0.5 line-clamp-1 text-xs text-danger">Escribiste: {log.typedAnswer}</p>}
                      <p className="mt-0.5 flex items-center gap-1 text-xs text-muted">
                        <RotateCcw size={11} aria-hidden /> {relativeTime(log.reviewedAt)}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </div>
      )}
    </>
  );
}
