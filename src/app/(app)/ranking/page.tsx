"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { BarChart3, LineChart, Zap } from "lucide-react";
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
import { subscribeToRanking } from "@/features/users/users.service";
import { subscribeToAllBets } from "@/features/bets/bets.service";
import {
  betInGroup,
  computeSuperaumentoSummary,
  computeUserStats,
  getInitialBalances,
} from "@/features/bets/bets.utils";
import { useGroup } from "@/features/groups/groups.context";
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

export default function RankingPage() {
  const [allUsers, setAllUsers] = useState<AppUser[] | null>(null);
  const [allBets, setAllBets] = useState<Bet[]>([]);
  const { memberUids, activeGroup } = useGroup();

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

  // Lista ordenada por ROI del grupo (con beneficio como desempate).
  const rankedUsers = useMemo(() => {
    if (!users) return null;
    return [...users].sort((a, b) => {
      const sa = groupStatsByUid.get(a.uid);
      const sb = groupStatsByUid.get(b.uid);
      const roiA = sa?.roi ?? 0;
      const roiB = sb?.roi ?? 0;
      if (roiA !== roiB) return roiB - roiA;
      const profitA = sa?.totalProfit ?? 0;
      const profitB = sb?.totalProfit ?? 0;
      return profitB - profitA;
    });
  }, [users, groupStatsByUid]);

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
              },
              { label: "Total", value: String(superaumento.count) },
              {
                label: "Ganadas",
                value: String(superaumento.won),
                accent: "text-profit",
              },
              {
                label: "Perdidas",
                value: String(superaumento.lost),
                accent: "text-loss",
              },
            ].map((s) => (
              <div key={s.label} className="rounded-md border bg-card p-3">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  {s.label}
                </p>
                <p
                  className={`mt-1 font-mono text-lg font-bold ${s.accent ?? ""}`}
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
              Todos arrancan hoy en 0 €. La línea sube o baja con cada
              apuesta liquidada — solo refleja ganancias y pérdidas, no
              el saldo de la banca. Click en un nombre para ocultar/mostrar
              su línea.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {users === null ? (
              <div className="px-6 py-8 text-center text-sm text-muted-foreground">
                Cargando…
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
              <div className="px-6 py-8 text-center text-sm text-muted-foreground">
                Cargando…
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
            Ordenado por <strong>ROI</strong> (% de beneficio/pérdida sobre lo
            apostado). Se actualiza en tiempo real.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {users === null ? (
            <div className="px-6 py-8 text-center text-sm text-muted-foreground">
              Cargando ranking…
            </div>
          ) : users.length === 0 ? (
            <div className="px-6 py-8 text-center text-sm text-muted-foreground">
              Aún no hay usuarios registrados.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 w-16">#</th>
                    <th className="px-2 py-3">Usuario</th>
                    <th className="px-2 py-3 text-right">ROI</th>
                    <th className="px-2 py-3 text-right hidden sm:table-cell">
                      Beneficio
                    </th>
                    <th className="px-2 py-3 text-right hidden md:table-cell">
                      Saldo
                    </th>
                    <th className="px-2 py-3 text-right hidden md:table-cell">
                      % Acierto
                    </th>
                    <th className="px-4 py-3 text-right hidden lg:table-cell">
                      Apuestas
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {(rankedUsers ?? users).map((u, idx) => {
                    const rank = idx + 1;
                    const s = groupStatsByUid.get(u.uid);
                    const roi = s?.roi ?? 0;
                    const profit = s?.totalProfit ?? 0;
                    const hitRate = s?.hitRate ?? 0;
                    const balance = balanceByUid.get(u.uid) ?? 0;
                    return (
                      <tr key={u.uid} className="hover:bg-accent/30">
                        <td className="px-4 py-3 font-semibold">{medal(rank)}</td>
                        <td className="px-2 py-3">
                          <Link
                            href={ROUTES.profile(u.uid)}
                            className="flex items-center gap-3 hover:underline"
                          >
                            <Avatar className="h-8 w-8">
                              {u.avatarUrl && <AvatarImage src={u.avatarUrl} />}
                              <AvatarFallback>{initials(u.username)}</AvatarFallback>
                            </Avatar>
                            <div className="min-w-0">
                              <p className="truncate font-medium">{u.username}</p>
                              <p className="truncate text-xs text-muted-foreground">
                                @{u.username}
                              </p>
                            </div>
                          </Link>
                        </td>
                        <td
                          className={`px-2 py-3 text-right font-mono font-bold ${profitClass(
                            roi
                          )}`}
                        >
                          {roi > 0 ? "+" : ""}
                          {formatPercent(roi)}
                        </td>
                        <td
                          className={`px-2 py-3 text-right font-mono hidden sm:table-cell ${profitClass(
                            profit
                          )}`}
                        >
                          {profit > 0 ? "+" : ""}
                          {formatCurrency(profit)}
                        </td>
                        <td className="px-2 py-3 text-right font-mono hidden md:table-cell">
                          {formatCurrency(balance)}
                        </td>
                        <td className="px-2 py-3 text-right font-mono text-muted-foreground hidden md:table-cell">
                          {formatPercent(hitRate)}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-muted-foreground hidden lg:table-cell">
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
