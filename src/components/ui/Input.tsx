import { forwardRef, type InputHTMLAttributes } from "react";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className = "", ...props }, ref) {
    return (
      <input
        ref={ref}
        // 16px evita el zoom automático de Safari en iPhone al enfocar
        className={[
          "h-10 w-full rounded-lg border border-line bg-canvas px-3 text-base text-fg sm:text-sm",
          "placeholder:text-muted/70 transition-colors",
          "focus:border-primary focus:outline-none",
          "aria-[invalid=true]:border-danger",
          className,
        ].join(" ")}
        {...props}
      />
    );
  },
);

export function Label({ htmlFor, children }: { htmlFor: string; children: React.ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 block text-xs font-medium text-muted">
      {children}
    </label>
  );
}
