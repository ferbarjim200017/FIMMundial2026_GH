"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useAuth } from "@/features/auth/auth.context";
import { subscribeToBets } from "@/features/bets/bets.service";
import { bookmakerLabel } from "@/features/bets/bets.utils";
import { BetStatusBadge } from "@/components/bets/bet-status-badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatPercent, profitClass } from "@/lib/utils";
import { ROUTES } from "@/lib/constants";
import type { Bet } from "@/types/domain";

export default function DashboardPage() {
  const { appUser } = useAuth();
  const [recent, setRecent] = useState<Bet[]>([]);

  useEffect(() => {
    if (!appUser) return;
    const unsub = subscribeToBets({ userId: appUser.uid }, (bets) =>
      setRecent(bets.slice(0, 5))
    );
    return unsub;
  }, [appUser]);

  if (!appUser) return null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Hola, {appUser.username} 👋
        </h1>
        <p className="text-sm text-muted-foreground">
          Resumen de tu actividad. Módulo 2 (Apuestas) activo.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Saldo actual"
          value={formatCurrency(appUser.currentBalance)}
        />
        <StatCard
          label="Beneficio total"
          value={formatCurrency(appUser.stats.totalProfit)}
          valueClass={profitClass(appUser.stats.totalProfit)}
        />
        <StatCard
          label="ROI"
          value={formatPercent(appUser.stats.roi)}
          valueClass={profitClass(appUser.stats.roi)}
        />
        <StatCard
          label="Apuestas"
          value={`${appUser.stats.betsCount} (${appUser.stats.betsPending} pdtes.)`}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Últimas apuestas</CardTitle>
              <CardDescription>Tus 5 registros más recientes</CardDescription>
            </div>
            <Button asChild variant="ghost" size="sm">
              <Link href={ROUTES.bets}>
                Ver todas <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            {recent.length === 0 ? (
              <div className="px-6 py-8 text-center text-sm text-muted-foreground">
                Aún no has registrado ninguna apuesta.
                <div className="mt-3">
                  <Button asChild size="sm">
                    <Link href={`${ROUTES.bets}/new`}>Registrar primera apuesta</Link>
                  </Button>
                </div>
              </div>
            ) : (
              <ul className="divide-y">
                {recent.map((b) => (
                  <li
                    key={b.id}
                    className="flex items-center gap-3 px-4 py-3 text-sm hover:bg-accent/30"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{b.matchLabel}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {b.selection} @ {b.odds.toFixed(2)} ·{" "}
                        {bookmakerLabel(b.bookmaker, b.bookmakerLabel)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-mono text-xs text-muted-foreground">
                        {formatCurrency(b.stake)}
                      </p>
                      {b.status !== "pending" && (
                        <p className={`font-mono text-xs ${profitClass(b.profit)}`}>
                          {b.profit >= 0 ? "+" : ""}
                          {formatCurrency(b.profit)}
                        </p>
                      )}
                    </div>
                    <BetStatusBadge status={b.status} />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Tus rachas</CardTitle>
            <CardDescription>Calculadas en tiempo real</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Row label="Racha actual" value={String(appUser.stats.currentStreak)} />
            <Row label="Mejor racha" value={String(appUser.stats.bestStreak)} />
            <Row label="% Acierto" value={formatPercent(appUser.stats.hitRate)} />
            <Row label="Cuota media" value={appUser.stats.avgOdds.toFixed(2)} />
            <Row label="Stake medio" value={formatCurrency(appUser.stats.avgStake)} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Próximos pasos</CardTitle>
          <CardDescription>Roadmap del proyecto</CardDescription>
        </CardHeader>
        <CardContent className="space-y-1.5 text-sm">
          <p>✅ Módulo 1: Setup + Auth + Usuarios</p>
          <p>✅ Módulo 2: Gestión de Apuestas <em>(actual)</em></p>
          <p className="text-muted-foreground">⏭️ Módulo 3: Centro Mundial (equipos, partidos, grupos)</p>
          <p className="text-muted-foreground">⏭️ Módulo 4: Ranking + Carrusel real-time</p>
          <p className="text-muted-foreground">⏭️ Módulo 5: Perfil avanzado + estadísticas</p>
          <p className="text-muted-foreground">⏭️ Módulo 6: Predicciones + Logros</p>
          <p className="text-muted-foreground">⏭️ Módulo 7: Feed social</p>
          <p className="text-muted-foreground">⏭️ Módulo 8: Panel admin completo</p>
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({
  label,
  value,
  valueClass,
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
        <p className={`mt-1 text-2xl font-bold ${valueClass ?? ""}`}>{value}</p>
      </CardContent>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono font-medium">{value}</span>
    </div>
  );
}
