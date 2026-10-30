"use client";

import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { usePrefs } from "@/lib/prefs";
import { Card, CardDescription, CardTitle } from "@/components/ui/Card";
import { Input, Label } from "@/components/ui/Input";

export function ProfileSection() {
  const [prefs, setPrefs] = usePrefs();
  const [name, setName] = useState(prefs.name);
  const [saved, setSaved] = useState(false);

  // sincroniza si cambia desde otra pestaña
  useEffect(() => setName(prefs.name), [prefs.name]);

  useEffect(() => {
    if (!saved) return;
    const t = window.setTimeout(() => setSaved(false), 1800);
    return () => window.clearTimeout(t);
  }, [saved]);

  function commit() {
    const clean = name.replace(/\s+/g, " ").trim().slice(0, 40);
    if (clean === prefs.name) return;
    setPrefs({ name: clean });
    setName(clean);
    setSaved(true);
  }

  return (
    <Card>
      <CardTitle>Perfil</CardTitle>
      <CardDescription>Se usa para el saludo del Dashboard.</CardDescription>
      <div className="mt-4 max-w-sm">
        <Label htmlFor="pref-name">Tu nombre</Label>
        <div className="relative">
          <Input
            id="pref-name"
            value={name}
            maxLength={40}
            onChange={(e) => setName(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commit();
                (e.target as HTMLInputElement).blur();
              }
            }}
            autoComplete="given-name"
          />
          <span
            role="status"
            className={`pointer-events-none absolute inset-y-0 right-3 flex items-center gap-1 text-xs text-success transition-opacity ${saved ? "opacity-100" : "opacity-0"}`}
          >
            <Check size={14} aria-hidden />
            {saved ? "Guardado" : ""}
          </span>
        </div>
      </div>
    </Card>
  );
}
