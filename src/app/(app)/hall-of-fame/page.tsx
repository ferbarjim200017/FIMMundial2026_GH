"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Coins,
  Crown,
  Flame,
  Medal,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Trophy,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { subscribeToAllBets } from "@/features/bets/bets.service";
import { betInGroup, betOutcome } from "@/features/bets/bets.utils";
import { useGroup } from "@/features/groups/groups.context";
import { isFirebaseConfigured } from "@/lib/firebase/client";
import { ROUTES } from "@/lib/constants";
import {
  cn,
  formatCurrency,
  formatDate,
  initials,
  profitClass,
} from "@/lib/utils";
import type { AppUser, Bet } from "@/types/domain";

/** Fecha "efectiva" de una apuesta: cuándo se resolvió, o cuándo se creó. */
function eventDate(bet: Bet): Date {
  return (bet.settledAt ?? bet.createdAt).toDate();
}

export default function HallOfFamePage() {
  const { memberUids, activeGroup, groupMembers } = useGroup();
  const [allBets, setAllBets] = useState<Bet[] | null>(null);

  useEffect(() => {
    if (!isFirebaseConfigured) {
      setAllBets([]);
      return;
    }
    const unsub = subscribeToAllBets(setAllBets);
    return unsub;
  }, []);

  const usersById = useMemo(() => {
    const map: Record<string, AppUser> = {};
    for (const u of groupMembers) map[u.uid] = u;
    return map;
  }, [groupMembers]);

  // Apuestas del grupo activo (mismas reglas de visibilidad que el feed).
  const bets = useMemo(() => {
    if (allBets === null) return null;
    if (!activeGroup || memberUids.size === 0) return null;
    return allBets.filter(
      (b) => betInGroup(b, activeGroup.id) && memberUids.has(b.userId)
    );
  }, [allBets, memberUids, activeGroup]);

  const settled = useMemo(
    () => (bets ?? []).filter((b) => b.status !== "pending"),
    [bets]
  );

  const topGains = useMemo(
    () =>
      [...settled]
        .filter((b) => (b.profit ?? 0) > 0)
        .sort((a, b) => b.profit - a.profit)
        .slice(0, 3),
    [settled]
  );

  const topLosses = useMemo(
    () =>
      [...settled]
        .filter((b) => (b.profit ?? 0) < 0)
        .sort((a, b) => a.profit - b.profit)
        .slice(0, 3),
    [settled]
  );

  // Récords sueltos.
  // La machada: solo apuestas ACERTADAS por completo (status "won"). Quedan
  // fuera cashouts y anuladas/push, aunque tengan beneficio.
  const biggestOddsWon = useMemo(() => {
    const won = settled.filter((b) => b.status === "won");
    if (won.length === 0) return null;
    return [...won].sort((a, b) => b.odds - a.odds)[0];
  }, [settled]);

  const biggestStake = useMemo(() => {
    const real = (bets ?? []).filter((b) => !b.isFreebet);
    if (real.length === 0) return null;
    return [...real].sort((a, b) => b.stake - a.stake)[0];
  }, [bets]);

  // Agregados por usuario (sobre apuestas resueltas del grupo): beneficio neto
  // y nº de apuestas ganadas/perdidas. De aquí salen los podios de usuarios.
  const userAgg = useMemo(() => {
    if (!bets) return [];
    const byUid = new Map<
      string,
      { profit: number; won: number; lost: number }
    >();
    for (const b of bets) {
      if (b.status === "pending") continue;
      const cur = byUid.get(b.userId) ?? { profit: 0, won: 0, lost: 0 };
      cur.profit += b.profit ?? 0;
      const outcome = betOutcome(b);
      if (outcome === "won") cur.won += 1;
      else if (outcome === "lost") cur.lost += 1;
      byUid.set(b.userId, cur);
    }
    return [...byUid.entries()].map(([uid, v]) => ({
      user: usersById[uid] ?? null,
      ...v,
    }));
  }, [bets, usersById]);

  const kings = useMemo(
    () =>
      userAgg
        .filter((u) => u.profit > 0)
        .sort((a, b) => b.profit - a.profit)
        .slice(0, 3),
    [userAgg]
  );

  const biggestLosers = useMemo(
    () =>
      userAgg
        .filter((u) => u.profit < 0)
        .sort((a, b) => a.profit - b.profit)
        .slice(0, 3),
    [userAgg]
  );

  const mostWinners = useMemo(
    () =>
      userAgg
        .filter((u) => u.won > 0)
        .sort((a, b) => b.won - a.won)
        .slice(0, 3),
    [userAgg]
  );

  const loading = bets === null;
  const isEmpty = !loading && settled.length === 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1">
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <Crown className="h-6 w-6 text-gold" />
          Salón de la Fama
        </h1>
        <p className="text-sm text-muted-foreground">
          Las apuestas para la historia del grupo: mayores pelotazos, peores
          batacazos y récords varios.
        </p>
      </div>

      {loading ? (
        <Card>
          <CardContent className="px-6 py-10 text-center text-sm text-muted-foreground">
            Cargando salón de la fama…
          </CardContent>
        </Card>
      ) : isEmpty ? (
        <Card>
          <CardContent className="px-6 py-10 text-center text-sm text-muted-foreground">
            Todavía no hay apuestas resueltas en el grupo. ¡Cuando las haya,
            aquí saldrán los mejores y peores momentos!
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            <Podium
              title="Top 3 ganancias"
              subtitle="Los mayores pelotazos"
              icon={<TrendingUp className="h-5 w-5 text-profit" />}
              bets={topGains}
              usersById={usersById}
              kind="gain"
            />
            <Podium
              title="Top 3 pérdidas"
              subtitle="Los peores batacazos"
              icon={<TrendingDown className="h-5 w-5 text-loss" />}
              bets={topLosses}
              usersById={usersById}
              kind="loss"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {biggestOddsWon && (
              <RecordCard
                title="La machada"
                caption="Mayor cuota acertada (sin cashout)"
                icon={<Sparkles className="h-5 w-5 text-gold" />}
                bet={biggestOddsWon}
                user={usersById[biggestOddsWon.userId] ?? null}
                highlight={`@ ${biggestOddsWon.odds.toFixed(2)}`}
                highlightClass="text-gold"
              />
            )}
            {biggestStake && (
              <RecordCard
                title="El valiente"
                caption="Apuesta de mayor stake"
                icon={<Coins className="h-5 w-5 text-primary" />}
                bet={biggestStake}
                user={usersById[biggestStake.userId] ?? null}
                highlight={formatCurrency(biggestStake.stake)}
                highlightClass="text-primary"
              />
            )}
          </div>

          {(kings.length > 0 ||
            biggestLosers.length > 0 ||
            mostWinners.length > 0) && (
            <div className="grid gap-4 lg:grid-cols-3">
              <UserPodium
                title="Reyes del beneficio"
                subtitle="Top 3 con más beneficio total"
                icon={<Flame className="h-5 w-5 text-orange-500" />}
                rows={kings.map((u) => ({
                  user: u.user,
                  value: `${u.profit > 0 ? "+" : ""}${formatCurrency(u.profit)}`,
                  valueClass: profitClass(u.profit),
                }))}
                emptyLabel="Nadie está en positivo todavía."
              />
              <UserPodium
                title="Los más sufridores"
                subtitle="Top 3 con más pérdidas totales"
                icon={<TrendingDown className="h-5 w-5 text-loss" />}
                rows={biggestLosers.map((u) => ({
                  user: u.user,
                  value: formatCurrency(u.profit),
                  valueClass: profitClass(u.profit),
                }))}
                emptyLabel="Nadie está en negativo todavía."
              />
              <UserPodium
                title="Más ganadoras"
                subtitle="Top 3 por apuestas acertadas"
                icon={<Trophy className="h-5 w-5 text-gold" />}
                rows={mostWinners.map((u) => ({
                  user: u.user,
                  value: `${u.won} ganadas`,
                  valueClass: "text-profit",
                }))}
                emptyLabel="Aún no hay apuestas ganadas."
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}

const MEDAL_CLASSES = ["text-gold", "text-silver", "text-bronze"] as const;

function RankBadge({ rank }: { rank: number }) {
  const medal = MEDAL_CLASSES[rank - 1];
  return (
    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted">
      {medal ? (
        <Medal className={cn("h-4 w-4", medal)} />
      ) : (
        <span className="text-xs font-bold text-muted-foreground">{rank}</span>
      )}
    </span>
  );
}

function Podium({
  title,
  subtitle,
  icon,
  bets,
  usersById,
  kind,
}: {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  bets: Bet[];
  usersById: Record<string, AppUser>;
  kind: "gain" | "loss";
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          {icon}
          {title}
        </CardTitle>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </CardHeader>
      <CardContent className="space-y-2">
        {bets.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            {kind === "gain"
              ? "Aún no hay apuestas ganadas."
              : "Aún no hay apuestas perdidas."}
          </p>
        ) : (
          bets.map((bet, i) => (
            <BetRow
              key={bet.id}
              rank={i + 1}
              bet={bet}
              user={usersById[bet.userId] ?? null}
            />
          ))
        )}
      </CardContent>
    </Card>
  );
}

function BetRow({
  rank,
  bet,
  user,
}: {
  rank: number;
  bet: Bet;
  user: AppUser | null;
}) {
  const accent =
    rank === 1
      ? "border-l-4 border-l-gold"
      : "border-l-4 border-l-border";

  return (
    <Link
      href={`${ROUTES.bets}/${bet.id}`}
      className={cn(
        "flex items-start gap-3 rounded-md border border-border/60 px-3 py-2 transition-colors hover:bg-accent/40",
        accent
      )}
    >
      <RankBadge rank={rank} />
      <Avatar className="h-9 w-9 shrink-0">
        {user?.avatarUrl && <AvatarImage src={user.avatarUrl} />}
        <AvatarFallback>{initials(user?.username ?? "?")}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">
          {user?.username ?? "Usuario"}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {bet.matchLabel}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {bet.selection} @ {bet.odds.toFixed(2)} · {formatCurrency(bet.stake)} ·{" "}
          {formatDate(eventDate(bet))}
        </p>
      </div>
      <span
        className={cn(
          "shrink-0 font-mono text-sm font-bold",
          profitClass(bet.profit)
        )}
      >
        {bet.profit > 0 ? "+" : ""}
        {formatCurrency(bet.profit)}
      </span>
    </Link>
  );
}

function UserPodium({
  title,
  subtitle,
  icon,
  rows,
  emptyLabel,
}: {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  rows: { user: AppUser | null; value: string; valueClass?: string }[];
  emptyLabel: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          {icon}
          {title}
        </CardTitle>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </CardHeader>
      <CardContent className="space-y-2">
        {rows.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            {emptyLabel}
          </p>
        ) : (
          rows.map((row, i) => (
            <UserRow
              key={row.user?.uid ?? i}
              rank={i + 1}
              user={row.user}
              value={row.value}
              valueClass={row.valueClass}
            />
          ))
        )}
      </CardContent>
    </Card>
  );
}

function UserRow({
  rank,
  user,
  value,
  valueClass,
}: {
  rank: number;
  user: AppUser | null;
  value: string;
  valueClass?: string;
}) {
  const content = (
    <>
      <RankBadge rank={rank} />
      <Avatar className="h-8 w-8 shrink-0">
        {user?.avatarUrl && <AvatarImage src={user.avatarUrl} />}
        <AvatarFallback>{initials(user?.username ?? "?")}</AvatarFallback>
      </Avatar>
      <span className="min-w-0 flex-1 truncate text-sm font-medium">
        {user?.username ?? "Usuario"}
      </span>
      <span className={cn("shrink-0 font-mono text-sm font-bold", valueClass)}>
        {value}
      </span>
    </>
  );
  const base =
    "flex items-center gap-3 rounded-md border border-border/60 px-3 py-2";
  if (!user) return <div className={base}>{content}</div>;
  return (
    <Link
      href={ROUTES.profile(user.uid)}
      className={cn(base, "transition-colors hover:bg-accent/40")}
    >
      {content}
    </Link>
  );
}

function RecordCard({
  title,
  caption,
  icon,
  bet,
  user,
  highlight,
  highlightClass,
}: {
  title: string;
  caption: string;
  icon: React.ReactNode;
  bet: Bet;
  user: AppUser | null;
  highlight: string;
  highlightClass?: string;
}) {
  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="rounded-md bg-muted/50 p-2">{icon}</div>
            <div>
              <p className="text-sm font-semibold">{title}</p>
              <p className="text-xs text-muted-foreground">{caption}</p>
            </div>
          </div>
          <span className={cn("font-mono text-lg font-bold", highlightClass)}>
            {highlight}
          </span>
        </div>
        <Link
          href={`${ROUTES.bets}/${bet.id}`}
          className="flex items-start gap-3 rounded-md border border-border/60 px-3 py-2 transition-colors hover:bg-accent/40"
        >
          <Avatar className="h-9 w-9 shrink-0">
            {user?.avatarUrl && <AvatarImage src={user.avatarUrl} />}
            <AvatarFallback>{initials(user?.username ?? "?")}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">
              {user?.username ?? "Usuario"}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {bet.matchLabel}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {bet.selection} @ {bet.odds.toFixed(2)} ·{" "}
              {formatCurrency(bet.stake)} · {formatDate(eventDate(bet))}
            </p>
          </div>
        </Link>
      </CardContent>
    </Card>
  );
}
