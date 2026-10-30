"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "./Sidebar";
import { MobileHeader, MobileTabBar } from "./MobileNav";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  // Señal de que la app ya está interactiva (la usan las pruebas automáticas)
  useEffect(() => {
    document.documentElement.dataset.hydrated = "1";
  }, []);
  return (
    <div className="flex min-h-dvh">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <MobileHeader />
        <main
          // key = ruta → animación de entrada discreta al cambiar de módulo
          key={pathname}
          className="mx-auto w-full max-w-5xl flex-1 animate-enter px-4 pb-28 pt-5 sm:px-6 lg:px-10 lg:pb-12 lg:pt-10"
        >
          {children}
        </main>
      </div>
      <MobileTabBar />
    </div>
  );
}
