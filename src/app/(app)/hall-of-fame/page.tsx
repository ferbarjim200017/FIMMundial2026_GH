"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Crown,
  TrendingUp,
  TrendingDown,
  Target,
  Coins,
  Layers,
  Flame,
  Receipt,
  type LucideIcon,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { subscribeToAllBets } from "@/features/bets/bets.service";
import { useGroup } from "@/features/groups/groups.context";
import {
  betInGroup,
  betOutcome,
  bookmakerLabel,
  computeUserStats,
  round2,
} from "@/features/bets/bets.utils";
import { isFirebaseConfigured } from "@/lib/firebase/client";
import { cn, formatCurrency, formatPercent, initials, profitClass } from "@/lib/utils";
import type { AppUser, Bet } from "@/types/domain";

// ── Helpers de presentación ──────────────────────────────────────────────

function medal(i: number): string {
  return ["🥇", "🥈", "🥉"][i] ?? `${i + 1}.`;
}

/** Círculo con las iniciales del jugador (sin fotos, como pediste). */
function Initial({ name }: { name: string }) {
  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary">
      {initials(name)}
    </span>
  );
}

interface PodiumEntry {
  name: string;
  detail?: string;
  value: string;
  valueClass?: string;
}

/**
 * Tarjeta de podio reutilizable (sirve tanto para records de apuestas como
 * para rankings de jugadores). Muestra hasta 3 entradas con su medalla.
 */
function PodiumCard({
  title,
  icon: Icon,
  accent,
  entries,
  emptyText,
}: {
  title: string;
  icon: LucideIcon;
  accent?: string;
  entries: PodiumEntry[];
  emptyText?: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Icon className={cn("h-4 w-4", accent)} />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2.5">
        {entries.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            {emptyText ?? "Sin datos todavía."}
          </p>
        ) : (
          entries.map((e, i) => (
            <div key={i} className="flex items-center gap-2.5">
              <span className="w-5 shrink-0 text-center text-sm">{medal(i)}</span>
              <Initial name={e.name} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{e.name}</p>
                {e.detail && (
                  <p className="truncate text-xs text-muted-foreground">{e.detail}</p>
                )}
              </div>
              <span
                className={cn(
                  "shrink-0 font-mono text-sm font-semibold",
                  e.valueClass
                )}
              >
                {e.value}
              </span>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

function Metric({
  label,
  value,
  valueClass,
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="rounded-md border bg-muted/20 px-2.5 py-1.5">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className={cn("font-mono text-sm font-semibold", valueClass)}>{value}</p>
    </div>
  );
}

function BetHighlight({ label, bet }: { label: string; bet: Bet }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-md border px-2.5 py-1.5">
      <div className="min-w-0">
        <p className="text-[11px] text-muted-foreground">{label}</p>
        <p className="truncate text-xs">{bet.selection || bet.matchLabel || "—"}</p>
      </div>
      <span
        className={cn(
          "shrink-0 font-mono text-sm font-semibold",
          profitClass(bet.profit ?? 0)
        )}
      >
        {formatCurrency(bet.profit ?? 0)}
      </span>
    </div>
  );
}

// ── Tipos de cálculo ─────────────────────────────────────────────────────

interface PlayerAgg {
  user: AppUser;
  betsCount: number;
  totalStaked: number;
  best: Bet | null;
  worst: Bet | null;
  stats: ReturnType<typeof computeUserStats>;
}

// ── Página ───────────────────────────────────────────────────────────────

export default function HallOfFamePage() {
  const [allBets, setAllBets] = useState<Bet[]>([]);
  const { activeGroup, groupMembers, memberUids } = useGroup();

  // Reutiliza el listener COMPARTIDO de apuestas (ya vivo por el keep-alive del
  // layout): este salón de la fama no abre nada nuevo en Firestore, solo hace
  // cuentas sobre lo que ya está en memoria. Cero lecturas/escrituras.
  useEffect(() => {
    if (!isFirebaseConfigured) {
      setAllBets([]);
      return;
    }
    return subscribeToAllBets(setAllBets);
  }, []);

  // Apuestas del grupo activo y de sus miembros.
  const bets = useMemo(() => {
    if (!activeGroup) return [];
    return allBets.filter(
      (b) => betInGroup(b, activeGroup.id) && memberUids.has(b.userId)
    );
  }, [allBets, activeGroup, memberUids]);

  const usersById = useMemo(() => {
    const map: Record<string, AppUser> = {};
    for (const u of groupMembers) map[u.uid] = u;
    return map;
  }, [groupMembers]);

  const nameOf = (uid: string) => usersById[uid]?.username ?? "—";
  const betDetail = (b: Bet) =>
    `${b.selection || b.matchLabel || "—"} · ${bookmakerLabel(
      b.bookmaker,
      b.bookmakerLabel
    )} · cuota ${b.odds.toFixed(2)}`;

  // ── Records por apuesta (Top 3) ──
  const records = useMemo(() => {
    const settled = bets.filter((b) => b.status !== "pending");

    const topProfit = [...settled]
      .filter((b) => (b.profit ?? 0) > 0)
      .sort((a, b) => (b.profit ?? 0) - (a.profit ?? 0))
      .slice(0, 3);

    const topLoss = [...settled]
      .filter((b) => (b.profit ?? 0) < 0)
      .sort((a, b) => (a.profit ?? 0) - (b.profit ?? 0))
      .slice(0, 3);

    const topOdds = [...settled]
      .filter((b) => betOutcome(b) === "won")
      .sort((a, b) => b.odds - a.odds)
      .slice(0, 3);

    // "Mayor dinero apostado": dinero real, así que fuera freebets. Cuenta
    // incluso si la apuesta sigue pendiente (el dinero ya está jugado).
    const topStake = [...bets]
      .filter((b) => !b.isFreebet)
      .sort((a, b) => b.stake - a.stake)
      .slice(0, 3);

    const topCombo = [...settled]
      .filter((b) => b.isCombo && betOutcome(b) === "won")
      .sort((a, b) => (b.profit ?? 0) - (a.profit ?? 0))
      .slice(0, 3);

    return { topProfit, topLoss, topOdds, topStake, topCombo };
  }, [bets]);

  // ── Agregados por jugador ──
  const perPlayer = useMemo<PlayerAgg[]>(() => {
    return groupMembers
      .map((user) => {
        const userBets = bets.filter((b) => b.userId === user.uid);
        const settledU = userBets.filter((b) => b.status !== "pending");
        const best =
          [...settledU].sort((a, b) => (b.profit ?? 0) - (a.profit ?? 0))[0] ??
          null;
        const worst =
          [...settledU].sort((a, b) => (a.profit ?? 0) - (b.profit ?? 0))[0] ??
          null;
        const totalStaked = round2(
          userBets
            .filter((b) => !b.isFreebet)
            .reduce((acc, b) => acc + b.stake, 0)
        );
        return {
          user,
          betsCount: userBets.length,
          totalStaked,
          best,
          worst,
          stats: computeUserStats(userBets),
        };
      })
      .filter((p) => p.betsCount > 0);
  }, [groupMembers, bets]);

  // ── Podios de jugadores (Top 3) ──
  const mostBets = useMemo(
    () => [...perPlayer].sort((a, b) => b.betsCount - a.betsCount).slice(0, 3),
    [perPlayer]
  );
  const mostStaked = useMemo(
    () => [...perPlayer].sort((a, b) => b.totalStaked - a.totalStaked).slice(0, 3),
    [perPlayer]
  );
  const mostProfit = useMemo(
    () =>
      [...perPlayer]
        .sort((a, b) => b.stats.totalProfit - a.stats.totalProfit)
        .slice(0, 3),
    [perPlayer]
  );
  const bestStreak = useMemo(
    () =>
      [...perPlayer]
        .filter((p) => p.stats.bestStreak > 0)
        .sort((a, b) => b.stats.bestStreak - a.stats.bestStreak)
        .slice(0, 3),
    [perPlayer]
  );

  // ── Estados vacíos ──
  if (!activeGroup) {
    return (
      <div className="py-16 text-center text-sm text-muted-foreground">
        Selecciona un grupo para ver su salón de la fama.
      </div>
    );
  }

  const hasData = bets.length > 0;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <Crown className="h-6 w-6 text-yellow-500" />
          Salón de la fama
        </h1>
        <p className="text-sm text-muted-foreground">
          Records de <span className="font-medium">{activeGroup.name}</span>. Se
          actualiza solo con cada apuesta.
        </p>
      </header>

      {!hasData ? (
        <div className="py-16 text-center text-sm text-muted-foreground">
          Aún no hay apuestas en este grupo. ¡Que empiece la fiesta!
        </div>
      ) : (
        <>
          {/* Records por apuesta */}
          <section className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Records de apuestas
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <PodiumCard
                title="Mayores beneficios"
                icon={TrendingUp}
                accent="text-emerald-500"
                entries={records.topProfit.map((b) => ({
                  name: nameOf(b.userId),
                  detail: betDetail(b),
                  value: formatCurrency(b.profit ?? 0),
                  valueClass: profitClass(b.profit ?? 0),
                }))}
              />
              <PodiumCard
                title="Mayores pérdidas"
                icon={TrendingDown}
                accent="text-red-500"
                entries={records.topLoss.map((b) => ({
                  name: nameOf(b.userId),
                  detail: betDetail(b),
                  value: formatCurrency(b.profit ?? 0),
                  valueClass: profitClass(b.profit ?? 0),
                }))}
              />
              <PodiumCard
                title="Cuotas más altas acertadas"
                icon={Target}
                accent="text-sky-500"
                entries={records.topOdds.map((b) => ({
                  name: nameOf(b.userId),
                  detail: `${b.selection || b.matchLabel || "—"} · ${bookmakerLabel(
                    b.bookmaker,
                    b.bookmakerLabel
                  )}`,
                  value: `@${b.odds.toFixed(2)}`,
                  valueClass: "text-emerald-500",
                }))}
              />
              <PodiumCard
                title="Mayor dinero apostado"
                icon={Coins}
                accent="text-amber-500"
                entries={records.topStake.map((b) => ({
                  name: nameOf(b.userId),
                  detail: betDetail(b),
                  value: formatCurrency(b.stake),
                }))}
              />
              <PodiumCard
                title="Mejores combinadas"
                icon={Layers}
                accent="text-violet-500"
                entries={records.topCombo.map((b) => ({
                  name: nameOf(b.userId),
                  detail: `${b.matchLabel || b.selection || "Combinada"} · @${b.odds.toFixed(
                    2
                  )}`,
                  value: formatCurrency(b.profit ?? 0),
                  valueClass: profitClass(b.profit ?? 0),
                }))}
                emptyText="Aún no hay combinadas ganadas."
              />
            </div>
          </section>

          {/* Rankings de jugadores */}
          <section className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Rankings de jugadores
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <PodiumCard
                title="Más apuestas"
                icon={Receipt}
                accent="text-primary"
                entries={mostBets.map((p) => ({
                  name: p.user.username,
                  value: `${p.betsCount}`,
                }))}
              />
              <PodiumCard
                title="Más dinero apostado"
                icon={Coins}
                accent="text-amber-500"
                entries={mostStaked.map((p) => ({
                  name: p.user.username,
                  value: formatCurrency(p.totalStaked),
                }))}
              />
              <PodiumCard
                title="Más beneficio"
                icon={TrendingUp}
                accent="text-emerald-500"
                entries={mostProfit.map((p) => ({
                  name: p.user.username,
                  value: formatCurrency(p.stats.totalProfit),
                  valueClass: profitClass(p.stats.totalProfit),
                }))}
              />
              <PodiumCard
                title="Mejor racha"
                icon={Flame}
                accent="text-orange-500"
                entries={bestStreak.map((p) => ({
                  name: p.user.username,
                  value: `${p.stats.bestStreak} ✅`,
                }))}
                emptyText="Sin rachas todavía."
              />
            </div>
          </section>

          {/* Estadísticas individuales */}
          <section className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Estadísticas individuales
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {perPlayer
                .slice()
                .sort((a, b) => b.stats.totalProfit - a.stats.totalProfit)
                .map((p) => (
                  <Card key={p.user.uid}>
                    <CardHeader className="pb-2">
                      <CardTitle className="flex items-center gap-2 text-base">
                        <Initial name={p.user.username} />
                        <span className="truncate">{p.user.username}</span>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="grid grid-cols-3 gap-2">
                        <Metric
                          label="Beneficio"
                          value={formatCurrency(p.stats.totalProfit)}
                          valueClass={profitClass(p.stats.totalProfit)}
                        />
                        <Metric
                          label="Apostado"
                          value={formatCurrency(p.totalStaked)}
                        />
                        <Metric label="Apuestas" value={`${p.betsCount}`} />
                        <Metric
                          label="ROI"
                          value={formatPercent(p.stats.roi)}
                          valueClass={profitClass(p.stats.roi)}
                        />
                        <Metric
                          label="% acierto"
                          value={formatPercent(p.stats.hitRate)}
                        />
                        <Metric
                          label="Mejor racha"
                          value={`${p.stats.bestStreak} ✅`}
                        />
                      </div>
                      {p.best && (p.best.profit ?? 0) > 0 && (
                        <BetHighlight label="Mayor acierto" bet={p.best} />
                      )}
                      {p.worst && (p.worst.profit ?? 0) < 0 && (
                        <BetHighlight label="Mayor pérdida" bet={p.worst} />
                      )}
                    </CardContent>
                  </Card>
                ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
