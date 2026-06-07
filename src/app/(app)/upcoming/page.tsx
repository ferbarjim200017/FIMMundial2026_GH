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
import { useAuth } from "@/features/auth/auth.context";
import { subscribeToBets } from "@/features/bets/bets.service";
import { subscribeToMatches } from "@/features/matches/matches.service";
import { bookmakerLabel } from "@/features/bets/bets.utils";
import { isTveMatch } from "@/features/matches/tve-matches";
import { ROUTES } from "@/lib/constants";
import {
  cn,
  formatCurrency,
  initials,
} from "@/lib/utils";
import type { AppUser, Bet, Match } from "@/types/domain";

const DAY_MS = 24 * 60 * 60 * 1000;
const LIVE_WINDOW_MS = 130 * 60 * 1000;
/** Ventana fija desde el día seleccionado: 3 días (el propio + 2 más). */
const WINDOW_DAYS = 3;

function matchKickoffMs(m: Match): number {
  return m.kickoffUtc.toMillis();
}

function startOfDayMs(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Devuelve la fecha de kickoff más temprana entre los partidos vinculados a
 *  una apuesta. Si no hay ninguno mapeado, retorna `null`. */
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

interface DayChipInfo {
  ms: number;
  day: number;
  weekday: string;
  disabled: boolean;
  isToday: boolean;
}

/** Genera la tira de chips para todos los días del mes actual. Los días
 *  anteriores a hoy quedan deshabilitados ("lo antiguo ya nunca"). */
function buildDayStrip(nowMs: number): DayChipInfo[] {
  const todayStart = startOfDayMs(nowMs);
  const d = new Date(todayStart);
  const year = d.getFullYear();
  const month = d.getMonth();
  const lastDay = new Date(year, month + 1, 0).getDate();
  const out: DayChipInfo[] = [];
  for (let day = 1; day <= lastDay; day++) {
    const dayMs = new Date(year, month, day).getTime();
    out.push({
      ms: dayMs,
      day,
      weekday: format(new Date(dayMs), "EEE", { locale: es }),
      disabled: dayMs < todayStart,
      isToday: dayMs === todayStart,
    });
  }
  return out;
}

export default function UpcomingPage() {
  const { appUser } = useAuth();
  const [bets, setBets] = useState<Bet[] | null>(null);
  const [matches, setMatches] = useState<Match[] | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [selectedDayMs, setSelectedDayMs] = useState<number>(() =>
    startOfDayMs(Date.now())
  );

  // Solo apuestas del usuario actual.
  useEffect(() => {
    if (!appUser) return;
    const unsub = subscribeToBets({ userId: appUser.uid }, setBets);
    return unsub;
  }, [appUser]);

  useEffect(() => {
    const unsub = subscribeToMatches(setMatches);
    return unsub;
  }, []);

  // Tic cada 60s para reevaluar las ventanas temporales (en vivo, próximos…).
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  // Si pasa la medianoche y el día seleccionado era el de ayer, lo subimos
  // automáticamente a "hoy" para no dejar al usuario en un día deshabilitado.
  useEffect(() => {
    const todayStart = startOfDayMs(now);
    if (selectedDayMs < todayStart) setSelectedDayMs(todayStart);
  }, [now, selectedDayMs]);

  const todayStart = startOfDayMs(now);
  const windowStart = selectedDayMs;
  const windowEnd = selectedDayMs + WINDOW_DAYS * DAY_MS;
  const isViewingToday = selectedDayMs === todayStart;

  const dayStrip = useMemo(() => buildDayStrip(now), [now]);

  const matchById = useMemo(() => {
    const map = new Map<string, Match>();
    for (const m of matches ?? []) map.set(m.id, m);
    return map;
  }, [matches]);

  // ── Mis apuestas pendientes dentro de la ventana ──
  const myPendingBets = useMemo(() => {
    if (!bets || !appUser) return null;
    return bets
      .filter((b) => b.status === "pending")
      .map((b) => ({ bet: b, kickoff: earliestKickoff(b, matchById) }))
      .filter(({ kickoff }) => {
        if (kickoff === null) return false; // sin fecha conocida → fuera del filtro por día
        return kickoff >= windowStart && kickoff < windowEnd;
      })
      .sort((a, b) => (a.kickoff! - b.kickoff!));
  }, [bets, appUser, matchById, windowStart, windowEnd]);

  // ── En vivo: solo cuando estás viendo el día de hoy ──
  const liveMatches = useMemo(() => {
    if (!matches || !isViewingToday) return null;
    return matches
      .filter((m) => {
        if (m.status === "finished") return false;
        const t = matchKickoffMs(m);
        return t <= now && now <= t + LIVE_WINDOW_MS;
      })
      .sort((a, b) => matchKickoffMs(a) - matchKickoffMs(b));
  }, [matches, now, isViewingToday]);

  // ── Próximos partidos dentro de la ventana ──
  const upcomingMatches = useMemo(() => {
    if (!matches) return null;
    return matches
      .filter((m) => {
        if (m.status === "finished") return false;
        const t = matchKickoffMs(m);
        // Excluye lo "en vivo" del bloque de "próximos" cuando estás en hoy,
        // para que no se duplique entre ambas secciones.
        if (isViewingToday && t <= now && now <= t + LIVE_WINDOW_MS) return false;
        return t >= windowStart && t < windowEnd;
      })
      .sort((a, b) => matchKickoffMs(a) - matchKickoffMs(b));
  }, [matches, isViewingToday, now, windowStart, windowEnd]);

  const loading = bets === null || matches === null;
  const isEmpty =
    !loading &&
    (myPendingBets?.length ?? 0) === 0 &&
    (liveMatches?.length ?? 0) === 0 &&
    (upcomingMatches?.length ?? 0) === 0;

  const windowLabel = `${format(new Date(windowStart), "EEE d MMM", { locale: es })} → ${format(new Date(windowEnd - DAY_MS), "EEE d MMM", { locale: es })}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1">
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <CalendarClock className="h-5 w-5 text-primary" />
          Próximos eventos
        </h1>
        <p className="text-sm text-muted-foreground">
          Tus apuestas pendientes, partidos en directo y los siguientes 3 días
          desde el día que elijas.
        </p>
      </div>

      {/* ─── Tira de días del mes ─── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Elige día</CardTitle>
          <CardDescription>
            Cargando ventana: <span className="font-medium">{windowLabel}</span>{" "}
            ({WINDOW_DAYS} días)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-1.5">
            {dayStrip.map((d) => (
              <DayChip
                key={d.ms}
                info={d}
                selected={d.ms === selectedDayMs}
                onSelect={() => setSelectedDayMs(d.ms)}
              />
            ))}
          </div>
        </CardContent>
      </Card>

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
            No hay eventos en este rango.
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

      {myPendingBets && myPendingBets.length > 0 && (
        <SectionCard
          title="Mis apuestas pendientes"
          icon={<Receipt className="h-4 w-4 text-primary" />}
          description={`${myPendingBets.length} apuesta${myPendingBets.length === 1 ? "" : "s"} tuya${myPendingBets.length === 1 ? "" : "s"} en este rango.`}
        >
          <div className="space-y-2">
            {myPendingBets.map(({ bet, kickoff }) => (
              <BetRow
                key={bet.id}
                bet={bet}
                user={appUser ?? null}
                kickoffMs={kickoff}
                now={now}
              />
            ))}
          </div>
        </SectionCard>
      )}

      {upcomingMatches && upcomingMatches.length > 0 && (
        <SectionCard
          title="Próximos partidos"
          icon={<Tv className="h-4 w-4 text-primary" />}
          description={`${upcomingMatches.length} partido${upcomingMatches.length === 1 ? "" : "s"} en el rango.`}
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

function DayChip({
  info,
  selected,
  onSelect,
}: {
  info: DayChipInfo;
  selected: boolean;
  onSelect: () => void;
}) {
  const { day, weekday, disabled, isToday } = info;
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onSelect}
      disabled={disabled}
      aria-pressed={selected}
      title={disabled ? "Día pasado" : isToday ? "Hoy" : `Día ${day}`}
      className={cn(
        "flex w-12 flex-col items-center rounded-md border px-1.5 py-1 transition-colors",
        disabled && "cursor-not-allowed opacity-40",
        !disabled && !selected && "hover:bg-accent/40",
        selected
          ? "border-primary bg-primary text-primary-foreground"
          : isToday
          ? "border-primary/60 bg-card ring-2 ring-primary/20"
          : "border-border bg-card"
      )}
    >
      <span
        className={cn(
          "text-[10px] font-semibold uppercase tracking-wider",
          selected ? "text-primary-foreground/80" : "text-muted-foreground"
        )}
      >
        {weekday}
      </span>
      <span className="font-mono text-base font-bold leading-none">{day}</span>
    </button>
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
  const displayName = user?.username ?? "Tú";
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
