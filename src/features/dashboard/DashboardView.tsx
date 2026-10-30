"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  Activity,
  ArrowRight,
  Brain,
  CalendarDays,
  CheckCircle2,
  Clock,
  FileUp,
  Gauge,
  Layers,
  ShieldAlert,
  Shuffle,
  Stethoscope,
  Target,
  Timer,
  TrendingUp,
} from "lucide-react";
import { getDashboardData } from "@/db/repos/stats";
import { reconcileActiveSession } from "@/db/repos/focus";
import { daysUntil, daysUntilLabel } from "@/db/repos/exams";
import type { ActivityType } from "@/db/types";
import { usePrefs } from "@/lib/prefs";
import { formatLongDate, formatMinutes, greetingFor } from "@/lib/time";
import { relativeTime, shortDate } from "@/lib/format";
import { useNow } from "@/lib/useNow";
import { buttonClasses } from "@/components/ui/Button";
import { Card, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { ProgressBar } from "@/components/ui/Fields";
import { rankObjectives } from "./objective";

const ACTIVITY_ICON: Record<ActivityType, typeof Clock> = {
  subject_created: CheckCircle2,
  review_session: Brain,
  focus_session: Timer,
  case_completed: Stethoscope,
  import: FileUp,
  backup: CheckCircle2,
};

function StatTile({ icon: Icon, label, value, loading }: { icon: typeof Clock; label: string; value: string; loading: boolean }) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 text-xs font-medium text-muted">
        <Icon size={14} aria-hidden />
        {label}
      </div>
      <p className="mt-2 text-2xl font-semibold tabular-nums tracking-tight text-fg">
        {loading ? <span className="inline-block h-7 w-12 animate-pulse rounded bg-surface-2" /> : value}
      </p>
    </Card>
  );
}

const QUICK = [
  { href: "/recall/estudiar?mix=1", label: "Repaso mixto", icon: Shuffle },
  { href: "/focus", label: "Sesión de enfoque", icon: Timer },
  { href: "/lab", label: "Casos clínicos", icon: Stethoscope },
  { href: "/recall", label: "Mis mazos", icon: Layers },
];

export function DashboardView() {
  const now = useNow();
  const [prefs] = usePrefs();
  const data = useLiveQuery(() => getDashboardData(), []);

  // Cierra sesiones de FocusMD que terminaron mientras la app estaba cerrada
  useEffect(() => {
    void reconcileActiveSession();
  }, []);

  const loading = data === undefined;
  const objectives = data ? rankObjectives(data) : [];
  const [objective, next] = objectives;
  const greeting = now ? greetingFor(now.getHours()) : "Hola";
  const name = prefs.name.trim();
  const backupStale =
    data && data.totalCards + data.casesCount > 0 && (data.lastBackupAt === null || Date.now() - data.lastBackupAt > 14 * 86_400_000);

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm text-muted" suppressHydrationWarning>
          {now ? formatLongDate(now) : " "}
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight lg:text-3xl">
          {greeting}
          {name ? `, ${name}` : ""}
        </h1>
      </header>

      {/* Mi siguiente objetivo — una sola tarea prioritaria */}
      <section aria-labelledby="objetivo">
        <Card className="border-primary/40 bg-linear-to-br from-primary/15 via-surface to-surface p-6">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-info">
            <Target size={14} aria-hidden />
            <span id="objetivo">Mi siguiente objetivo</span>
          </div>
          {loading ? (
            <div className="mt-3 h-7 w-56 animate-pulse rounded bg-surface-2" />
          ) : objective ? (
            <>
              <h2 className="mt-3 text-xl font-semibold text-fg">{objective.title}</h2>
              <p className="mt-1 max-w-prose text-sm text-muted">{objective.reason}</p>
              <Link href={objective.href} className={buttonClasses("primary", "lg", "mt-5")}>
                {objective.cta}
                <ArrowRight size={18} aria-hidden />
              </Link>
              {next && (
                <p className="mt-4 text-sm text-muted">
                  Después:{" "}
                  <Link href={next.href} className="text-info hover:underline">
                    {next.title}
                  </Link>
                </p>
              )}
            </>
          ) : (
            <div className="mt-3 flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 shrink-0 text-success" size={22} aria-hidden />
              <div>
                <h2 className="text-xl font-semibold text-fg">Nada pendiente por ahora</h2>
                <p className="mt-1 text-sm text-muted">Estás al día. Si quieres avanzar, una sesión corta de FocusMD o un caso clínico suman.</p>
              </div>
            </div>
          )}
        </Card>
      </section>

      {/* Resumen de actividad */}
      <section aria-label="Resumen" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile icon={Clock} label="Estudiado hoy" value={formatMinutes(data?.focusedMinutesToday ?? 0)} loading={loading} />
        <StatTile icon={TrendingUp} label="Esta semana" value={formatMinutes(data?.focusedMinutesWeek ?? 0)} loading={loading} />
        <StatTile icon={Layers} label="Tarjetas pendientes" value={String((data?.reviewsDue ?? 0) + (data?.newAvailable ?? 0))} loading={loading} />
        <StatTile icon={Gauge} label="Retención 30 días" value={data?.retention30 == null ? "—" : `${data.retention30} %`} loading={loading} />
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Próximos exámenes */}
        <Card>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2"><CalendarDays size={15} aria-hidden /> Próximos exámenes</CardTitle>
            <Link href="/ajustes#examenes" className="text-sm font-medium text-info hover:underline">Agregar</Link>
          </div>
          {!data ? (
            <div className="mt-4 h-16 animate-pulse rounded bg-surface-2" />
          ) : data.exams.length === 0 ? (
            <p className="mt-3 text-sm text-muted">Sin exámenes registrados.</p>
          ) : (
            <ul className="mt-3 divide-y divide-line">
              {data.exams.slice(0, 4).map((e) => {
                const d = daysUntil(e.date, data.now);
                const s = data.subjects.find((x) => x.id === e.subjectId);
                return (
                  <li key={e.id} className="flex items-center gap-3 py-2">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: s?.color ?? "#94a3b8" }} aria-hidden />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-fg">{e.title}</p>
                      <p className="text-xs text-muted">{s?.name ?? "—"} · {shortDate(e.date)}</p>
                    </div>
                    <Badge tone={d <= 3 ? "warning" : "info"}>{daysUntilLabel(d)}</Badge>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        {/* Progreso de aprendizaje */}
        <Card>
          <div className="flex items-center justify-between">
            <CardTitle>Progreso de aprendizaje</CardTitle>
            <Link href="/recall/estadisticas" className="text-sm font-medium text-info hover:underline">Detalle</Link>
          </div>
          {!data ? (
            <div className="mt-4 h-16 animate-pulse rounded bg-surface-2" />
          ) : data.progress.length === 0 ? (
            <p className="mt-3 text-sm text-muted">Aparecerá cuando tengas tarjetas en NeuroRecall.</p>
          ) : (
            <ul className="mt-3 space-y-3">
              {data.progress.map((p) => (
                <li key={p.subject.id}>
                  <div className="mb-1 flex items-center justify-between gap-2 text-sm">
                    <span className="flex min-w-0 items-center gap-2 truncate">
                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: p.subject.color }} aria-hidden />
                      {p.subject.name}
                    </span>
                    <span className="shrink-0 text-xs tabular-nums text-muted">
                      {p.mastered}/{p.total} dominadas{p.due ? ` · ${p.due} vencidas` : ""}
                    </span>
                  </div>
                  <ProgressBar value={p.mastered} max={p.total} label={`Dominio de ${p.subject.name}`} tone="success" />
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        {/* Actividad reciente */}
        <Card>
          <CardTitle className="flex items-center gap-2"><Activity size={15} aria-hidden /> Actividad reciente</CardTitle>
          {!data ? (
            <div className="mt-4 h-20 animate-pulse rounded bg-surface-2" />
          ) : data.activity.length === 0 ? (
            <p className="mt-3 text-sm text-muted">Tu actividad aparecerá aquí.</p>
          ) : (
            <ul className="mt-3 space-y-2.5">
              {data.activity.map((a) => {
                const Icon = ACTIVITY_ICON[a.type] ?? Activity;
                return (
                  <li key={a.id} className="flex items-start gap-3 text-sm">
                    <Icon size={15} className="mt-0.5 shrink-0 text-muted" aria-hidden />
                    <span className="min-w-0 flex-1 text-fg">{a.summary}</span>
                    <span className="shrink-0 text-xs text-muted">{relativeTime(a.at)}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        {/* Accesos rápidos */}
        <Card>
          <CardTitle>Accesos rápidos</CardTitle>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {QUICK.map((q) => (
              <Link
                key={q.href}
                href={q.href}
                className="flex flex-col items-start gap-2 rounded-lg border border-line bg-canvas p-3 text-sm font-medium text-fg transition-colors hover:border-primary/50"
              >
                <q.icon size={18} className="text-info" aria-hidden />
                {q.label}
              </Link>
            ))}
          </div>
        </Card>
      </div>

      {backupStale && (
        <Link href="/ajustes#respaldos" className="flex items-center gap-2 px-1 text-sm text-warning hover:underline">
          <ShieldAlert size={15} aria-hidden />
          {data?.lastBackupAt === null ? "Aún no respaldas tus datos." : `Último respaldo ${relativeTime(data!.lastBackupAt!)}.`} Hazlo en Ajustes.
        </Link>
      )}
    </div>
  );
}
