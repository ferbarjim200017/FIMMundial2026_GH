"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { BarChart3, LineChart } from "lucide-react";
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
import { subscribeToBets } from "@/features/bets/bets.service";
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
    const unsubBets = subscribeToBets({}, setAllBets);
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

  const bets = useMemo(
    () => allBets.filter((b) => memberUids.has(b.userId)),
    [allBets, memberUids]
  );

  return (
    <div className="space-y-6">
      {/* ─── Bloque de gráficas ─── */}
      <div className="grid gap-6 lg:grid-cols-2">
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
                  {users.map((u, idx) => {
                    const rank = idx + 1;
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
                            u.stats.roi
                          )}`}
                        >
                          {u.stats.roi > 0 ? "+" : ""}
                          {formatPercent(u.stats.roi)}
                        </td>
                        <td
                          className={`px-2 py-3 text-right font-mono hidden sm:table-cell ${profitClass(
                            u.stats.totalProfit
                          )}`}
                        >
                          {u.stats.totalProfit > 0 ? "+" : ""}
                          {formatCurrency(u.stats.totalProfit)}
                        </td>
                        <td className="px-2 py-3 text-right font-mono hidden md:table-cell">
                          {formatCurrency(u.currentBalance)}
                        </td>
                        <td className="px-2 py-3 text-right font-mono text-muted-foreground hidden md:table-cell">
                          {formatPercent(u.stats.hitRate)}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-muted-foreground hidden lg:table-cell">
                          {u.stats.betsCount}
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
