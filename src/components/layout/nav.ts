import {
  Brain,
  LayoutDashboard,
  Settings,
  Stethoscope,
  Timer,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  /** Etiqueta corta para la barra inferior en iPhone */
  short: string;
  icon: LucideIcon;
}

/** Los cuatro módulos. No agregar más. */
export const MODULES: NavItem[] = [
  { href: "/", label: "Dashboard", short: "Inicio", icon: LayoutDashboard },
  { href: "/recall", label: "NeuroRecall", short: "Recall", icon: Brain },
  { href: "/focus", label: "FocusMD", short: "Focus", icon: Timer },
  { href: "/lab", label: "ClinicalLab", short: "Lab", icon: Stethoscope },
];

export const SETTINGS: NavItem = {
  href: "/ajustes",
  label: "Ajustes",
  short: "Ajustes",
  icon: Settings,
};

/** usePathname() puede devolver "/recall" o "/recall/" según trailingSlash. */
export function normalizePath(pathname: string | null): string {
  if (!pathname) return "/";
  const trimmed = pathname.replace(/\/+$/, "");
  return trimmed === "" ? "/" : trimmed;
}

export function isActive(pathname: string | null, href: string): boolean {
  const current = normalizePath(pathname);
  if (href === "/") return current === "/";
  return current === href || current.startsWith(`${href}/`);
}
