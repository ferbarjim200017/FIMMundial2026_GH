"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  computeBestThirds,
  type ThirdPlaceEntry,
} from "@/features/standings/standings.utils";
import { GROUP_IDS } from "@/features/matches/matches.service";
import type { Match } from "@/types/domain";

interface Props {
  matches: Match[];
}

export function ThirdPlaceTable({ matches }: Props) {
  const entries = computeBestThirds(GROUP_IDS, matches);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Mejores terceros</CardTitle>
        <CardDescription>
          Los <strong>8 mejores</strong> avanzan a dieciseisavos (resaltados en verde).
          Criterios FIFA: puntos → diferencia de goles → goles a favor → fair play.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {entries.length === 0 ? (
          <p className="px-6 py-8 text-center text-sm text-muted-foreground">
            La tabla se calculará cuando los terceros lugares hayan jugado al menos
            un partido.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-y bg-muted/30 text-left text-[10px] uppercase text-muted-foreground">
              <tr>
                <th className="px-2 py-1 text-center">#</th>
                <th className="px-2 py-1">Grupo</th>
                <th className="px-2 py-1">Equipo</th>
                <th className="px-2 py-1 text-center">PJ</th>
                <th className="px-2 py-1 text-center">G</th>
                <th className="px-2 py-1 text-center">E</th>
                <th className="px-2 py-1 text-center">P</th>
                <th className="px-2 py-1 text-center">GF</th>
                <th className="px-2 py-1 text-center">GC</th>
                <th className="px-2 py-1 text-center">DG</th>
                <th className="px-2 py-1 text-center">FP</th>
                <th className="px-2 py-1 text-center font-bold">Pts</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e, idx) => (
                <Row key={e.groupId} e={e} idx={idx} />
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}

function Row({ e, idx }: { e: ThirdPlaceEntry; idx: number }) {
  return (
    <tr
      className={cn(
        "border-b last:border-0",
        e.qualified ? "bg-profit/5 hover:bg-profit/10" : "hover:bg-accent/30"
      )}
    >
      <td className="px-2 py-1.5 text-center">
        <div className="flex items-center justify-center gap-1.5">
          <span
            className={cn(
              "h-1.5 w-1.5 rounded-full",
              e.qualified ? "bg-profit/80" : "bg-loss/40"
            )}
          />
          <span className="font-medium">{idx + 1}</span>
        </div>
      </td>
      <td className="px-2 py-1.5 font-bold text-primary">{e.groupId}</td>
      <td className="px-2 py-1.5 font-medium">
        {e.teamLabel}
        {e.qualified && (
          <span className="ml-1.5 rounded bg-profit/20 px-1 py-0 text-[9px] font-bold uppercase tracking-wide text-profit">
            Clasificado
          </span>
        )}
      </td>
      <td className="px-2 py-1.5 text-center font-mono">{e.played}</td>
      <td className="px-2 py-1.5 text-center font-mono">{e.won}</td>
      <td className="px-2 py-1.5 text-center font-mono">{e.drawn}</td>
      <td className="px-2 py-1.5 text-center font-mono">{e.lost}</td>
      <td className="px-2 py-1.5 text-center font-mono">{e.goalsFor}</td>
      <td className="px-2 py-1.5 text-center font-mono">{e.goalsAgainst}</td>
      <td
        className={cn(
          "px-2 py-1.5 text-center font-mono",
          e.goalDiff > 0 && "text-profit",
          e.goalDiff < 0 && "text-loss"
        )}
      >
        {e.goalDiff > 0 ? "+" : ""}
        {e.goalDiff}
      </td>
      <td className="px-2 py-1.5 text-center font-mono text-xs text-muted-foreground">
        {e.fairPlay}
      </td>
      <td className="px-2 py-1.5 text-center font-mono font-bold">{e.points}</td>
    </tr>
  );
}
