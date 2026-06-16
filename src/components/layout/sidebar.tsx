"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarClock,
  LayoutDashboard,
  Receipt,
  Trophy,
  Globe2,
  Newspaper,
  Crown,
  Lightbulb,
  Shield,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ROUTES } from "@/lib/constants";
import { useAuth } from "@/features/auth/auth.context";
import { useSuggestions } from "@/features/suggestions/suggestions.context";

const NAV = [
  { href: ROUTES.dashboard, label: "Dashboard", icon: LayoutDashboard },
  { href: ROUTES.bets, label: "Apuestas", icon: Receipt },
  { href: ROUTES.upcoming, label: "Próximos", icon: CalendarClock },
  { href: ROUTES.ranking, label: "Ranking", icon: Trophy },
  { href: ROUTES.worldCup, label: "Mundial", icon: Globe2 },
  { href: ROUTES.feed, label: "Feed", icon: Newspaper },
  { href: ROUTES.hallOfFame, label: "Salón de la Fama", icon: Crown },
  { href: ROUTES.suggestions, label: "Sugerencias", icon: Lightbulb },
] as const;

export function Sidebar() {
  const pathname = usePathname();
  const { isAdmin } = useAuth();
  const { hasUnread } = useSuggestions();

  const items = [
    ...NAV,
    ...(isAdmin ? [{ href: ROUTES.admin, label: "Admin", icon: Shield }] : []),
  ];

  return (
    <aside
      className={
        // En desktop fijamos el sidebar a la parte superior del viewport, justo
        // por debajo del wrapper sticky de carrusel + topbar (~h-24 = 6rem).
        // `self-start` evita que el flexbox lo estire en altura y rompa el
        // `sticky`. La altura se calcula sobre 100vh restando lo que ocupa
        // el wrapper de arriba para que el contenido del sidebar tenga su
        // propio scroll si crece más de la cuenta.
        "hidden w-56 shrink-0 border-r border-border bg-card/30 " +
        "md:sticky md:top-24 md:block md:h-[calc(100vh-6rem)] md:self-start md:overflow-y-auto"
      }
    >
      <nav className="flex flex-col gap-1 p-3">
        {items.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          const showDot = href === ROUTES.suggestions && hasUnread;
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                active
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              )}
            >
              <Icon className="h-4 w-4" />
              <span>{label}</span>
              {showDot && (
                <span
                  className="ml-auto h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-background"
                  aria-label="Hay sugerencias nuevas"
                />
              )}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
