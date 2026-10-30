"use client";

import { useState, type FormEvent } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { CalendarPlus, Trash2 } from "lucide-react";
import { createExam, daysUntil, daysUntilLabel, deleteExam, ExamError, pastExams, upcomingExams } from "@/db/repos/exams";
import { listSubjects } from "@/db/repos/subjects";
import { fromDateInput, shortDate, toDateInput } from "@/lib/format";
import { Button } from "@/components/ui/Button";
import { Card, CardDescription, CardTitle } from "@/components/ui/Card";
import { Alert, Select } from "@/components/ui/Fields";
import { Input, Label } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";

export function ExamsSection() {
  const subjects = useLiveQuery(() => listSubjects(), []);
  const upcoming = useLiveQuery(() => upcomingExams(Date.now(), 30), []);
  const past = useLiveQuery(() => pastExams(), []);
  const [subjectId, setSubjectId] = useState("");
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(() => toDateInput(Date.now() + 7 * 86_400_000));
  const [error, setError] = useState<string | null>(null);

  const effectiveSubject = subjectId || subjects?.[0]?.id || "";
  const nameOf = (id: string) => subjects?.find((s) => s.id === id)?.name ?? "Materia archivada";
  const colorOf = (id: string) => subjects?.find((s) => s.id === id)?.color ?? "#94a3b8";

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await createExam({ subjectId: effectiveSubject, title, date: fromDateInput(date) });
      setTitle("");
    } catch (err) {
      setError(err instanceof ExamError ? err.message : "No se pudo guardar el examen.");
    }
  }

  return (
    <Card id="examenes" className="scroll-mt-24">
      <CardTitle>Exámenes</CardTitle>
      <CardDescription>El Dashboard prioriza el repaso de la materia con el examen más cercano.</CardDescription>

      {subjects && subjects.length === 0 ? (
        <p className="mt-4 text-sm text-muted">Crea una materia primero.</p>
      ) : (
        <form onSubmit={submit} className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto_auto] sm:items-end" aria-label="Nuevo examen">
          <div>
            <Label htmlFor="exam-subject">Materia</Label>
            <Select id="exam-subject" value={effectiveSubject} onChange={(e) => setSubjectId(e.target.value)}>
              {subjects?.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="exam-title">Examen</Label>
            <Input id="exam-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ej. Primer parcial" maxLength={80} />
          </div>
          <div>
            <Label htmlFor="exam-date">Fecha</Label>
            <Input id="exam-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <Button type="submit" disabled={!title.trim() || !date}>
            <CalendarPlus size={16} aria-hidden /> Agregar
          </Button>
        </form>
      )}
      {error && <div className="mt-3"><Alert>{error}</Alert></div>}

      {upcoming && upcoming.length > 0 && (
        <ul className="mt-4 divide-y divide-line" aria-label="Próximos exámenes">
          {upcoming.map((x) => {
            const d = daysUntil(x.date);
            return (
              <li key={x.id} className="flex items-center gap-3 py-2.5">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: colorOf(x.subjectId) }} aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-fg">{x.title}</p>
                  <p className="text-xs text-muted">{nameOf(x.subjectId)} · {shortDate(x.date)}</p>
                </div>
                <Badge tone={d <= 3 ? "warning" : "info"}>{daysUntilLabel(d)}</Badge>
                <Button size="sm" variant="ghost" onClick={() => deleteExam(x.id)} aria-label={`Eliminar ${x.title}`}>
                  <Trash2 size={14} aria-hidden />
                </Button>
              </li>
            );
          })}
        </ul>
      )}
      {past && past.length > 0 && (
        <details className="mt-3 border-t border-line pt-3">
          <summary className="cursor-pointer text-sm text-muted hover:text-fg">Pasados ({past.length})</summary>
          <ul className="mt-2 divide-y divide-line">
            {past.map((x) => (
              <li key={x.id} className="flex items-center gap-3 py-2 text-sm text-muted">
                <span className="min-w-0 flex-1 truncate">{x.title} · {nameOf(x.subjectId)} · {shortDate(x.date)}</span>
                <Button size="sm" variant="ghost" onClick={() => deleteExam(x.id)} aria-label={`Eliminar ${x.title}`}>
                  <Trash2 size={14} aria-hidden />
                </Button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </Card>
  );
}
