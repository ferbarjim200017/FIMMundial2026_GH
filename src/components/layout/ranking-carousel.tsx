"use client";

/**
 * Carrusel del ranking en la TopBar.
 * En el Módulo 1 muestra un placeholder; en el Módulo 4 se conectará a
 * `rankings/global` con onSnapshot para mostrar saldos en tiempo real.
 */
import { Trophy } from "lucide-react";
import { formatCurrency, formatPercent, profitClass } from "@/lib/utils";

interface RankingEntry {
  rank: number;
  username: string;
  currentBalance: number;
  roi: number;
}

// Datos demo. Se reemplazarán por suscripción a Firestore en el Módulo 4.
const DEMO_RANKING: RankingEntry[] = [
  { rank: 1, username: "@nando", currentBalance: 1245.5, roi: 24.5 },
  { rank: 2, username: "@javi", currentBalance: 980.1, roi: 18.2 },
  { rank: 3, username: "@laura", currentBalance: 760.0, roi: 11.4 },
  { rank: 4, username: "@dani", currentBalance: 540.7, roi: 5.1 },
  { rank: 5, username: "@marcos", currentBalance: 320.0, roi: -3.2 },
  { rank: 6, username: "@sara", currentBalance: 180.5, roi: -8.7 },
];

function medal(rank: number) {
  if (rank === 1) return "🥇";
  if (rank === 2) return "🥈";
  if (rank === 3) return "🥉";
  return `#${rank}`;
}

export function RankingCarousel() {
  const items = [...DEMO_RANKING, ...DEMO_RANKING]; // duplicado para loop infinito

  return (
    <div className="relative flex items-center gap-3 overflow-hidden border-b border-border bg-card/50 px-4 py-2">
      <Trophy className="h-4 w-4 shrink-0 text-gold" />
      <div className="relative flex-1 overflow-hidden">
        <div className="flex animate-marquee gap-8 whitespace-nowrap text-sm">
          {items.map((e, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="font-semibold">{medal(e.rank)}</span>
              <span className="text-muted-foreground">{e.username}</span>
              <span className="font-mono font-medium">
                {formatCurrency(e.currentBalance)}
              </span>
              <span className={profitClass(e.roi)}>
                {e.roi > 0 ? "+" : ""}
                {formatPercent(e.roi)}
              </span>
              <span className="text-border">•</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
