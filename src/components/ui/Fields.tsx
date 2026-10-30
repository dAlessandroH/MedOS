"use client";

import { forwardRef, useRef, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { ChevronDown } from "lucide-react";

const FIELD =
  "w-full rounded-lg border border-line bg-canvas px-3 text-base text-fg sm:text-sm transition-colors focus:border-primary focus:outline-none aria-[invalid=true]:border-danger disabled:opacity-50";

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select(
  { className = "", children, ...props },
  ref,
) {
  return (
    <div className="relative">
      <select ref={ref} className={`${FIELD} h-10 appearance-none pr-9 ${className}`} {...props}>
        {children}
      </select>
      <ChevronDown size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
    </div>
  );
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea(
  { className = "", ...props },
  ref,
) {
  return <textarea ref={ref} className={`${FIELD} min-h-24 py-2.5 leading-relaxed ${className}`} {...props} />;
});

export function Toggle({
  checked,
  onChange,
  label,
  description,
  id,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
  id: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <label htmlFor={id} className="cursor-pointer">
        <span className="block text-sm font-medium text-fg">{label}</span>
        {description && <span className="mt-0.5 block text-xs text-muted">{description}</span>}
      </label>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors ${checked ? "bg-primary" : "bg-surface-2 ring-1 ring-line"}`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-5.5" : "translate-x-0.5"}`}
          aria-hidden
        />
      </button>
    </div>
  );
}

/** Grupo de botones excluyentes (duraciones, filtros, tipos). */
export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  label,
  size = "md",
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
  size?: "sm" | "md";
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={[
              "rounded-lg border font-medium tabular-nums transition-colors",
              size === "sm" ? "h-8 px-3 text-xs" : "h-10 px-4 text-sm",
              active ? "border-primary bg-primary/15 text-fg" : "border-line bg-canvas text-muted hover:text-fg",
            ].join(" ")}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function ProgressBar({ value, max, label, tone = "primary" }: { value: number; max: number; label: string; tone?: "primary" | "success" }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2"
    >
      <div
        className={`h-full rounded-full transition-[width] duration-300 ${tone === "success" ? "bg-success" : "bg-primary"}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

/** Botón que abre el selector de archivos. */
export function FileButton({
  accept,
  onFile,
  children,
  className = "",
  variant = "secondary",
  label,
}: {
  accept: string;
  onFile: (file: File) => void;
  children: React.ReactNode;
  className?: string;
  variant?: "primary" | "secondary";
  label?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={ref}
        type="file"
        accept={accept}
        className="sr-only"
        tabIndex={-1}
        aria-label={label}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.target.value = "";
        }}
      />
      <button
        type="button"
        onClick={() => ref.current?.click()}
        className={[
          "inline-flex h-10 items-center justify-center gap-2 rounded-lg px-4 text-sm font-medium transition-colors",
          variant === "primary" ? "bg-primary text-white hover:bg-primary-hover" : "border border-line bg-surface text-fg hover:bg-surface-2",
          className,
        ].join(" ")}
      >
        {children}
      </button>
    </>
  );
}

export function Alert({ tone = "danger", children }: { tone?: "danger" | "success" | "info" | "warning"; children: React.ReactNode }) {
  const tones = {
    danger: "bg-danger/10 text-danger",
    success: "bg-success/10 text-success",
    info: "bg-info/10 text-info",
    warning: "bg-warning/10 text-warning",
  };
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={`rounded-lg px-3 py-2.5 text-sm ${tones[tone]}`}>
      {children}
    </div>
  );
}
