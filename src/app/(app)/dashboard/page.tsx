"use client";

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
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
import {
  betInGroup,
  bookmakerLabel,
  computeBookmakerSummary,
  computeSuperaumentoSummary,
  computeUserStats,
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
import {
  cn,
  formatCurrency,
  formatPercent,
  profitClass,
} from "@/lib/utils";
import { ROUTES } from "@/lib/constants";
import { useBetDetail } from "@/components/bets/bet-detail-dialog";
import type { Bet } from "@/types/domain";

export default function DashboardPage() {
  const { appUser } = useAuth();
  const { activeGroup } = useGroup();
  const { openBet } = useBetDetail();
  const [allBets, setAllBets] = useState<Bet[]>([]);

  useEffect(() => {
    if (!appUser) return;
    const unsub = subscribeToBets({ userId: appUser.uid }, setAllBets);
    return unsub;
  }, [appUser]);

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
          <MiniStat label="Total" value={stats.betsCount} icon={<Ticket className="h-4 w-4" />} />
          <MiniStat label="Ganadas" value={stats.betsWon} accent="text-profit" icon={<Trophy className="h-4 w-4" />} />
          <MiniStat label="Perdidas" value={stats.betsLost} accent="text-loss" icon={<TrendingDown className="h-4 w-4" />} />
          <MiniStat label="Pendientes" value={stats.betsPending} icon={<Clock className="h-4 w-4" />} />
          <MiniStat label="Anuladas" value={stats.betsVoid} icon={<Ban className="h-4 w-4" />} />
          <MiniStat label="Racha actual" value={stats.currentStreak} accent={profitClass(stats.currentStreak)} icon={<Flame className="h-4 w-4" />} />
          <MiniStat label="Mejor racha" value={stats.bestStreak} icon={<Award className="h-4 w-4" />} />
          <MiniStat label="Yield" value={formatPercent(stats.yield)} accent={profitClass(stats.yield)} icon={<Gauge className="h-4 w-4" />} />
        </div>
      </section>

      {/* ─────── Promedios ─────── */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Promedios</h2>
        <div className="grid gap-4 grid-cols-2 sm:grid-cols-4">
          <MiniStat label="Total apostado" value={formatCurrency(stats.totalStaked)} icon={<Coins className="h-4 w-4" />} />
          <MiniStat label="Cuota media" value={stats.avgOdds.toFixed(2)} icon={<Calculator className="h-4 w-4" />} />
          <MiniStat label="Stake medio" value={formatCurrency(stats.avgStake)} icon={<Coins className="h-4 w-4" />} />
          <MiniStat
            label="Saldo inicial total"
            value={formatCurrency(summary.total.initial)}
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
            value={`${superaumento.profit > 0 ? "+" : ""}${formatCurrency(
              superaumento.profit
            )}`}
            accent={profitClass(superaumento.profit)}
            icon={<Zap className="h-4 w-4" />}
          />
          <MiniStat
            label="Total"
            value={superaumento.count}
            icon={<Ticket className="h-4 w-4" />}
          />
          <MiniStat
            label="Ganadas"
            value={superaumento.won}
            accent="text-profit"
            icon={<Trophy className="h-4 w-4" />}
          />
          <MiniStat
            label="Perdidas"
            value={superaumento.lost}
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

/** Anima un número de 0 (o del valor previo) hasta `target` con easeOutCubic.
 *  Respeta prefers-reduced-motion (salta directo al valor final). */
function useCountUp(target: number, durationMs = 700): number {
  const [value, setValue] = useState(0);
  const valueRef = useRef(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce || durationMs <= 0) {
      valueRef.current = target;
      setValue(target);
      return;
    }
    const from = valueRef.current;
    const startedAt = performance.now();
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    const tick = (now: number) => {
      const t = Math.min(1, (now - startedAt) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      const current = from + (target - from) * eased;
      valueRef.current = current;
      setValue(current);
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [target, durationMs]);

  return value;
}

/** Muestra un número animado (count-up) formateado. */
function CountUp({
  end,
  format,
  durationMs,
}: {
  end: number;
  format: (n: number) => string;
  durationMs?: number;
}) {
  const v = useCountUp(end, durationMs);
  return <>{format(v)}</>;
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
  value: string | number;
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
      await updateInitialBalances(uid, { [bookmaker]: parsed }, groupId);
      setEditing(false);
    } catch (err) {
      console.error("[updateInitialBalances]", err);
      const msg = err instanceof Error ? err.message : "Error guardando";
      const friendly =
        msg.includes("permission-denied") || msg.includes("PERMISSION_DENIED")
          ? "Firebase ha rechazado el cambio por reglas de seguridad. " +
            "Si eres el admin, ejecuta `firebase deploy --only firestore:rules` " +
            "para subir las reglas actuales (las viejas no permitían editar el saldo a usuarios normales)."
          : `No se pudo guardar: ${msg}`;
      window.alert(friendly);
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
