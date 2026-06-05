"use client";

import { useEffect, useState } from "react";
import { Trophy } from "lucide-react";
import { subscribeToRanking } from "@/features/users/users.service";
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

  useEffect(() => {
    if (!isFirebaseConfigured) return;
    const unsub = subscribeToRanking(setUsers);
    return unsub;
  }, []);

  if (users.length === 0) return null;

  // Duplicamos suficientes copias para que el marquee llene cualquier ancho
  // (evita el "salto" cuando hay pocos usuarios).
  const minCopies = Math.max(2, Math.ceil(12 / users.length));
  const items = Array.from({ length: minCopies }, () => users).flat();

  return (
    <div className="relative flex items-center gap-3 overflow-hidden border-b border-border bg-card/50 px-4 py-2">
      <Trophy className="h-4 w-4 shrink-0 text-gold" />
      <div className="relative flex-1 overflow-hidden">
        <div className="flex animate-marquee gap-8 whitespace-nowrap text-sm">
          {items.map((u, i) => {
            const rank = (i % users.length) + 1;
            return (
              <div key={`${u.uid}-${i}`} className="flex items-center gap-2">
                <span className="font-semibold">{medal(rank)}</span>
                <span className="text-muted-foreground">@{u.username}</span>
                <span className="font-mono font-medium">
                  {formatCurrency(u.currentBalance)}
                </span>
                <span className={profitClass(u.stats.roi)}>
                  {u.stats.roi > 0 ? "+" : ""}
                  {formatPercent(u.stats.roi)}
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
