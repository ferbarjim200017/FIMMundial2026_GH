import type { ReactNode } from "react";
import { Globe2, Trophy } from "lucide-react";
import { WorldCupTabs } from "@/components/world-cup/world-cup-tabs";

export default function WorldCupLayout({ children }: { children: ReactNode }) {
  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-xl border bg-gradient-to-br from-primary/20 via-violet-500/10 to-pink-500/10 p-6">
        <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-yellow-400/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-10 -left-10 h-40 w-40 rounded-full bg-primary/30 blur-3xl" />
        <div className="relative flex items-center gap-4">
          <div className="rounded-lg bg-background/60 p-3 backdrop-blur">
            <Globe2 className="h-7 w-7 text-primary" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight">
                Centro Mundial 2026
              </h1>
              <Trophy className="h-5 w-5 text-yellow-500" />
            </div>
            <p className="text-sm text-muted-foreground">
              Calendario, grupos y eliminatorias. Los resultados los introduce el admin
              desde el panel.
            </p>
          </div>
        </div>
      </div>
      <WorldCupTabs />
      {children}
    </div>
  );
}
