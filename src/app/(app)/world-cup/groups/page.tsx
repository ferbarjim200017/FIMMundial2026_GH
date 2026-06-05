"use client";

import { useEffect, useState } from "react";
import { GroupTable } from "@/components/world-cup/group-table";
import { ThirdPlaceTable } from "@/components/world-cup/third-place-table";
import { MatchCard } from "@/components/world-cup/match-card";
import { MatchBetsDialog } from "@/components/world-cup/match-bets-dialog";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  GROUP_IDS,
  subscribeToMatches,
} from "@/features/matches/matches.service";
import type { GroupId, Match } from "@/types/domain";

export default function GroupsPage() {
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

  if (matches.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-12 text-center text-sm text-muted-foreground">
        Aún no hay partidos cargados. El admin puede cargarlos desde{" "}
        <code className="rounded bg-muted px-1">/admin/matches</code>.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {GROUP_IDS.map((g) => (
          <GroupSection
            key={g}
            groupId={g}
            matches={matches}
            onMatchClick={setBetsFor}
          />
        ))}
      </div>

      <ThirdPlaceTable matches={matches} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Leyenda</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            <span className="mr-2 inline-block h-2 w-2 rounded-full bg-profit/70 align-middle" />
            1.º y 2.º — Clasifican directo a 1/16
          </p>
          <p>
            <span className="mr-2 inline-block h-2 w-2 rounded-full bg-amber-500/80 align-middle" />
            3.º — Depende de la tabla de mejores terceros (8 de 12 avanzan)
          </p>
          <p>
            <span className="mr-2 inline-block h-2 w-2 rounded-full bg-loss/40 align-middle" />
            4.º — Eliminado
          </p>
          <p className="pt-2 text-xs">
            <strong>PJ</strong>: jugados · <strong>G/E/P</strong>: ganados/empatados/perdidos ·{" "}
            <strong>GF/GC</strong>: goles a favor/en contra · <strong>DG</strong>: diferencia ·{" "}
            <strong>FP</strong>: fair play (−1 por amarilla, −3 por roja)
          </p>
        </CardContent>
      </Card>

      <MatchBetsDialog
        match={betsFor}
        open={!!betsFor}
        onOpenChange={(o) => !o && setBetsFor(null)}
      />
    </div>
  );
}

function GroupSection({
  groupId,
  matches,
  onMatchClick,
}: {
  groupId: GroupId;
  matches: Match[];
  onMatchClick: (m: Match) => void;
}) {
  const groupMatches = matches
    .filter((m) => m.stage === "group" && m.groupId === groupId)
    .sort((a, b) => a.kickoffUtc.toMillis() - b.kickoffUtc.toMillis());

  return (
    <div className="space-y-3">
      <GroupTable groupId={groupId} matches={matches} compact />
      <div className="space-y-1.5">
        {groupMatches.map((m) => (
          <MatchCard key={m.id} match={m} className="p-2" onClick={onMatchClick} />
        ))}
      </div>
    </div>
  );
}
