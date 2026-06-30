"use client";

import { useMemo } from "react";
import { Globe2 } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { TeamFlag } from "@/components/matches/team-flag";
import { teamFlagCode } from "@/features/matches/teams-2026";
import { betMatchIds, betShareCount } from "@/features/bets/bets.utils";
import { cn, formatCurrency, profitClass } from "@/lib/utils";
import type { Bet, Match } from "@/types/domain";

function TeamRow({
  team,
  profit,
  count,
}: {
  team: string;
  profit: number;
  count: number;
}) {
  return (
    <div className="flex items-center gap-2 rounded-md border px-2.5 py-1.5">
      <TeamFlag name={team} />
      <span className="min-w-0 flex-1 truncate text-sm">{team}</span>
      <span className="shrink-0 text-[10px] text-muted-foreground">
        {count} ap.
      </span>
      <span
        className={cn(
          "shrink-0 font-mono text-sm font-semibold",
          profitClass(profit)
        )}
      >
        {profit > 0 ? "+" : ""}
        {formatCurrency(profit)}
      </span>
    </div>
  );
}

/**
 * Beneficio del jugador agrupado por SELECCIÓN: a cada equipo se le imputa el
 * resultado de las apuestas en sus partidos (los combos reparten su beneficio
 * entre los partidos que los componen). Muestra los 3 equipos que más dinero le
 * dan y los 3 que más le quitan.
 */
export function TeamStatsCard({
  bets,
  matchById,
}: {
  bets: Bet[];
  matchById: Map<string, Match>;
}) {
  const { best, worst } = useMemo(() => {
    const by = new Map<string, { count: number; profit: number }>();
    for (const b of bets) {
      const ids = betMatchIds(b);
      if (ids.length === 0) continue;
      const share = betShareCount(b);
      const profitShare = b.status !== "pending" ? (b.profit ?? 0) / share : 0;
      for (const id of ids) {
        const m = matchById.get(id);
        if (!m) continue;
        for (const team of [m.homeLabel, m.awayLabel]) {
          if (!teamFlagCode(team)) continue; // solo selecciones reales
          const cur = by.get(team) ?? { count: 0, profit: 0 };
          cur.count += 1;
          cur.profit += profitShare;
          by.set(team, cur);
        }
      }
    }
    const list = [...by.entries()].map(([team, v]) => ({
      team,
      count: v.count,
      profit: v.profit,
    }));
    return {
      best: list
        .filter((t) => t.profit > 0)
        .sort((a, b) => b.profit - a.profit)
        .slice(0, 3),
      worst: list
        .filter((t) => t.profit < 0)
        .sort((a, b) => a.profit - b.profit)
        .slice(0, 3),
    };
  }, [bets, matchById]);

  if (best.length === 0 && worst.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Globe2 className="h-4 w-4 text-primary" />
          Por selección
        </CardTitle>
        <CardDescription>
          Beneficio en los partidos de cada equipo (los combos se reparten).
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-profit">
            Te dan dinero 🍀
          </p>
          {best.length > 0 ? (
            best.map((t) => <TeamRow key={t.team} {...t} />)
          ) : (
            <p className="text-xs text-muted-foreground">Aún ninguno.</p>
          )}
        </div>
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-loss">
            Te lo quitan 💀
          </p>
          {worst.length > 0 ? (
            worst.map((t) => <TeamRow key={t.team} {...t} />)
          ) : (
            <p className="text-xs text-muted-foreground">Aún ninguno.</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
