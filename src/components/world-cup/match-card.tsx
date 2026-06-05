"use client";

import { Badge } from "@/components/ui/badge";
import { GROUP_COLORS, STAGE_STYLES } from "@/features/matches/stage-styles";
import { cn } from "@/lib/utils";
import type { Match } from "@/types/domain";

interface Props {
  match: Match;
  highlightTeam?: string;
  className?: string;
  /** Si true, oculta la cabecera de fase/fecha (útil dentro del bracket). */
  compact?: boolean;
}

export function MatchCard({ match, highlightTeam, className, compact }: Props) {
  const kickoff = new Date(match.kickoffUtc.toMillis());
  const finished = match.status === "finished" && match.result;
  const r = match.result;
  const stage = STAGE_STYLES[match.stage];
  const groupStyle =
    match.stage === "group" && match.groupId
      ? GROUP_COLORS[match.groupId]
      : null;

  const kickoffDate = kickoff.toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "short",
  });
  const kickoffTime = kickoff.toLocaleTimeString("es-ES", {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div
      className={cn(
        "relative rounded-lg border-l-4 bg-card p-3 shadow-sm transition-all hover:border-primary/40 hover:shadow",
        groupStyle?.ring ?? stage.ring,
        className
      )}
    >
      {!compact && (
        <div className="mb-2 flex items-center justify-between gap-2 text-[10px] uppercase tracking-wider">
          <div className="flex items-center gap-1.5">
            <span
              className={cn(
                "rounded-md px-1.5 py-0.5 font-semibold",
                groupStyle?.chip ?? stage.chip
              )}
            >
              {match.groupId
                ? `Grupo ${match.groupId}`
                : `${stage.emoji} ${stage.shortLabel}`}
            </span>
            {match.matchday && (
              <span className="text-muted-foreground">J{match.matchday}</span>
            )}
          </div>
          {finished ? (
            <Badge variant="muted" className="text-[10px]">Final</Badge>
          ) : (
            <span className="text-muted-foreground">
              {kickoffDate} · {kickoffTime}
            </span>
          )}
        </div>
      )}

      {compact && (
        <div className="mb-1.5 flex items-center justify-between text-[10px] uppercase tracking-wider text-muted-foreground">
          {finished ? (
            <>
              <Badge variant="muted" className="text-[9px]">Final</Badge>
              <span>{kickoffDate}</span>
            </>
          ) : (
            <>
              <span className="font-semibold text-foreground/80">
                {kickoffDate}
              </span>
              <span>{kickoffTime}</span>
            </>
          )}
        </div>
      )}

      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <div
          className={cn(
            "text-right text-sm font-medium truncate",
            highlightTeam === match.homeLabel && "text-primary",
            finished && r && r.homeGoals > r.awayGoals && "font-bold"
          )}
          title={match.homeLabel}
        >
          {match.homeLabel}
        </div>

        {finished && r ? (
          <div className="flex flex-col items-center">
            <div className="flex items-center gap-1.5 rounded-md bg-muted/40 px-2 py-0.5 font-mono text-lg font-bold">
              <span
                className={cn(
                  (r.homeGoals > r.awayGoals ||
                    (r.homeGoals === r.awayGoals && r.penaltyWinner === "home")) &&
                    "text-profit"
                )}
              >
                {r.homeGoals}
              </span>
              <span className="text-muted-foreground/60">-</span>
              <span
                className={cn(
                  (r.awayGoals > r.homeGoals ||
                    (r.homeGoals === r.awayGoals && r.penaltyWinner === "away")) &&
                    "text-profit"
                )}
              >
                {r.awayGoals}
              </span>
            </div>
            {r.homeGoals === r.awayGoals && r.penaltyWinner && (
              <span className="mt-0.5 text-[9px] uppercase tracking-wider text-muted-foreground">
                Pen. {r.penaltyWinner === "home" ? "←" : "→"}
              </span>
            )}
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">vs</span>
        )}

        <div
          className={cn(
            "text-left text-sm font-medium truncate",
            highlightTeam === match.awayLabel && "text-primary",
            finished && r && r.awayGoals > r.homeGoals && "font-bold"
          )}
          title={match.awayLabel}
        >
          {match.awayLabel}
        </div>
      </div>

      {!compact && (match.city || match.venue) && (
        <p className="mt-2 truncate text-[10px] text-muted-foreground">
          {[match.venue, match.city].filter(Boolean).join(" · ")}
        </p>
      )}

      {!compact &&
        finished &&
        r &&
        r.homeYellow + r.awayYellow + r.homeRed + r.awayRed > 0 && (
          <p className="mt-1 text-[10px] text-muted-foreground">
            {r.homeYellow + r.awayYellow > 0 && (
              <>🟨 {r.homeYellow + r.awayYellow}</>
            )}
            {r.homeRed + r.awayRed > 0 && (
              <span className="ml-2">🟥 {r.homeRed + r.awayRed}</span>
            )}
          </p>
        )}
    </div>
  );
}
