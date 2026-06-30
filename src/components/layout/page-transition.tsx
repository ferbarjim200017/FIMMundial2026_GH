"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/**
 * Envuelve el contenido de la página y le aplica la animación de entrada
 * (`page-enter`). Al usar `key={pathname}`, el div se vuelve a montar en cada
 * navegación, así la animación se reinicia al cambiar de pestaña. Respeta
 * "reducir movimiento" (lo gestiona la propia clase en globals.css).
 */
export function PageTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return (
    <div key={pathname} className="page-enter">
      {children}
    </div>
  );
}
