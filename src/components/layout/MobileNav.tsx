"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "./Logo";
import { MODULES, SETTINGS, isActive } from "./nav";

/** Barra superior en iPhone / iPad vertical: logo + acceso a Ajustes. */
export function MobileHeader() {
  const pathname = usePathname();
  const SettingsIcon = SETTINGS.icon;
  const active = isActive(pathname, SETTINGS.href);
  return (
    <header
      className="sticky top-0 z-30 flex items-center justify-between border-b border-line bg-canvas/85 px-4 pb-3 backdrop-blur-md lg:hidden"
      style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}
    >
      <Link href="/" aria-label="Ir al Dashboard">
        <Logo className="text-lg" />
      </Link>
      <Link
        href={SETTINGS.href}
        aria-label="Ajustes"
        aria-current={active ? "page" : undefined}
        className={[
          "grid h-10 w-10 place-items-center rounded-full transition-colors",
          active ? "bg-primary/15 text-primary" : "text-muted hover:bg-surface hover:text-fg",
        ].join(" ")}
      >
        <SettingsIcon size={20} aria-hidden />
      </Link>
    </header>
  );
}

/** Barra inferior con los 4 módulos. */
export function MobileTabBar() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Módulos"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/90 backdrop-blur-md lg:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="mx-auto grid max-w-lg grid-cols-4">
        {MODULES.map((item) => {
          const active = isActive(pathname, item.href);
          const Icon = item.icon;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                aria-label={item.label}
                className={[
                  "flex h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors",
                  active ? "text-primary" : "text-muted hover:text-fg",
                ].join(" ")}
              >
                <Icon size={21} strokeWidth={active ? 2.25 : 1.75} aria-hidden />
                <span>{item.short}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
