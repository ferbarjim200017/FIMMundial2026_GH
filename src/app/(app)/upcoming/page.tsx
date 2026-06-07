"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import {
  CalendarClock,
  Clock,
  Copy,
  Radio,
  Receipt,
  Tv,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { BetStatusBadge } from "@/components/bets/bet-status-badge";
import { subscribeToBets } from "@/features/bets/bets.service";
import { subscribeToMatches } from "@/features/matches/matches.service";
import { subscribeToRanking } from "@/features/users/users.service";
import { bookmakerLabel } from "@/features/bets/bets.utils";
import { isTveMatch } from "@/features/matches/tve-matches";
import { ROUTES } from "@/lib/constants";
import {
  cn,
  formatCurrency,
  initials,
} from "@/lib/utils";
import type { AppUser, Bet, Match } from "@/types/domain";

const LIVE_WINDOW_MS = 130 * 60 * 1000;
const UPCOMING_WINDOW_MS = 72 * 60 * 60 * 1000;

function matchKickoffMs(m: Match): number {
  return m.kickoffUtc.toMillis();
}

/** Devuelve la fecha de kickoff más temprana entre los partidos vinculados a
 *  una apuesta. Si no hay ninguno mapeado, retorna `null` y la apuesta se
 *  trata como "sin fecha conocida" (irá al final de la lista). */
function earliestKickoff(
  bet: Bet,
  matchById: Map<string, Match>
): number | null {
  const ids: string[] = [];
  if (bet.matchId) ids.push(bet.matchId);
  if (bet.matchIds) ids.push(...bet.matchIds);
  let min = Infinity;
  for (const id of ids) {
    const m = matchById.get(id);
    if (m) min = Math.min(min, matchKickoffMs(m));
  }
  return Number.isFinite(min) ? min : null;
}

function formatKickoffLabel(ms: number, now: number): string {
  const diffMin = Math.round((ms - now) / 60000);
  if (diffMin <= -LIVE_WINDOW_MS / 60000) {
    return format(new Date(ms), "d MMM HH:mm", { locale: es });
  }
  if (diffMin < 0) return `comenzó hace ${Math.abs(diffMin)} min`;
  if (diffMin < 60) return diffMin <= 1 ? "en 1 min" : `en ${diffMin} min`;
  if (diffMin < 24 * 60) {
    const h = Math.floor(diffMin / 60);
    const m = diffMin % 60;
    return m === 0 ? `en ${h} h` : `en ${h} h ${m} min`;
  }
  return format(new Date(ms), "EEE d MMM HH:mm", { locale: es });
}

export default function UpcomingPage() {
  const [bets, setBets] = useState<Bet[] | null>(null);
  const [matches, setMatches] = useState<Match[] | null>(null);
  const [usersById, setUsersById] = useState<Record<string, AppUser>>({});
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const unsubBets = subscribeToBets({}, setBets);
    const unsubMatches = subscribeToMatches(setMatches);
    const unsubUsers = subscribeToRanking((users) => {
      const map: Record<string, AppUser> = {};
      for (const u of users) map[u.uid] = u;
      setUsersById(map);
    });
    return () => {
      unsubBets();
      unsubMatches();
      unsubUsers();
    };
  }, []);

  // Tic-tac cada 60s para que los filtros "ahora ± X" se refresquen sin que
  // dependa de cargar la página de nuevo.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const matchById = useMemo(() => {
    const map = new Map<string, Match>();
    for (const m of matches ?? []) map.set(m.id, m);
    return map;
  }, [matches]);

  // ── Sección 1: apuestas en curso, ordenadas por kickoff más próximo ──
  const pendingBets = useMemo(() => {
    if (!bets) return null;
    return bets
      .filter((b) => b.status === "pending")
      .map((b) => ({ bet: b, kickoff: earliestKickoff(b, matchById) }))
      .sort((a, b) => {
        // Las que tienen fecha van primero, ordenadas asc; las sin fecha al final.
        if (a.kickoff === null && b.kickoff === null) return 0;
        if (a.kickoff === null) return 1;
        if (b.kickoff === null) return -1;
        return a.kickoff - b.kickoff;
      });
  }, [bets, matchById]);

  // ── Sección 2: partidos en directo ahora ──
  const liveMatches = useMemo(() => {
    if (!matches) return null;
    return matches
      .filter((m) => {
        if (m.status === "finished") return false;
        const t = matchKickoffMs(m);
        return t <= now && now <= t + LIVE_WINDOW_MS;
      })
      .sort((a, b) => matchKickoffMs(a) - matchKickoffMs(b));
  }, [matches, now]);

  // ── Sección 3: próximos partidos (siguientes 72h) ──
  const upcomingMatches = useMemo(() => {
    if (!matches) return null;
    return matches
      .filter((m) => {
        if (m.status === "finished") return false;
        const t = matchKickoffMs(m);
        return t > now && t - now <= UPCOMING_WINDOW_MS;
      })
      .sort((a, b) => matchKickoffMs(a) - matchKickoffMs(b));
  }, [matches, now]);

  const loading = bets === null || matches === null;
  const isEmpty =
    !loading &&
    (pendingBets?.length ?? 0) === 0 &&
    (liveMatches?.length ?? 0) === 0 &&
    (upcomingMatches?.length ?? 0) === 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1">
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <CalendarClock className="h-5 w-5 text-primary" />
          Próximos eventos
        </h1>
        <p className="text-sm text-muted-foreground">
          Apuestas en curso del grupo, partidos en directo y todo lo que se
          juega en las próximas 72 horas. Se actualiza solo.
        </p>
      </div>

      {loading && (
        <Card>
          <CardContent className="px-6 py-8 text-center text-sm text-muted-foreground">
            Cargando…
          </CardContent>
        </Card>
      )}

      {isEmpty && (
        <Card>
          <CardContent className="px-6 py-8 text-center text-sm text-muted-foreground">
            No hay apuestas en curso ni partidos en los próximos 3 días.
          </CardContent>
        </Card>
      )}

      {liveMatches && liveMatches.length > 0 && (
        <SectionCard
          title="En vivo ahora"
          icon={<Radio className="h-4 w-4 animate-pulse text-red-500" />}
          description={`${liveMatches.length} partido${liveMatches.length === 1 ? "" : "s"} jugándose ahora mismo.`}
        >
          <div className="space-y-2">
            {liveMatches.map((m) => (
              <MatchRow key={m.id} match={m} now={now} live />
            ))}
          </div>
        </SectionCard>
      )}

      {pendingBets && pendingBets.length > 0 && (
        <SectionCard
          title="Apuestas en curso"
          icon={<Receipt className="h-4 w-4 text-primary" />}
          description={`${pendingBets.length} apuesta${pendingBets.length === 1 ? "" : "s"} pendiente${pendingBets.length === 1 ? "" : "s"} de liquidar.`}
        >
          <div className="space-y-2">
            {pendingBets.map(({ bet, kickoff }) => (
              <BetRow
                key={bet.id}
                bet={bet}
                user={usersById[bet.userId] ?? null}
                kickoffMs={kickoff}
                now={now}
              />
            ))}
          </div>
        </SectionCard>
      )}

      {upcomingMatches && upcomingMatches.length > 0 && (
        <SectionCard
          title="Próximos partidos (72 h)"
          icon={<Tv className="h-4 w-4 text-primary" />}
          description={`${upcomingMatches.length} partido${upcomingMatches.length === 1 ? "" : "s"} en las próximas 72 horas.`}
        >
          <div className="space-y-2">
            {upcomingMatches.map((m) => (
              <MatchRow key={m.id} match={m} now={now} />
            ))}
          </div>
        </SectionCard>
      )}
    </div>
  );
}

function SectionCard({
  title,
  icon,
  description,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          {icon}
          {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function MatchRow({
  match,
  now,
  live = false,
}: {
  match: Match;
  now: number;
  live?: boolean;
}) {
  const tve = isTveMatch(match);
  const kickoffMs = matchKickoffMs(match);
  return (
    <Link
      href={ROUTES.worldCup}
      className={cn(
        "block rounded-md border bg-card p-3 transition-colors hover:bg-accent/40",
        live && "border-red-500/40 bg-red-500/5"
      )}
    >
      <div className="flex items-center gap-3">
        <div
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
            live
              ? "bg-red-500/15 text-red-600 dark:text-red-400"
              : "bg-muted text-muted-foreground"
          )}
        >
          {live ? <Radio className="h-4 w-4 animate-pulse" /> : <Clock className="h-4 w-4" />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">
            {match.homeLabel}{" "}
            {match.result && (
              <span className="font-mono font-bold">
                {match.result.homeGoals}–{match.result.awayGoals}
              </span>
            )}{" "}
            <span className="text-muted-foreground">vs</span> {match.awayLabel}
          </p>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
            <span>{formatKickoffLabel(kickoffMs, now)}</span>
            {match.venue && (
              <>
                <span aria-hidden>·</span>
                <span className="truncate">{match.venue}</span>
              </>
            )}
            {tve && (
              <>
                <span aria-hidden>·</span>
                <span className="font-semibold text-amber-600 dark:text-amber-400">
                  La 1 · TVE
                </span>
              </>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}

function BetRow({
  bet,
  user,
  kickoffMs,
  now,
}: {
  bet: Bet;
  user: AppUser | null;
  kickoffMs: number | null;
  now: number;
}) {
  const displayName = user?.username ?? "Usuario";
  return (
    <div className="flex items-start gap-3 rounded-md border bg-card p-3">
      <Link href={user ? ROUTES.profile(user.uid) : "#"} className="shrink-0">
        <Avatar className="h-9 w-9">
          {user?.avatarUrl && <AvatarImage src={user.avatarUrl} />}
          <AvatarFallback>{initials(displayName)}</AvatarFallback>
        </Avatar>
      </Link>

      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
          <Link
            href={user ? ROUTES.profile(user.uid) : "#"}
            className="font-semibold hover:underline"
          >
            {displayName}
          </Link>
          <BetStatusBadge status={bet.status} />
          {bet.isFreebet && (
            <span className="rounded-full bg-purple-600/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-purple-600 dark:text-purple-400">
              Freebet
            </span>
          )}
        </div>

        <p className="truncate text-sm font-medium">{bet.matchLabel}</p>
        <p className="truncate text-xs text-muted-foreground">
          {bet.selection} @ {bet.odds.toFixed(2)} ·{" "}
          {formatCurrency(bet.stake)} ·{" "}
          {bookmakerLabel(bet.bookmaker, bet.bookmakerLabel)}
        </p>

        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
          {kickoffMs !== null && (
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {formatKickoffLabel(kickoffMs, now)}
            </span>
          )}
          {kickoffMs !== null && <span aria-hidden>·</span>}
          <Link
            href={`${ROUTES.bets}/new?from=${bet.id}`}
            className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-medium text-primary hover:bg-primary/10"
            title="Copiar esta apuesta a una nueva"
          >
            <Copy className="h-3 w-3" />
            Copiar
          </Link>
        </div>
      </div>
    </div>
  );
}
