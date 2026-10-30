"use client";

import { SESSION_SIZES, usePrefs } from "@/lib/prefs";
import { Card, CardTitle } from "@/components/ui/Card";
import { Segmented, Toggle } from "@/components/ui/Fields";

export function StudyPrefsSection() {
  const [prefs, setPrefs] = usePrefs();
  return (
    <Card>
      <CardTitle>Estudio</CardTitle>
      <div className="mt-4 space-y-5">
        <div>
          <span className="mb-1.5 block text-sm font-medium text-fg">Tarjetas por sesión de repaso</span>
          <span className="mb-2 block text-xs text-muted">Sesiones cortas ayudan a empezar. Al terminar puedes seguir con más.</span>
          <Segmented
            label="Tarjetas por sesión"
            value={prefs.sessionSize}
            onChange={(v) => setPrefs({ sessionSize: v })}
            options={SESSION_SIZES.map((n) => ({ value: n as number, label: String(n) }))}
          />
        </div>
        <Toggle
          id="pref-type"
          checked={prefs.typeAnswer}
          onChange={(v) => setPrefs({ typeAnswer: v })}
          label="Escribir mi respuesta antes de voltear"
          description="Muestra una caja para teclear tu respuesta y compararla con la correcta."
        />
        <Toggle
          id="pref-sound"
          checked={prefs.soundEnabled}
          onChange={(v) => setPrefs({ soundEnabled: v })}
          label="Sonido al terminar una sesión de FocusMD"
          description="Un tono suave, solo si la app está abierta."
        />
      </div>
    </Card>
  );
}
