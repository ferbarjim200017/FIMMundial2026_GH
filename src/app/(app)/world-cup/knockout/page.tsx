"use client";

import { useEffect, useState } from "react";
import { MatchCard } from "@/components/world-cup/match-card";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  STAGE_LABELS,
  subscribeToMatches,
} from "@/features/matches/matches.service";
import type { Match, MatchStage } from "@/types/domain";

const KNOCKOUT_STAGES: { key: MatchStage; label: string }[] = [
  { key: "r32", label: STAGE_LABELS.r32 },
  { key: "r16", label: STAGE_LABELS.r16 },
  { key: "qf", label: STAGE_LABELS.qf },
  { key: "sf", label: STAGE_LABELS.sf },
  { key: "third", label: STAGE_LABELS.third },
  { key: "final", label: STAGE_LABELS.final },
];

export default function KnockoutPage() {
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);

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

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Bracket eliminatorio</CardTitle>
          <CardDescription>
            Los cuadros se irán llenando a medida que el admin actualice los
            partidos y los resultados.
          </CardDescription>
        </CardHeader>
      </Card>

      <div className="overflow-x-auto pb-4">
        <div className="flex min-w-max gap-3">
          {KNOCKOUT_STAGES.map(({ key, label }) => {
            const items = knockout
              .filter((m) => m.stage === key)
              .sort((a, b) => a.kickoffUtc.toMillis() - b.kickoffUtc.toMillis());
            if (items.length === 0) return null;
            return (
              <div key={key} className="w-72 shrink-0 space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {label}{" "}
                  <span className="ml-1 text-foreground/70">({items.length})</span>
                </h3>
                <div className="space-y-2">
                  {items.map((m) => (
                    <MatchCard key={m.id} match={m} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
