"use client";

import { useEffect, useState } from "react";
import { MatchCard } from "@/components/world-cup/match-card";
import { MatchBetsDialog } from "@/components/world-cup/match-bets-dialog";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { subscribeToMatches } from "@/features/matches/matches.service";
import { STAGE_STYLES } from "@/features/matches/stage-styles";
import { cn } from "@/lib/utils";
import type { Match, MatchStage } from "@/types/domain";

const BRACKET_STAGES: MatchStage[] = ["r32", "r16", "qf", "sf", "final"];

export default function KnockoutPage() {
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [betsFor, setBetsFor] = useState<Match | null>(null);

  useEffect(() => {
    const unsub = subscribeToMatches(
      (list) => {
        setMatches(list);
        setLoading(false);
      },
      () => setLoading(false)
    );
    return unsub;
  }, []);

  if (loading) return <p className="text-sm text-muted-foreground">Cargando…</p>;

  const knockout = matches.filter((m) => m.stage !== "group");
  if (knockout.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-12 text-center text-sm text-muted-foreground">
        Aún no hay eliminatorias cargadas.
      </div>
    );
  }

  const byStage: Record<MatchStage, Match[]> = {
    group: [],
    r32: [],
    r16: [],
    qf: [],
    sf: [],
    third: [],
    final: [],
  };
  for (const m of knockout) {
    byStage[m.stage].push(m);
  }
  for (const s of BRACKET_STAGES) {
    byStage[s].sort((a, b) => a.kickoffUtc.toMillis() - b.kickoffUtc.toMillis());
  }
  byStage.third.sort((a, b) => a.kickoffUtc.toMillis() - b.kickoffUtc.toMillis());

  const presentStages = BRACKET_STAGES.filter((s) => byStage[s].length > 0);

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden border-yellow-500/40 bg-gradient-to-br from-yellow-500/10 via-amber-500/5 to-transparent">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            🏆 Cuadro eliminatorio
          </CardTitle>
          <CardDescription>
            Cada columna es una ronda. Las cards se alinean verticalmente con
            el cruce de la siguiente fase.
          </CardDescription>
        </CardHeader>
      </Card>

      {/* ──────────── Bracket ──────────── */}
      <div className="overflow-x-auto rounded-xl border bg-card/40 p-4">
        <div
          className="grid min-w-[1100px] gap-4"
          style={{
            gridTemplateColumns: `repeat(${presentStages.length}, minmax(220px, 1fr))`,
            minHeight: "640px",
          }}
        >
          {presentStages.map((stage) => {
            const style = STAGE_STYLES[stage];
            const items = byStage[stage];
            return (
              <div key={stage} className="flex flex-col">
                <div
                  className={cn(
                    "mb-3 flex items-center justify-between rounded-md px-2 py-1 text-xs font-semibold uppercase tracking-wider",
                    style.chip
                  )}
                >
                  <span>
                    {style.emoji} {style.label}
                  </span>
                  <span className="opacity-70">({items.length})</span>
                </div>
                <div className="relative flex flex-1 flex-col justify-around gap-2">
                  {items.map((m) => (
                    <div
                      key={m.id}
                      className={cn(
                        "relative rounded-lg bg-gradient-to-br p-[1px]",
                        style.gradient
                      )}
                    >
                      <MatchCard
                        match={m}
                        compact
                        className="bg-card"
                        onClick={setBetsFor}
                      />
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ──────────── 3.er puesto, mostrado aparte ──────────── */}
      {byStage.third.length > 0 && (
        <Card className="border-amber-500/40 bg-gradient-to-br from-amber-500/10 via-amber-500/5 to-transparent">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              🥉 3.er puesto
            </CardTitle>
            <CardDescription>
              Partido por la medalla de bronce.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2 sm:grid-cols-2">
              {byStage.third.map((m) => (
                <MatchCard key={m.id} match={m} onClick={setBetsFor} />
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <MatchBetsDialog
        match={betsFor}
        open={!!betsFor}
        onOpenChange={(o) => !o && setBetsFor(null)}
      />
    </div>
  );
}
