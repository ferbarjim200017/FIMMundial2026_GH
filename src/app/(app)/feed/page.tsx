"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import {
  ArrowUpRight,
  ArrowDownRight,
  Bell,
  ChevronDown,
  Clock,
  Coins,
  Copy,
  Layers,
  Percent,
  Receipt,
  Search,
  SlidersHorizontal,
  TrendingDown,
  TrendingUp,
  Trophy,
  X,
  Zap,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
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
import { BetStatusBadge } from "@/components/bets/bet-status-badge";
import { BookmakerPill } from "@/components/bets/bookmaker-pill";
import { MatchFilter } from "@/components/bets/match-filter";
import { BetMatchFlags } from "@/components/bets/bet-match-flags";
import { EmptyState } from "@/components/ui/empty-state";
import { useBetDetail } from "@/components/bets/bet-detail-dialog";
import { useAuth } from "@/features/auth/auth.context";
import { subscribeToAllBets } from "@/features/bets/bets.service";
import { subscribeToMatches } from "@/features/matches/matches.service";
import { useGroup } from "@/features/groups/groups.context";
import {
  betDisplayLabel,
  betHasMatch,
  betInGroup,
  betOutcome,
  betPlaysInWindow,
  computeSuperaumentoSummary,
  computeUserStats,
  currentDayWindow,
} from "@/features/bets/bets.utils";
import { bookmakerLabel } from "@/features/bets/bets.utils";
import { resolveMatchLabels } from "@/features/matches/bracket-resolver";
import { isFirebaseConfigured } from "@/lib/firebase/client";
import { ROUTES } from "@/lib/constants";
import {
  cn,
  formatCurrency,
  formatPercent,
  initials,
  profitClass,
} from "@/lib/utils";
import type { AppUser, Bet, BetStatus, Bookmaker, Match } from "@/types/domain";

type FeedFilter = "results" | "won" | "lost" | "pending" | "all";

const FILTERS: { value: FeedFilter; label: string }[] = [
  { value: "results", label: "Resultados" },
  { value: "won", label: "Ganadas" },
  { value: "lost", label: "Perdidas" },
  { value: "pending", label: "En curso" },
  { value: "all", label: "Todo" },
];

const MAX_ITEMS = 80;
// Ventana para agrupar apuestas registradas "del tirón" (escaleras/sesión).
const GROUP_WINDOW_MS = 15 * 60 * 1000;

function eventDate(bet: Bet): Date {
  const ts = bet.settledAt ?? bet.createdAt;
  return ts.toDate();
}

function sameYMD(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function dayLabel(d: Date): string {
  const now = new Date();
  const yest = new Date(now);
  yest.setDate(now.getDate() - 1);
  if (sameYMD(d, now)) return "Hoy";
  if (sameYMD(d, yest)) return "Ayer";
  return d.toLocaleDateString("es-ES", {
    weekday: "long",
    day: "2-digit",
    month: "long",
  });
}

/** Entrada del feed ya procesada: divisor de día, apuesta suelta o grupo
 *  (escalera / varias apuestas del mismo registro). */
type FeedEntry =
  | { kind: "day"; key: string; label: string }
  | { kind: "single"; key: string; bet: Bet }
  | { kind: "group"; key: string; bets: Bet[] };

function matchesFilter(bet: Bet, filter: FeedFilter): boolean {
  if (filter === "all") return true;
  // Cashout cuenta como ganada/perdida según su resultado.
  if (filter === "won") return betOutcome(bet) === "won";
  if (filter === "lost") return betOutcome(bet) === "lost";
  if (filter === "pending") return bet.status === "pending";
  // "results" → todo lo que ya tiene un desenlace
  return bet.status !== "pending";
}

type BookmakerFilter = Bookmaker | "all";

export default function FeedPage() {
  const [allBets, setAllBets] = useState<Bet[] | null>(null);
  const [matches, setMatches] = useState<Match[]>([]);
  const { memberUids, activeGroup, groupMembers } = useGroup();
  const { appUser } = useAuth();
  // Marca de tiempo de la última visita al feed (por grupo) para resaltar las
  // novedades. Se lee al entrar y se reescribe a "ahora" para la próxima vez.
  const [lastSeen, setLastSeen] = useState<number | null>(null);

  // Mapa de autores para pintar el feed. Las apuestas mostradas se filtran a
  // miembros del grupo activo, que ya están en memoria vía GroupProvider, así
  // que evitamos abrir un listener a la colección `users` ENTERA.
  const usersById = useMemo(() => {
    const map: Record<string, AppUser> = {};
    for (const u of groupMembers) map[u.uid] = u;
    return map;
  }, [groupMembers]);
  const [filter, setFilter] = useState<FeedFilter>("results");
  const [query, setQuery] = useState("");
  const [userFilter, setUserFilter] = useState<string>("all");
  const [matchFilter, setMatchFilter] = useState<string>("all");
  const [bookmakerFilter, setBookmakerFilter] = useState<BookmakerFilter>("all");
  const [minStake, setMinStake] = useState("");
  const [maxStake, setMaxStake] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Deep-link: si la URL trae `?user=UID` (p.ej. desde la gráfica de
  // ranking) aplicamos directamente el filtro por usuario y abrimos el
  // panel de filtros para que la selección sea visible. Leemos
  // `window.location.search` para no requerir `<Suspense>` alrededor.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const uid = new URLSearchParams(window.location.search).get("user");
    if (uid) {
      setUserFilter(uid);
      setFiltersOpen(true);
      // Cambia a "Todo" para no esconder apuestas pending del filtro por
      // defecto "Resultados".
      setFilter("all");
    }
  }, []);

  useEffect(() => {
    if (!isFirebaseConfigured) {
      setAllBets([]);
      return;
    }
    const unsubBets = subscribeToAllBets(setAllBets);
    const unsubMatches = subscribeToMatches(setMatches, () => setMatches([]));
    return () => {
      unsubBets();
      unsubMatches();
    };
  }, []);

  // Lee la última visita guardada (para resaltar novedades) y marca "ahora"
  // como nueva última visita. Por grupo activo.
  useEffect(() => {
    if (!activeGroup) return;
    const key = `fim:feed-seen:${activeGroup.id}`;
    try {
      const raw = localStorage.getItem(key);
      setLastSeen(raw != null ? Number(raw) : null);
      localStorage.setItem(key, String(Date.now()));
    } catch {
      setLastSeen(null);
    }
  }, [activeGroup]);

  // Filtra a las apuestas TAGGEADAS con el grupo activo. La membresía del
  // usuario en el grupo se queda como segunda condición de seguridad — una
  // apuesta antigua sin groupId que no se haya migrado quedaría fuera, lo
  // cual es lo deseable.
  const bets = useMemo(() => {
    if (allBets === null) return null;
    if (!activeGroup || memberUids.size === 0) return null;
    return allBets.filter(
      (b) => betInGroup(b, activeGroup.id) && memberUids.has(b.userId)
    );
  }, [allBets, memberUids, activeGroup]);

  // Una apuesta es "novedad" si es de OTRO miembro y su actividad (alta o
  // liquidación) es posterior a tu última visita al feed.
  const isNewBet = useCallback(
    (b: Bet) =>
      lastSeen != null &&
      appUser != null &&
      b.userId !== appUser.uid &&
      eventDate(b).getTime() > lastSeen,
    [lastSeen, appUser]
  );
  const newCount = useMemo(
    () => (bets ? bets.filter(isNewBet).length : 0),
    [bets, isNewBet]
  );

  // Resort por timestamp efectivo (settledAt si existe, si no createdAt)
  // para que las apuestas recién liquidadas suban arriba aunque sean antiguas.
  const sortedBets = useMemo(() => {
    if (!bets) return null;
    return [...bets].sort(
      (a, b) => eventDate(b).getTime() - eventDate(a).getTime()
    );
  }, [bets]);

  const userOptions = useMemo(() => {
    return Object.values(usersById)
      .slice()
      .filter((u) => memberUids.has(u.uid))
      .sort((a, b) =>
        a.username.localeCompare(b.username, "es", { sensitivity: "base" })
      );
  }, [usersById, memberUids]);

  const normalizedQuery = query.trim().toLowerCase();
  const minStakeNum = minStake === "" ? null : Number(minStake);
  const maxStakeNum = maxStake === "" ? null : Number(maxStake);
  const hasAdvancedFilters =
    userFilter !== "all" ||
    matchFilter !== "all" ||
    bookmakerFilter !== "all" ||
    minStake !== "" ||
    maxStake !== "" ||
    normalizedQuery !== "";

  // Partidos con los huecos de eliminatoria resueltos al equipo provisional,
  // para mostrar el equipo real aunque la apuesta se guardara con un hueco.
  const resolvedMatchById = useMemo(() => {
    const map = new Map<string, Match>();
    for (const m of resolveMatchLabels(matches)) map.set(m.id, m);
    return map;
  }, [matches]);

  const filteredBets = useMemo(() => {
    if (!sortedBets) return null;
    return sortedBets
      .filter((b) => matchesFilter(b, filter))
      .filter((b) => {
        if (userFilter !== "all" && b.userId !== userFilter) return false;
        if (matchFilter !== "all" && !betHasMatch(b, matchFilter)) return false;
        if (bookmakerFilter !== "all" && b.bookmaker !== bookmakerFilter)
          return false;
        if (minStakeNum !== null && !Number.isNaN(minStakeNum) && b.stake < minStakeNum)
          return false;
        if (maxStakeNum !== null && !Number.isNaN(maxStakeNum) && b.stake > maxStakeNum)
          return false;
        if (normalizedQuery !== "") {
          const username = usersById[b.userId]?.username?.toLowerCase() ?? "";
          const haystack = [
            username,
            betDisplayLabel(b, resolvedMatchById),
            b.matchLabel,
            b.selection,
            b.marketDetail,
            b.bookmakerLabel ?? "",
            bookmakerLabel(b.bookmaker, b.bookmakerLabel),
          ]
            .join(" ")
            .toLowerCase();
          if (!haystack.includes(normalizedQuery)) return false;
        }
        return true;
      })
      .slice(0, MAX_ITEMS);
  }, [
    sortedBets,
    filter,
    userFilter,
    matchFilter,
    bookmakerFilter,
    minStakeNum,
    maxStakeNum,
    normalizedQuery,
    usersById,
    resolvedMatchById,
  ]);

  // Procesa la lista en entradas con divisores por día y AGRUPANDO las apuestas
  // registradas del tirón (mismo usuario, mismo partido, mismo estado y dentro
  // de una ventana corta) para que una escalera de 5 no inunde el feed.
  const feedEntries = useMemo<FeedEntry[]>(() => {
    if (!filteredBets) return [];
    const out: FeedEntry[] = [];
    let lastDay = "";
    let i = 0;
    while (i < filteredBets.length) {
      const b = filteredBets[i];
      const d = eventDate(b);
      const dk = dayKey(d);
      if (dk !== lastDay) {
        out.push({ kind: "day", key: `day-${dk}`, label: dayLabel(d) });
        lastDay = dk;
      }
      const group = [b];
      let j = i + 1;
      while (j < filteredBets.length) {
        const n = filteredBets[j];
        if (
          n.userId === b.userId &&
          n.matchLabel === b.matchLabel &&
          n.status === b.status &&
          sameYMD(eventDate(n), d) &&
          Math.abs(n.createdAt.toMillis() - b.createdAt.toMillis()) <
            GROUP_WINDOW_MS
        ) {
          group.push(n);
          j++;
        } else {
          break;
        }
      }
      if (group.length >= 2) {
        out.push({ kind: "group", key: `g-${b.id}`, bets: group });
      } else {
        out.push({ kind: "single", key: b.id, bet: b });
      }
      i = j;
    }
    return out;
  }, [filteredBets]);

  const resetFilters = () => {
    setQuery("");
    setUserFilter("all");
    setMatchFilter("all");
    setBookmakerFilter("all");
    setMinStake("");
    setMaxStake("");
  };

  // Hora de inicio (kickoff) de cada partido, para atribuir cada apuesta al
  // día en que se JUEGA su partido (no a cuándo se liquidó).
  const kickoffByMatchId = useMemo(() => {
    const m = new Map<string, number>();
    for (const x of matches) m.set(x.id, x.kickoffUtc.toMillis());
    return m;
  }, [matches]);

  // "Resultado de hoy": jornada de las 9:00 a las 9:00, por hora del partido.
  // Una pérdida de un partido de ayer NO cuenta hoy aunque la marques hoy.
  const todaySummary = useMemo(() => {
    if (!sortedBets) return null;
    const { startMs, endMs } = currentDayWindow();
    const todays = sortedBets.filter(
      (b) =>
        b.status !== "pending" &&
        betPlaysInWindow(b, kickoffByMatchId, startMs, endMs)
    );
    const won = todays.filter((b) => betOutcome(b) === "won");
    const lost = todays.filter((b) => betOutcome(b) === "lost");
    const netProfit = todays.reduce((acc, b) => acc + b.profit, 0);
    return { won: won.length, lost: lost.length, netProfit };
  }, [sortedBets, kickoffByMatchId]);

  // Ganador y perdedor "absolutos" del grupo activo, calculados a partir
  // de las apuestas etiquetadas con este grupo (no del stats global).
  const groupExtremes = useMemo(() => {
    const usersArr = Object.values(usersById).filter((u) =>
      memberUids.has(u.uid)
    );
    if (usersArr.length === 0 || !bets) return null;
    const profitByUid = new Map<string, number>();
    for (const u of usersArr) {
      const userBets = bets.filter((b) => b.userId === u.uid);
      profitByUid.set(u.uid, computeUserStats(userBets).totalProfit);
    }
    let topProfit = usersArr[0];
    let topLoss = usersArr[0];
    for (const u of usersArr) {
      if ((profitByUid.get(u.uid) ?? 0) > (profitByUid.get(topProfit.uid) ?? 0)) {
        topProfit = u;
      }
      if ((profitByUid.get(u.uid) ?? 0) < (profitByUid.get(topLoss.uid) ?? 0)) {
        topLoss = u;
      }
    }
    const topProfitValue = profitByUid.get(topProfit.uid) ?? 0;
    const topLossValue = profitByUid.get(topLoss.uid) ?? 0;
    return {
      topProfit: topProfitValue > 0 ? { user: topProfit, value: topProfitValue } : null,
      topLoss: topLossValue < 0 ? { user: topLoss, value: topLossValue } : null,
    };
  }, [usersById, memberUids, bets]);

  // Totales históricos del grupo (todas las apuestas, no solo de hoy).
  const groupTotals = useMemo(() => {
    if (!sortedBets) return null;
    const wonCount = sortedBets.filter((b) => betOutcome(b) === "won").length;
    const lostCount = sortedBets.filter((b) => betOutcome(b) === "lost").length;
    return { wonCount, lostCount };
  }, [sortedBets]);

  // Agregados económicos del grupo: dinero apostado (solo dinero real, sin
  // freebets), beneficio neto, ROI y dinero "en juego" (stake de apuestas
  // pendientes, sin contar freebets).
  const groupAggregates = useMemo(() => {
    const src = sortedBets ?? [];
    let totalStaked = 0;
    let totalProfit = 0;
    let decidedStaked = 0;
    let pendingStake = 0;
    for (const b of src) {
      // "Dinero apostado": solo dinero real del jugador, los freebets (dinero
      // de la casa) no cuentan, independientemente del resultado.
      if (!b.isFreebet) totalStaked += b.stake;
      totalProfit += b.profit ?? 0;
      if (b.status === "pending" && !b.isFreebet) pendingStake += b.stake;
      if (b.status !== "pending" && b.status !== "void" && !b.isFreebet) {
        decidedStaked += b.stake;
      }
    }
    const roi = decidedStaked > 0 ? (totalProfit / decidedStaked) * 100 : 0;
    return { totalStaked, totalProfit, roi, pendingStake };
  }, [sortedBets]);

  // Balance de superaumentos del grupo (beneficio neto de las apuestas de
  // tipo superaumento de todos los miembros).
  const superaumento = useMemo(
    () => computeSuperaumentoSummary(sortedBets ?? []),
    [sortedBets]
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight">Feed</h1>
        <p className="text-sm text-muted-foreground">
          Actividad del grupo en tiempo real — ganadas, perdidas y apuestas en
          curso.
        </p>
      </div>

      {newCount > 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-sm">
          <Bell className="h-4 w-4 shrink-0 text-primary" />
          <span>
            <strong>{newCount}</strong> novedad{newCount === 1 ? "" : "es"} desde
            tu última visita
          </span>
        </div>
      )}

      {sortedBets && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
          <SummaryCard
            label="Apuestas totales"
            value={String(sortedBets.length)}
            icon={<Receipt className="h-5 w-5 text-primary" />}
            accent="text-primary"
          />
          {groupTotals && (
            <>
              <SummaryCard
                label="Total ganadas"
                value={String(groupTotals.wonCount)}
                icon={<TrendingUp className="h-5 w-5 text-profit" />}
                accent="text-profit"
              />
              <SummaryCard
                label="Total perdidas"
                value={String(groupTotals.lostCount)}
                icon={<TrendingDown className="h-5 w-5 text-loss" />}
                accent="text-loss"
              />
            </>
          )}
          {todaySummary && (
            <>
              <SummaryCard
                label="Ganadas hoy"
                value={String(todaySummary.won)}
                icon={<TrendingUp className="h-5 w-5 text-profit" />}
                accent="text-profit"
              />
              <SummaryCard
                label="Perdidas hoy"
                value={String(todaySummary.lost)}
                icon={<TrendingDown className="h-5 w-5 text-loss" />}
                accent="text-loss"
              />
              <SummaryCard
                label="Resultado de hoy"
                value={`${todaySummary.netProfit > 0 ? "+" : ""}${formatCurrency(
                  todaySummary.netProfit
                )}`}
                icon={<Trophy className="h-5 w-5 text-gold" />}
                accent={profitClass(todaySummary.netProfit)}
              />
            </>
          )}
        </div>
      )}

      {/* Resumen económico general del grupo */}
      {sortedBets && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <SummaryCard
            label="Dinero apostado"
            value={formatCurrency(groupAggregates.totalStaked)}
            icon={<Coins className="h-5 w-5 text-primary" />}
          />
          <SummaryCard
            label="Beneficio total"
            value={`${groupAggregates.totalProfit > 0 ? "+" : ""}${formatCurrency(
              groupAggregates.totalProfit
            )}`}
            icon={
              <TrendingUp
                className={cn("h-5 w-5", profitClass(groupAggregates.totalProfit))}
              />
            }
            accent={profitClass(groupAggregates.totalProfit)}
          />
          <SummaryCard
            label="ROI del grupo"
            value={formatPercent(groupAggregates.roi)}
            icon={
              <Percent
                className={cn("h-5 w-5", profitClass(groupAggregates.roi))}
              />
            }
            accent={profitClass(groupAggregates.roi)}
          />
          <SummaryCard
            label="En juego"
            value={formatCurrency(groupAggregates.pendingStake)}
            icon={<Clock className="h-5 w-5 text-amber-500" />}
          />
          <SummaryCard
            label="Beneficio superaumento"
            value={`${superaumento.profit > 0 ? "+" : ""}${formatCurrency(
              superaumento.profit
            )}`}
            icon={
              <Zap className={cn("h-5 w-5", profitClass(superaumento.profit))} />
            }
            accent={profitClass(superaumento.profit)}
          />
        </div>
      )}

      {groupExtremes && (groupExtremes.topProfit || groupExtremes.topLoss) && (
        <div className="grid gap-3 sm:grid-cols-2">
          <ExtremeCard
            label="Máximo ganador"
            user={groupExtremes.topProfit?.user ?? null}
            value={groupExtremes.topProfit?.value ?? 0}
            icon={<ArrowUpRight className="h-5 w-5 text-profit" />}
            accent="text-profit"
            emptyLabel="Aún nadie está en positivo"
          />
          <ExtremeCard
            label="Máximo perdedor"
            user={groupExtremes.topLoss?.user ?? null}
            value={groupExtremes.topLoss?.value ?? 0}
            icon={<ArrowDownRight className="h-5 w-5 text-loss" />}
            accent="text-loss"
            emptyLabel="Aún nadie está en negativo"
          />
        </div>
      )}

      <div className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por usuario, partido, selección…"
              className="pl-9 pr-9"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:text-foreground"
                aria-label="Limpiar búsqueda"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <Button
            type="button"
            variant={filtersOpen ? "default" : "outline"}
            size="sm"
            onClick={() => setFiltersOpen((v) => !v)}
            className="gap-1.5"
          >
            <SlidersHorizontal className="h-4 w-4" />
            Filtros
          </Button>
          {hasAdvancedFilters && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={resetFilters}
            >
              Limpiar
            </Button>
          )}
        </div>

        {filtersOpen && (
          <Card>
            <CardContent className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-1">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                  Usuario
                </Label>
                <Select
                  value={userFilter}
                  onValueChange={(v) => setUserFilter(v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Todos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    {userOptions.map((u) => (
                      <SelectItem key={u.uid} value={u.uid}>
                        {u.username}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <MatchFilter
                matches={matches}
                value={matchFilter}
                onChange={setMatchFilter}
              />

              <div className="space-y-1">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                  Casa de apuestas
                </Label>
                <Select
                  value={bookmakerFilter}
                  onValueChange={(v) => setBookmakerFilter(v as BookmakerFilter)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Todas" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas</SelectItem>
                    <SelectItem value="bet365">Bet365</SelectItem>
                    <SelectItem value="winamax">Winamax</SelectItem>
                    <SelectItem value="other">Otra</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                  Stake mínimo (€)
                </Label>
                <Input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="0.01"
                  value={minStake}
                  onChange={(e) => setMinStake(e.target.value)}
                  placeholder="0"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                  Stake máximo (€)
                </Label>
                <Input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="0.01"
                  value={maxStake}
                  onChange={(e) => setMaxStake(e.target.value)}
                  placeholder="Sin límite"
                />
              </div>
            </CardContent>
          </Card>
        )}

        <div className="flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <Button
              key={f.value}
              variant={filter === f.value ? "default" : "outline"}
              size="sm"
              onClick={() => setFilter(f.value)}
            >
              {f.label}
            </Button>
          ))}
        </div>
      </div>

      {filteredBets === null ? (
        <Card>
          <CardContent className="px-6 py-8 text-center text-sm text-muted-foreground">
            Cargando feed…
          </CardContent>
        </Card>
      ) : filteredBets.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title="No hay actividad para este filtro"
          subtitle="Prueba a cambiar los filtros o el periodo para ver más apuestas."
        />
      ) : (
        <div className="space-y-3">
          {feedEntries.map((e) =>
            e.kind === "day" ? (
              <DayDivider key={e.key} label={e.label} />
            ) : e.kind === "group" ? (
              <GroupedFeedItem
                key={e.key}
                bets={e.bets}
                user={usersById[e.bets[0].userId] ?? null}
                matchById={resolvedMatchById}
                isNew={e.bets.some(isNewBet)}
              />
            ) : (
              <FeedItem
                key={e.key}
                bet={e.bet}
                user={usersById[e.bet.userId] ?? null}
                matchById={resolvedMatchById}
                isNew={isNewBet(e.bet)}
              />
            )
          )}
        </div>
      )}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  icon,
  accent,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  accent?: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className="rounded-md bg-muted/50 p-2">{icon}</div>
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">
            {label}
          </p>
          <p className={cn("text-xl font-bold", accent)}>{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function ExtremeCard({
  label,
  user,
  value,
  icon,
  accent,
  emptyLabel,
}: {
  label: string;
  user: AppUser | null;
  value: number;
  icon: React.ReactNode;
  accent?: string;
  emptyLabel: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className="rounded-md bg-muted/50 p-2">{icon}</div>
        <div className="min-w-0 flex-1">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">
            {label}
          </p>
          {user ? (
            <Link
              href={ROUTES.profile(user.uid)}
              className="block hover:underline"
            >
              <p className="truncate text-sm font-medium">{user.username}</p>
              <p className={cn("font-mono text-lg font-bold", accent)}>
                {value > 0 ? "+" : ""}
                {formatCurrency(value)}
              </p>
            </Link>
          ) : (
            <p className="text-sm text-muted-foreground">{emptyLabel}</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function DayDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 pt-2">
      <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}

/** Varias apuestas registradas del tirón (una escalera), agrupadas en una sola
 *  tarjeta plegable para no inundar el feed. */
function GroupedFeedItem({
  bets,
  user,
  matchById,
  isNew = false,
}: {
  bets: Bet[];
  user: AppUser | null;
  matchById: Map<string, Match>;
  isNew?: boolean;
}) {
  const { openBet } = useBetDetail();
  const [open, setOpen] = useState(false);
  const displayName = user?.username ?? "Usuario";
  const first = bets[0];
  const totalStake = bets.reduce((a, b) => a + b.stake, 0);
  const allSettled = bets.every((b) => b.status !== "pending");
  const totalProfit = bets.reduce((a, b) => a + (b.profit ?? 0), 0);
  const timestamp = formatDistanceToNow(eventDate(first), {
    addSuffix: true,
    locale: es,
  });

  return (
    <Card className={cn("overflow-hidden", isNew && "ring-1 ring-primary/50")}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-start gap-3 p-4 text-left transition-colors hover:bg-accent/30"
      >
        <Avatar className="h-10 w-10 shrink-0">
          {user?.avatarUrl && <AvatarImage src={user.avatarUrl} />}
          <AvatarFallback>{initials(displayName)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1 space-y-1">
          <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm">
            <span className="font-semibold">{displayName}</span>
            <span className="text-muted-foreground">
              {actionVerb(first.status)} {bets.length} apuestas en
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase text-muted-foreground">
              <Layers className="h-3 w-3" />
              Escalera
            </span>
            {isNew && (
              <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-bold uppercase text-primary-foreground">
                Nuevo
              </span>
            )}
          </p>
          <p className="flex items-center gap-1.5 text-sm font-medium">
            <BetMatchFlags bet={first} matchById={matchById} />
            <span className="truncate">{betDisplayLabel(first, matchById)}</span>
          </p>
          <p className="text-xs text-muted-foreground">
            Stake total {formatCurrency(totalStake)} · {timestamp}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {allSettled && (
            <span
              className={cn("font-mono text-sm font-bold", profitClass(totalProfit))}
            >
              {totalProfit > 0 ? "+" : ""}
              {formatCurrency(totalProfit)}
            </span>
          )}
          <ChevronDown
            className={cn(
              "h-4 w-4 text-muted-foreground transition-transform",
              open && "rotate-180"
            )}
            aria-hidden
          />
        </div>
      </button>
      {open && (
        <ul className="divide-y border-t">
          {bets.map((b) => (
            <li key={b.id}>
              <button
                type="button"
                onClick={() => openBet(b, user)}
                className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm transition-colors hover:bg-accent/30"
              >
                <span className="min-w-0 flex-1 truncate">
                  {b.selection}{" "}
                  <span className="text-muted-foreground">
                    @ {b.odds.toFixed(2)} · {formatCurrency(b.stake)}
                  </span>
                </span>
                <BetStatusBadge status={b.status} />
                {b.status !== "pending" && (
                  <span
                    className={cn(
                      "shrink-0 font-mono text-xs font-semibold",
                      profitClass(b.profit)
                    )}
                  >
                    {b.profit > 0 ? "+" : ""}
                    {formatCurrency(b.profit)}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function FeedItem({
  bet,
  user,
  matchById,
  isNew = false,
}: {
  bet: Bet;
  user: AppUser | null;
  matchById: Map<string, Match>;
  isNew?: boolean;
}) {
  const { openBet } = useBetDetail();
  const accent =
    bet.status === "won"
      ? "border-l-4 border-l-profit"
      : bet.status === "lost"
      ? "border-l-4 border-l-loss"
      : bet.status === "pending"
      ? "border-l-4 border-l-muted-foreground/30"
      : "";

  const displayName = user?.username ?? "Usuario";
  const timestamp = formatDistanceToNow(eventDate(bet), {
    addSuffix: true,
    locale: es,
  });

  return (
    // Toda la tarjeta es clicable → abre el pop-up. Los enlaces internos
    // (perfil, copiar) cortan la propagación para navegar sin abrir el pop-up.
    <Card
      role="button"
      tabIndex={0}
      onClick={() => openBet(bet, user)}
      onKeyDown={(e) => {
        if (
          e.target === e.currentTarget &&
          (e.key === "Enter" || e.key === " ")
        ) {
          e.preventDefault();
          openBet(bet, user);
        }
      }}
      aria-label={`Abrir apuesta de ${displayName}`}
      className={cn(
        "relative cursor-pointer overflow-hidden transition-colors hover:bg-accent/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        accent,
        isNew && "ring-1 ring-primary/50"
      )}
    >
      <CardContent className="relative flex items-start gap-3 p-4">
        <Link
          href={user ? ROUTES.profile(user.uid) : "#"}
          onClick={(e) => e.stopPropagation()}
          className="relative z-10 shrink-0"
        >
          <Avatar className="h-10 w-10">
            {user?.avatarUrl && <AvatarImage src={user.avatarUrl} />}
            <AvatarFallback>{initials(displayName)}</AvatarFallback>
          </Avatar>
        </Link>

        <div className="relative z-10 min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
            <Link
              href={user ? ROUTES.profile(user.uid) : "#"}
              onClick={(e) => e.stopPropagation()}
              className="font-semibold hover:underline"
            >
              {displayName}
            </Link>
            <span className="text-muted-foreground">
              {actionVerb(bet.status)}
            </span>
            <BetStatusBadge status={bet.status} />
            {bet.isFreebet && (
              <span className="rounded-full bg-purple-600/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-purple-600 dark:text-purple-400">
                Freebet
              </span>
            )}
            {isNew && (
              <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-bold uppercase text-primary-foreground">
                Nuevo
              </span>
            )}
          </div>

          <p className="flex items-center gap-1.5 text-sm font-medium">
            <BetMatchFlags bet={bet} matchById={matchById} />
            <span className="truncate">{betDisplayLabel(bet, matchById)}</span>
          </p>

          <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            <span className="truncate">
              {bet.selection} @ {bet.odds.toFixed(2)} ·{" "}
              {formatCurrency(bet.stake)}
            </span>
            <BookmakerPill
              bookmaker={bet.bookmaker}
              customLabel={bet.bookmakerLabel}
              size="xs"
            />
          </p>

          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {timestamp}
            </span>
            <span aria-hidden>·</span>
            <Link
              href={`${ROUTES.bets}/new?from=${bet.id}`}
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-medium text-primary hover:bg-primary/10"
              title="Copiar esta apuesta a una nueva"
            >
              <Copy className="h-3 w-3" />
              Copiar
            </Link>
          </div>
        </div>

        {bet.status !== "pending" && (
          <div className="relative z-10 shrink-0 text-right">
            <p
              className={cn(
                "font-mono text-lg font-bold",
                profitClass(bet.profit)
              )}
            >
              {bet.profit > 0 ? "+" : ""}
              {formatCurrency(bet.profit)}
            </p>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
              {bet.status === "won"
                ? "Ganada"
                : bet.status === "lost"
                ? "Perdida"
                : bet.status === "void"
                ? "Anulada"
                : "Cashout"}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function actionVerb(status: BetStatus): string {
  switch (status) {
    case "won":
      return "ganó";
    case "lost":
      return "perdió";
    case "void":
      return "tuvo anulada";
    case "cashout":
      return "cobró cashout en";
    case "pending":
    default:
      return "apostó por";
  }
}
