"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Crown,
  TrendingUp,
  TrendingDown,
  Target,
  Coins,
  Layers,
  Flame,
  Receipt,
  Gift,
  Shield,
  Bomb,
  Percent,
  Snowflake,
  Dices,
  Skull,
  Wallet,
  Calendar,
  Sunrise,
  Moon,
  type LucideIcon,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { TeamFlag } from "@/components/matches/team-flag";
import { subscribeToAllBets } from "@/features/bets/bets.service";
import { subscribeToMatches } from "@/features/matches/matches.service";
import { resolveMatchLabels } from "@/features/matches/bracket-resolver";
import { useGroup } from "@/features/groups/groups.context";
import {
  betInGroup,
  betMatchIds,
  betOutcome,
  betShareCount,
  bookmakerLabel,
  computeCashSummary,
  computeUserStats,
  round2,
} from "@/features/bets/bets.utils";
import { isFirebaseConfigured } from "@/lib/firebase/client";
import { cn, formatCurrency, formatPercent, initials, profitClass } from "@/lib/utils";
import type { AppUser, Bet, Match } from "@/types/domain";

// ── Helpers de presentación ──────────────────────────────────────────────

function medal(i: number): string {
  return ["🥇", "🥈", "🥉"][i] ?? `${i + 1}.`;
}

function formatDayShort(ms: number): string {
  return new Date(ms).toLocaleDateString("es-ES", {
    weekday: "short",
    day: "2-digit",
    month: "short",
  });
}

/** Círculo con las iniciales del jugador (sin fotos, como pediste). */
function Initial({ name }: { name: string }) {
  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary">
      {initials(name)}
    </span>
  );
}

/** Banderas (local arriba, visitante abajo) para las entradas de partido. */
function matchFlags(home?: string, away?: string): ReactNode {
  if (!home || !away) return undefined;
  return (
    <span className="flex h-8 w-8 shrink-0 flex-col items-center justify-center gap-0.5 rounded-md bg-muted/50">
      <TeamFlag name={home} className="h-3 w-[18px]" />
      <TeamFlag name={away} className="h-3 w-[18px]" />
    </span>
  );
}

interface PodiumEntry {
  name: string;
  detail?: string;
  value: string;
  valueClass?: string;
  /** Elemento a la izquierda del nombre (banderas, etc.). Si no se pasa, se usa
   *  el círculo con las iniciales del nombre. */
  leading?: ReactNode;
  /** Contenido extra que se muestra DEBAJO de la fila (p. ej. el desglose de
   *  jugadores de un partido). */
  extra?: ReactNode;
}

/**
 * Tarjeta de podio reutilizable (sirve tanto para records de apuestas como
 * para rankings de jugadores y partidos). Muestra hasta 3 entradas con su
 * medalla y resalta el 1.º.
 */
function PodiumCard({
  title,
  icon: Icon,
  accent,
  entries,
  emptyText,
}: {
  title: string;
  icon: LucideIcon;
  accent?: string;
  entries: PodiumEntry[];
  emptyText?: string;
}) {
  return (
    <Card className="transition-shadow hover:shadow-md">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <span
            className={cn(
              "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-muted/60",
              accent
            )}
          >
            <Icon className="h-4 w-4" />
          </span>
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">
        {entries.length === 0 ? (
          <p className="px-1 py-2 text-xs text-muted-foreground">
            {emptyText ?? "Sin datos todavía."}
          </p>
        ) : (
          entries.map((e, i) => (
            <div
              key={i}
              className={cn(
                "rounded-lg transition-colors",
                i === 0
                  ? "bg-amber-400/10 ring-1 ring-amber-400/20"
                  : "hover:bg-accent/30"
              )}
            >
              <div className="flex items-center gap-2.5 px-2 py-1.5">
                <span className="w-6 shrink-0 text-center text-base leading-none">
                  {medal(i)}
                </span>
                {e.leading ?? <Initial name={e.name} />}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{e.name}</p>
                  {e.detail && (
                    <p className="truncate text-xs text-muted-foreground">
                      {e.detail}
                    </p>
                  )}
                </div>
                <span
                  className={cn(
                    "shrink-0 font-mono text-sm font-semibold",
                    e.valueClass
                  )}
                >
                  {e.value}
                </span>
              </div>
              {e.extra && <div className="px-2 pb-2 pl-10">{e.extra}</div>}
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

/** Desglose del top-3 de jugadores de un partido (con su beneficio/pérdida en
 *  ese partido). Se muestra bajo cada partido en "Donde más se ha ganado/perdido". */
function MatchPlayerBreakdown({
  players,
  positive,
  nameOf,
}: {
  players: { uid: string; profit: number }[];
  positive: boolean;
  nameOf: (uid: string) => string;
}) {
  if (players.length === 0) return null;
  return (
    <ul
      className={cn(
        "space-y-0.5 border-l-2 pl-2",
        positive ? "border-emerald-500/30" : "border-red-500/30"
      )}
    >
      {players.map((p) => (
        <li
          key={p.uid}
          className="flex items-center justify-between gap-2 text-[11px]"
        >
          <span className="truncate text-muted-foreground">{nameOf(p.uid)}</span>
          <span
            className={cn(
              "shrink-0 font-mono font-medium",
              positive ? "text-profit" : "text-loss"
            )}
          >
            {p.profit > 0 ? "+" : ""}
            {formatCurrency(p.profit)}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Chip de estadística para la cabecera (apuestas, dinero jugado, beneficio). */
function HeroStat({
  label,
  value,
  valueClass,
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="rounded-lg border bg-card/60 px-3 py-1.5 text-center">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className={cn("font-mono text-base font-bold tabular-nums", valueClass)}>
        {value}
      </p>
    </div>
  );
}

function Metric({
  label,
  value,
  valueClass,
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="rounded-md border bg-muted/20 px-2.5 py-1.5">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className={cn("font-mono text-sm font-semibold", valueClass)}>{value}</p>
    </div>
  );
}

function BetHighlight({ label, bet }: { label: string; bet: Bet }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-md border px-2.5 py-1.5">
      <div className="min-w-0">
        <p className="text-[11px] text-muted-foreground">{label}</p>
        <p className="truncate text-xs">{bet.selection || bet.matchLabel || "—"}</p>
      </div>
      <span
        className={cn(
          "shrink-0 font-mono text-sm font-semibold",
          profitClass(bet.profit ?? 0)
        )}
      >
        {formatCurrency(bet.profit ?? 0)}
      </span>
    </div>
  );
}

// ── Tipos de cálculo ─────────────────────────────────────────────────────

interface PlayerAgg {
  user: AppUser;
  betsCount: number;
  totalStaked: number;
  best: Bet | null;
  worst: Bet | null;
  worstStreak: number;
  stats: ReturnType<typeof computeUserStats>;
}

/** Racha más larga de DERROTAS seguidas. Simétrica a `bestStreak` (victorias):
 *  cuenta el resultado efectivo (un cashout por debajo del stake cuenta como
 *  derrota, igual que en el resto de stats). */
function worstLossStreak(bets: Bet[]): number {
  const chrono = bets
    .filter((b) => {
      const o = betOutcome(b);
      return o === "won" || o === "lost";
    })
    .sort(
      (a, b) =>
        (a.settledAt?.toMillis() ?? a.createdAt.toMillis()) -
        (b.settledAt?.toMillis() ?? b.createdAt.toMillis())
    );
  let worst = 0;
  let run = 0;
  for (const b of chrono) {
    if (betOutcome(b) === "lost") {
      run += 1;
      if (run > worst) worst = run;
    } else {
      run = 0;
    }
  }
  return worst;
}

/** Nº mínimo de apuestas decididas para entrar en el podio de % de acierto
 *  (evita que alguien con 1 sola apuesta ganada salga con 100%). */
const MIN_DECIDED_FOR_HITRATE = 5;

// ── Página ───────────────────────────────────────────────────────────────

export default function HallOfFamePage() {
  const [allBets, setAllBets] = useState<Bet[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const { activeGroup, groupMembers, memberUids } = useGroup();

  useEffect(
    () => subscribeToMatches(setMatches, () => setMatches([])),
    []
  );

  // Reutiliza el listener COMPARTIDO de apuestas (ya vivo por el keep-alive del
  // layout): este salón de la fama no abre nada nuevo en Firestore, solo hace
  // cuentas sobre lo que ya está en memoria. Cero lecturas/escrituras.
  useEffect(() => {
    if (!isFirebaseConfigured) {
      setAllBets([]);
      return;
    }
    return subscribeToAllBets(setAllBets);
  }, []);

  // Apuestas del grupo activo y de sus miembros.
  const bets = useMemo(() => {
    if (!activeGroup) return [];
    return allBets.filter(
      (b) => betInGroup(b, activeGroup.id) && memberUids.has(b.userId)
    );
  }, [allBets, activeGroup, memberUids]);

  const usersById = useMemo(() => {
    const map: Record<string, AppUser> = {};
    for (const u of groupMembers) map[u.uid] = u;
    return map;
  }, [groupMembers]);

  // Caja por jugador: ingresos, retiradas y NETO RETIRADO (retirado − ingresado).
  // Positivo = se ha llevado más dinero del que metió (bueno, es su dinero).
  const cashByUid = useMemo(() => {
    const map = new Map<
      string,
      { deposits: number; withdrawals: number; netWithdrawn: number }
    >();
    for (const u of groupMembers) {
      const c = computeCashSummary(u, activeGroup?.id);
      map.set(u.uid, {
        deposits: c.deposits,
        withdrawals: c.withdrawals,
        netWithdrawn: round2(c.withdrawals - c.deposits),
      });
    }
    return map;
  }, [groupMembers, activeGroup]);

  // Podio "Más dinero retirado": jugadores ordenados por neto retirado (desc).
  const topWithdrawn = useMemo(
    () =>
      groupMembers
        .map((u) => ({
          user: u,
          ...(cashByUid.get(u.uid) ?? {
            deposits: 0,
            withdrawals: 0,
            netWithdrawn: 0,
          }),
        }))
        .filter((p) => p.deposits > 0 || p.withdrawals > 0)
        .sort((a, b) => b.netWithdrawn - a.netWithdrawn)
        .slice(0, 3),
    [groupMembers, cashByUid]
  );

  // Partidos con los huecos de eliminatoria ya resueltos al equipo real.
  const matchById = useMemo(() => {
    const map = new Map<string, Match>();
    for (const m of resolveMatchLabels(matches)) map.set(m.id, m);
    return map;
  }, [matches]);

  // ── Records por PARTIDO ──
  // Agregamos por partido: dinero apostado (solo dinero real), beneficio,
  // nº de apuestas y jugadores distintos. Los combos reparten su stake/beneficio
  // entre sus partidos; las apuestas a futuro sin partido se ignoran.
  const matchRecords = useMemo(() => {
    const byMatch = new Map<
      string,
      {
        stake: number;
        profit: number;
        count: number;
        users: Set<string>;
        profitByUser: Map<string, number>;
      }
    >();
    for (const b of bets) {
      const ids = betMatchIds(b);
      if (ids.length === 0) continue;
      const share = betShareCount(b);
      const stakeShare = b.isFreebet ? 0 : b.stake / share;
      const profitShare = b.status !== "pending" ? (b.profit ?? 0) / share : 0;
      for (const id of ids) {
        const cur =
          byMatch.get(id) ??
          {
            stake: 0,
            profit: 0,
            count: 0,
            users: new Set<string>(),
            profitByUser: new Map<string, number>(),
          };
        cur.stake += stakeShare;
        cur.profit += profitShare;
        cur.count += 1;
        cur.users.add(b.userId);
        cur.profitByUser.set(
          b.userId,
          (cur.profitByUser.get(b.userId) ?? 0) + profitShare
        );
        byMatch.set(id, cur);
      }
    }
    const labelOf = (id: string): string => {
      const m = matchById.get(id);
      if (m) return `${m.homeLabel} vs ${m.awayLabel}`;
      const b = bets.find((x) => betMatchIds(x).includes(id));
      return b?.matchLabel ?? "Partido";
    };
    const list = [...byMatch.entries()].map(([id, v]) => {
      const m = matchById.get(id);
      // Desglose por jugador en este partido: top-3 ganadores y top-3
      // perdedores (con su beneficio/pérdida ya repartido en combos).
      const players = [...v.profitByUser.entries()].map(([uid, p]) => ({
        uid,
        profit: round2(p),
      }));
      const topWinners = players
        .filter((p) => p.profit > 0)
        .sort((a, b) => b.profit - a.profit)
        .slice(0, 3);
      const topLosers = players
        .filter((p) => p.profit < 0)
        .sort((a, b) => a.profit - b.profit)
        .slice(0, 3);
      return {
        id,
        label: labelOf(id),
        home: m?.homeLabel,
        away: m?.awayLabel,
        stake: round2(v.stake),
        profit: round2(v.profit),
        count: v.count,
        players: v.users.size,
        topWinners,
        topLosers,
      };
    });
    return {
      mostStaked: [...list].sort((a, b) => b.stake - a.stake).slice(0, 3),
      mostBets: [...list].sort((a, b) => b.count - a.count).slice(0, 3),
      mostWon: [...list]
        .filter((m) => m.profit > 0)
        .sort((a, b) => b.profit - a.profit)
        .slice(0, 3),
      mostLost: [...list]
        .filter((m) => m.profit < 0)
        .sort((a, b) => a.profit - b.profit)
        .slice(0, 3),
    };
  }, [bets, matchById]);

  // Resumen rápido del grupo para la cabecera.
  const groupSummary = useMemo(() => {
    let stake = 0;
    let profit = 0;
    for (const b of bets) {
      if (!b.isFreebet) stake += b.stake;
      if (b.status !== "pending") profit += b.profit ?? 0;
    }
    return { count: bets.length, stake: round2(stake), profit: round2(profit) };
  }, [bets]);

  // Días más movidos (por dinero jugado), por fecha de la apuesta.
  const topDays = useMemo(() => {
    const byDay = new Map<
      string,
      { ms: number; stake: number; count: number; users: Set<string> }
    >();
    for (const b of bets) {
      const d = b.createdAt.toDate();
      const dayMs = new Date(
        d.getFullYear(),
        d.getMonth(),
        d.getDate()
      ).getTime();
      const cur =
        byDay.get(String(dayMs)) ??
        { ms: dayMs, stake: 0, count: 0, users: new Set<string>() };
      if (!b.isFreebet) cur.stake += b.stake;
      cur.count += 1;
      cur.users.add(b.userId);
      byDay.set(String(dayMs), cur);
    }
    return [...byDay.values()]
      .sort((a, b) => b.stake - a.stake)
      .slice(0, 3);
  }, [bets]);

  // Madrugadores (apuestas de 06:00 a 09:59) y búhos nocturnos (de 22:00 a
  // 05:59): se rankea a cada jugador por el NÚMERO de apuestas registradas en
  // esa franja horaria. (La media de hora anterior mezclaba madrugada y noche
  // y daba resultados sin sentido.)
  const timeRecords = useMemo(() => {
    const isNight = (h: number) => h >= 22 || h < 6; // 22:00–05:59
    const isMorning = (h: number) => h >= 6 && h < 10; // 06:00–09:59
    const byUser = new Map<string, { night: number; morning: number }>();
    for (const b of bets) {
      const h = (b.addedAt ?? b.createdAt).toDate().getHours();
      const cur = byUser.get(b.userId) ?? { night: 0, morning: 0 };
      if (isNight(h)) cur.night += 1;
      if (isMorning(h)) cur.morning += 1;
      byUser.set(b.userId, cur);
    }
    const rows = [...byUser.entries()]
      .map(([uid, v]) => ({ user: usersById[uid] ?? null, ...v }))
      .filter((x): x is { user: AppUser; night: number; morning: number } =>
        Boolean(x.user)
      );
    return {
      earliest: rows
        .filter((r) => r.morning > 0)
        .sort((a, b) => b.morning - a.morning)
        .slice(0, 3),
      latest: rows
        .filter((r) => r.night > 0)
        .sort((a, b) => b.night - a.night)
        .slice(0, 3),
    };
  }, [bets, usersById]);

  const nameOf = (uid: string) => usersById[uid]?.username ?? "—";
  const betDetail = (b: Bet) =>
    `${b.selection || b.matchLabel || "—"} · ${bookmakerLabel(
      b.bookmaker,
      b.bookmakerLabel
    )} · cuota ${b.odds.toFixed(2)}`;

  // ── Records por apuesta (Top 3) ──
  const records = useMemo(() => {
    const settled = bets.filter((b) => b.status !== "pending");

    const topProfit = [...settled]
      .filter((b) => (b.profit ?? 0) > 0)
      .sort((a, b) => (b.profit ?? 0) - (a.profit ?? 0))
      .slice(0, 3);

    const topLoss = [...settled]
      .filter((b) => (b.profit ?? 0) < 0)
      .sort((a, b) => (a.profit ?? 0) - (b.profit ?? 0))
      .slice(0, 3);

    // "Acertada" = ganada DE VERDAD (status won). Un cashout NO cuenta como
    // acierto aunque deje beneficio: cerraste antes y no se cumplió la cuota.
    const topOdds = [...settled]
      .filter((b) => b.status === "won")
      .sort((a, b) => b.odds - a.odds)
      .slice(0, 3);

    // "Mayor dinero apostado": dinero real, así que fuera freebets. Cuenta
    // incluso si la apuesta sigue pendiente (el dinero ya está jugado).
    const topStake = [...bets]
      .filter((b) => !b.isFreebet)
      .sort((a, b) => b.stake - a.stake)
      .slice(0, 3);

    const topCombo = [...settled]
      .filter((b) => b.isCombo && b.status === "won")
      .sort((a, b) => (b.profit ?? 0) - (a.profit ?? 0))
      .slice(0, 3);

    // Freebet más rentable: la apuesta gratis que más beneficio dejó.
    const topFreebet = [...settled]
      .filter((b) => b.isFreebet && b.status === "won")
      .sort((a, b) => (b.profit ?? 0) - (a.profit ?? 0))
      .slice(0, 3);

    // La más segura ganada: cuota más BAJA acertada (status won de verdad).
    const safestWon = [...settled]
      .filter((b) => b.status === "won")
      .sort((a, b) => a.odds - b.odds)
      .slice(0, 3);

    // El bombazo fallado: cuota más ALTA perdida (status lost).
    const biggestFail = [...settled]
      .filter((b) => b.status === "lost")
      .sort((a, b) => b.odds - a.odds)
      .slice(0, 3);

    return {
      topProfit,
      topLoss,
      topOdds,
      topStake,
      topCombo,
      topFreebet,
      safestWon,
      biggestFail,
    };
  }, [bets]);

  // ── Agregados por jugador ──
  const perPlayer = useMemo<PlayerAgg[]>(() => {
    return groupMembers
      .map((user) => {
        const userBets = bets.filter((b) => b.userId === user.uid);
        const settledU = userBets.filter((b) => b.status !== "pending");
        const best =
          [...settledU].sort((a, b) => (b.profit ?? 0) - (a.profit ?? 0))[0] ??
          null;
        const worst =
          [...settledU].sort((a, b) => (a.profit ?? 0) - (b.profit ?? 0))[0] ??
          null;
        const totalStaked = round2(
          userBets
            .filter((b) => !b.isFreebet)
            .reduce((acc, b) => acc + b.stake, 0)
        );
        return {
          user,
          betsCount: userBets.length,
          totalStaked,
          best,
          worst,
          worstStreak: worstLossStreak(settledU),
          stats: computeUserStats(userBets),
        };
      })
      .filter((p) => p.betsCount > 0);
  }, [groupMembers, bets]);

  // ── Podios de jugadores (Top 3) ──
  const mostBets = useMemo(
    () => [...perPlayer].sort((a, b) => b.betsCount - a.betsCount).slice(0, 3),
    [perPlayer]
  );
  const mostStaked = useMemo(
    () => [...perPlayer].sort((a, b) => b.totalStaked - a.totalStaked).slice(0, 3),
    [perPlayer]
  );
  const mostProfit = useMemo(
    () =>
      [...perPlayer]
        .sort((a, b) => b.stats.totalProfit - a.stats.totalProfit)
        .slice(0, 3),
    [perPlayer]
  );
  const bestStreak = useMemo(
    () =>
      [...perPlayer]
        .filter((p) => p.stats.bestStreak > 0)
        .sort((a, b) => b.stats.bestStreak - a.stats.bestStreak)
        .slice(0, 3),
    [perPlayer]
  );
  const bestHitRate = useMemo(
    () =>
      [...perPlayer]
        .filter(
          (p) => p.stats.betsWon + p.stats.betsLost >= MIN_DECIDED_FOR_HITRATE
        )
        .sort((a, b) => b.stats.hitRate - a.stats.hitRate)
        .slice(0, 3),
    [perPlayer]
  );
  const worstStreaks = useMemo(
    () =>
      [...perPlayer]
        .filter((p) => p.worstStreak > 0)
        .sort((a, b) => b.worstStreak - a.worstStreak)
        .slice(0, 3),
    [perPlayer]
  );
  const craziest = useMemo(
    () =>
      [...perPlayer]
        .filter((p) => p.stats.avgOdds > 0)
        .sort((a, b) => b.stats.avgOdds - a.stats.avgOdds)
        .slice(0, 3),
    [perPlayer]
  );
  const mostLost = useMemo(
    () =>
      [...perPlayer]
        .filter((p) => p.stats.betsLost > 0)
        .sort((a, b) => b.stats.betsLost - a.stats.betsLost)
        .slice(0, 3),
    [perPlayer]
  );

  // ── Estados vacíos ──
  if (!activeGroup) {
    return (
      <div className="py-16 text-center text-sm text-muted-foreground">
        Selecciona un grupo para ver su salón de la fama.
      </div>
    );
  }

  const hasData = bets.length > 0;

  return (
    <div className="space-y-6">
      {/* ─── Cabecera ─── */}
      <Card className="overflow-hidden border-yellow-500/30 bg-gradient-to-br from-yellow-500/10 via-amber-500/5 to-transparent">
        <CardContent className="flex flex-wrap items-center justify-between gap-4 p-5">
          <div className="flex items-center gap-3">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-yellow-500/15 text-yellow-500">
              <Crown className="h-6 w-6" />
            </span>
            <div>
              <h1 className="text-2xl font-bold leading-tight">
                Salón de la fama
              </h1>
              <p className="text-sm text-muted-foreground">
                Records de{" "}
                <span className="font-medium text-foreground">
                  {activeGroup.name}
                </span>{" "}
                · se actualiza solo
              </p>
            </div>
          </div>
          {hasData && (
            <div className="flex flex-wrap gap-2">
              <HeroStat label="Apuestas" value={String(groupSummary.count)} />
              <HeroStat
                label="Dinero jugado"
                value={formatCurrency(groupSummary.stake)}
              />
              <HeroStat
                label="Beneficio"
                value={`${groupSummary.profit > 0 ? "+" : ""}${formatCurrency(
                  groupSummary.profit
                )}`}
                valueClass={profitClass(groupSummary.profit)}
              />
            </div>
          )}
        </CardContent>
      </Card>

      {!hasData ? (
        <EmptyState
          icon={Crown}
          title="Aún no hay records"
          subtitle="En cuanto el grupo empiece a registrar apuestas, aquí saldrán los mejores (y los peores). ¡Que empiece la fiesta!"
        />
      ) : (
        <>
          {/* Records por apuesta */}
          <section className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Records de apuestas
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <PodiumCard
                title="Mayores beneficios"
                icon={TrendingUp}
                accent="text-emerald-500"
                entries={records.topProfit.map((b) => ({
                  name: nameOf(b.userId),
                  detail: betDetail(b),
                  value: formatCurrency(b.profit ?? 0),
                  valueClass: profitClass(b.profit ?? 0),
                }))}
              />
              <PodiumCard
                title="Mayores pérdidas"
                icon={TrendingDown}
                accent="text-red-500"
                entries={records.topLoss.map((b) => ({
                  name: nameOf(b.userId),
                  detail: betDetail(b),
                  value: formatCurrency(b.profit ?? 0),
                  valueClass: profitClass(b.profit ?? 0),
                }))}
              />
              <PodiumCard
                title="Cuotas más altas acertadas"
                icon={Target}
                accent="text-sky-500"
                entries={records.topOdds.map((b) => ({
                  name: nameOf(b.userId),
                  detail: `${b.selection || b.matchLabel || "—"} · ${bookmakerLabel(
                    b.bookmaker,
                    b.bookmakerLabel
                  )}`,
                  value: `@${b.odds.toFixed(2)}`,
                  valueClass: "text-emerald-500",
                }))}
              />
              <PodiumCard
                title="Mayor dinero apostado"
                icon={Coins}
                accent="text-amber-500"
                entries={records.topStake.map((b) => ({
                  name: nameOf(b.userId),
                  detail: betDetail(b),
                  value: formatCurrency(b.stake),
                }))}
              />
              <PodiumCard
                title="Mejores combinadas"
                icon={Layers}
                accent="text-violet-500"
                entries={records.topCombo.map((b) => ({
                  name: nameOf(b.userId),
                  detail: `${b.matchLabel || b.selection || "Combinada"} · @${b.odds.toFixed(
                    2
                  )}`,
                  value: formatCurrency(b.profit ?? 0),
                  valueClass: profitClass(b.profit ?? 0),
                }))}
                emptyText="Aún no hay combinadas ganadas."
              />
              <PodiumCard
                title="Freebet más rentable"
                icon={Gift}
                accent="text-pink-500"
                entries={records.topFreebet.map((b) => ({
                  name: nameOf(b.userId),
                  detail: betDetail(b),
                  value: formatCurrency(b.profit ?? 0),
                  valueClass: profitClass(b.profit ?? 0),
                }))}
                emptyText="Sin freebets ganadas todavía."
              />
              <PodiumCard
                title="La más segura ganada"
                icon={Shield}
                accent="text-teal-500"
                entries={records.safestWon.map((b) => ({
                  name: nameOf(b.userId),
                  detail: `${b.selection || b.matchLabel || "—"} · ${bookmakerLabel(
                    b.bookmaker,
                    b.bookmakerLabel
                  )}`,
                  value: `@${b.odds.toFixed(2)}`,
                  valueClass: "text-emerald-500",
                }))}
              />
              <PodiumCard
                title="El bombazo fallado"
                icon={Bomb}
                accent="text-rose-500"
                entries={records.biggestFail.map((b) => ({
                  name: nameOf(b.userId),
                  detail: `${b.selection || b.matchLabel || "—"} · ${bookmakerLabel(
                    b.bookmaker,
                    b.bookmakerLabel
                  )}`,
                  value: `@${b.odds.toFixed(2)}`,
                  valueClass: "text-red-500",
                }))}
                emptyText="Nadie ha fallado un cuotón aún."
              />
            </div>
          </section>

          {/* Records de partidos */}
          <section className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Records de partidos
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <PodiumCard
                title="Más dinero jugado"
                icon={Coins}
                accent="text-amber-500"
                entries={matchRecords.mostStaked.map((m) => ({
                  name: m.label,
                  leading: matchFlags(m.home, m.away),
                  detail: `${m.count} apuesta${m.count === 1 ? "" : "s"} · ${
                    m.players
                  } jugador${m.players === 1 ? "" : "es"}`,
                  value: formatCurrency(m.stake),
                }))}
                emptyText="Aún no hay apuestas a partidos."
              />
              <PodiumCard
                title="Donde más se ha ganado"
                icon={TrendingUp}
                accent="text-emerald-500"
                entries={matchRecords.mostWon.map((m) => ({
                  name: m.label,
                  leading: matchFlags(m.home, m.away),
                  detail: `${m.count} apuesta${m.count === 1 ? "" : "s"}`,
                  value: `+${formatCurrency(m.profit)}`,
                  valueClass: "text-profit",
                  extra: (
                    <MatchPlayerBreakdown
                      players={m.topWinners}
                      positive
                      nameOf={nameOf}
                    />
                  ),
                }))}
                emptyText="Aún nadie ha ganado en un partido."
              />
              <PodiumCard
                title="Donde más se ha perdido"
                icon={TrendingDown}
                accent="text-red-500"
                entries={matchRecords.mostLost.map((m) => ({
                  name: m.label,
                  leading: matchFlags(m.home, m.away),
                  detail: `${m.count} apuesta${m.count === 1 ? "" : "s"}`,
                  value: formatCurrency(m.profit),
                  valueClass: "text-loss",
                  extra: (
                    <MatchPlayerBreakdown
                      players={m.topLosers}
                      positive={false}
                      nameOf={nameOf}
                    />
                  ),
                }))}
                emptyText="Aún nadie ha perdido en un partido."
              />
              <PodiumCard
                title="Partido con más apuestas"
                icon={Receipt}
                accent="text-primary"
                entries={matchRecords.mostBets.map((m) => ({
                  name: m.label,
                  leading: matchFlags(m.home, m.away),
                  detail: `${formatCurrency(m.stake)} jugado`,
                  value: `${m.count}`,
                }))}
                emptyText="Aún no hay apuestas a partidos."
              />
            </div>
          </section>

          {/* Días y horarios */}
          <section className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Días y horarios
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <PodiumCard
                title="Días más movidos"
                icon={Calendar}
                accent="text-primary"
                entries={topDays.map((d) => ({
                  name: formatDayShort(d.ms),
                  leading: (
                    <span className="flex h-8 w-8 shrink-0 flex-col items-center justify-center rounded-md bg-muted/50 leading-none">
                      <span className="text-[8px] uppercase text-muted-foreground">
                        {new Date(d.ms).toLocaleDateString("es-ES", {
                          month: "short",
                        })}
                      </span>
                      <span className="text-sm font-bold">
                        {new Date(d.ms).getDate()}
                      </span>
                    </span>
                  ),
                  detail: `${d.count} apuesta${d.count === 1 ? "" : "s"} · ${
                    d.users.size
                  } jugador${d.users.size === 1 ? "" : "es"}`,
                  value: formatCurrency(d.stake),
                }))}
                emptyText="Aún no hay apuestas."
              />
              <PodiumCard
                title="Madrugadores"
                icon={Sunrise}
                accent="text-amber-500"
                entries={timeRecords.earliest.map((p) => ({
                  name: p.user.username,
                  detail: "apuestas de 06:00 a 10:00",
                  value: `${p.morning}`,
                }))}
                emptyText="Nadie apuesta a primera hora… aún."
              />
              <PodiumCard
                title="Búhos nocturnos"
                icon={Moon}
                accent="text-indigo-500"
                entries={timeRecords.latest.map((p) => ({
                  name: p.user.username,
                  detail: "apuestas de 22:00 a 06:00",
                  value: `${p.night}`,
                }))}
                emptyText="Nadie apuesta de madrugada… aún."
              />
            </div>
          </section>

          {/* Rankings de jugadores */}
          <section className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Rankings de jugadores
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <PodiumCard
                title="Más apuestas"
                icon={Receipt}
                accent="text-primary"
                entries={mostBets.map((p) => ({
                  name: p.user.username,
                  value: `${p.betsCount}`,
                }))}
              />
              <PodiumCard
                title="Más dinero apostado"
                icon={Coins}
                accent="text-amber-500"
                entries={mostStaked.map((p) => ({
                  name: p.user.username,
                  value: formatCurrency(p.totalStaked),
                }))}
              />
              <PodiumCard
                title="Más beneficio"
                icon={TrendingUp}
                accent="text-emerald-500"
                entries={mostProfit.map((p) => ({
                  name: p.user.username,
                  value: formatCurrency(p.stats.totalProfit),
                  valueClass: profitClass(p.stats.totalProfit),
                }))}
              />
              <PodiumCard
                title="Mejor racha"
                icon={Flame}
                accent="text-orange-500"
                entries={bestStreak.map((p) => ({
                  name: p.user.username,
                  value: `${p.stats.bestStreak} ✅`,
                }))}
                emptyText="Sin rachas todavía."
              />
              <PodiumCard
                title="Mejor % de acierto"
                icon={Percent}
                accent="text-emerald-500"
                entries={bestHitRate.map((p) => ({
                  name: p.user.username,
                  detail: `${p.stats.betsWon}/${
                    p.stats.betsWon + p.stats.betsLost
                  } decididas`,
                  value: formatPercent(p.stats.hitRate),
                }))}
                emptyText={`Hacen falta ${MIN_DECIDED_FOR_HITRATE} apuestas decididas.`}
              />
              <PodiumCard
                title="Peor racha"
                icon={Snowflake}
                accent="text-sky-500"
                entries={worstStreaks.map((p) => ({
                  name: p.user.username,
                  value: `${p.worstStreak} ❌`,
                }))}
                emptyText="Nadie encadena derrotas… aún."
              />
              <PodiumCard
                title="El más loco"
                icon={Dices}
                accent="text-violet-500"
                entries={craziest.map((p) => ({
                  name: p.user.username,
                  detail: "cuota media",
                  value: `@${p.stats.avgOdds.toFixed(2)}`,
                }))}
              />
              <PodiumCard
                title="El que más palma"
                icon={Skull}
                accent="text-red-500"
                entries={mostLost.map((p) => ({
                  name: p.user.username,
                  value: `${p.stats.betsLost}`,
                }))}
                emptyText="Nadie ha perdido todavía."
              />
              <PodiumCard
                title="Más dinero retirado"
                icon={Wallet}
                accent="text-emerald-500"
                entries={topWithdrawn.map((p) => ({
                  name: p.user.username,
                  detail: `Ingresado ${formatCurrency(
                    p.deposits
                  )} · Retirado ${formatCurrency(p.withdrawals)}`,
                  value: `${p.netWithdrawn > 0 ? "+" : ""}${formatCurrency(
                    p.netWithdrawn
                  )}`,
                  valueClass:
                    p.netWithdrawn > 0
                      ? "text-profit"
                      : p.netWithdrawn < 0
                        ? "text-loss"
                        : undefined,
                }))}
                emptyText="Nadie ha ingresado ni retirado aún."
              />
            </div>
          </section>

          {/* Estadísticas individuales */}
          <section className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Estadísticas individuales
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {perPlayer
                .slice()
                .sort((a, b) => b.stats.totalProfit - a.stats.totalProfit)
                .map((p) => {
                  const netWithdrawn =
                    cashByUid.get(p.user.uid)?.netWithdrawn ?? 0;
                  return (
                  <Card key={p.user.uid}>
                    <CardHeader className="pb-2">
                      <CardTitle className="flex items-center gap-2 text-base">
                        <Initial name={p.user.username} />
                        <span className="truncate">{p.user.username}</span>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="grid grid-cols-3 gap-2">
                        <Metric
                          label="Beneficio"
                          value={formatCurrency(p.stats.totalProfit)}
                          valueClass={profitClass(p.stats.totalProfit)}
                        />
                        <Metric
                          label="Apostado"
                          value={formatCurrency(p.totalStaked)}
                        />
                        <Metric label="Apuestas" value={`${p.betsCount}`} />
                        <Metric
                          label="ROI"
                          value={formatPercent(p.stats.roi)}
                          valueClass={profitClass(p.stats.roi)}
                        />
                        <Metric
                          label="% acierto"
                          value={formatPercent(p.stats.hitRate)}
                        />
                        <Metric
                          label="Mejor racha"
                          value={`${p.stats.bestStreak} ✅`}
                        />
                        <Metric
                          label="Neto retirado"
                          value={`${netWithdrawn > 0 ? "+" : ""}${formatCurrency(
                            netWithdrawn
                          )}`}
                          valueClass={profitClass(netWithdrawn)}
                        />
                      </div>
                      {p.best && (p.best.profit ?? 0) > 0 && (
                        <BetHighlight label="Mayor acierto" bet={p.best} />
                      )}
                      {p.worst && (p.worst.profit ?? 0) < 0 && (
                        <BetHighlight label="Mayor pérdida" bet={p.worst} />
                      )}
                    </CardContent>
                  </Card>
                  );
                })}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
