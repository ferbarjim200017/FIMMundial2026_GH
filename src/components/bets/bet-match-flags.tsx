"use client";

import { TeamFlag } from "@/components/matches/team-flag";
import { betMatchIds } from "@/features/bets/bets.utils";
import { cn } from "@/lib/utils";
import type { Bet, Match } from "@/types/domain";

/**
 * Banderas del partido de una apuesta. Solo se muestran cuando la apuesta es a
 * UN único partido del Mundial (los combos y las apuestas a futuro no llevan
 * banderas). `matchById` debe traer los partidos con las etiquetas resueltas.
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
  if (ids.length !== 1) return null;
  const m = matchById.get(ids[0]);
  if (!m) return null;
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-0.5 align-text-bottom",
        className
      )}
    >
      <TeamFlag name={m.homeLabel} />
      <TeamFlag name={m.awayLabel} />
    </span>
  );
}
