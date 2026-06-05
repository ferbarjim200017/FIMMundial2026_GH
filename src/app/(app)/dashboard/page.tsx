"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useAuth } from "@/features/auth/auth.context";
import { subscribeToBets } from "@/features/bets/bets.service";
import {
  bookmakerLabel,
  computeBookmakerSummary,
  getInitialBalances,
} from "@/features/bets/bets.utils";
import { BetStatusBadge } from "@/components/bets/bet-status-badge";
import { updateInitialBalances } from "@/features/users/users.service";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  cn,
  formatCurrency,
  formatPercent,
  profitClass,
} from "@/lib/utils";
import { ROUTES } from "@/lib/constants";
import type { Bet } from "@/types/domain";

export default function DashboardPage() {
  const { appUser } = useAuth();
  const [bets, setBets] = useState<Bet[]>([]);

  useEffect(() => {
    if (!appUser) return;
    const unsub = subscribeToBets({ userId: appUser.uid }, setBets);
    return unsub;
  }, [appUser]);

  const summary = useMemo(
    () => (appUser ? computeBookmakerSummary(appUser, bets) : null),
    [appUser, bets]
  );

  if (!appUser || !summary) return null;

  const recent = bets.slice(0, 5);
  const stats = appUser.stats;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Hola, {appUser.username} 👋
        </h1>
        <p className="text-sm text-muted-foreground">
          Aquí tienes tu resumen completo: saldos por casa y estadísticas en tiempo real.
        </p>
      </div>

      {/* ─────── Resumen general ─────── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Saldo total"
          value={formatCurrency(summary.total.current)}
        />
        <StatCard
          label="Beneficio total"
          value={`${stats.totalProfit > 0 ? "+" : ""}${formatCurrency(stats.totalProfit)}`}
          valueClass={profitClass(stats.totalProfit)}
        />
        <StatCard
          label="ROI"
          value={formatPercent(stats.roi)}
          valueClass={profitClass(stats.roi)}
        />
        <StatCard
          label="% Acierto"
          value={formatPercent(stats.hitRate)}
        />
      </div>

      {/* ─────── Saldos por casa ─────── */}
      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold">Saldos por casa</h2>
          <p className="text-sm text-muted-foreground">
            Configura tu saldo inicial en cada casa. El saldo actual se
            calcula sumando el beneficio de tus apuestas liquidadas.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <BookmakerCard
            uid={appUser.uid}
            bookmaker="bet365"
            initial={summary.bet365.initial}
            profit={summary.bet365.profit}
            current={summary.bet365.current}
            pendingStake={summary.bet365.pendingStake}
            betsCount={summary.bet365.betsCount}
          />
          <BookmakerCard
            uid={appUser.uid}
            bookmaker="winamax"
            initial={summary.winamax.initial}
            profit={summary.winamax.profit}
            current={summary.winamax.current}
            pendingStake={summary.winamax.pendingStake}
            betsCount={summary.winamax.betsCount}
          />
          <TotalBalanceCard
            initial={summary.total.initial}
            profit={summary.total.profit}
            current={summary.total.current}
            pendingStake={summary.total.pendingStake}
            other={summary.other.current}
            otherInitial={getInitialBalances(appUser).other}
          />
        </div>
      </section>

      {/* ─────── Desglose de apuestas ─────── */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Desglose de apuestas</h2>
        <div className="grid gap-4 grid-cols-2 sm:grid-cols-4">
          <MiniStat label="Total" value={stats.betsCount} />
          <MiniStat label="Ganadas" value={stats.betsWon} accent="text-profit" />
          <MiniStat label="Perdidas" value={stats.betsLost} accent="text-loss" />
          <MiniStat label="Pendientes" value={stats.betsPending} />
          <MiniStat label="Anuladas" value={stats.betsVoid} />
          <MiniStat label="Racha actual" value={stats.currentStreak} accent={profitClass(stats.currentStreak)} />
          <MiniStat label="Mejor racha" value={stats.bestStreak} />
          <MiniStat label="Yield" value={formatPercent(stats.yield)} accent={profitClass(stats.yield)} />
        </div>
      </section>

      {/* ─────── Promedios ─────── */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Promedios</h2>
        <div className="grid gap-4 grid-cols-2 sm:grid-cols-4">
          <MiniStat label="Total apostado" value={formatCurrency(stats.totalStaked)} />
          <MiniStat label="Cuota media" value={stats.avgOdds.toFixed(2)} />
          <MiniStat label="Stake medio" value={formatCurrency(stats.avgStake)} />
          <MiniStat
            label="Saldo inicial total"
            value={formatCurrency(summary.total.initial)}
          />
        </div>
      </section>

      {/* ─────── Últimas apuestas ─────── */}
      <Card>
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
        <p className={cn("mt-1 text-2xl font-bold", valueClass)}>{value}</p>
      </CardContent>
    </Card>
  );
}

function MiniStat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string | number;
  accent?: string;
}) {
  return (
    <Card>
      <CardContent className="p-3">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
        <p className={cn("mt-1 text-lg font-bold font-mono", accent)}>{value}</p>
      </CardContent>
    </Card>
  );
}

function BookmakerCard({
  uid,
  bookmaker,
  initial,
  profit,
  current,
  pendingStake,
  betsCount,
}: {
  uid: string;
  bookmaker: "bet365" | "winamax";
  initial: number;
  profit: number;
  current: number;
  pendingStake: number;
  betsCount: number;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(initial.toString());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!editing) setDraft(initial.toString());
  }, [initial, editing]);

  async function handleSave() {
    const parsed = Number(draft.replace(",", "."));
    if (Number.isNaN(parsed) || parsed < 0) {
      window.alert("Introduce un saldo inicial válido (>= 0)");
      return;
    }
    setSaving(true);
    try {
      await updateInitialBalances(uid, { [bookmaker]: parsed });
      setEditing(false);
    } catch (err) {
      console.error("[updateInitialBalances]", err);
      window.alert(
        err instanceof Error ? `No se pudo guardar: ${err.message}` : "Error guardando"
      );
    } finally {
      setSaving(false);
    }
  }

  const label = bookmaker === "bet365" ? "Bet365" : "Winamax";

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{label}</CardTitle>
        <CardDescription>
          {betsCount} apuesta{betsCount === 1 ? "" : "s"}
          {pendingStake > 0 && (
            <> · {formatCurrency(pendingStake)} pendiente</>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <p className="text-xs uppercase tracking-wider text-muted-foreground">
            Saldo actual
          </p>
          <p className="font-mono text-2xl font-bold">
            {formatCurrency(current)}
          </p>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Beneficio</span>
          <span className={cn("font-mono font-medium", profitClass(profit))}>
            {profit > 0 ? "+" : ""}
            {formatCurrency(profit)}
          </span>
        </div>

        {!editing ? (
          <div className="flex items-center justify-between gap-2 border-t pt-3">
            <div>
              <p className="text-xs uppercase tracking-wider text-muted-foreground">
                Saldo inicial
              </p>
              <p className="font-mono text-sm font-medium">
                {formatCurrency(initial)}
              </p>
            </div>
            <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
              Editar
            </Button>
          </div>
        ) : (
          <div className="space-y-2 border-t pt-3">
            <Label htmlFor={`initial-${bookmaker}`} className="text-xs">
              Saldo inicial (€)
            </Label>
            <Input
              id={`initial-${bookmaker}`}
              type="number"
              min={0}
              step="0.01"
              inputMode="decimal"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              autoFocus
            />
            <div className="flex gap-2">
              <Button size="sm" onClick={handleSave} disabled={saving}>
                {saving ? "Guardando…" : "Guardar"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setEditing(false)}
                disabled={saving}
              >
                Cancelar
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function TotalBalanceCard({
  initial,
  profit,
  current,
  pendingStake,
  other,
  otherInitial,
}: {
  initial: number;
  profit: number;
  current: number;
  pendingStake: number;
  other: number;
  otherInitial: number;
}) {
  const hasOther = other !== 0 || otherInitial !== 0;
  return (
    <Card className="border-primary/40 bg-primary/5">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Total</CardTitle>
        <CardDescription>
          Suma de todas las casas
          {pendingStake > 0 && (
            <> · {formatCurrency(pendingStake)} pendiente</>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <p className="text-xs uppercase tracking-wider text-muted-foreground">
            Saldo actual
          </p>
          <p className="font-mono text-2xl font-bold">
            {formatCurrency(current)}
          </p>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Beneficio</span>
          <span className={cn("font-mono font-medium", profitClass(profit))}>
            {profit > 0 ? "+" : ""}
            {formatCurrency(profit)}
          </span>
        </div>
        <div className="flex items-center justify-between border-t pt-3 text-sm">
          <span className="text-muted-foreground">Saldo inicial</span>
          <span className="font-mono font-medium">{formatCurrency(initial)}</span>
        </div>
        {hasOther && (
          <p className="text-xs text-muted-foreground">
            Incluye <strong>{formatCurrency(other)}</strong> de otras casas
            (configurable más adelante).
          </p>
        )}
      </CardContent>
    </Card>
  );
}
