export function Logo({ className = "" }: { className?: string }) {
  return (
    <span
      className={`select-none text-xl font-semibold tracking-tight ${className}`}
      aria-label="MedOS"
    >
      <span className="text-fg">Med</span>
      <span className="text-primary">OS</span>
    </span>
  );
}
