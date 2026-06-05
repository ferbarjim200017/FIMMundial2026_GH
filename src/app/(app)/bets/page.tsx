"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Plus, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { BetsTable } from "@/components/bets/bets-table";
import { useAuth } from "@/features/auth/auth.context";
import { subscribeToBets, type BetsFilter } from "@/features/bets/bets.service";
import {
  BOOKMAKER_OPTIONS,
  STATUS_OPTIONS,
} from "@/features/bets/bets.schema";
import { formatCurrency, formatPercent, profitClass } from "@/lib/utils";
import { ROUTES } from "@/lib/constants";
import type { Bet } from "@/types/domain";

type ScopeKey = "me" | "all";

export default function BetsPage() {
  const { appUser, isAdmin } = useAuth();
  const [bets, setBets] = useState<Bet[]>([]);
  const [loading, setLoading] = useState(true);
  const [scope, setScope] = useState<ScopeKey>("me");
  const [status, setStatus] = useState<BetsFilter["status"]>("all");
  const [bookmaker, setBookmaker] = useState<BetsFilter["bookmaker"]>("all");

  useEffect(() => {
    if (!appUser) return;
    setLoading(true);
    const unsub = subscribeToBets(
      {
        userId: scope === "me" ? appUser.uid : undefined,
        status,
        bookmaker,
      },
      (next) => {
        setBets(next);
        setLoading(false);
      },
      () => setLoading(false)
    );
    return unsub;
  }, [appUser, scope, status, bookmaker]);

  const stats = useMemo(() => summarize(bets), [bets]);

  if (!appUser) return null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Apuestas</h1>
          <p className="text-sm text-muted-foreground">
            Registra y liquida tus apuestas reales.
          </p>
        </div>
        <Button asChild>
          <Link href={`${ROUTES.bets}/new`}>
            <Plus className="h-4 w-4" /> Nueva apuesta
          </Link>
        </Button>
      </div>

      {/* KPIs filtrados */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Kpi label="Apuestas" value={String(stats.count)} />
        <Kpi label="Stake total" value={formatCurrency(stats.totalStake)} />
        <Kpi
          label="Beneficio"
          value={formatCurrency(stats.totalProfit)}
          tone={profitClass(stats.totalProfit)}
        />
        <Kpi
          label="ROI"
          value={formatPercent(stats.roi)}
          tone={profitClass(stats.roi)}
        />
        <Kpi
          label="Pendientes"
          value={`${stats.pending} (${formatCurrency(stats.pendingStake)})`}
        />
      </div>

      {/* Filtros */}
      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 p-4">
          <div className="flex items-center gap-2 text-xs uppercase text-muted-foreground">
            <Filter className="h-3.5 w-3.5" />
            Filtros
          </div>

          {isAdmin && (
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Ámbito</label>
              <Select value={scope} onValueChange={(v) => setScope(v as ScopeKey)}>
                <SelectTrigger className="h-9 w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="me">Mis apuestas</SelectItem>
                  <SelectItem value="all">Todas (admin)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Estado</label>
            <Select
              value={status ?? "all"}
              onValueChange={(v) => setStatus(v as BetsFilter["status"])}
            >
              <SelectTrigger className="h-9 w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {STATUS_OPTIONS.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Casa</label>
            <Select
              value={bookmaker ?? "all"}
              onValueChange={(v) => setBookmaker(v as BetsFilter["bookmaker"])}
            >
              <SelectTrigger className="h-9 w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {BOOKMAKER_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <p className="text-sm text-muted-foreground">Cargando apuestas…</p>
      ) : (
        <BetsTable bets={bets} ownerUid={appUser.uid} isAdmin={isAdmin} />
      )}
    </div>
  );
}

function Kpi({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <Card>
      <CardContent className="p-3">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
        <p className={`mt-0.5 font-mono text-lg font-bold ${tone ?? ""}`}>
          {value}
        </p>
      </CardContent>
    </Card>
  );
}

function summarize(bets: Bet[]) {
  const decided = bets.filter((b) => b.status !== "pending" && b.status !== "void");
  const totalStake = decided.reduce((a, b) => a + b.stake, 0);
  const totalProfit = bets.reduce((a, b) => a + b.profit, 0);
  const pending = bets.filter((b) => b.status === "pending");
  return {
    count: bets.length,
    totalStake,
    totalProfit,
    roi: totalStake > 0 ? (totalProfit / totalStake) * 100 : 0,
    pending: pending.length,
    pendingStake: pending.reduce((a, b) => a + b.stake, 0),
  };
}
