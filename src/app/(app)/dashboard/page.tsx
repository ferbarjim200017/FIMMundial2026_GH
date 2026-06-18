"use client";

import { useEffect, useId, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Award,
  Ban,
  Calculator,
  Clock,
  Coins,
  Flame,
  Gauge,
  Percent,
  Sunrise,
  Target,
  Ticket,
  TrendingDown,
  TrendingUp,
  Trophy,
  Wallet,
  Zap,
} from "lucide-react";
import { useAuth } from "@/features/auth/auth.context";
import { useGroup } from "@/features/groups/groups.context";
import { subscribeToBets } from "@/features/bets/bets.service";
import { subscribeToMatches } from "@/features/matches/matches.service";
import {
  betInGroup,
  betOutcome,
  betPlaysInWindow,
  bookmakerLabel,
  computeBookmakerSummary,
  computeSuperaumentoSummary,
  computeUserStats,
  currentDayWindow,
  getInitialBalances,
} from "@/features/bets/bets.utils";
import { BetStatusBadge } from "@/components/bets/bet-status-badge";
import { BookmakerPill } from "@/components/bets/bookmaker-pill";
import { LiveTvBanner } from "@/components/matches/live-tv-banner";
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
import { CountUp } from "@/components/ui/count-up";
import {
  cn,
  formatCurrency,
  formatPercent,
  profitClass,
  TimeoutError,
  withTimeout,
} from "@/lib/utils";
import { ROUTES } from "@/lib/constants";
import { useBetDetail } from "@/components/bets/bet-detail-dialog";
import type { Bet, Match } from "@/types/domain";

// Formateadores para el count-up de las tarjetas (enteros y cuotas).
const asInt = (n: number) => String(Math.round(n));
const asOdds = (n: number) => n.toFixed(2);

/** Fecha+hora corta para mostrar la ventana de la "jornada de hoy". */
function fmtWindow(ms: number): string {
  return new Date(ms).toLocaleString("es-ES", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function DashboardPage() {
  const { appUser } = useAuth();
  const { activeGroup } = useGroup();
  const { openBet } = useBetDetail();
  const [allBets, setAllBets] = useState<Bet[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);

  useEffect(() => {
    if (!appUser) return;
    const unsub = subscribeToBets({ userId: appUser.uid }, setAllBets);
    return unsub;
  }, [appUser]);

  useEffect(() => subscribeToMatches(setMatches, () => setMatches([])), []);

  // Hora de inicio (kickoff) de cada partido, para decidir qué apuestas son
  // "de hoy" según cuándo se juega el partido (no cuándo se creó la apuesta).
  const kickoffByMatchId = useMemo(() => {
    const m = new Map<string, number>();
    for (const x of matches) m.set(x.id, x.kickoffUtc.toMillis());
    return m;
  }, [matches]);

  // Filtramos a las apuestas del grupo activo. Cada grupo es contabilidad
  // independiente: saldos, stats y "últimas apuestas" solo reflejan el
  // grupo seleccionado en el topbar.
  const bets = useMemo(() => {
    if (!activeGroup) return [];
    return allBets.filter((b) => betInGroup(b, activeGroup.id));
  }, [allBets, activeGroup]);

  const summary = useMemo(
    () =>
      appUser && activeGroup
        ? computeBookmakerSummary(appUser, bets, activeGroup.id)
        : null,
    [appUser, bets, activeGroup]
  );

  // Stats por grupo: se calculan en cliente desde las apuestas filtradas,
  // no desde el `appUser.stats` global (que es agregado de todos los grupos).
  const stats = useMemo(() => computeUserStats(bets), [bets]);

  // Serie de beneficio acumulado (apuestas liquidadas, en orden temporal) para
  // el mini-sparkline de la tarjeta "Beneficio total".
  const profitSeries = useMemo(() => {
    const settled = bets
      .filter(
        (b) =>
          b.status === "won" || b.status === "lost" || b.status === "cashout"
      )
      .slice()
      .sort(
        (a, b) =>
          (a.settledAt ?? a.createdAt).toMillis() -
          (b.settledAt ?? b.createdAt).toMillis()
      );
    let acc = 0;
    const out = [0];
    for (const b of settled) {
      acc += b.profit ?? 0;
      out.push(acc);
    }
    return out;
  }, [bets]);

  // Balance de tus apuestas de tipo superaumento en el grupo activo.
  const superaumento = useMemo(
    () => computeSuperaumentoSummary(bets),
    [bets]
  );

  // "Hoy" = jornada de MEDIODÍA a MEDIODÍA. Así una sesión de noche (de 19-21h
  // hasta las 8h de la mañana siguiente) cuenta entera en el mismo día. Si aún
  // no es mediodía, seguimos en la jornada que arrancó ayer a las 12:00.
  // Una apuesta cuenta como "de hoy" según la HORA DEL PARTIDO (kickoff), no
  // según cuándo se creó ni cuándo se liquidó. Para combos basta con que algún
  // partido de la apuesta se juegue hoy.
  const today = useMemo(() => {
    const { startMs, endMs } = currentDayWindow();
    let profit = 0;
    let won = 0;
    let lost = 0;
    let placed = 0;
    let stakePlaced = 0;
    for (const b of bets) {
      if (!betPlaysInWindow(b, kickoffByMatchId, startMs, endMs)) continue;
      placed += 1;
      if (!b.isFreebet) stakePlaced += b.stake;
      if (b.status !== "pending") {
        profit += b.profit ?? 0;
        const o = betOutcome(b);
        if (o === "won") won += 1;
        else if (o === "lost") lost += 1;
      }
    }
    return { startMs, endMs, profit, won, lost, placed, stakePlaced };
  }, [bets, kickoffByMatchId]);

  if (!appUser || !summary) return null;

  const recent = bets.slice(0, 5);

  return (
    <div className="space-y-6">
      <LiveTvBanner />

      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Hola, <span className="text-brand">{appUser.username}</span> 👋
        </h1>
        <p className="text-sm text-muted-foreground">
          Aquí tienes tu resumen completo: saldos por casa y estadísticas en tiempo real.
        </p>
      </div>

      {/* ─────── Hoy (jornada de mediodía a mediodía) ─────── */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <Sunrise className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">Hoy</h2>
          <span className="text-xs text-muted-foreground">
            {fmtWindow(today.startMs)} → {fmtWindow(today.endMs)}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-5">
          <MiniStat
            label="Beneficio hoy"
            value={
              <CountUp
                end={today.profit}
                format={(n) => `${n > 0 ? "+" : ""}${formatCurrency(n)}`}
              />
            }
            accent={profitClass(today.profit)}
            icon={<TrendingUp className="h-4 w-4" />}
          />
          <MiniStat
            label="Ganadas hoy"
            value={<CountUp end={today.won} format={asInt} />}
            accent="text-profit"
            icon={<Trophy className="h-4 w-4" />}
          />
          <MiniStat
            label="Perdidas hoy"
            value={<CountUp end={today.lost} format={asInt} />}
            accent="text-loss"
            icon={<TrendingDown className="h-4 w-4" />}
          />
          <MiniStat
            label="Apuestas hoy"
            value={<CountUp end={today.placed} format={asInt} />}
            icon={<Ticket className="h-4 w-4" />}
          />
          <MiniStat
            label="Apostado hoy"
            value={<CountUp end={today.stakePlaced} format={formatCurrency} />}
            icon={<Coins className="h-4 w-4" />}
          />
        </div>
      </section>

      {/* ─────── Resumen general ─────── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label={summary.total.pendingStake > 0 ? "Disponible total" : "Saldo total"}
          value={
            <CountUp
              end={summary.total.current - summary.total.pendingStake}
              format={formatCurrency}
            />
          }
          subtitle={
            summary.total.pendingStake > 0
              ? `${formatCurrency(summary.total.current)} − ${formatCurrency(summary.total.pendingStake)} en juego`
              : undefined
          }
          icon={<Wallet className="h-4 w-4" />}
        />
        <StatCard
          label="Beneficio total"
          value={
            <CountUp
              end={stats.totalProfit}
              format={(n) => `${n > 0 ? "+" : ""}${formatCurrency(n)}`}
            />
          }
          valueClass={profitClass(stats.totalProfit)}
          icon={<TrendingUp className="h-4 w-4" />}
          trendValue={stats.totalProfit}
          sparkline={profitSeries}
        />
        <StatCard
          label="ROI"
          value={<CountUp end={stats.roi} format={formatPercent} />}
          valueClass={profitClass(stats.roi)}
          icon={<Percent className="h-4 w-4" />}
          trendValue={stats.roi}
        />
        <StatCard
          label="% Acierto"
          value={<CountUp end={stats.hitRate} format={formatPercent} />}
          icon={<Target className="h-4 w-4" />}
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
            groupId={activeGroup?.id ?? null}
            bookmaker="bet365"
            initial={summary.bet365.initial}
            profit={summary.bet365.profit}
            current={summary.bet365.current}
            pendingStake={summary.bet365.pendingStake}
            betsCount={summary.bet365.betsCount}
          />
          <BookmakerCard
            uid={appUser.uid}
            groupId={activeGroup?.id ?? null}
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
            otherInitial={
              getInitialBalances(appUser, activeGroup?.id).other
            }
          />
        </div>
      </section>

      {/* ─────── Desglose de apuestas ─────── */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Desglose de apuestas</h2>
        <div className="grid gap-4 grid-cols-2 sm:grid-cols-4">
          <MiniStat label="Total" value={<CountUp end={stats.betsCount} format={asInt} />} icon={<Ticket className="h-4 w-4" />} />
          <MiniStat label="Ganadas" value={<CountUp end={stats.betsWon} format={asInt} />} accent="text-profit" icon={<Trophy className="h-4 w-4" />} />
          <MiniStat label="Perdidas" value={<CountUp end={stats.betsLost} format={asInt} />} accent="text-loss" icon={<TrendingDown className="h-4 w-4" />} />
          <MiniStat label="Pendientes" value={<CountUp end={stats.betsPending} format={asInt} />} icon={<Clock className="h-4 w-4" />} />
          <MiniStat label="Anuladas" value={<CountUp end={stats.betsVoid} format={asInt} />} icon={<Ban className="h-4 w-4" />} />
          <MiniStat label="Racha actual" value={<CountUp end={stats.currentStreak} format={asInt} />} accent={profitClass(stats.currentStreak)} icon={<Flame className="h-4 w-4" />} />
          <MiniStat label="Mejor racha" value={<CountUp end={stats.bestStreak} format={asInt} />} icon={<Award className="h-4 w-4" />} />
          <MiniStat label="Yield" value={<CountUp end={stats.yield} format={formatPercent} />} accent={profitClass(stats.yield)} icon={<Gauge className="h-4 w-4" />} />
        </div>
      </section>

      {/* ─────── Promedios ─────── */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Promedios</h2>
        <div className="grid gap-4 grid-cols-2 sm:grid-cols-4">
          <MiniStat label="Total apostado" value={<CountUp end={stats.totalStaked} format={formatCurrency} />} icon={<Coins className="h-4 w-4" />} />
          <MiniStat label="Cuota media" value={<CountUp end={stats.avgOdds} format={asOdds} />} icon={<Calculator className="h-4 w-4" />} />
          <MiniStat label="Stake medio" value={<CountUp end={stats.avgStake} format={formatCurrency} />} icon={<Coins className="h-4 w-4" />} />
          <MiniStat
            label="Saldo inicial total"
            value={<CountUp end={summary.total.initial} format={formatCurrency} />}
            icon={<Wallet className="h-4 w-4" />}
          />
        </div>
      </section>

      {/* ─────── Superaumentos ─────── */}
      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold">Superaumentos</h2>
          <p className="text-sm text-muted-foreground">
            Balance de tus apuestas de tipo superaumento en este grupo.
          </p>
        </div>
        <div className="grid gap-4 grid-cols-2 sm:grid-cols-4">
          <MiniStat
            label="Balance"
            value={
              <CountUp
                end={superaumento.profit}
                format={(n) => `${n > 0 ? "+" : ""}${formatCurrency(n)}`}
              />
            }
            accent={profitClass(superaumento.profit)}
            icon={<Zap className="h-4 w-4" />}
          />
          <MiniStat
            label="Total"
            value={<CountUp end={superaumento.count} format={asInt} />}
            icon={<Ticket className="h-4 w-4" />}
          />
          <MiniStat
            label="Ganadas"
            value={<CountUp end={superaumento.won} format={asInt} />}
            accent="text-profit"
            icon={<Trophy className="h-4 w-4" />}
          />
          <MiniStat
            label="Perdidas"
            value={<CountUp end={superaumento.lost} format={asInt} />}
            accent="text-loss"
            icon={<TrendingDown className="h-4 w-4" />}
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
                <li key={b.id}>
                  <button
                    type="button"
                    onClick={() => openBet(b, appUser)}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm transition-colors hover:bg-accent/30 focus:outline-none focus-visible:bg-accent/30"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{b.matchLabel}</p>
                      <p className="flex flex-wrap items-center gap-1.5 truncate text-xs text-muted-foreground">
                        <span className="truncate">
                          {b.selection} @ {b.odds.toFixed(2)}
                        </span>
                        <BookmakerPill
                          bookmaker={b.bookmaker}
                          customLabel={b.bookmakerLabel}
                          size="xs"
                        />
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
                  </button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/** Mini-gráfica de línea sin ejes para incrustar en una tarjeta KPI. */
function Sparkline({ values, color }: { values: number[]; color: string }) {
  const gid = `spark-${useId().replace(/:/g, "")}`;
  const w = 84;
  const h = 30;
  const pad = 3;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const n = values.length;
  const x = (i: number) => pad + (i / (n - 1)) * (w - 2 * pad);
  const y = (v: number) => pad + (1 - (v - min) / span) * (h - 2 * pad);
  const line = values
    .map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`)
    .join(" ");
  const area = `${line} L${x(n - 1).toFixed(1)},${h - pad} L${x(0).toFixed(1)},${
    h - pad
  } Z`;
  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      className="shrink-0"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.25} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gid})`} stroke="none" />
      <path
        d={line}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

function StatCard({
  label,
  value,
  valueClass,
  subtitle,
  icon,
  trendValue,
  sparkline,
}: {
  label: string;
  value: ReactNode;
  valueClass?: string;
  subtitle?: string;
  icon?: ReactNode;
  trendValue?: number;
  sparkline?: number[];
}) {
  const sparkColor =
    (trendValue ?? 0) >= 0 ? "hsl(var(--profit))" : "hsl(var(--loss))";
  const dir =
    trendValue === undefined
      ? null
      : trendValue > 0
        ? "up"
        : trendValue < 0
          ? "down"
          : "flat";
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">
            {label}
          </p>
          {icon && <span className="text-muted-foreground/60">{icon}</span>}
        </div>
        <div className="mt-1 flex items-end justify-between gap-2">
          <p
            className={cn(
              "flex items-center gap-1 text-2xl font-bold tabular-nums",
              valueClass
            )}
          >
            {dir === "up" && <ArrowUpRight className="h-4 w-4" />}
            {dir === "down" && <ArrowDownRight className="h-4 w-4" />}
            {value}
          </p>
          {sparkline && sparkline.length > 1 && (
            <Sparkline values={sparkline} color={sparkColor} />
          )}
        </div>
        {subtitle && (
          <p className="mt-0.5 text-[11px] text-muted-foreground">{subtitle}</p>
        )}
      </CardContent>
    </Card>
  );
}

function MiniStat({
  label,
  value,
  accent,
  icon,
}: {
  label: string;
  value: ReactNode;
  accent?: string;
  icon?: ReactNode;
}) {
  return (
    <Card>
      <CardContent className="p-3">
        <div className="flex items-center justify-between">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
            {label}
          </p>
          {icon && <span className="text-muted-foreground/60">{icon}</span>}
        </div>
        <p className={cn("mt-1 font-mono text-lg font-bold tabular-nums", accent)}>
          {value}
        </p>
      </CardContent>
    </Card>
  );
}

function BookmakerCard({
  uid,
  groupId,
  bookmaker,
  initial,
  profit,
  current,
  pendingStake,
  betsCount,
}: {
  uid: string;
  groupId: string | null;
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
    if (!groupId) {
      window.alert(
        "No tienes un grupo activo. Selecciona uno desde el icono de grupos antes de editar saldos."
      );
      return;
    }
    setSaving(true);
    try {
      await withTimeout(
        updateInitialBalances(uid, { [bookmaker]: parsed }, groupId),
        9000
      );
      setEditing(false);
    } catch (err) {
      if (err instanceof TimeoutError) {
        // Red lenta: se guarda y sincroniza en segundo plano.
        setEditing(false);
      } else {
        console.error("[updateInitialBalances]", err);
        const msg = err instanceof Error ? err.message : "Error guardando";
        const friendly =
          msg.includes("permission-denied") || msg.includes("PERMISSION_DENIED")
            ? "Firebase ha rechazado el cambio por reglas de seguridad. " +
              "Si eres el admin, ejecuta `firebase deploy --only firestore:rules` " +
              "para subir las reglas actuales (las viejas no permitían editar el saldo a usuarios normales)."
            : `No se pudo guardar: ${msg}`;
        window.alert(friendly);
      }
    } finally {
      setSaving(false);
    }
  }

  const label = bookmaker === "bet365" ? "Bet365" : "Winamax";
  const borderClass =
    bookmaker === "bet365"
      ? "border-2 border-emerald-500/70"
      : "border-2 border-red-500/70";

  return (
    <Card className={borderClass}>
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
            {pendingStake > 0 ? "Disponible" : "Saldo actual"}
          </p>
          <p className="font-mono text-2xl font-bold">
            {formatCurrency(current - pendingStake)}
          </p>
          {pendingStake > 0 && (
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Saldo total: {formatCurrency(current)} ·{" "}
              <span className="text-amber-500 dark:text-amber-400">
                −{formatCurrency(pendingStake)} en juego
              </span>
            </p>
          )}
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
            {pendingStake > 0 ? "Disponible" : "Saldo actual"}
          </p>
          <p className="font-mono text-2xl font-bold">
            {formatCurrency(current - pendingStake)}
          </p>
          {pendingStake > 0 && (
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Saldo total: {formatCurrency(current)} ·{" "}
              <span className="text-amber-500 dark:text-amber-400">
                −{formatCurrency(pendingStake)} en juego
              </span>
            </p>
          )}
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
