"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarClock, Radio } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { subscribeToMatches } from "@/features/matches/matches.service";
import { isTveMatch } from "@/features/matches/tve-matches";
import { TeamFlag } from "@/components/matches/team-flag";
import { MatchBetsDialog } from "@/components/world-cup/match-bets-dialog";
import { cn } from "@/lib/utils";
import type { Match } from "@/types/domain";

/** Ventana posterior al kickoff durante la que un partido se considera "en
 *  vivo" si no está marcado como `finished`: 90' + descanso + prórroga. */
const LIVE_WINDOW_MIN = 130;

/** Texto relativo/absoluto del inicio del partido. */
function formatKickoff(ms: number, now: number): string {
  const diffMin = Math.round((ms - now) / 60000);
  if (diffMin <= 0) {
    const elapsed = -diffMin;
    return elapsed === 0 ? "ahora mismo" : `hace ${elapsed} min`;
  }
  if (diffMin <= 60) return diffMin <= 1 ? "en 1 min" : `en ${diffMin} min`;

  const d = new Date(ms);
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const matchDay = new Date(ms);
  matchDay.setHours(0, 0, 0, 0);
  const dayDiff = Math.round((matchDay.getTime() - today.getTime()) / 86400000);
  const time = d.toLocaleTimeString("es-ES", {
    hour: "2-digit",
    minute: "2-digit",
  });
  if (dayDiff === 0) return `hoy · ${time}`;
  if (dayDiff === 1) return `mañana · ${time}`;
  const dayStr = d.toLocaleDateString("es-ES", {
    weekday: "short",
    day: "2-digit",
    month: "short",
  });
  return `${dayStr} · ${time}`;
}

/**
 * Banner del dashboard: muestra SIEMPRE el partido actual o el próximo (el
 * más cercano no terminado). Al pulsarlo abre el mismo popup de apuestas que
 * en el apartado Mundial (`MatchBetsDialog`).
 */
export function LiveTvBanner() {
  const [matches, setMatches] = useState<Match[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const [dialogOpen, setDialogOpen] = useState(false);

  useEffect(() => {
    const unsub = subscribeToMatches(setMatches);
    return unsub;
  }, []);

  // Refresca cada 60s para que el estado pase de "próximo" a "en vivo" solo.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  // Partido destacado: el más cercano (no terminado) cuya hora de inicio no
  // quede ya muy atrás (dentro de la ventana de directo). Cubre tanto el que
  // está en vivo ahora como el próximo que vaya a empezar.
  const featured = useMemo(() => {
    const liveWindowMs = LIVE_WINDOW_MIN * 60000;
    return (
      matches
        .filter((m) => m.status !== "finished")
        .filter((m) => m.kickoffUtc.toMillis() >= now - liveWindowMs)
        .sort(
          (a, b) => a.kickoffUtc.toMillis() - b.kickoffUtc.toMillis()
        )[0] ?? null
    );
  }, [matches, now]);

  if (!featured) return null;

  const kickoff = featured.kickoffUtc.toMillis();
  const isLive = kickoff <= now; // garantizado dentro de la ventana de directo
  const tve = isTveMatch(featured);

  return (
    <>
      <button
        type="button"
        onClick={() => setDialogOpen(true)}
        className="block w-full text-left"
        aria-label={`Ver apuestas de ${featured.homeLabel} vs ${featured.awayLabel}`}
      >
        <Card
          className={cn(
            "overflow-hidden border-l-4 transition-colors hover:bg-accent/40",
            isLive
              ? "border-l-red-500 bg-red-500/5"
              : "border-l-primary bg-primary/5"
          )}
        >
          <CardContent className="flex items-center gap-3 p-3 sm:p-4">
            <div
              className={cn(
                "flex h-10 w-10 shrink-0 items-center justify-center rounded-full",
                isLive
                  ? "bg-red-500/15 text-red-600 dark:text-red-400"
                  : "bg-primary/15 text-primary"
              )}
            >
              {isLive ? (
                <Radio className="h-5 w-5 animate-pulse" aria-hidden />
              ) : (
                <CalendarClock className="h-5 w-5" aria-hidden />
              )}
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider">
                {isLive ? (
                  <span className="rounded-full bg-red-500/20 px-2 py-0.5 text-red-600 dark:text-red-400">
                    🔴 En vivo
                  </span>
                ) : (
                  <span className="rounded-full bg-primary/20 px-2 py-0.5 text-primary">
                    Próximo partido
                  </span>
                )}
                {tve && (
                  <>
                    <span className="text-muted-foreground">·</span>
                    <span className="text-muted-foreground">La 1 · TVE</span>
                  </>
                )}
                <span className="text-muted-foreground">·</span>
                <span className="text-muted-foreground">
                  {formatKickoff(kickoff, now)}
                </span>
              </div>
              <p className="mt-0.5 truncate text-sm font-semibold sm:text-base">
                <TeamFlag name={featured.homeLabel} className="mr-1" />
                {featured.homeLabel}{" "}
                {featured.result && (
                  <span className="font-mono font-bold">
                    {featured.result.homeGoals}–{featured.result.awayGoals}
                  </span>
                )}{" "}
                <span className="text-muted-foreground">vs</span>{" "}
                <TeamFlag name={featured.awayLabel} className="mr-1" />
                {featured.awayLabel}
              </p>
            </div>
          </CardContent>
        </Card>
      </button>

      <MatchBetsDialog
        match={featured}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />
    </>
  );
}
