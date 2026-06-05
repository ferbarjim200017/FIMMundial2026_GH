"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { LineChart } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { RankingChart } from "@/components/ranking/ranking-chart";
import { subscribeToRanking } from "@/features/users/users.service";
import { subscribeToBets } from "@/features/bets/bets.service";
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
  const [users, setUsers] = useState<AppUser[] | null>(null);
  const [bets, setBets] = useState<Bet[]>([]);

  useEffect(() => {
    if (!isFirebaseConfigured) {
      setUsers([]);
      return;
    }
    const unsubUsers = subscribeToRanking(setUsers);
    const unsubBets = subscribeToBets({}, setBets);
    return () => {
      unsubUsers();
      unsubBets();
    };
  }, []);

  return (
    <div className="space-y-6">
      {/* ─── Gráfica de evolución ─── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <LineChart className="h-4 w-4 text-primary" />
            Evolución del saldo
          </CardTitle>
          <CardDescription>
            Cada línea muestra cómo ha evolucionado el saldo de un usuario a
            partir de sus apuestas liquidadas. Click en un nombre para
            ocultar/mostrar su línea.
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

      {/* ─── Tabla de clasificación ─── */}
      <Card>
        <CardHeader>
          <CardTitle>Clasificación</CardTitle>
          <CardDescription>
            Posiciones por saldo actual. Se actualiza en tiempo real con cada
            apuesta liquidada.
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
                    <th className="px-2 py-3 text-right">Saldo</th>
                    <th className="px-2 py-3 text-right hidden sm:table-cell">
                      Beneficio
                    </th>
                    <th className="px-2 py-3 text-right hidden md:table-cell">
                      ROI
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
                        <td className="px-2 py-3 text-right font-mono font-medium">
                          {formatCurrency(u.currentBalance)}
                        </td>
                        <td
                          className={`px-2 py-3 text-right font-mono hidden sm:table-cell ${profitClass(
                            u.stats.totalProfit
                          )}`}
                        >
                          {u.stats.totalProfit > 0 ? "+" : ""}
                          {formatCurrency(u.stats.totalProfit)}
                        </td>
                        <td
                          className={`px-2 py-3 text-right font-mono hidden md:table-cell ${profitClass(
                            u.stats.roi
                          )}`}
                        >
                          {u.stats.roi > 0 ? "+" : ""}
                          {formatPercent(u.stats.roi)}
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
