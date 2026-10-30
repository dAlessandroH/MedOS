import type { LucideIcon } from "lucide-react";

export function EmptyState({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-dashed border-line px-6 py-12 text-center">
      <div className="mb-4 grid h-12 w-12 place-items-center rounded-full bg-primary/12 text-primary">
        <Icon size={22} aria-hidden />
      </div>
      <h2 className="text-base font-semibold text-fg">{title}</h2>
      <p className="mt-1.5 max-w-sm text-sm text-muted">{description}</p>
      {children && <div className="mt-5">{children}</div>}
    </div>
  );
}
