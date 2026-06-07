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
  Shield,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ROUTES } from "@/lib/constants";
import { useAuth } from "@/features/auth/auth.context";

const NAV = [
  { href: ROUTES.dashboard, label: "Dashboard", icon: LayoutDashboard },
  { href: ROUTES.bets, label: "Apuestas", icon: Receipt },
  { href: ROUTES.upcoming, label: "Próximos", icon: CalendarClock },
  { href: ROUTES.ranking, label: "Ranking", icon: Trophy },
  { href: ROUTES.worldCup, label: "Mundial", icon: Globe2 },
  { href: ROUTES.feed, label: "Feed", icon: Newspaper },
] as const;

export function Sidebar() {
  const pathname = usePathname();
  const { isAdmin } = useAuth();

  const items = [
    ...NAV,
    ...(isAdmin ? [{ href: ROUTES.admin, label: "Admin", icon: Shield }] : []),
  ];

  return (
    <aside
      className={
        // En desktop fijamos el sidebar a la parte superior del viewport y le
        // damos altura completa para que las pestañas sean siempre accesibles
        // sin tener que volver arriba al scrollear. `self-start` evita que el
        // flexbox lo estire en altura natural y rompa el `sticky`.
        "hidden w-56 shrink-0 border-r border-border bg-card/30 " +
        "md:sticky md:top-0 md:block md:h-screen md:self-start md:overflow-y-auto"
      }
    >
      <nav className="flex flex-col gap-1 p-3">
        {items.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
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
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
