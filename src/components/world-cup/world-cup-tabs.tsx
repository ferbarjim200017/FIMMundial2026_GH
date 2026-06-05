"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, Layers3, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";

const TABS: {
  href: string;
  label: string;
  shortLabel: string;
  icon: typeof CalendarDays;
  exact?: boolean;
  activeClass: string;
  iconClass: string;
}[] = [
  {
    href: "/world-cup",
    label: "Calendario",
    shortLabel: "Calendario",
    icon: CalendarDays,
    exact: true,
    activeClass: "border-sky-500 text-sky-600 dark:text-sky-400 bg-sky-500/5",
    iconClass: "text-sky-500",
  },
  {
    href: "/world-cup/groups",
    label: "Fase de grupos",
    shortLabel: "Grupos",
    icon: Layers3,
    activeClass:
      "border-indigo-500 text-indigo-600 dark:text-indigo-400 bg-indigo-500/5",
    iconClass: "text-indigo-500",
  },
  {
    href: "/world-cup/knockout",
    label: "Eliminatorias",
    shortLabel: "Bracket",
    icon: Trophy,
    activeClass:
      "border-yellow-500 text-yellow-700 dark:text-yellow-400 bg-yellow-500/5",
    iconClass: "text-yellow-500",
  },
];

export function WorldCupTabs() {
  const pathname = usePathname();
  return (
    <div className="-mx-1 flex gap-1 overflow-x-auto border-b">
      {TABS.map(({ href, label, shortLabel, icon: Icon, exact, activeClass, iconClass }) => {
        const active = exact ? pathname === href : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex shrink-0 items-center gap-2 rounded-t-md border-b-2 px-3 py-2 text-sm font-medium transition-all sm:px-4",
              active
                ? activeClass
                : "border-transparent text-muted-foreground hover:text-foreground hover:bg-accent/30"
            )}
          >
            <Icon className={cn("h-4 w-4", active ? iconClass : "")} />
            <span className="sm:hidden">{shortLabel}</span>
            <span className="hidden sm:inline">{label}</span>
          </Link>
        );
      })}
    </div>
  );
}
