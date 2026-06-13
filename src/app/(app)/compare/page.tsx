"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { LineChart, Minus, Swords, TrendingDown, TrendingUp } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { RankingChart } from "@/components/ranking/ranking-chart";
import { BackButton } from "@/components/layout/back-button";
import { getUser } from "@/features/users/users.service";
import { subscribeToAllBets } from "@/features/bets/bets.service";
import { useGroup } from "@/features/groups/groups.context";
import { betInGroup, computeUserStats, getInitialBalances } from "@/features/bets/bets.utils";
import {
  cn,
  formatCurrency,
  formatPercent,
  initials,
} from "@/lib/utils";
import { ROUTES } from "@/lib/constants";
import type { AppUser, Bet, UserStats } from "@/types/domain";

interface CompareData {
  stats: UserStats;
  balance: number;
}

type Metric = {
  label: string;
  /** Cómo extraer el valor numérico para comparar a partir de las stats
   *  del grupo activo + balance del grupo. */
  pick: (d: CompareData) => number;
  /** Cómo renderizar el valor en la celda. */
  render: (n: number) => string;
  /** Si true, "más es mejor". Si false, "menos es mejor". null = no compite. */
  higherWins: boolean | null;
};

const METRICS: Metric[] = [
  {
    label: "ROI",
    pick: (d) => d.stats.roi,
    render: (n) => `${n > 0 ? "+" : ""}${formatPercent(n)}`,
    higherWins: true,
  },
  {
    label: "Beneficio total",
    pick: (d) => d.stats.totalProfit,
    render: (n) => `${n > 0 ? "+" : ""}${formatCurrency(n)}`,
    higherWins: true,
  },
  {
    label: "% Acierto",
    pick: (d) => d.stats.hitRate,
    render: (n) => formatPercent(n),
    higherWins: true,
  },
  {
    label: "Racha actual",
    pick: (d) => d.stats.currentStreak,
    render: (n) => (n > 0 ? `+${n}` : String(n)),
    higherWins: true,
  },
  {
    label: "Mejor racha",
    pick: (d) => d.stats.bestStreak,
    render: (n) => String(n),
    higherWins: true,
  },
  {
    label: "Cuota media",
    pick: (d) => d.stats.avgOdds,
    render: (n) => n.toFixed(2),
    higherWins: null,
  },
  {
    label: "Stake medio",
    pick: (d) => d.stats.avgStake,
    render: (n) => formatCurrency(n),
    higherWins: null,
  },
  {
    label: "Apuestas",
    pick: (d) => d.stats.betsCount,
    render: (n) => String(n),
    higherWins: null,
  },
  {
    label: "Ganadas",
    pick: (d) => d.stats.betsWon,
    render: (n) => String(n),
    higherWins: true,
  },
  {
    label: "Perdidas",
    pick: (d) => d.stats.betsLost,
    render: (n) => String(n),
    higherWins: false,
  },
  {
    label: "Saldo actual",
    pick: (d) => d.balance,
    render: (n) => formatCurrency(n),
    higherWins: null,
  },
];

function evaluateWinner(a: number, b: number, higherWins: boolean | null): "a" | "b" | "tie" | null {
  if (higherWins === null) return null;
  if (a === b) return "tie";
  const aWins = higherWins ? a > b : a < b;
  return aWins ? "a" : "b";
}

/** Esqueleto de carga del cara a cara: cabecera de marcador + tabla. */
function CompareSkeleton() {
  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="flex items-center gap-4 p-4 sm:gap-6">
          <div className="flex flex-1 items-center gap-3">
            <Skeleton className="h-14 w-14 rounded-full" />
            <Skeleton className="h-5 w-24" />
          </div>
          <Skeleton className="h-9 w-16 shrink-0" />
          <div className="flex flex-1 items-center justify-end gap-3">
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-14 w-14 rounded-full" />
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="space-y-2 p-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-full" />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

export default function ComparePage() {
  return (
    <Suspense fallback={<CompareSkeleton />}>
      <CompareContent />
    </Suspense>
  );
}

function CompareContent() {
  const search = useSearchParams();
  const aUid = search.get("a") ?? "";
  const bUid = search.get("b") ?? "";
  const { activeGroup, memberUids } = useGroup();

  const [userA, setUserA] = useState<AppUser | null>(null);
  const [userB, setUserB] = useState<AppUser | null>(null);
  const [bets, setBets] = useState<Bet[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!aUid || !bUid) {
      setLoading(false);
      return;
    }
    setLoading(true);
    Promise.all([getUser(aUid), getUser(bUid)])
      .then(([a, b]) => {
        setUserA(a);
        setUserB(b);
      })
      .catch((err) => console.error("[compare] getUser", err))
      .finally(() => setLoading(false));
  }, [aUid, bUid]);

  useEffect(() => {
    if (!aUid || !bUid) return;
    const unsub = subscribeToAllBets((all) => {
      setBets(all.filter((bet) => bet.userId === aUid || bet.userId === bUid));
    });
    return unsub;
  }, [aUid, bUid]);

  // Stats y balances de cada usuario contextualizados al grupo activo.
  const dataA = useMemo<CompareData | null>(() => {
    if (!userA || !activeGroup) return null;
    const userBets = bets.filter(
      (b) => b.userId === userA.uid && betInGroup(b, activeGroup.id)
    );
    const stats = computeUserStats(userBets);
    const initials = getInitialBalances(userA, activeGroup.id);
    const balance =
      initials.bet365 + initials.winamax + initials.other + stats.totalProfit;
    return { stats, balance };
  }, [userA, bets, activeGroup]);

  const dataB = useMemo<CompareData | null>(() => {
    if (!userB || !activeGroup) return null;
    const userBets = bets.filter(
      (b) => b.userId === userB.uid && betInGroup(b, activeGroup.id)
    );
    const stats = computeUserStats(userBets);
    const initials = getInitialBalances(userB, activeGroup.id);
    const balance =
      initials.bet365 + initials.winamax + initials.other + stats.totalProfit;
    return { stats, balance };
  }, [userB, bets, activeGroup]);

  const tally = useMemo(() => {
    if (!dataA || !dataB) return { a: 0, b: 0 };
    let a = 0;
    let b = 0;
    for (const m of METRICS) {
      const w = evaluateWinner(
        m.pick(dataA),
        m.pick(dataB),
        m.higherWins
      );
      if (w === "a") a++;
      else if (w === "b") b++;
    }
    return { a, b };
  }, [dataA, dataB]);

  if (loading) {
    return <CompareSkeleton />;
  }

  if (!aUid || !bUid || !userA || !userB) {
    return (
      <Card>
        <CardContent className="space-y-3 p-6 text-center">
          <p className="text-sm text-muted-foreground">
            Faltan usuarios para comparar, o uno de ellos no existe.
          </p>
          <Button asChild variant="outline">
            <Link href={ROUTES.ranking}>Ir al ranking</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  // Cross-group block: si alguno de los dos no está en tu grupo activo,
  // no se permite la comparativa.
  if (
    activeGroup &&
    memberUids.size > 0 &&
    (!memberUids.has(aUid) || !memberUids.has(bUid))
  ) {
    return (
      <Card>
        <CardContent className="space-y-3 p-6 text-center">
          <p className="text-sm text-muted-foreground">
            Uno o los dos usuarios no están en tu grupo{" "}
            <strong>{activeGroup.name}</strong>. Solo puedes comparar
            jugadores del mismo grupo.
          </p>
          <Button asChild variant="outline">
            <Link href={ROUTES.ranking}>Ir al ranking</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  const leader =
    tally.a > tally.b ? "a" : tally.b > tally.a ? "b" : "tie";

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <BackButton fallbackHref={ROUTES.profile(userB.uid)} />
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <Swords className="h-5 w-5 text-primary" />
            Cara a cara
          </h1>
          <p className="text-sm text-muted-foreground">
            {userA.username} vs {userB.username}
          </p>
        </div>
      </div>

      <Card className="border-primary/40">
        <CardContent className="flex flex-col items-stretch gap-3 p-4 sm:flex-row sm:items-center sm:gap-6">
          <UserHeader
            user={userA}
            alignment="left"
            winning={leader === "a"}
            profit={dataA?.stats.totalProfit ?? 0}
          />
          <div className="flex shrink-0 flex-col items-center gap-1 px-2">
            <div className="font-mono text-3xl font-extrabold tracking-tight">
              <span className={leader === "a" ? "text-profit" : leader === "b" ? "text-muted-foreground" : ""}>
                {tally.a}
              </span>
              <span className="mx-2 text-muted-foreground">–</span>
              <span className={leader === "b" ? "text-profit" : leader === "a" ? "text-muted-foreground" : ""}>
                {tally.b}
              </span>
            </div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
              {leader === "tie"
                ? "Empate"
                : `${(leader === "a" ? userA : userB).username} lidera`}
            </p>
          </div>
          <UserHeader
            user={userB}
            alignment="right"
            winning={leader === "b"}
            profit={dataB?.stats.totalProfit ?? 0}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Métrica a métrica</CardTitle>
          <CardDescription>
            La flecha verde marca al ganador de cada fila. Algunas estadísticas
            (cuota media, stake medio, número de apuestas) son informativas y
            no cuentan al marcador.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 text-right w-2/5">{userA.username}</th>
                  <th className="px-2 py-3 text-center">Métrica</th>
                  <th className="px-4 py-3 text-left w-2/5">{userB.username}</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {METRICS.map((m) => {
                  const va = dataA ? m.pick(dataA) : 0;
                  const vb = dataB ? m.pick(dataB) : 0;
                  const w = evaluateWinner(va, vb, m.higherWins);
                  return (
                    <tr key={m.label}>
                      <td
                        className={cn(
                          "px-4 py-2.5 text-right font-mono",
                          w === "a" && "font-bold text-profit",
                          w === "b" && "text-muted-foreground"
                        )}
                      >
                        <span className="inline-flex items-center gap-1.5">
                          {w === "a" && (
                            <TrendingUp className="h-3.5 w-3.5" aria-hidden />
                          )}
                          {m.render(va)}
                        </span>
                      </td>
                      <td className="px-2 py-2.5 text-center text-xs uppercase tracking-wider text-muted-foreground">
                        {m.label}
                      </td>
                      <td
                        className={cn(
                          "px-4 py-2.5 text-left font-mono",
                          w === "b" && "font-bold text-profit",
                          w === "a" && "text-muted-foreground"
                        )}
                      >
                        <span className="inline-flex items-center gap-1.5">
                          {m.render(vb)}
                          {w === "b" && (
                            <TrendingUp className="h-3.5 w-3.5" aria-hidden />
                          )}
                          {w === "tie" && (
                            <Minus className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                          )}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <LineChart className="h-4 w-4 text-primary" />
            Evolución del beneficio
          </CardTitle>
          <CardDescription>
            Beneficio acumulado de cada uno desde el inicio del seguimiento. La
            línea solo refleja apuestas liquidadas.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RankingChart users={[userA, userB]} bets={bets} />
        </CardContent>
      </Card>
    </div>
  );
}

function UserHeader({
  user,
  alignment,
  winning,
  profit,
}: {
  user: AppUser;
  alignment: "left" | "right";
  winning: boolean;
  profit: number;
}) {
  return (
    <Link
      href={ROUTES.profile(user.uid)}
      className={cn(
        "flex flex-1 items-center gap-3 rounded-md p-2 transition-colors hover:bg-accent/50",
        alignment === "right" && "flex-row-reverse text-right"
      )}
    >
      <Avatar
        className={cn(
          "h-14 w-14 ring-2 transition-all",
          winning ? "ring-profit" : "ring-transparent"
        )}
      >
        {user.avatarUrl && <AvatarImage src={user.avatarUrl} alt={user.username} />}
        <AvatarFallback>{initials(user.username)}</AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        <p className="truncate font-semibold">{user.username}</p>
        <p
          className={cn(
            "font-mono text-sm",
            profit > 0
              ? "text-profit"
              : profit < 0
              ? "text-loss"
              : "text-muted-foreground"
          )}
        >
          {profit > 0 ? "+" : ""}
          {formatCurrency(profit)}
          {profit < 0 && (
            <TrendingDown className="ml-1 inline h-3 w-3" aria-hidden />
          )}
        </p>
      </div>
    </Link>
  );
}
