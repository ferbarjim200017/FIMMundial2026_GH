"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  Award,
  Calculator,
  Clock,
  Coins,
  Flame,
  Gauge,
  Percent,
  Search,
  Swords,
  Ticket,
  TrendingDown,
  TrendingUp,
  Trophy,
  Wallet,
  X,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { CountUp } from "@/components/ui/count-up";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { BetsTable } from "@/components/bets/bets-table";
import { AchievementsCard } from "@/components/profile/achievements-card";
import { MarketStatsCard } from "@/components/profile/market-stats-card";
import { TeamStatsCard } from "@/components/profile/team-stats-card";
import { computeAchievements } from "@/features/bets/achievements";
import { useAuth } from "@/features/auth/auth.context";
import { useGroup } from "@/features/groups/groups.context";
import { getUser, updateUserProfile } from "@/features/users/users.service";
import { subscribeToBets } from "@/features/bets/bets.service";
import { subscribeToMatches } from "@/features/matches/matches.service";
import { resolveMatchLabels } from "@/features/matches/bracket-resolver";
import {
  betInGroup,
  bookmakerLabel,
  computeUserStats,
  getInitialBalances,
} from "@/features/bets/bets.utils";
import { STATUS_OPTIONS, BOOKMAKER_OPTIONS } from "@/features/bets/bets.schema";
import { ROUTES } from "@/lib/constants";
import {
  cn,
  formatCurrency,
  formatDate,
  formatPercent,
  initials,
} from "@/lib/utils";
import type { AppUser, Bet, BetStatus, Bookmaker, Match } from "@/types/domain";

export default function ProfilePage() {
  const params = useParams<{ userId: string }>();
  const { appUser: me, isAdmin } = useAuth();
  const { activeGroup, memberUids } = useGroup();
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [editing, setEditing] = useState(false);
  const [username, setUsername] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [bets, setBets] = useState<Bet[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  // Filtros del listado de apuestas del usuario.
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<BetStatus | "all" | "settled">("all");
  const [bookmakerFilter, setBookmakerFilter] = useState<Bookmaker | "all">("all");

  useEffect(() => {
    if (!params.userId) return;
    let cancelled = false;
    setLoading(true);
    setLoadError(false);
    getUser(params.userId)
      .then((u) => {
        if (cancelled) return;
        setUser(u);
        setUsername(u?.username ?? "");
        setAvatarUrl(u?.avatarUrl ?? "");
      })
      .catch((err) => {
        console.error("[profile] getUser", err);
        if (!cancelled) setLoadError(true);
      })
      // Pase lo que pase (éxito o error) salimos de "Cargando…" para no
      // dejar la página colgada si la lectura falla puntualmente.
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [params.userId, reloadKey]);

  // Apuestas del usuario en el grupo activo — base para stats y saldos
  // contextualizados.
  useEffect(() => {
    if (!params.userId) return;
    const unsub = subscribeToBets({ userId: params.userId }, setBets);
    return unsub;
  }, [params.userId]);

  useEffect(() => subscribeToMatches(setMatches, () => setMatches([])), []);

  // Partidos con los huecos de eliminatoria resueltos, para la tabla de apuestas.
  const resolvedMatchById = useMemo(() => {
    const map = new Map<string, Match>();
    for (const m of resolveMatchLabels(matches)) map.set(m.id, m);
    return map;
  }, [matches]);

  const groupBets = useMemo(() => {
    if (!activeGroup) return [];
    return bets.filter((b) => betInGroup(b, activeGroup.id));
  }, [bets, activeGroup]);

  const groupStats = useMemo(() => computeUserStats(groupBets), [groupBets]);
  const achievements = useMemo(
    () => computeAchievements(groupBets, groupStats),
    [groupBets, groupStats]
  );

  // Listado de apuestas del usuario, filtrado por búsqueda + estado + casa.
  const normalizedQuery = query.trim().toLowerCase();
  const filteredBets = useMemo(() => {
    return groupBets.filter((b) => {
      if (statusFilter === "settled") {
        if (b.status === "pending") return false;
      } else if (statusFilter !== "all" && b.status !== statusFilter) {
        return false;
      }
      if (bookmakerFilter !== "all" && b.bookmaker !== bookmakerFilter) {
        return false;
      }
      if (normalizedQuery) {
        const haystack = [
          b.matchLabel,
          b.selection,
          b.marketDetail ?? "",
          b.bookmakerLabel ?? "",
          bookmakerLabel(b.bookmaker, b.bookmakerLabel),
          b.notes ?? "",
        ]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(normalizedQuery)) return false;
      }
      return true;
    });
  }, [groupBets, statusFilter, bookmakerFilter, normalizedQuery]);

  // Cuánto dinero tiene "en juego" ahora mismo: suma de stakes de las
  // apuestas pendientes que NO sean freebet (las freebets no inmovilizan
  // dinero del usuario). Mismo criterio que `computeBookmakerSummary`.
  const inPlay = useMemo(() => {
    const pending = groupBets.filter(
      (b) => b.status === "pending" && !b.isFreebet
    );
    const amount = pending.reduce((acc, b) => acc + b.stake, 0);
    return { amount, count: pending.length };
  }, [groupBets]);

  const groupBalances = useMemo(() => {
    if (!user || !activeGroup) {
      return { initial: 0, current: 0 };
    }
    const initials = getInitialBalances(user, activeGroup.id);
    const initial =
      initials.bet365 +
      initials.winamax +
      (initials.betfair ?? 0) +
      (initials.luckia ?? 0) +
      (initials.williamhill ?? 0) +
      initials.other;
    return {
      initial,
      current: initial + groupStats.totalProfit,
    };
  }, [user, activeGroup, groupStats.totalProfit]);

  if (loading) return <ProfileSkeleton />;
  if (loadError && !user) {
    return (
      <div className="rounded-lg border border-dashed p-12 text-center">
        <p className="text-sm text-muted-foreground">
          No se pudo cargar el perfil. Puede ser un fallo puntual de conexión.
        </p>
        <Button
          variant="outline"
          className="mt-4"
          onClick={() => setReloadKey((k) => k + 1)}
        >
          Reintentar
        </Button>
      </div>
    );
  }
  if (!user) return <p className="text-sm text-muted-foreground">Usuario no encontrado.</p>;

  const isOwner = me?.uid === user.uid;
  // Bloqueo cross-group: si el target no comparte grupo activo y no eres tú
  // mismo, no enseñamos nada (decisión del usuario: misma regla para admin).
  // memberUids puede estar vacío durante el primer render — solo bloqueamos
  // cuando los miembros ya han cargado (size > 0).
  const outsideOfGroup =
    !!activeGroup && memberUids.size > 0 && !isOwner && !memberUids.has(user.uid);
  if (outsideOfGroup) {
    return (
      <div className="rounded-lg border border-dashed p-12 text-center text-sm text-muted-foreground">
        Este usuario no está en tu grupo <strong>{activeGroup.name}</strong>.
        Cambia de grupo activo desde el icono de grupos si necesitas verlo.
      </div>
    );
  }

  async function handleSave() {
    if (!user) return;
    setSaving(true);
    try {
      await updateUserProfile(user.uid, {
        username,
        avatarUrl: avatarUrl || null,
      });
      const updated = await getUser(user.uid);
      setUser(updated);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center">
          <Avatar className="h-20 w-20">
            {user.avatarUrl && <AvatarImage src={user.avatarUrl} alt={user.username} />}
            <AvatarFallback className="text-lg">{initials(user.username)}</AvatarFallback>
          </Avatar>
          <div className="flex-1">
            <h1 className="text-2xl font-bold">{user.username}</h1>
            <p className="text-sm text-muted-foreground">{user.email}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Miembro desde {user.joinedAt ? formatDate(user.joinedAt.toDate()) : "—"}
              {user.role === "admin" && (
                <span className="ml-2 rounded bg-primary/10 px-1.5 py-0.5 text-primary">
                  ADMIN
                </span>
              )}
            </p>
          </div>
          {isOwner && !editing && (
            <Button variant="outline" onClick={() => setEditing(true)}>
              Editar perfil
            </Button>
          )}
          {!isOwner && me && (
            <Button asChild variant="outline" className="gap-1.5">
              <Link href={ROUTES.compare(me.uid, user.uid)}>
                <Swords className="h-4 w-4" />
                Comparar conmigo
              </Link>
            </Button>
          )}
        </CardContent>
      </Card>

      {editing && isOwner && (
        <Card>
          <CardHeader>
            <CardTitle>Editar perfil</CardTitle>
            <CardDescription>
              Actualiza tu nombre de usuario y avatar (URL de imagen)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="username">Nombre de usuario</Label>
              <Input
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                minLength={3}
                maxLength={20}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="avatar">Avatar (URL)</Label>
              <Input
                id="avatar"
                type="url"
                value={avatarUrl}
                onChange={(e) => setAvatarUrl(e.target.value)}
                placeholder="https://…"
              />
              <p className="text-xs text-muted-foreground">
                En el Módulo 5 añadiremos subida directa a Firebase Storage.
              </p>
            </div>
            <div className="flex gap-2 pt-2">
              <Button onClick={handleSave} disabled={saving}>
                {saving ? "Guardando…" : "Guardar"}
              </Button>
              <Button variant="outline" onClick={() => setEditing(false)} disabled={saving}>
                Cancelar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatBox
          label="Saldo inicial"
          value={<CountUp end={groupBalances.initial} format={formatCurrency} />}
          icon={<Coins className="h-4 w-4" />}
        />
        <StatBox
          label="Saldo actual"
          value={<CountUp end={groupBalances.current} format={formatCurrency} />}
          tone="primary"
          icon={<Wallet className="h-4 w-4" />}
        />
        <StatBox
          label="Dinero en juego"
          value={<CountUp end={inPlay.amount} format={formatCurrency} />}
          tone={inPlay.amount > 0 ? "amber" : "neutral"}
          icon={<Clock className="h-4 w-4" />}
          subtitle={
            inPlay.count === 0
              ? "Sin apuestas pendientes"
              : `${inPlay.count} apuesta${inPlay.count === 1 ? "" : "s"} pendiente${inPlay.count === 1 ? "" : "s"}`
          }
        />
        <StatBox
          label="Beneficio total"
          value={<CountUp end={groupStats.totalProfit} format={formatCurrency} />}
          tone={signTone(groupStats.totalProfit)}
          icon={<TrendingUp className="h-4 w-4" />}
        />
        <StatBox
          label="ROI"
          value={<CountUp end={groupStats.roi} format={formatPercent} />}
          tone={signTone(groupStats.roi)}
          icon={<Percent className="h-4 w-4" />}
        />
        <StatBox
          label="Yield"
          value={<CountUp end={groupStats.yield} format={formatPercent} />}
          tone={signTone(groupStats.yield)}
          icon={<Gauge className="h-4 w-4" />}
        />
        <StatBox
          label="Apuestas"
          value={<CountUp end={groupStats.betsCount} format={asInt} />}
          tone="primary"
          icon={<Ticket className="h-4 w-4" />}
        />
        <StatBox
          label="Ganadas"
          value={<CountUp end={groupStats.betsWon} format={asInt} />}
          tone="profit"
          icon={<Trophy className="h-4 w-4" />}
        />
        <StatBox
          label="Perdidas"
          value={<CountUp end={groupStats.betsLost} format={asInt} />}
          tone="loss"
          icon={<TrendingDown className="h-4 w-4" />}
        />
        <StatBox
          label="Racha actual"
          value={<CountUp end={groupStats.currentStreak} format={asInt} />}
          tone={signTone(groupStats.currentStreak)}
          icon={<Flame className="h-4 w-4" />}
        />
        <StatBox
          label="Mejor racha"
          value={<CountUp end={groupStats.bestStreak} format={asInt} />}
          tone={groupStats.bestStreak > 0 ? "profit" : "neutral"}
          icon={<Award className="h-4 w-4" />}
        />
        <StatBox
          label="Cuota media"
          value={<CountUp end={groupStats.avgOdds} format={asOdds} />}
          icon={<Calculator className="h-4 w-4" />}
        />
        <StatBox
          label="Stake medio"
          value={<CountUp end={groupStats.avgStake} format={formatCurrency} />}
          icon={<Coins className="h-4 w-4" />}
        />
      </div>

      {/* ─── Logros / insignias del jugador ─── */}
      <AchievementsCard achievements={achievements} />

      {/* ─── Desglose por mercado y por selección ─── */}
      <MarketStatsCard bets={groupBets} />
      <TeamStatsCard bets={groupBets} matchById={resolvedMatchById} />

      {/* ─── Listado de apuestas del usuario, con filtros ─── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Apuestas de {user.username}
          </CardTitle>
          <CardDescription>
            {groupBets.length} apuesta{groupBets.length === 1 ? "" : "s"}
            {activeGroup ? ` en ${activeGroup.name}` : ""}. Usa los filtros para
            acotar.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar por partido, selección, casa, notas…"
                className="pl-9 pr-9"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  aria-label="Limpiar búsqueda"
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Estado</Label>
              <Select
                value={statusFilter}
                onValueChange={(v) =>
                  setStatusFilter(v as BetStatus | "all" | "settled")
                }
              >
                <SelectTrigger className="h-9 w-full sm:w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="settled">Terminadas</SelectItem>
                  {STATUS_OPTIONS.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Casa</Label>
              <Select
                value={bookmakerFilter}
                onValueChange={(v) => setBookmakerFilter(v as Bookmaker | "all")}
              >
                <SelectTrigger className="h-9 w-full sm:w-40">
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
          </div>
          <BetsTable
            bets={filteredBets}
            ownerUid={me?.uid ?? ""}
            isAdmin={isAdmin}
            matchById={resolvedMatchById}
          />
        </CardContent>
      </Card>
    </div>
  );
}

// Formateadores para el count-up de las tarjetas (enteros y cuotas).
const asInt = (n: number) => String(Math.round(n));
const asOdds = (n: number) => n.toFixed(2);

/** Esqueleto de carga del perfil: cabecera + rejilla de stats + listado. */
function ProfileSkeleton() {
  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center">
          <Skeleton className="h-20 w-20 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-7 w-44" />
            <Skeleton className="h-4 w-56" />
            <Skeleton className="h-3 w-32" />
          </div>
        </CardContent>
      </Card>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="space-y-2 p-4">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-6 w-24" />
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardContent className="space-y-2 p-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

type Tone = "profit" | "loss" | "amber" | "primary" | "neutral";

const TONE: Record<Tone, { border: string; value: string }> = {
  profit: { border: "border-l-4 border-l-profit bg-profit/5", value: "text-profit" },
  loss: { border: "border-l-4 border-l-loss bg-loss/5", value: "text-loss" },
  amber: {
    border: "border-l-4 border-l-amber-500 bg-amber-500/5",
    value: "text-amber-600 dark:text-amber-400",
  },
  primary: { border: "border-l-4 border-l-primary bg-primary/5", value: "" },
  neutral: { border: "", value: "" },
};

/** Tono según el signo del valor (verde si >0, rojo si <0, neutro si 0). */
function signTone(n: number): Tone {
  return n > 0 ? "profit" : n < 0 ? "loss" : "neutral";
}

function StatBox({
  label,
  value,
  tone = "neutral",
  valueClass,
  subtitle,
  icon,
}: {
  label: string;
  value: ReactNode;
  tone?: Tone;
  valueClass?: string;
  subtitle?: string;
  icon?: ReactNode;
}) {
  const t = TONE[tone];
  return (
    <Card className={t.border}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">
            {label}
          </p>
          {icon && <span className="text-muted-foreground/60">{icon}</span>}
        </div>
        <p className={cn("mt-1 text-xl font-bold tabular-nums", t.value, valueClass)}>
          {value}
        </p>
        {subtitle && (
          <p className="mt-0.5 text-[11px] text-muted-foreground">{subtitle}</p>
        )}
      </CardContent>
    </Card>
  );
}
