"use client";

import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Archive, Download, FileUp, ShieldCheck } from "lucide-react";
import {
  BACKUP_TABLES,
  BackupError,
  backupFilename,
  exportJson,
  exportZip,
  getLastBackupAt,
  mergeBackup,
  readBackup,
  replaceWithBackup,
  TABLE_LABEL,
  type BackupPreview,
  type ImportSummary,
} from "@/db/repos/backup";
import { downloadBlob } from "@/lib/browser";
import { relativeTime } from "@/lib/format";
import { Button } from "@/components/ui/Button";
import { Card, CardDescription, CardTitle } from "@/components/ui/Card";
import { Dialog } from "@/components/ui/Dialog";
import { Alert, FileButton } from "@/components/ui/Fields";
import { Input, Label } from "@/components/ui/Input";

const CONFIRM_WORD = "REEMPLAZAR";

function ImportFlow({ preview, onClose }: { preview: BackupPreview; onClose: () => void }) {
  const [mode, setMode] = useState<"merge" | "replace">("merge");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      if (mode === "replace") {
        // red de seguridad: respaldo automático del estado actual antes de reemplazar
        downloadBlob(await exportZip(), backupFilename("zip").replace("respaldo", "antes-de-reemplazar"));
        setResult(await replaceWithBackup(preview));
      } else {
        setResult(await mergeBackup(preview));
      }
    } catch {
      setError("No se pudo importar. Tus datos actuales no se modificaron.");
    } finally {
      setBusy(false);
    }
  }

  if (result) {
    return (
      <div className="space-y-4">
        <Alert tone="success">
          Listo: {result.added} registros nuevos{result.updated ? `, ${result.updated} actualizados` : ""}
          {result.images ? `, ${result.images} imágenes` : ""}.
        </Alert>
        <div className="flex justify-end"><Button onClick={onClose}>Cerrar</Button></div>
      </div>
    );
  }

  const exported = new Date(preview.backup.exportedAt).toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" });
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">Respaldo del {exported}.</p>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 rounded-lg bg-canvas p-3 text-sm sm:grid-cols-3">
        {[...BACKUP_TABLES, "media" as const]
          .filter((t) => preview.counts[t] > 0)
          .map((t) => (
            <div key={t} className="flex justify-between gap-2">
              <dt className="text-muted">{TABLE_LABEL[t]}</dt>
              <dd className="tabular-nums">{preview.counts[t]}</dd>
            </div>
          ))}
      </dl>
      {preview.hasImages && preview.counts.media === 0 && (
        <Alert tone="warning">Este respaldo es JSON: las tarjetas con imagen no traerán la imagen. Usa el ZIP para incluirlas.</Alert>
      )}

      <fieldset className="space-y-2">
        <legend className="mb-1 text-xs font-medium text-muted">¿Cómo importar?</legend>
        <label className={`flex cursor-pointer gap-3 rounded-lg border p-3 ${mode === "merge" ? "border-primary bg-primary/10" : "border-line"}`}>
          <input type="radio" name="mode" checked={mode === "merge"} onChange={() => setMode("merge")} className="mt-1 accent-[var(--color-primary)]" />
          <span>
            <span className="block text-sm font-medium">Fusionar (recomendado)</span>
            <span className="block text-xs text-muted">Agrega lo nuevo y conserva la versión más reciente de cada registro. No borra nada.</span>
          </span>
        </label>
        <label className={`flex cursor-pointer gap-3 rounded-lg border p-3 ${mode === "replace" ? "border-danger bg-danger/10" : "border-line"}`}>
          <input type="radio" name="mode" checked={mode === "replace"} onChange={() => setMode("replace")} className="mt-1 accent-[var(--color-danger)]" />
          <span>
            <span className="block text-sm font-medium">Reemplazar todo</span>
            <span className="block text-xs text-muted">Borra los datos de este dispositivo y deja solo los del respaldo. Antes se descarga una copia de seguridad.</span>
          </span>
        </label>
      </fieldset>
      {mode === "replace" && (
        <div>
          <Label htmlFor="confirm-replace">Escribe {CONFIRM_WORD} para confirmar</Label>
          <Input id="confirm-replace" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" autoCapitalize="characters" />
        </div>
      )}
      {error && <Alert>{error}</Alert>}
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose} disabled={busy}>Cancelar</Button>
        <Button
          variant={mode === "replace" ? "danger" : "primary"}
          onClick={run}
          disabled={busy || (mode === "replace" && confirm.trim().toUpperCase() !== CONFIRM_WORD)}
        >
          {mode === "replace" ? "Reemplazar" : "Fusionar"}
        </Button>
      </div>
    </div>
  );
}

export function BackupSection() {
  const last = useLiveQuery(() => getLastBackupAt(), []);
  const [busy, setBusy] = useState<"json" | "zip" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<BackupPreview | null>(null);

  async function doExport(kind: "json" | "zip") {
    setBusy(kind);
    setError(null);
    try {
      const blob = kind === "json" ? await exportJson() : await exportZip();
      downloadBlob(blob, backupFilename(kind));
    } catch {
      setError("No se pudo crear el respaldo.");
    } finally {
      setBusy(null);
    }
  }

  async function onFile(file: File) {
    setError(null);
    try {
      setPreview(await readBackup(file));
    } catch (e) {
      setError(e instanceof BackupError ? e.message : "No se pudo leer el archivo.");
    }
  }

  const stale = last === null || (typeof last === "number" && Date.now() - last > 7 * 86_400_000);

  return (
    <Card id="respaldos" className="scroll-mt-24">
      <CardTitle>Respaldos</CardTitle>
      <CardDescription>
        Tus datos solo existen en este dispositivo. Respalda seguido (por ejemplo, a iCloud Drive) y usa el respaldo para pasar tus datos a otro dispositivo.
      </CardDescription>

      <p className={`mt-4 flex items-center gap-2 text-sm ${stale ? "text-warning" : "text-success"}`}>
        <ShieldCheck size={16} aria-hidden />
        {last === undefined ? "…" : last === null ? "Nunca has hecho un respaldo." : `Último respaldo: ${relativeTime(last)}`}
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button onClick={() => doExport("zip")} disabled={busy !== null}>
          <Archive size={16} aria-hidden /> {busy === "zip" ? "Creando…" : "Respaldo completo (ZIP)"}
        </Button>
        <Button variant="secondary" onClick={() => doExport("json")} disabled={busy !== null}>
          <Download size={16} aria-hidden /> {busy === "json" ? "Creando…" : "Solo datos (JSON)"}
        </Button>
        <FileButton accept=".json,.zip,application/json,application/zip" onFile={onFile} label="Archivo de respaldo">
          <FileUp size={16} aria-hidden /> Importar respaldo
        </FileButton>
      </div>
      <p className="mt-2 text-xs text-muted">El ZIP incluye las imágenes de tus tarjetas. El JSON es más ligero pero sin imágenes.</p>
      {error && <div className="mt-3"><Alert>{error}</Alert></div>}

      <Dialog open={preview !== null} onClose={() => setPreview(null)} title="Importar respaldo" dismissible={false}>
        {preview && <ImportFlow preview={preview} onClose={() => setPreview(null)} />}
      </Dialog>
    </Card>
  );
}
