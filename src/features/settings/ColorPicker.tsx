"use client";

import { Check } from "lucide-react";
import { SUBJECT_COLORS } from "@/db/repos/subjects";

const COLOR_NAMES: Record<string, string> = {
  "#3b82f6": "Azul",
  "#38bdf8": "Celeste",
  "#2dd4bf": "Turquesa",
  "#10b981": "Esmeralda",
  "#a3e635": "Lima",
  "#f59e0b": "Ámbar",
  "#f472b6": "Rosa",
  "#a78bfa": "Violeta",
};

export function ColorPicker({
  value,
  onChange,
  name,
}: {
  value: string;
  onChange: (color: string) => void;
  name: string;
}) {
  return (
    <div role="radiogroup" aria-label="Color" className="flex flex-wrap gap-2">
      {SUBJECT_COLORS.map((color) => {
        const selected = value === color;
        return (
          <label
            key={color}
            className="relative grid h-8 w-8 cursor-pointer place-items-center rounded-full ring-offset-2 ring-offset-surface transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-info"
            style={{ backgroundColor: color }}
            title={COLOR_NAMES[color]}
          >
            <input
              type="radio"
              name={name}
              value={color}
              checked={selected}
              onChange={() => onChange(color)}
              className="sr-only"
              aria-label={COLOR_NAMES[color]}
            />
            {selected && <Check size={16} strokeWidth={3} className="text-canvas" aria-hidden />}
          </label>
        );
      })}
    </div>
  );
}
