"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "./Logo";
import { MODULES, SETTINGS, isActive, type NavItem } from "./nav";

function SidebarLink({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={[
        "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
        active
          ? "bg-primary/12 text-fg"
          : "text-muted hover:bg-surface-2 hover:text-fg",
      ].join(" ")}
    >
      <Icon
        size={18}
        strokeWidth={active ? 2.25 : 1.75}
        className={active ? "text-primary" : "text-muted group-hover:text-fg"}
        aria-hidden
      />
      <span>{item.label}</span>
      {active && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-primary" aria-hidden />}
    </Link>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  return (
    <aside
      className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-line bg-surface/60 px-3 py-5 lg:flex"
      aria-label="Navegación principal"
    >
      <div className="px-3 pb-6">
        <Logo />
        <p className="mt-0.5 text-xs text-muted">Medical Operating System</p>
      </div>

      <nav className="flex flex-col gap-1">
        {MODULES.map((item) => (
          <SidebarLink key={item.href} item={item} active={isActive(pathname, item.href)} />
        ))}
      </nav>

      <div className="mt-auto border-t border-line pt-3">
        <SidebarLink item={SETTINGS} active={isActive(pathname, SETTINGS.href)} />
      </div>
    </aside>
  );
}
