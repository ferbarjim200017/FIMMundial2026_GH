"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, Layers3, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/world-cup", label: "Calendario", icon: CalendarDays, exact: true },
  { href: "/world-cup/groups", label: "Fase de grupos", icon: Layers3 },
  { href: "/world-cup/knockout", label: "Eliminatorias", icon: Trophy },
] as const;

export function WorldCupTabs() {
  const pathname = usePathname();
  return (
    <div className="flex flex-wrap gap-1 border-b">
      {TABS.map(({ href, label, icon: Icon, exact }) => {
        const active = exact ? pathname === href : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex items-center gap-2 border-b-2 px-4 py-2 text-sm font-medium transition-colors",
              active
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </Link>
        );
      })}
    </div>
  );
}
