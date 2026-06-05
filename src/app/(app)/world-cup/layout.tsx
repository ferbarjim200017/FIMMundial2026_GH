import type { ReactNode } from "react";
import { WorldCupTabs } from "@/components/world-cup/world-cup-tabs";

export default function WorldCupLayout({ children }: { children: ReactNode }) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Centro Mundial 2026</h1>
        <p className="text-sm text-muted-foreground">
          Calendario, grupos y eliminatorias. Los resultados los introduce el admin
          desde el panel.
        </p>
      </div>
      <WorldCupTabs />
      {children}
    </div>
  );
}
