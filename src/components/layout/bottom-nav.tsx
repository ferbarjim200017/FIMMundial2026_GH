"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarClock,
  LayoutDashboard,
  Receipt,
  Trophy,
  Crown,
  Globe2,
  Newspaper,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ROUTES } from "@/lib/constants";
import { usePendingUploadsCount } from "@/features/bets/use-pending-uploads";

const NAV = [
  { href: ROUTES.dashboard, label: "Inicio", icon: LayoutDashboard },
  { href: ROUTES.bets, label: "Apuestas", icon: Receipt },
  { href: ROUTES.upcoming, label: "Próximos", icon: CalendarClock },
  { href: ROUTES.ranking, label: "Ranking", icon: Trophy },
  { href: ROUTES.hallOfFame, label: "Fama", icon: Crown },
  { href: ROUTES.worldCup, label: "Mundial", icon: Globe2 },
  { href: ROUTES.feed, label: "Feed", icon: Newspaper },
] as const;

/**
 * Barra de navegación inferior visible SOLO en móvil. Replica los items
 * principales del sidebar para que el usuario pueda saltar entre pestañas
 * con el dedo gordo. El item de Admin no aparece aquí; los admins lo
 * tienen disponible en el menú del avatar (TopBar).
 */
export function BottomNav() {
  const pathname = usePathname();
  const pendingUploads = usePendingUploadsCount();

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 backdrop-blur md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      aria-label="Navegación principal"
    >
      <ul className="grid h-14 grid-cols-7">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <li key={href}>
              <Link
                href={href}
                className={cn(
                  "flex h-full flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors",
                  active
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <span className="relative">
                  <Icon
                    className={cn("h-5 w-5", active && "scale-110")}
                    aria-hidden="true"
                  />
                  {href === ROUTES.bets && pendingUploads > 0 && (
                    <span
                      className="absolute -right-2.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 px-1 text-[9px] font-bold leading-none text-white"
                      title={`${pendingUploads} sin subir`}
                      aria-label={`${pendingUploads} apuestas sin subir`}
                    >
                      {pendingUploads > 99 ? "99+" : pendingUploads}
                    </span>
                  )}
                </span>
                {/* En móviles muy estrechos (< 380px) solo icono, para que las
                    7 pestañas respiren. A partir de ahí, con etiqueta. */}
                <span className="hidden leading-none min-[380px]:block">
                  {label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
