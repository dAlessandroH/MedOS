"use client";

import { useCallback, useEffect, useState } from "react";
import { HardDrive, ShieldCheck, ShieldAlert } from "lucide-react";
import {
  formatBytes,
  getStorageStatus,
  isStandalone,
  requestPersistence,
  type StorageStatus,
} from "@/lib/storage";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardDescription, CardTitle } from "@/components/ui/Card";

export function StorageSection() {
  const [status, setStatus] = useState<StorageStatus | null>(null);
  const [standalone, setStandalone] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [denied, setDenied] = useState(false);

  const refresh = useCallback(async () => {
    setStatus(await getStorageStatus());
  }, []);

  useEffect(() => {
    setStandalone(isStandalone());
    void refresh();
  }, [refresh]);

  async function onRequest() {
    setRequesting(true);
    const granted = await requestPersistence();
    setDenied(!granted);
    await refresh();
    setRequesting(false);
  }

  const persisted = status?.persisted === true;

  return (
    <Card>
      <CardTitle>Almacenamiento</CardTitle>
      <CardDescription>
        Tus datos viven solo en este dispositivo. Cada dispositivo guarda su propia copia.
      </CardDescription>

      <dl className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-line bg-canvas p-3">
          <dt className="flex items-center gap-1.5 text-xs text-muted">
            {persisted ? <ShieldCheck size={14} aria-hidden /> : <ShieldAlert size={14} aria-hidden />}
            Protección
          </dt>
          <dd className="mt-1.5">
            {status === null ? (
              <span className="inline-block h-5 w-20 animate-pulse rounded bg-surface-2" />
            ) : persisted ? (
              <Badge tone="success">Persistente</Badge>
            ) : status.persisted === false ? (
              <Badge tone="warning">Sin protección</Badge>
            ) : (
              <Badge>No disponible</Badge>
            )}
          </dd>
        </div>
        <div className="rounded-lg border border-line bg-canvas p-3">
          <dt className="flex items-center gap-1.5 text-xs text-muted">
            <HardDrive size={14} aria-hidden />
            Espacio usado
          </dt>
          <dd className="mt-1.5 text-sm font-medium tabular-nums">
            {status ? formatBytes(status.usageBytes) : "…"}
          </dd>
        </div>
        <div className="rounded-lg border border-line bg-canvas p-3">
          <dt className="text-xs text-muted">Modo</dt>
          <dd className="mt-1.5">
            <Badge tone={standalone ? "success" : "neutral"}>{standalone ? "App instalada" : "Navegador"}</Badge>
          </dd>
        </div>
      </dl>

      {status?.supported && !persisted && (
        <div className="mt-4 space-y-2">
          <Button variant="secondary" onClick={onRequest} disabled={requesting}>
            <ShieldCheck size={16} aria-hidden />
            Proteger mis datos
          </Button>
          {denied && (
            <p className="text-sm text-muted">
              El navegador no lo concedió todavía. En iPhone y iPad, instalar MedOS en la pantalla de
              inicio (Compartir → Agregar a inicio) evita que Safari borre los datos por inactividad.
            </p>
          )}
        </div>
      )}
    </Card>
  );
}
