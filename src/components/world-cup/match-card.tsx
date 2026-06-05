"use client";

import Link from "next/link";
import { BetStatusBadge } from "@/components/bets/bet-status-badge"; // no usado pero consistente
import { Badge } from "@/components/ui/badge";
import { STAGE_LABELS } from "@/features/matches/matches.service";
import { cn } from "@/lib/utils";
import type { Match } from "@/types/domain";

interface Props {
  match: Match;
  highlightTeam?: string;
  className?: string;
}

export function MatchCard({ match, highlightTeam, className }: Props) {
  const kickoff = new Date(match.kickoffUtc.toMillis());
  const finished = match.status === "finished" && match.result;
  const r = match.result;

  return (
    <div
      className={cn(
        "rounded-lg border bg-card p-3 transition-colors hover:border-primary/40",
        className
      )}
    >
      <div className="mb-2 flex items-center justify-between text-[10px] uppercase tracking-wider text-muted-foreground">
        <span>
          {STAGE_LABELS[match.stage]}
          {match.groupId && ` · Grupo ${match.groupId}`}
          {match.matchday && ` · J${match.matchday}`}
        </span>
        {finished ? (
          <Badge variant="muted" className="text-[10px]">Final</Badge>
        ) : (
          <span>
            {kickoff.toLocaleDateString("es-ES", {
              day: "2-digit",
              month: "short",
            })}{" "}
            ·{" "}
            {kickoff.toLocaleTimeString("es-ES", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        )}
      </div>

      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <div
          className={cn(
            "text-right text-sm font-medium truncate",
            highlightTeam === match.homeLabel && "text-primary"
          )}
          title={match.homeLabel}
        >
          {match.homeLabel}
        </div>

        {finished && r ? (
          <div className="flex items-center gap-1 font-mono text-lg font-bold">
            <span>{r.homeGoals}</span>
            <span className="text-muted-foreground">-</span>
            <span>{r.awayGoals}</span>
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">vs</span>
        )}

        <div
          className={cn(
            "text-left text-sm font-medium truncate",
            highlightTeam === match.awayLabel && "text-primary"
          )}
          title={match.awayLabel}
        >
          {match.awayLabel}
        </div>
      </div>

      {(match.city || match.venue) && (
        <p className="mt-2 truncate text-[10px] text-muted-foreground">
          {[match.venue, match.city].filter(Boolean).join(" · ")}
        </p>
      )}

      {finished && r && (r.homeYellow + r.awayYellow + r.homeRed + r.awayRed) > 0 && (
        <p className="mt-1 text-[10px] text-muted-foreground">
          {(r.homeYellow + r.awayYellow) > 0 && (
            <>🟨 {r.homeYellow + r.awayYellow}</>
          )}
          {(r.homeRed + r.awayRed) > 0 && (
            <span className="ml-2">🟥 {r.homeRed + r.awayRed}</span>
          )}
        </p>
      )}
    </div>
  );
}
