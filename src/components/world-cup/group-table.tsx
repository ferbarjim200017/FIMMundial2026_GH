"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { GroupId, Match } from "@/types/domain";
import { computeGroupStandings, type TeamStanding } from "@/features/standings/standings.utils";

interface Props {
  groupId: GroupId;
  matches: Match[];
  compact?: boolean;
}

export function GroupTable({ groupId, matches, compact }: Props) {
  const standings = computeGroupStandings(groupId, matches);
  const hasAny = standings.some((s) => s.played > 0);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <span className="rounded bg-primary/15 px-2 py-0.5 text-sm font-bold text-primary">
            Grupo {groupId}
          </span>
          {!hasAny && (
            <span className="text-xs font-normal text-muted-foreground">
              Aún no jugado
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <table className="w-full text-sm">
          <thead className="border-y bg-muted/30 text-left text-[10px] uppercase text-muted-foreground">
            <tr>
              <th className="px-2 py-1 text-center">#</th>
              <th className="px-2 py-1">Equipo</th>
              <th className="px-2 py-1 text-center">PJ</th>
              <th className="px-2 py-1 text-center">G</th>
              <th className="px-2 py-1 text-center">E</th>
              <th className="px-2 py-1 text-center">P</th>
              <th className="px-2 py-1 text-center">GF</th>
              <th className="px-2 py-1 text-center">GC</th>
              <th className="px-2 py-1 text-center">DG</th>
              {!compact && (
                <>
                  <th className="px-2 py-1 text-center">🟨</th>
                  <th className="px-2 py-1 text-center">🟥</th>
                </>
              )}
              <th className="px-2 py-1 text-center font-bold">Pts</th>
            </tr>
          </thead>
          <tbody>
            {standings.map((s) => (
              <Row key={s.teamLabel} s={s} compact={compact} />
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

function Row({ s, compact }: { s: TeamStanding; compact?: boolean }) {
  // Marcas visuales para los puestos:
  //  - 1.º y 2.º clasifican directo (verde)
  //  - 3.º depende de la tabla de terceros (ámbar)
  //  - 4.º eliminado (rojo tenue)
  const rank = s.rank ?? 0;
  const indicatorClass =
    rank === 1 || rank === 2
      ? "bg-profit/70"
      : rank === 3
        ? "bg-amber-500/80"
        : "bg-loss/40";

  return (
    <tr className="border-b last:border-0 hover:bg-accent/30">
      <td className="px-2 py-1.5 text-center">
        <div className="flex items-center justify-center gap-1.5">
          <span className={cn("h-1.5 w-1.5 rounded-full", indicatorClass)} />
          <span className="font-medium">{rank}</span>
        </div>
      </td>
      <td className="px-2 py-1.5 font-medium">{s.teamLabel}</td>
      <td className="px-2 py-1.5 text-center font-mono">{s.played}</td>
      <td className="px-2 py-1.5 text-center font-mono">{s.won}</td>
      <td className="px-2 py-1.5 text-center font-mono">{s.drawn}</td>
      <td className="px-2 py-1.5 text-center font-mono">{s.lost}</td>
      <td className="px-2 py-1.5 text-center font-mono">{s.goalsFor}</td>
      <td className="px-2 py-1.5 text-center font-mono">{s.goalsAgainst}</td>
      <td className={cn("px-2 py-1.5 text-center font-mono", s.goalDiff > 0 && "text-profit", s.goalDiff < 0 && "text-loss")}>
        {s.goalDiff > 0 ? "+" : ""}
        {s.goalDiff}
      </td>
      {!compact && (
        <>
          <td className="px-2 py-1.5 text-center font-mono text-xs text-muted-foreground">{s.yellow}</td>
          <td className="px-2 py-1.5 text-center font-mono text-xs text-muted-foreground">{s.red}</td>
        </>
      )}
      <td className="px-2 py-1.5 text-center font-mono font-bold">{s.points}</td>
    </tr>
  );
}
