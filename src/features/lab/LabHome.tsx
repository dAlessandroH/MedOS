"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { ChevronRight, Download, FileUp, Stethoscope } from "lucide-react";
import { db } from "@/db/schema";
import { finishedAttempts, importCases, parseCasesJson, type ParsedCases } from "@/db/repos/cases";
import { readFileAsText } from "@/lib/browser";
import { relativeTime } from "@/lib/format";
import { Badge } from "@/components/ui/Badge";
import { Button, buttonClasses } from "@/components/ui/Button";
import { Card, CardTitle } from "@/components/ui/Card";
import { Dialog } from "@/components/ui/Dialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { Alert, FileButton, Segmented, Select } from "@/components/ui/Fields";
import { PageHeader } from "@/components/ui/PageHeader";

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const DIFF_LABEL = { 1: "Básico", 2: "Intermedio", 3: "Avanzado" } as const;

export function Difficulty({ level }: { level: 1 | 2 | 3 }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted" title={DIFF_LABEL[level]}>
      {[1, 2, 3].map((i) => (
        <span key={i} className={`h-1.5 w-3 rounded-full ${i <= level ? "bg-info" : "bg-surface-2"}`} aria-hidden />
      ))}
      <span className="sr-only sm:not-sr-only sm:ml-1">{DIFF_LABEL[level]}</span>
    </span>
  );
}

function ImportCases({ onClose }: { onClose: () => void }) {
  const [parsed, setParsed] = useState<ParsedCases | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [result, setResult] = useState<{ added: number; duplicates: number } | null>(null);
  const [busy, setBusy] = useState(false);

  async function onFile(file: File) {
    setResult(null);
    setFileName(file.name);
    setParsed(parseCasesJson(await readFileAsText(file)));
  }

  async function onImport() {
    if (!parsed) return;
    setBusy(true);
    try {
      setResult(await importCases(parsed.cases));
    } finally {
      setBusy(false);
    }
  }

  if (result) {
    return (
      <div className="space-y-4">
        <Alert tone="success">
          {result.added} {result.added === 1 ? "caso importado" : "casos importados"}
          {result.duplicates > 0 ? ` · ${result.duplicates} ya existían` : ""}.
        </Alert>
        <div className="flex justify-end">
          <Button onClick={onClose}>Listo</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        ClinicalLab acepta solo su formato JSON. Cada caso debe incluir paciente, motivo de consulta, padecimiento actual,
        exploración, signos vitales, pasos con explicación y al menos una referencia verificable.
      </p>
      <div className="flex flex-wrap gap-2">
        <FileButton accept=".json,application/json" onFile={onFile} label="Archivo de casos JSON">
          <FileUp size={16} aria-hidden /> {fileName ? "Elegir otro" : "Elegir archivo JSON"}
        </FileButton>
        <a href={`${BASE}/plantillas/casos-ejemplo.json`} download className={buttonClasses("ghost")}>
          <Download size={16} aria-hidden /> Plantilla con un caso de ejemplo
        </a>
      </div>
      {parsed && (
        <>
          {parsed.cases.length > 0 && (
            <Alert tone="info">
              {parsed.cases.length} {parsed.cases.length === 1 ? "caso válido" : "casos válidos"}: {parsed.cases.map((c) => c.title).slice(0, 3).join(" · ")}
              {parsed.cases.length > 3 ? "…" : ""}
            </Alert>
          )}
          {parsed.errors.length > 0 && (
            <div className="rounded-lg bg-warning/10 px-3 py-2.5 text-sm text-warning" role="status">
              <p className="font-medium">No se importará lo siguiente:</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs">
                {parsed.errors.slice(0, 12).map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button onClick={onImport} disabled={!parsed || parsed.cases.length === 0 || busy}>
          Importar {parsed?.cases.length || ""}
        </Button>
      </div>
    </div>
  );
}

export function LabHome() {
  const cases = useLiveQuery(() => db.clinicalCases.toArray(), []);
  const attempts = useLiveQuery(() => db.caseAttempts.toArray(), []);
  const history = useLiveQuery(() => finishedAttempts(8), []);
  const [specialty, setSpecialty] = useState("");
  const [difficulty, setDifficulty] = useState<0 | 1 | 2 | 3>(0);
  const [importing, setImporting] = useState(false);

  const specialties = useMemo(() => [...new Set((cases ?? []).map((c) => c.specialty))].sort((a, b) => a.localeCompare(b, "es-MX")), [cases]);
  const filtered = (cases ?? [])
    .filter((c) => (!specialty || c.specialty === specialty) && (!difficulty || c.difficulty === difficulty))
    .sort((a, b) => a.specialty.localeCompare(b.specialty, "es-MX") || a.difficulty - b.difficulty || a.title.localeCompare(b.title, "es-MX"));

  const best = (caseId: string) => {
    const done = (attempts ?? []).filter((a) => a.caseId === caseId && a.score !== null);
    return done.length ? Math.max(...done.map((a) => a.score ?? 0)) : null;
  };
  const inProgress = (caseId: string) => (attempts ?? []).some((a) => a.caseId === caseId && a.finishedAt === null && a.answers.length > 0);
  const titleOf = (id: string) => cases?.find((c) => c.id === id)?.title ?? "Caso eliminado";

  return (
    <>
      <PageHeader
        eyebrow="Módulo 04"
        title="ClinicalLab"
        description="Casos clínicos ficticios con fines educativos. Razona paso a paso."
        actions={
          <Button onClick={() => setImporting(true)}>
            <FileUp size={16} aria-hidden /> Importar casos
          </Button>
        }
      />

      {!cases ? (
        <div className="h-48 animate-pulse rounded-xl bg-surface" />
      ) : cases.length === 0 ? (
        <EmptyState icon={Stethoscope} title="Tu biblioteca está vacía" description="Importa un archivo JSON de casos. Puedes empezar con la plantilla, que trae un caso completo de ejemplo.">
          <div className="flex flex-wrap justify-center gap-2">
            <Button onClick={() => setImporting(true)}>
              <FileUp size={16} aria-hidden /> Importar casos
            </Button>
            <a href={`${BASE}/plantillas/casos-ejemplo.json`} download className={buttonClasses("secondary")}>
              <Download size={16} aria-hidden /> Plantilla
            </a>
          </div>
        </EmptyState>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="w-full sm:w-56">
              <Select value={specialty} onChange={(e) => setSpecialty(e.target.value)} aria-label="Especialidad">
                <option value="">Todas las especialidades</option>
                {specialties.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </Select>
            </div>
            <Segmented
              size="sm"
              label="Dificultad"
              value={difficulty}
              onChange={setDifficulty}
              options={[
                { value: 0, label: "Todas" },
                { value: 1, label: "Básico" },
                { value: 2, label: "Intermedio" },
                { value: 3, label: "Avanzado" },
              ]}
            />
          </div>

          {filtered.length === 0 ? (
            <p className="px-1 text-sm text-muted">Ningún caso con esos filtros.</p>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2">
              {filtered.map((c) => {
                const score = best(c.id);
                return (
                  <li key={c.id}>
                    <Link href={`/lab/caso?id=${c.id}`} className="group flex h-full flex-col rounded-xl border border-line bg-surface p-4 transition-colors hover:border-primary/50">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-medium text-info">{c.specialty}</span>
                        <Difficulty level={c.difficulty} />
                      </div>
                      <h2 className="mt-2 font-semibold text-fg">{c.title}</h2>
                      <p className="mt-1 text-sm text-muted">
                        {c.patient.sex === "F" ? "Mujer" : "Hombre"}, {c.patient.age} años · {c.steps.length} {c.steps.length === 1 ? "pregunta" : "preguntas"}
                      </p>
                      <div className="mt-auto flex items-center justify-between pt-3">
                        {inProgress(c.id) ? <Badge tone="info">En progreso</Badge> : score !== null ? <Badge tone={score >= 70 ? "success" : "warning"}>Mejor: {score} %</Badge> : <Badge>Sin resolver</Badge>}
                        <ChevronRight size={16} className="text-muted group-hover:text-fg" aria-hidden />
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}

          {history && history.length > 0 && (
            <Card>
              <CardTitle>Casos resueltos</CardTitle>
              <ul className="mt-3 divide-y divide-line">
                {history.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                    <Link href={`/lab/caso?id=${a.caseId}`} className="min-w-0 truncate hover:text-info">{titleOf(a.caseId)}</Link>
                    <span className="flex shrink-0 items-center gap-3">
                      <span className="text-xs text-muted">{relativeTime(a.finishedAt ?? a.startedAt)}</span>
                      <Badge tone={(a.score ?? 0) >= 70 ? "success" : "warning"}>{a.score} %</Badge>
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      )}

      <Dialog open={importing} onClose={() => setImporting(false)} title="Importar casos clínicos" size="lg">
        <ImportCases onClose={() => setImporting(false)} />
      </Dialog>
    </>
  );
}
