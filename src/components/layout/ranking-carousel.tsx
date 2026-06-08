"use client";

import { useEffect, useMemo, useState } from "react";
import { Trophy } from "lucide-react";
import { subscribeToRanking } from "@/features/users/users.service";
import { useGroup } from "@/features/groups/groups.context";
import { isFirebaseConfigured } from "@/lib/firebase/client";
import { formatCurrency, formatPercent, profitClass } from "@/lib/utils";
import type { AppUser } from "@/types/domain";

function medal(rank: number) {
  if (rank === 1) return "🥇";
  if (rank === 2) return "🥈";
  if (rank === 3) return "🥉";
  return `#${rank}`;
}

export function RankingCarousel() {
  const [users, setUsers] = useState<AppUser[]>([]);
  const { memberUids } = useGroup();

  useEffect(() => {
    if (!isFirebaseConfigured) return;
    const unsub = subscribeToRanking(setUsers);
    return unsub;
  }, []);

  // Filtra a los miembros del grupo activo. Hasta que el listener de
  // miembros responde, memberUids está vacío y el carrusel queda en su
  // placeholder — preferimos eso a enseñar un instante datos de todo el
  // sistema antes del filtrado.
  const filtered = useMemo(
    () =>
      memberUids.size === 0
        ? []
        : users.filter((u) => memberUids.has(u.uid)),
    [users, memberUids]
  );

  // Si no hay usuarios todavía (cargando o estado vacío) reservamos el
  // mismo espacio que ocuparía el carrusel para que los offsets sticky
  // del sidebar no salten al hidratar.
  if (filtered.length === 0) {
    return (
      <div
        aria-hidden
        className="h-9 border-b border-border bg-card/50"
      />
    );
  }

  // Duplicamos suficientes copias para que el marquee llene cualquier ancho
  // (evita el "salto" cuando hay pocos usuarios).
  const minCopies = Math.max(2, Math.ceil(12 / filtered.length));
  const items = Array.from({ length: minCopies }, () => filtered).flat();

  return (
    <div className="relative flex items-center gap-3 overflow-hidden border-b border-border bg-card/50 px-4 py-2">
      <Trophy className="h-4 w-4 shrink-0 text-gold" />
      <div className="relative flex-1 overflow-hidden">
        <div className="flex animate-marquee gap-8 whitespace-nowrap text-sm">
          {items.map((u, i) => {
            const rank = (i % filtered.length) + 1;
            return (
              <div key={`${u.uid}-${i}`} className="flex items-center gap-2">
                <span className="font-semibold">{medal(rank)}</span>
                <span className="text-muted-foreground">@{u.username}</span>
                <span
                  className={`font-mono font-semibold ${profitClass(u.stats.roi)}`}
                >
                  {u.stats.roi > 0 ? "+" : ""}
                  {formatPercent(u.stats.roi)}
                </span>
                <span className="font-mono text-xs text-muted-foreground">
                  {formatCurrency(u.currentBalance)}
                </span>
                <span className="text-border">•</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
