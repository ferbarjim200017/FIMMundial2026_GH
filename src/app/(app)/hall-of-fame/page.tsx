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
  const biggestOddsWon = useMemo(() => {
    const won = settled.filter((b) => betOutcome(b) === "won");
    if (won.length === 0) return null;
    return [...won].sort((a, b) => b.odds - a.odds)[0];
  }, [settled]);

  const biggestStake = useMemo(() => {
    const real = (bets ?? []).filter((b) => !b.isFreebet);
    if (real.length === 0) return null;
    return [...real].sort((a, b) => b.stake - a.stake)[0];
  }, [bets]);

  // Reyes del beneficio: ranking de usuarios por beneficio neto en el grupo.
  const userRanking = useMemo(() => {
    if (!bets) return [];
    const byUid = new Map<string, number>();
    for (const b of bets) {
      if (b.status === "pending") continue;
      byUid.set(b.userId, (byUid.get(b.userId) ?? 0) + (b.profit ?? 0));
    }
    return [...byUid.entries()]
      .map(([uid, profit]) => ({ user: usersById[uid] ?? null, profit }))
      .sort((a, b) => b.profit - a.profit);
  }, [bets, usersById]);

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
                caption="Mayor cuota acertada"
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

          {userRanking.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Flame className="h-5 w-5 text-orange-500" />
                  Reyes del beneficio
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {userRanking.map((row, i) => (
                  <div
                    key={row.user?.uid ?? i}
                    className="flex items-center gap-3 rounded-md border border-border/60 px-3 py-2"
                  >
                    <RankBadge rank={i + 1} />
                    {row.user ? (
                      <Link
                        href={ROUTES.profile(row.user.uid)}
                        className="flex min-w-0 flex-1 items-center gap-2 hover:underline"
                      >
                        <Avatar className="h-8 w-8">
                          {row.user.avatarUrl && (
                            <AvatarImage src={row.user.avatarUrl} />
                          )}
                          <AvatarFallback>
                            {initials(row.user.username)}
                          </AvatarFallback>
                        </Avatar>
                        <span className="truncate text-sm font-medium">
                          {row.user.username}
                        </span>
                      </Link>
                    ) : (
                      <span className="flex-1 text-sm text-muted-foreground">
                        Usuario
                      </span>
                    )}
                    <span
                      className={cn(
                        "font-mono text-sm font-bold",
                        profitClass(row.profit)
                      )}
                    >
                      {row.profit > 0 ? "+" : ""}
                      {formatCurrency(row.profit)}
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>
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
