"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import {
  ArrowUpRight,
  ArrowDownRight,
  Clock,
  Copy,
  Receipt,
  Search,
  SlidersHorizontal,
  TrendingDown,
  TrendingUp,
  Trophy,
  X,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
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
import { subscribeToBets } from "@/features/bets/bets.service";
import { subscribeToRanking } from "@/features/users/users.service";
import { bookmakerLabel } from "@/features/bets/bets.utils";
import { isFirebaseConfigured } from "@/lib/firebase/client";
import { ROUTES } from "@/lib/constants";
import {
  cn,
  formatCurrency,
  initials,
  profitClass,
} from "@/lib/utils";
import type { AppUser, Bet, BetStatus, Bookmaker } from "@/types/domain";

type FeedFilter = "results" | "won" | "lost" | "pending" | "all";

const FILTERS: { value: FeedFilter; label: string }[] = [
  { value: "results", label: "Resultados" },
  { value: "won", label: "Ganadas" },
  { value: "lost", label: "Perdidas" },
  { value: "pending", label: "En curso" },
  { value: "all", label: "Todo" },
];

const MAX_ITEMS = 80;

function eventDate(bet: Bet): Date {
  const ts = bet.settledAt ?? bet.createdAt;
  return ts.toDate();
}

function matchesFilter(bet: Bet, filter: FeedFilter): boolean {
  if (filter === "all") return true;
  if (filter === "won") return bet.status === "won";
  if (filter === "lost") return bet.status === "lost";
  if (filter === "pending") return bet.status === "pending";
  // "results" → todo lo que ya tiene un desenlace
  return bet.status !== "pending";
}

type BookmakerFilter = Bookmaker | "all";

export default function FeedPage() {
  const [bets, setBets] = useState<Bet[] | null>(null);
  const [usersById, setUsersById] = useState<Record<string, AppUser>>({});
  const [filter, setFilter] = useState<FeedFilter>("results");
  const [query, setQuery] = useState("");
  const [userFilter, setUserFilter] = useState<string>("all");
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
      setBets([]);
      return;
    }
    const unsubBets = subscribeToBets({}, setBets);
    const unsubUsers = subscribeToRanking((users) => {
      const map: Record<string, AppUser> = {};
      for (const u of users) map[u.uid] = u;
      setUsersById(map);
    });
    return () => {
      unsubBets();
      unsubUsers();
    };
  }, []);

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
      .sort((a, b) =>
        a.username.localeCompare(b.username, "es", { sensitivity: "base" })
      );
  }, [usersById]);

  const normalizedQuery = query.trim().toLowerCase();
  const minStakeNum = minStake === "" ? null : Number(minStake);
  const maxStakeNum = maxStake === "" ? null : Number(maxStake);
  const hasAdvancedFilters =
    userFilter !== "all" ||
    bookmakerFilter !== "all" ||
    minStake !== "" ||
    maxStake !== "" ||
    normalizedQuery !== "";

  const filteredBets = useMemo(() => {
    if (!sortedBets) return null;
    return sortedBets
      .filter((b) => matchesFilter(b, filter))
      .filter((b) => {
        if (userFilter !== "all" && b.userId !== userFilter) return false;
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
    bookmakerFilter,
    minStakeNum,
    maxStakeNum,
    normalizedQuery,
    usersById,
  ]);

  const resetFilters = () => {
    setQuery("");
    setUserFilter("all");
    setBookmakerFilter("all");
    setMinStake("");
    setMaxStake("");
  };

  const todaySummary = useMemo(() => {
    if (!sortedBets) return null;
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const startMs = start.getTime();
    const todays = sortedBets.filter(
      (b) => b.settledAt && b.settledAt.toMillis() >= startMs
    );
    const won = todays.filter((b) => b.status === "won");
    const lost = todays.filter((b) => b.status === "lost");
    const netProfit = todays.reduce((acc, b) => acc + b.profit, 0);
    return { won: won.length, lost: lost.length, netProfit };
  }, [sortedBets]);

  // Ganador y perdedor "absolutos" del grupo (totalProfit acumulado).
  // Estos cuadros son globales: todos los usuarios ven el mismo valor.
  const groupExtremes = useMemo(() => {
    const usersArr = Object.values(usersById);
    if (usersArr.length === 0) return null;
    let topProfit = usersArr[0];
    let topLoss = usersArr[0];
    for (const u of usersArr) {
      if ((u.stats?.totalProfit ?? 0) > (topProfit.stats?.totalProfit ?? 0)) {
        topProfit = u;
      }
      if ((u.stats?.totalProfit ?? 0) < (topLoss.stats?.totalProfit ?? 0)) {
        topLoss = u;
      }
    }
    return {
      topProfit:
        (topProfit.stats?.totalProfit ?? 0) > 0
          ? { user: topProfit, value: topProfit.stats?.totalProfit ?? 0 }
          : null,
      topLoss:
        (topLoss.stats?.totalProfit ?? 0) < 0
          ? { user: topLoss, value: topLoss.stats?.totalProfit ?? 0 }
          : null,
    };
  }, [usersById]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight">Feed</h1>
        <p className="text-sm text-muted-foreground">
          Actividad del grupo en tiempo real — ganadas, perdidas y apuestas en
          curso.
        </p>
      </div>

      {sortedBets && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <SummaryCard
            label="Apuestas totales"
            value={String(sortedBets.length)}
            icon={<Receipt className="h-5 w-5 text-primary" />}
            accent="text-primary"
          />
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
                label="Resultado del grupo"
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
        <Card>
          <CardContent className="px-6 py-8 text-center text-sm text-muted-foreground">
            No hay actividad para este filtro.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredBets.map((bet) => (
            <FeedItem
              key={bet.id}
              bet={bet}
              user={usersById[bet.userId] ?? null}
            />
          ))}
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

function FeedItem({ bet, user }: { bet: Bet; user: AppUser | null }) {
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
    <Card className={cn("overflow-hidden", accent)}>
      <CardContent className="flex items-start gap-3 p-4">
        <Link
          href={user ? ROUTES.profile(user.uid) : "#"}
          className="shrink-0"
        >
          <Avatar className="h-10 w-10">
            {user?.avatarUrl && <AvatarImage src={user.avatarUrl} />}
            <AvatarFallback>{initials(displayName)}</AvatarFallback>
          </Avatar>
        </Link>

        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
            <Link
              href={user ? ROUTES.profile(user.uid) : "#"}
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
          </div>

          <Link
            href={`${ROUTES.bets}/${bet.id}`}
            className="block truncate text-sm font-medium hover:underline"
          >
            {bet.matchLabel}
          </Link>

          <p className="truncate text-xs text-muted-foreground">
            {bet.selection} @ {bet.odds.toFixed(2)} ·{" "}
            {formatCurrency(bet.stake)} · {bookmakerLabel(bet.bookmaker, bet.bookmakerLabel)}
          </p>

          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {timestamp}
            </span>
            <span aria-hidden>·</span>
            <Link
              href={`${ROUTES.bets}/new?from=${bet.id}`}
              className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-medium text-primary hover:bg-primary/10"
              title="Copiar esta apuesta a una nueva"
            >
              <Copy className="h-3 w-3" />
              Copiar
            </Link>
          </div>
        </div>

        {bet.status !== "pending" && (
          <div className="shrink-0 text-right">
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
