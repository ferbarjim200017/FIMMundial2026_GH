"use client";

import { useMemo } from "react";
import { Coins } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MARKET_OPTIONS } from "@/features/bets/bets.schema";
import { cn, formatCurrency, formatPercent, profitClass } from "@/lib/utils";
import type { Bet } from "@/types/domain";

function marketLabel(value: string): string {
  return MARKET_OPTIONS.find((m) => m.value === value)?.label ?? value;
}

/**
 * Desglose de los mercados del jugador: nº de apuestas, beneficio y ROI por
 * mercado (ordenado por beneficio). Marca con ★ el mercado más jugado.
 */
export function MarketStatsCard({ bets }: { bets: Bet[] }) {
  const rows = useMemo(() => {
    const by = new Map<
      string,
      { count: number; profit: number; staked: number }
    >();
    for (const b of bets) {
      const cur = by.get(b.market) ?? { count: 0, profit: 0, staked: 0 };
      cur.count += 1;
      if (b.status !== "pending") cur.profit += b.profit ?? 0;
      if (!b.isFreebet && b.status !== "pending" && b.status !== "void") {
        cur.staked += b.stake;
      }
      by.set(b.market, cur);
    }
    return [...by.entries()]
      .map(([market, v]) => ({
        market,
        label: marketLabel(market),
        count: v.count,
        profit: v.profit,
        roi: v.staked > 0 ? (v.profit / v.staked) * 100 : 0,
      }))
      .sort((a, b) => b.profit - a.profit);
  }, [bets]);

  if (rows.length === 0) return null;
  const favorite = [...rows].sort((a, b) => b.count - a.count)[0];

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Coins className="h-4 w-4 text-primary" />
          Mercados
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-2">Mercado</th>
                <th className="px-2 py-2 text-right">Apuestas</th>
                <th className="px-2 py-2 text-right">Beneficio</th>
                <th className="px-4 py-2 text-right">ROI</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((r) => (
                <tr key={r.market}>
                  <td className="px-4 py-2">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate">{r.label}</span>
                      {r.market === favorite.market && (
                        <span className="shrink-0 rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                          ★ favorito
                        </span>
                      )}
                    </span>
                  </td>
                  <td className="px-2 py-2 text-right font-mono text-muted-foreground">
                    {r.count}
                  </td>
                  <td
                    className={cn(
                      "px-2 py-2 text-right font-mono",
                      profitClass(r.profit)
                    )}
                  >
                    {r.profit > 0 ? "+" : ""}
                    {formatCurrency(r.profit)}
                  </td>
                  <td
                    className={cn(
                      "px-4 py-2 text-right font-mono",
                      profitClass(r.roi)
                    )}
                  >
                    {formatPercent(r.roi)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
