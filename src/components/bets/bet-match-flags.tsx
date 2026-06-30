"use client";

import { Fragment } from "react";
import { TeamFlag } from "@/components/matches/team-flag";
import { betMatchIds } from "@/features/bets/bets.utils";
import { cn } from "@/lib/utils";
import type { Bet, Match } from "@/types/domain";

/**
 * Banderas de los partidos de una apuesta. Para una apuesta a UN partido
 * muestra su par de banderas (local + visitante). Para una COMBINADA muestra
 * un par por cada partido, separados por un "+". Las apuestas a futuro/outright
 * (sin partido) no llevan banderas. `matchById` debe traer los partidos con las
 * etiquetas ya resueltas.
 */
export function BetMatchFlags({
  bet,
  matchById,
  className,
}: {
  bet: Bet;
  matchById: Map<string, Match>;
  className?: string;
}) {
  const ids = betMatchIds(bet);
  if (ids.length === 0) return null;
  // Solo los partidos que sí están en el mapa (resueltos).
  const ms = ids
    .map((id) => matchById.get(id))
    .filter((m): m is Match => Boolean(m));
  if (ms.length === 0) return null;
  return (
    <span
      className={cn(
        "inline-flex flex-wrap items-center gap-0.5 align-text-bottom",
        className
      )}
    >
      {ms.map((m, i) => (
        <Fragment key={m.id}>
          {i > 0 && (
            <span className="px-0.5 text-[10px] font-semibold text-muted-foreground">
              +
            </span>
          )}
          <span className="inline-flex shrink-0 items-center gap-0.5">
            <TeamFlag name={m.homeLabel} />
            <TeamFlag name={m.awayLabel} />
          </span>
        </Fragment>
      ))}
    </span>
  );
}
