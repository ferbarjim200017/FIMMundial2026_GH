"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Radio, Tv } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { subscribeToMatches } from "@/features/matches/matches.service";
import { isTveMatch } from "@/features/matches/tve-matches";
import { TeamFlag } from "@/components/matches/team-flag";
import { ROUTES } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { Match } from "@/types/domain";

/** Ventana posterior al kickoff durante la que un partido se considera "en vivo"
 *  si no está marcado como `finished`: 90' + descanso + prórroga + colchón. */
const LIVE_WINDOW_MIN = 130;
/** Ventana previa al kickoff para "empieza pronto". */
const STARTING_SOON_MIN = 60;

interface BannerItem {
  match: Match;
  kind: "live" | "soon";
  /** Minutos hasta el inicio (sólo para `soon`) o transcurridos (sólo para `live`). */
  minutes: number;
  /** Cuando es true, se muestra un sello "Demo" para distinguirlo de los reales. */
  demo?: boolean;
}

/** Mocks de muestra para `?demo=tv`. Construyo objetos `Match`-like al vuelo
 *  con sólo los campos que renderiza el banner — el resto los ignoramos. */
function demoItems(): BannerItem[] {
  const mockMatch = (overrides: Partial<Match>): Match =>
    ({
      id: "demo",
      stage: "group",
      kickoffUtc: { toMillis: () => Date.now() } as Match["kickoffUtc"],
      homeLabel: "",
      awayLabel: "",
      homeTeamId: null,
      awayTeamId: null,
      status: "scheduled",
      ...overrides,
    } as Match);

  return [
    {
      kind: "live",
      minutes: 47,
      demo: true,
      match: mockMatch({
        id: "demo-live",
        homeLabel: "España",
        awayLabel: "Cabo Verde",
        status: "scheduled",
        result: {
          homeGoals: 1,
          awayGoals: 0,
          homeYellow: 0,
          awayYellow: 0,
          homeRed: 0,
          awayRed: 0,
        },
      }),
    },
    {
      kind: "soon",
      minutes: 23,
      demo: true,
      match: mockMatch({
        id: "demo-soon",
        homeLabel: "Brasil",
        awayLabel: "Marruecos",
      }),
    },
  ];
}

function classify(match: Match, now: number): BannerItem | null {
  if (match.status === "finished") return null;
  const kickoff = match.kickoffUtc.toMillis();
  const diffMin = Math.round((kickoff - now) / 60000);
  if (diffMin <= 0 && -diffMin <= LIVE_WINDOW_MIN) {
    return { match, kind: "live", minutes: -diffMin };
  }
  if (diffMin > 0 && diffMin <= STARTING_SOON_MIN) {
    return { match, kind: "soon", minutes: diffMin };
  }
  return null;
}

export function LiveTvBanner() {
  const [matches, setMatches] = useState<Match[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const [demoMode, setDemoMode] = useState(false);

  useEffect(() => {
    const unsub = subscribeToMatches(setMatches);
    return unsub;
  }, []);

  // Refresca cada 60s para que pasen del estado "soon" al "live" sin recargar.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  // Activación del modo demo vía `?demo=tv`. Leemos `window.location` después
  // del montaje para no usar `useSearchParams` (que obligaría a envolver en
  // un `<Suspense>` desde fuera).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const p = new URLSearchParams(window.location.search);
    setDemoMode(p.get("demo") === "tv");
  }, []);

  const realItems = matches
    .filter(isTveMatch)
    .map((m) => classify(m, now))
    .filter((x): x is BannerItem => x !== null);

  const items = (demoMode ? [...demoItems(), ...realItems] : realItems).sort(
    (a, b) => {
      // Live primero, luego los que empiezan antes.
      if (a.kind !== b.kind) return a.kind === "live" ? -1 : 1;
      return a.match.kickoffUtc.toMillis() - b.match.kickoffUtc.toMillis();
    }
  );

  if (items.length === 0) return null;

  return (
    <div className="space-y-2">
      {items.map((it) => (
        <BannerRow key={it.match.id} item={it} />
      ))}
    </div>
  );
}

function BannerRow({ item }: { item: BannerItem }) {
  const { match, kind, minutes, demo } = item;
  const isLive = kind === "live";

  return (
    <Link
      href={demo ? "#" : ROUTES.worldCup}
      className="block"
      aria-disabled={demo}
      onClick={demo ? (e) => e.preventDefault() : undefined}
    >
      <Card
        className={cn(
          "overflow-hidden border-l-4 transition-colors hover:bg-accent/40",
          isLive
            ? "border-l-red-500 bg-red-500/5"
            : "border-l-amber-500 bg-amber-500/5"
        )}
      >
        <CardContent className="flex items-center gap-3 p-3 sm:p-4">
          <div
            className={cn(
              "flex h-10 w-10 shrink-0 items-center justify-center rounded-full",
              isLive
                ? "bg-red-500/15 text-red-600 dark:text-red-400"
                : "bg-amber-500/15 text-amber-600 dark:text-amber-400"
            )}
          >
            {isLive ? (
              <Radio className="h-5 w-5 animate-pulse" aria-hidden />
            ) : (
              <Tv className="h-5 w-5" aria-hidden />
            )}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider">
              {isLive ? (
                <span className="rounded-full bg-red-500/20 px-2 py-0.5 text-red-600 dark:text-red-400">
                  🔴 En vivo
                </span>
              ) : (
                <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-amber-600 dark:text-amber-400">
                  Empieza pronto
                </span>
              )}
              {demo && (
                <span className="rounded-full bg-sky-500/20 px-2 py-0.5 text-sky-600 dark:text-sky-400">
                  🧪 Demo
                </span>
              )}
              <span className="text-muted-foreground">·</span>
              <span className="text-muted-foreground">La 1 · TVE</span>
              <span className="text-muted-foreground">·</span>
              <span className="text-muted-foreground">
                {isLive
                  ? minutes === 0
                    ? "ahora mismo"
                    : `hace ${minutes} min`
                  : minutes <= 1
                  ? "en 1 min"
                  : `en ${minutes} min`}
              </span>
            </div>
            <p className="mt-0.5 truncate text-sm font-semibold sm:text-base">
              <TeamFlag name={match.homeLabel} className="mr-1" />
              {match.homeLabel}{" "}
              {match.result && (
                <span className="font-mono font-bold">
                  {match.result.homeGoals}–{match.result.awayGoals}
                </span>
              )}{" "}
              <span className="text-muted-foreground">vs</span>{" "}
              <TeamFlag name={match.awayLabel} className="mr-1" />
              {match.awayLabel}
            </p>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
