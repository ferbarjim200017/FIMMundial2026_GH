"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import {
  ArrowUpRight,
  ArrowDownRight,
  Clock,
  TrendingDown,
  TrendingUp,
  Trophy,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { BetStatusBadge } from "@/components/bets/bet-status-badge";
import { subscribeToBets } from "@/features/bets/bets.service";
import { subscribeToRanking } from "@/features/users/users.service";
import { bookmakerLabel } from "@/features/bets/bets.utils";
import { isFirebaseConfigured } from "@/lib/firebase/client";
import { ROUTES } from "@/lib/constants";
import {
  cn,
  formatCurrency,
  initials,
  profitClass,
} from "@/lib/utils";
import type { AppUser, Bet, BetStatus } from "@/types/domain";

type FeedFilter = "results" | "won" | "lost" | "pending" | "all";

const FILTERS: { value: FeedFilter; label: string }[] = [
  { value: "results", label: "Resultados" },
  { value: "won", label: "Ganadas" },
  { value: "lost", label: "Perdidas" },
  { value: "pending", label: "En curso" },
  { value: "all", label: "Todo" },
];

const MAX_ITEMS = 80;

function eventDate(bet: Bet): Date {
  const ts = bet.settledAt ?? bet.createdAt;
  return ts.toDate();
}

function matchesFilter(bet: Bet, filter: FeedFilter): boolean {
  if (filter === "all") return true;
  if (filter === "won") return bet.status === "won";
  if (filter === "lost") return bet.status === "lost";
  if (filter === "pending") return bet.status === "pending";
  // "results" → todo lo que ya tiene un desenlace
  return bet.status !== "pending";
}

export default function FeedPage() {
  const [bets, setBets] = useState<Bet[] | null>(null);
  const [usersById, setUsersById] = useState<Record<string, AppUser>>({});
  const [filter, setFilter] = useState<FeedFilter>("results");

  useEffect(() => {
    if (!isFirebaseConfigured) {
      setBets([]);
      return;
    }
    const unsubBets = subscribeToBets({}, setBets);
    const unsubUsers = subscribeToRanking((users) => {
      const map: Record<string, AppUser> = {};
      for (const u of users) map[u.uid] = u;
      setUsersById(map);
    });
    return () => {
      unsubBets();
      unsubUsers();
    };
  }, []);

  // Resort por timestamp efectivo (settledAt si existe, si no createdAt)
  // para que las apuestas recién liquidadas suban arriba aunque sean antiguas.
  const sortedBets = useMemo(() => {
    if (!bets) return null;
    return [...bets].sort(
      (a, b) => eventDate(b).getTime() - eventDate(a).getTime()
    );
  }, [bets]);

  const filteredBets = useMemo(() => {
    if (!sortedBets) return null;
    return sortedBets.filter((b) => matchesFilter(b, filter)).slice(0, MAX_ITEMS);
  }, [sortedBets, filter]);

  const todaySummary = useMemo(() => {
    if (!sortedBets) return null;
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const startMs = start.getTime();
    const todays = sortedBets.filter(
      (b) => b.settledAt && b.settledAt.toMillis() >= startMs
    );
    const won = todays.filter((b) => b.status === "won");
    const lost = todays.filter((b) => b.status === "lost");
    const netProfit = todays.reduce((acc, b) => acc + b.profit, 0);
    return { won: won.length, lost: lost.length, netProfit };
  }, [sortedBets]);

  // Ganador y perdedor "absolutos" del grupo (totalProfit acumulado).
  // Estos cuadros son globales: todos los usuarios ven el mismo valor.
  const groupExtremes = useMemo(() => {
    const usersArr = Object.values(usersById);
    if (usersArr.length === 0) return null;
    let topProfit = usersArr[0];
    let topLoss = usersArr[0];
    for (const u of usersArr) {
      if ((u.stats?.totalProfit ?? 0) > (topProfit.stats?.totalProfit ?? 0)) {
        topProfit = u;
      }
      if ((u.stats?.totalProfit ?? 0) < (topLoss.stats?.totalProfit ?? 0)) {
        topLoss = u;
      }
    }
    return {
      topProfit:
        (topProfit.stats?.totalProfit ?? 0) > 0
          ? { user: topProfit, value: topProfit.stats?.totalProfit ?? 0 }
          : null,
      topLoss:
        (topLoss.stats?.totalProfit ?? 0) < 0
          ? { user: topLoss, value: topLoss.stats?.totalProfit ?? 0 }
          : null,
    };
  }, [usersById]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight">Feed</h1>
        <p className="text-sm text-muted-foreground">
          Actividad del grupo en tiempo real — ganadas, perdidas y apuestas en
          curso.
        </p>
      </div>

      {todaySummary && (
        <div className="grid gap-3 sm:grid-cols-3">
          <SummaryCard
            label="Ganadas hoy"
            value={String(todaySummary.won)}
            icon={<TrendingUp className="h-5 w-5 text-profit" />}
            accent="text-profit"
          />
          <SummaryCard
            label="Perdidas hoy"
            value={String(todaySummary.lost)}
            icon={<TrendingDown className="h-5 w-5 text-loss" />}
            accent="text-loss"
          />
          <SummaryCard
            label="Resultado del grupo"
            value={`${todaySummary.netProfit > 0 ? "+" : ""}${formatCurrency(
              todaySummary.netProfit
            )}`}
            icon={<Trophy className="h-5 w-5 text-gold" />}
            accent={profitClass(todaySummary.netProfit)}
          />
        </div>
      )}

      {groupExtremes && (groupExtremes.topProfit || groupExtremes.topLoss) && (
        <div className="grid gap-3 sm:grid-cols-2">
          <ExtremeCard
            label="Máximo ganador"
            user={groupExtremes.topProfit?.user ?? null}
            value={groupExtremes.topProfit?.value ?? 0}
            icon={<ArrowUpRight className="h-5 w-5 text-profit" />}
            accent="text-profit"
            emptyLabel="Aún nadie está en positivo"
          />
          <ExtremeCard
            label="Máximo perdedor"
            user={groupExtremes.topLoss?.user ?? null}
            value={groupExtremes.topLoss?.value ?? 0}
            icon={<ArrowDownRight className="h-5 w-5 text-loss" />}
            accent="text-loss"
            emptyLabel="Aún nadie está en negativo"
          />
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Button
            key={f.value}
            variant={filter === f.value ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter(f.value)}
          >
            {f.label}
          </Button>
        ))}
      </div>

      {filteredBets === null ? (
        <Card>
          <CardContent className="px-6 py-8 text-center text-sm text-muted-foreground">
            Cargando feed…
          </CardContent>
        </Card>
      ) : filteredBets.length === 0 ? (
        <Card>
          <CardContent className="px-6 py-8 text-center text-sm text-muted-foreground">
            No hay actividad para este filtro.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredBets.map((bet) => (
            <FeedItem
              key={bet.id}
              bet={bet}
              user={usersById[bet.userId] ?? null}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  icon,
  accent,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  accent?: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className="rounded-md bg-muted/50 p-2">{icon}</div>
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">
            {label}
          </p>
          <p className={cn("text-xl font-bold", accent)}>{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function ExtremeCard({
  label,
  user,
  value,
  icon,
  accent,
  emptyLabel,
}: {
  label: string;
  user: AppUser | null;
  value: number;
  icon: React.ReactNode;
  accent?: string;
  emptyLabel: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className="rounded-md bg-muted/50 p-2">{icon}</div>
        <div className="min-w-0 flex-1">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">
            {label}
          </p>
          {user ? (
            <Link
              href={ROUTES.profile(user.uid)}
              className="block hover:underline"
            >
              <p className="truncate text-sm font-medium">{user.username}</p>
              <p className={cn("font-mono text-lg font-bold", accent)}>
                {value > 0 ? "+" : ""}
                {formatCurrency(value)}
              </p>
            </Link>
          ) : (
            <p className="text-sm text-muted-foreground">{emptyLabel}</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function FeedItem({ bet, user }: { bet: Bet; user: AppUser | null }) {
  const accent =
    bet.status === "won"
      ? "border-l-4 border-l-profit"
      : bet.status === "lost"
      ? "border-l-4 border-l-loss"
      : bet.status === "pending"
      ? "border-l-4 border-l-muted-foreground/30"
      : "";

  const displayName = user?.username ?? "Usuario";
  const timestamp = formatDistanceToNow(eventDate(bet), {
    addSuffix: true,
    locale: es,
  });

  return (
    <Card className={cn("overflow-hidden", accent)}>
      <CardContent className="flex items-start gap-3 p-4">
        <Link
          href={user ? ROUTES.profile(user.uid) : "#"}
          className="shrink-0"
        >
          <Avatar className="h-10 w-10">
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
            <span className="text-muted-foreground">
              {actionVerb(bet.status)}
            </span>
            <BetStatusBadge status={bet.status} />
            {bet.isFreebet && (
              <span className="rounded-full bg-purple-600/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-purple-600 dark:text-purple-400">
                Freebet
              </span>
            )}
          </div>

          <Link
            href={`${ROUTES.bets}/${bet.id}`}
            className="block truncate text-sm font-medium hover:underline"
          >
            {bet.matchLabel}
          </Link>

          <p className="truncate text-xs text-muted-foreground">
            {bet.selection} @ {bet.odds.toFixed(2)} ·{" "}
            {formatCurrency(bet.stake)} · {bookmakerLabel(bet.bookmaker, bet.bookmakerLabel)}
          </p>

          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" />
            <span>{timestamp}</span>
          </div>
        </div>

        {bet.status !== "pending" && (
          <div className="shrink-0 text-right">
            <p
              className={cn(
                "font-mono text-lg font-bold",
                profitClass(bet.profit)
              )}
            >
              {bet.profit > 0 ? "+" : ""}
              {formatCurrency(bet.profit)}
            </p>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
              {bet.status === "won"
                ? "Ganada"
                : bet.status === "lost"
                ? "Perdida"
                : bet.status === "void"
                ? "Anulada"
                : "Cashout"}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function actionVerb(status: BetStatus): string {
  switch (status) {
    case "won":
      return "ganó";
    case "lost":
      return "perdió";
    case "void":
      return "tuvo anulada";
    case "cashout":
      return "cobró cashout en";
    case "pending":
    default:
      return "apostó por";
  }
}
