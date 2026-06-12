"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  BarChart3,
  LineChart,
  Star,
  Ticket,
  TrendingDown,
  Trophy,
  Zap,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { RankingChart } from "@/components/ranking/ranking-chart";
import { BetsBarChart } from "@/components/ranking/bets-bar-chart";
import { Skeleton } from "@/components/ui/skeleton";
import { subscribeToRanking } from "@/features/users/users.service";
import { subscribeToAllBets } from "@/features/bets/bets.service";
import {
  betInGroup,
  computeSuperaumentoSummary,
  computeUserStats,
  getInitialBalances,
} from "@/features/bets/bets.utils";
import { useGroup } from "@/features/groups/groups.context";
import { useAuth } from "@/features/auth/auth.context";
import { isFirebaseConfigured } from "@/lib/firebase/client";
import { ROUTES } from "@/lib/constants";
import {
  formatCurrency,
  formatPercent,
  initials,
  profitClass,
} from "@/lib/utils";
import type { AppUser, Bet } from "@/types/domain";

function medal(rank: number) {
  if (rank === 1) return "🥇";
  if (rank === 2) return "🥈";
  if (rank === 3) return "🥉";
  return `#${rank}`;
}

/** Tinte de fila para el podio (top-3): oro, plata y bronce. */
function podiumRow(rank: number): string {
  if (rank === 1) return "bg-amber-400/10 hover:bg-amber-400/20";
  if (rank === 2) return "bg-zinc-400/10 hover:bg-zinc-400/20";
  if (rank === 3) return "bg-orange-500/10 hover:bg-orange-500/20";
  return "hover:bg-accent/30";
}

/** Aro de color del avatar para el podio. */
function podiumRing(rank: number): string {
  if (rank === 1) return "ring-2 ring-amber-400 ring-offset-1 ring-offset-background";
  if (rank === 2) return "ring-2 ring-zinc-400 ring-offset-1 ring-offset-background";
  if (rank === 3) return "ring-2 ring-orange-500 ring-offset-1 ring-offset-background";
  return "";
}

type SortKey = "roi" | "profit" | "balance" | "hitRate" | "betsCount" | "username";

export default function RankingPage() {
  const [allUsers, setAllUsers] = useState<AppUser[] | null>(null);
  const [allBets, setAllBets] = useState<Bet[]>([]);
  const { memberUids, activeGroup } = useGroup();
  const { appUser } = useAuth();

  // Columna por la que se ordena el ranking (por defecto ROI descendente).
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({
    key: "roi",
    dir: "desc",
  });

  function handleSort(key: SortKey) {
    setSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { key, dir: key === "username" ? "asc" : "desc" }
    );
  }

  // Cabecera de columna clicable: ordena por ese campo (y al re-pulsar invierte).
  const sortTh = (k: SortKey, label: string, thClass: string) => (
    <th className={thClass}>
      <button
        type="button"
        onClick={() => handleSort(k)}
        className={`inline-flex items-center gap-1 transition-colors hover:text-foreground ${
          sort.key === k ? "text-foreground" : ""
        }`}
        aria-label={`Ordenar por ${label}`}
      >
        {label}
        {sort.key === k ? (
          sort.dir === "asc" ? (
            <ArrowUp className="h-3 w-3" />
          ) : (
            <ArrowDown className="h-3 w-3" />
          )
        ) : (
          <ArrowUpDown className="h-3 w-3 opacity-30" />
        )}
      </button>
    </th>
  );

  useEffect(() => {
    if (!isFirebaseConfigured) {
      setAllUsers([]);
      return;
    }
    const unsubUsers = subscribeToRanking(setAllUsers);
    const unsubBets = subscribeToAllBets(setAllBets);
    return () => {
      unsubUsers();
      unsubBets();
    };
  }, []);

  // Filtra a los miembros del grupo activo. Si activeGroup aún no está
  // resuelto (carga inicial) devolvemos null para que la tabla se quede
  // en "Cargando…".
  const users = useMemo(() => {
    if (allUsers === null) return null;
    if (!activeGroup || memberUids.size === 0) return null;
    return allUsers.filter((u) => memberUids.has(u.uid));
  }, [allUsers, memberUids, activeGroup]);

  const bets = useMemo(() => {
    if (!activeGroup) return [];
    return allBets.filter(
      (b) => betInGroup(b, activeGroup.id) && memberUids.has(b.userId)
    );
  }, [allBets, memberUids, activeGroup]);

  // Balance general del grupo en apuestas de tipo superaumento (todas las
  // de los miembros del grupo activo).
  const superaumento = useMemo(
    () => computeSuperaumentoSummary(bets),
    [bets]
  );

  // Stats por usuario calculadas a partir de las apuestas DEL GRUPO ACTIVO.
  // Sustituyen al `user.stats` global para que el ranking refleje solo lo
  // ocurrido en este grupo.
  const groupStatsByUid = useMemo(() => {
    const map = new Map<string, ReturnType<typeof computeUserStats>>();
    for (const u of users ?? []) {
      const userBets = bets.filter((b) => b.userId === u.uid);
      map.set(u.uid, computeUserStats(userBets));
    }
    return map;
  }, [users, bets]);

  // Saldo actual del usuario en el grupo = saldo inicial del grupo + profit.
  const balanceByUid = useMemo(() => {
    const map = new Map<string, number>();
    for (const u of users ?? []) {
      const initial = getInitialBalances(u, activeGroup?.id);
      const initialSum =
        initial.bet365 + initial.winamax + initial.other;
      const profit = groupStatsByUid.get(u.uid)?.totalProfit ?? 0;
      map.set(u.uid, initialSum + profit);
    }
    return map;
  }, [users, groupStatsByUid, activeGroup]);

  // Mayor |ROI| del grupo, para escalar la barra de ROI en línea de la tabla.
  const maxAbsRoi = useMemo(() => {
    let m = 0;
    for (const u of users ?? []) {
      const r = Math.abs(groupStatsByUid.get(u.uid)?.roi ?? 0);
      if (r > m) m = r;
    }
    return m || 1;
  }, [users, groupStatsByUid]);

  // Lista ordenada según la columna elegida (por defecto ROI desc). Desempate
  // estable por beneficio.
  const rankedUsers = useMemo(() => {
    if (!users) return null;
    const valueOf = (u: AppUser): number | string => {
      const s = groupStatsByUid.get(u.uid);
      switch (sort.key) {
        case "roi":
          return s?.roi ?? 0;
        case "profit":
          return s?.totalProfit ?? 0;
        case "balance":
          return balanceByUid.get(u.uid) ?? 0;
        case "hitRate":
          return s?.hitRate ?? 0;
        case "betsCount":
          return s?.betsCount ?? 0;
        case "username":
          return u.username.toLowerCase();
      }
    };
    return [...users].sort((a, b) => {
      const va = valueOf(a);
      const vb = valueOf(b);
      let cmp =
        typeof va === "string" && typeof vb === "string"
          ? va.localeCompare(vb, "es")
          : (va as number) - (vb as number);
      cmp = sort.dir === "asc" ? cmp : -cmp;
      if (cmp !== 0) return cmp;
      // Desempate estable: más beneficio primero.
      return (
        (groupStatsByUid.get(b.uid)?.totalProfit ?? 0) -
        (groupStatsByUid.get(a.uid)?.totalProfit ?? 0)
      );
    });
  }, [users, groupStatsByUid, balanceByUid, sort]);

  return (
    <div className="space-y-6">
      {/* ─── Balance general de superaumentos ─── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Zap className="h-4 w-4 text-primary" />
            Balance de superaumentos
          </CardTitle>
          <CardDescription>
            Resultado conjunto del grupo en apuestas de tipo superaumento.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 grid-cols-2 sm:grid-cols-4">
            {[
              {
                label: "Balance",
                value: `${superaumento.profit > 0 ? "+" : ""}${formatCurrency(
                  superaumento.profit
                )}`,
                accent: profitClass(superaumento.profit),
                icon: <Zap className="h-4 w-4" />,
              },
              {
                label: "Total",
                value: String(superaumento.count),
                icon: <Ticket className="h-4 w-4" />,
              },
              {
                label: "Ganadas",
                value: String(superaumento.won),
                accent: "text-profit",
                icon: <Trophy className="h-4 w-4" />,
              },
              {
                label: "Perdidas",
                value: String(superaumento.lost),
                accent: "text-loss",
                icon: <TrendingDown className="h-4 w-4" />,
              },
            ].map((s) => (
              <div
                key={s.label}
                className="rounded-md border bg-card p-3 transition-shadow hover:shadow-md"
              >
                <div className="flex items-center justify-between">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    {s.label}
                  </p>
                  <span className="text-muted-foreground/60">{s.icon}</span>
                </div>
                <p
                  className={`mt-1 font-mono text-lg font-bold tabular-nums ${
                    s.accent ?? ""
                  }`}
                >
                  {s.value}
                </p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* ─── Bloque de gráficas ─── */}
      {/* grid-cols-1 en móvil: limita la columna al ancho disponible para que
          el SVG de las gráficas no la "estire" y se desborde a la derecha. */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <LineChart className="h-4 w-4 text-primary" />
              Evolución del beneficio
            </CardTitle>
            <CardDescription>
              Beneficio/pérdida acumulado a lo largo del periodo elegido (por
              defecto, todo el historial). Cada línea arranca en 0 € al inicio
              del periodo — solo refleja ganancias y pérdidas, no el saldo de la
              banca. Click en un nombre para ocultar/mostrar su línea.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {users === null ? (
              <div className="space-y-3">
                <Skeleton className="h-8 w-44" />
                <Skeleton className="h-[320px] w-full rounded-lg" />
                <div className="flex flex-wrap gap-2">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="h-6 w-20 rounded-full" />
                  ))}
                </div>
              </div>
            ) : (
              <RankingChart users={users} bets={bets} />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <BarChart3 className="h-4 w-4 text-primary" />
              Apuestas por jugador
            </CardTitle>
            <CardDescription>
              Una barra por jugador. Elige un día concreto o &quot;Total&quot;
              para ver cuántas apuestas ha registrado cada uno.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {users === null ? (
              <div className="space-y-3">
                <Skeleton className="h-8 w-44" />
                <Skeleton className="h-[320px] w-full rounded-lg" />
                <div className="flex flex-wrap gap-2">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="h-6 w-20 rounded-full" />
                  ))}
                </div>
              </div>
            ) : (
              <BetsBarChart users={users} bets={bets} />
            )}
          </CardContent>
        </Card>
      </div>

      {/* ─── Tabla de clasificación ─── */}
      <Card>
        <CardHeader>
          <CardTitle>Clasificación</CardTitle>
          <CardDescription>
            Pulsa una columna para ordenar por ese campo (vuelve a pulsar para
            invertir). Por defecto, por <strong>ROI</strong>. Se actualiza en
            tiempo real.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {users === null ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton className="h-8 w-8 rounded-full" />
                  <Skeleton className="h-4 flex-1" />
                  <Skeleton className="h-4 w-12" />
                  <Skeleton className="h-4 w-16" />
                </div>
              ))}
            </div>
          ) : users.length === 0 ? (
            <div className="px-6 py-8 text-center text-sm text-muted-foreground">
              Aún no hay usuarios registrados.
            </div>
          ) : (
            <div className="overflow-x-auto">
              {/* min-w fuerza que en móvil la tabla sea más ancha que la
                  pantalla → el contenedor (overflow-x-auto) permite desplazar
                  horizontalmente para ver todas las columnas. En PC el
                  contenedor es más ancho que 640px, así que no cambia nada. */}
              <table className="w-full min-w-[640px] text-sm">
                <thead className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground [&_th]:whitespace-nowrap">
                  <tr>
                    <th className="px-4 py-3 w-16">#</th>
                    {sortTh("username", "Usuario", "px-2 py-3")}
                    {sortTh("roi", "ROI", "px-2 py-3 text-right")}
                    {sortTh("profit", "Beneficio", "px-2 py-3 text-right")}
                    {sortTh("balance", "Saldo", "px-2 py-3 text-right")}
                    {sortTh("hitRate", "% Acierto", "px-2 py-3 text-right")}
                    {sortTh("betsCount", "Apuestas", "px-4 py-3 text-right")}
                  </tr>
                </thead>
                <tbody className="divide-y [&_td]:whitespace-nowrap">
                  {(rankedUsers ?? users).map((u, idx, ranked) => {
                    const rank = idx + 1;
                    const s = groupStatsByUid.get(u.uid);
                    const roi = s?.roi ?? 0;
                    const profit = s?.totalProfit ?? 0;
                    const hitRate = s?.hitRate ?? 0;
                    const balance = balanceByUid.get(u.uid) ?? 0;
                    const isMe = appUser?.uid === u.uid;
                    // Farolillo rojo: el último de la lista mostrada (con la
                    // ordenación por defecto, el de peor ROI). Requiere ≥2.
                    const isLast = ranked.length > 1 && idx === ranked.length - 1;
                    return (
                      <tr
                        key={u.uid}
                        className={`transition-colors ${podiumRow(rank)}`}
                      >
                        <td className="px-4 py-3 text-base font-semibold">
                          {medal(rank)}
                        </td>
                        <td className="px-2 py-3">
                          <Link
                            href={ROUTES.profile(u.uid)}
                            className="flex items-center gap-3 hover:underline"
                          >
                            <Avatar className={`h-8 w-8 ${podiumRing(rank)}`}>
                              {u.avatarUrl && <AvatarImage src={u.avatarUrl} />}
                              <AvatarFallback>{initials(u.username)}</AvatarFallback>
                            </Avatar>
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="truncate font-medium">
                                  {u.username}
                                </span>
                                {isMe && (
                                  <Star
                                    className="h-4 w-4 shrink-0 fill-primary text-primary"
                                    aria-label="Eres tú"
                                  />
                                )}
                                {isLast && (
                                  <span
                                    className="shrink-0 text-xl leading-none"
                                    role="img"
                                    aria-label="Farolillo rojo: último de la clasificación"
                                    title="Farolillo rojo: último de la clasificación"
                                  >
                                    🤡
                                  </span>
                                )}
                              </div>
                              <p className="truncate text-xs text-muted-foreground">
                                @{u.username}
                              </p>
                            </div>
                          </Link>
                        </td>
                        <td className="px-2 py-3">
                          <div className="flex flex-col items-end gap-1">
                            <span
                              className={`font-mono font-bold tabular-nums ${profitClass(
                                roi
                              )}`}
                            >
                              {roi > 0 ? "+" : ""}
                              {formatPercent(roi)}
                            </span>
                            <span className="block h-1 w-16 overflow-hidden rounded-full bg-muted">
                              <span
                                className="block h-full rounded-full"
                                style={{
                                  width: `${Math.min(
                                    100,
                                    (Math.abs(roi) / maxAbsRoi) * 100
                                  )}%`,
                                  marginLeft: roi < 0 ? "auto" : undefined,
                                  backgroundColor:
                                    roi >= 0
                                      ? "hsl(var(--profit))"
                                      : "hsl(var(--loss))",
                                }}
                              />
                            </span>
                          </div>
                        </td>
                        <td
                          className={`px-2 py-3 text-right font-mono ${profitClass(
                            profit
                          )}`}
                        >
                          {profit > 0 ? "+" : ""}
                          {formatCurrency(profit)}
                        </td>
                        <td className="px-2 py-3 text-right font-mono">
                          {formatCurrency(balance)}
                        </td>
                        <td className="px-2 py-3 text-right font-mono text-muted-foreground">
                          {formatPercent(hitRate)}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-muted-foreground">
                          {s?.betsCount ?? 0}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
