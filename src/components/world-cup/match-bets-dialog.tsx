"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ClipboardCheck, Eye, Search, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { BetStatusBadge } from "@/components/bets/bet-status-badge";
import { BookmakerPill } from "@/components/bets/bookmaker-pill";
import { useBetDetail } from "@/components/bets/bet-detail-dialog";
import { useAuth } from "@/features/auth/auth.context";
import { useGroup } from "@/features/groups/groups.context";
import { subscribeToBetsForMatch } from "@/features/bets/bets.service";
import {
  MARKET_OPTIONS,
  STATUS_OPTIONS,
  BOOKMAKER_OPTIONS,
} from "@/features/bets/bets.schema";
import { TeamFlag } from "@/components/matches/team-flag";
import { MatchResultDialog } from "@/components/matches/match-result-dialog";
import { subscribeToRanking } from "@/features/users/users.service";
import { betInGroup, bookmakerLabel, round2 } from "@/features/bets/bets.utils";
import { isFirebaseConfigured } from "@/lib/firebase/client";
import { ROUTES } from "@/lib/constants";
import {
  cn,
  formatCurrency,
  initials,
  profitClass,
} from "@/lib/utils";
import type { AppUser, Bet, Match } from "@/types/domain";

function marketLabel(value: string): string {
  return MARKET_OPTIONS.find((m) => m.value === value)?.label ?? value;
}

function medal(rank: number) {
  if (rank === 1) return "🥇";
  if (rank === 2) return "🥈";
  if (rank === 3) return "🥉";
  return `#${rank}`;
}

// Pestañas por resultado, visibles solo cuando el partido ya terminó. Cada
// una mapea al mismo estado `status` que usa el filtrado.
const RESULT_TABS = [
  { value: "all", label: "Todas" },
  { value: "won", label: "Ganadas" },
  { value: "lost", label: "Perdidas" },
  { value: "pending", label: "Pendientes" },
] as const;

/** True si la apuesta es directa a este partido (su id está en `matchIds`),
 *  frente a las apuestas a futuro/outright que aparecen solo por el equipo. */
function isDirectMatchBet(bet: Bet, matchId: string): boolean {
  if (bet.matchId === matchId) return true;
  return (bet.matchIds ?? []).includes(matchId);
}

function BetRow({
  bet,
  user,
  onOpen,
}: {
  bet: Bet;
  user: AppUser | null;
  onOpen: (bet: Bet, user: AppUser | null) => void;
}) {
  return (
    <li className="flex items-start gap-3 px-1 py-3 text-sm">
      <Link href={user ? ROUTES.profile(user.uid) : "#"} className="shrink-0">
        <Avatar className="h-9 w-9">
          {user?.avatarUrl && <AvatarImage src={user.avatarUrl} />}
          <AvatarFallback>{initials(user?.username ?? "?")}</AvatarFallback>
        </Avatar>
      </Link>
      <div className="min-w-0 flex-1 space-y-0.5">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={user ? ROUTES.profile(user.uid) : "#"}
            className="font-semibold hover:underline"
          >
            {user?.username ?? "Usuario"}
          </Link>
          <BetStatusBadge status={bet.status} />
          {bet.isCombo && (
            <span className="rounded-full border px-1.5 py-0.5 text-[10px] text-muted-foreground">
              Combo
            </span>
          )}
          {bet.market === "outright" && (
            <span className="rounded-full bg-sky-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-sky-600 dark:text-sky-400">
              Outright
            </span>
          )}
          {bet.isFreebet && (
            <span className="rounded-full bg-purple-600/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-purple-600 dark:text-purple-400">
              Freebet
            </span>
          )}
        </div>
        <p className="truncate text-[11px] uppercase tracking-wider text-muted-foreground">
          {marketLabel(bet.market)}
          {bet.market === "outright" && bet.matchLabel && (
            <>
              <span className="mx-1.5 text-border" aria-hidden>·</span>
              <span className="normal-case tracking-normal text-foreground/80">
                {bet.matchLabel}
              </span>
            </>
          )}
          {bet.market !== "outright" && bet.marketDetail && (
            <>
              <span className="mx-1.5 text-border" aria-hidden>·</span>
              <span className="normal-case tracking-normal">
                {bet.marketDetail}
              </span>
            </>
          )}
        </p>
        <p className="truncate text-sm font-medium">{bet.selection}</p>
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="min-w-0 truncate">
            Cuota {bet.odds.toFixed(2)} · Stake {formatCurrency(bet.stake)}
          </span>
          <span className="shrink-0">
            <BookmakerPill
              bookmaker={bet.bookmaker}
              customLabel={bet.bookmakerLabel}
              size="xs"
            />
          </span>
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        {bet.status !== "pending" && (
          <p
            className={cn(
              "font-mono text-sm font-bold",
              profitClass(bet.profit)
            )}
          >
            {bet.profit > 0 ? "+" : ""}
            {formatCurrency(bet.profit)}
          </p>
        )}
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 gap-1 px-2 text-xs"
          onClick={() => onOpen(bet, user)}
        >
          <Eye className="h-3.5 w-3.5" />
          Ver
        </Button>
      </div>
    </li>
  );
}

interface Props {
  match: Match | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function MatchBetsDialog({ match, open, onOpenChange }: Props) {
  const { appUser, isAdmin } = useAuth();
  const { memberUids, activeGroup } = useGroup();
  const { openBet } = useBetDetail();
  const [resultOpen, setResultOpen] = useState(false);
  const [bets, setBets] = useState<Bet[] | null>(null);
  const [usersById, setUsersById] = useState<Record<string, AppUser>>({});
  // "all"  → comportamiento por defecto (todas las apuestas).
  // "mine" → solo las del usuario logueado.
  const [scope, setScope] = useState<"all" | "mine">("all");
  // Filtros equivalentes a los de la página de Apuestas / Feed.
  const [status, setStatus] = useState<Bet["status"] | "all">("all");
  const [bookmaker, setBookmaker] = useState<Bet["bookmaker"] | "all">("all");
  const [playerFilter, setPlayerFilter] = useState<string>("all");
  const [query, setQuery] = useState("");
  // Reseteamos los filtros cada vez que cambia el partido para que el usuario
  // no se quede atrapado en ellos al saltar entre popups.
  useEffect(() => {
    setScope("all");
    setStatus("all");
    setBookmaker("all");
    setPlayerFilter("all");
    setQuery("");
  }, [match?.id]);

  useEffect(() => {
    if (!open || !match || !isFirebaseConfigured) {
      setBets(null);
      return;
    }
    // Reset al abrir para evitar mostrar las apuestas del partido anterior
    setBets(null);

    // Salvavidas: si la suscripción no devuelve nada en 4 s, mostramos
    // "no hay apuestas" en vez de quedarnos en "Cargando…" para siempre.
    const safety = window.setTimeout(() => {
      setBets((prev) => (prev === null ? [] : prev));
    }, 4000);

    const unsubBets = subscribeToBetsForMatch(
      match,
      (bets) => {
        window.clearTimeout(safety);
        setBets(bets);
      },
      (err) => {
        console.error("[match bets]", err);
        window.clearTimeout(safety);
        setBets([]); // si Firestore rechaza la query (p.ej. falta índice), no nos quedamos colgados
      }
    );
    const unsubUsers = subscribeToRanking((users) => {
      const map: Record<string, AppUser> = {};
      for (const u of users) map[u.uid] = u;
      setUsersById(map);
    });
    return () => {
      window.clearTimeout(safety);
      unsubBets();
      unsubUsers();
    };
  }, [open, match]);

  // Filtrado base por grupo activo: solo apuestas etiquetadas con este grupo
  // y de miembros del mismo (defensa contra apuestas viejas sin migrar).
  const groupBets = useMemo(() => {
    if (!bets) return null;
    if (!activeGroup || memberUids.size === 0) return [];
    return bets.filter(
      (b) => betInGroup(b, activeGroup.id) && memberUids.has(b.userId)
    );
  }, [bets, memberUids, activeGroup]);

  const normalizedQuery = query.trim().toLowerCase();
  const hasActiveFilters =
    status !== "all" ||
    bookmaker !== "all" ||
    playerFilter !== "all" ||
    normalizedQuery !== "";

  // ¿El partido ya terminó y tiene resultado? Solo entonces mostramos las
  // pestañas por resultado.
  const matchFinished = match?.status === "finished" && !!match?.result;

  // Apuestas filtradas por scope + jugador + casa + búsqueda, pero SIN aplicar
  // todavía el estado. Las usan tanto el dropdown/pestañas como sus contadores.
  const preStatusBets = useMemo(() => {
    if (!groupBets) return null;
    return groupBets.filter((b) => {
      if (scope === "mine" && appUser && b.userId !== appUser.uid) return false;
      if (playerFilter !== "all" && b.userId !== playerFilter) return false;
      if (bookmaker !== "all" && b.bookmaker !== bookmaker) return false;
      if (normalizedQuery) {
        const username = usersById[b.userId]?.username?.toLowerCase() ?? "";
        const haystack = [
          username,
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
  }, [
    groupBets,
    scope,
    appUser,
    playerFilter,
    bookmaker,
    normalizedQuery,
    usersById,
  ]);

  const visibleBets = useMemo(() => {
    if (!preStatusBets) return null;
    if (status === "all") return preStatusBets;
    return preStatusBets.filter((b) => b.status === status);
  }, [preStatusBets, status]);

  const tabCounts = useMemo(() => {
    const src = preStatusBets ?? [];
    return {
      all: src.length,
      won: src.filter((b) => b.status === "won").length,
      lost: src.filter((b) => b.status === "lost").length,
      pending: src.filter((b) => b.status === "pending").length,
    };
  }, [preStatusBets]);

  const myBetsCount = useMemo(() => {
    if (!groupBets || !appUser) return 0;
    return groupBets.filter((b) => b.userId === appUser.uid).length;
  }, [groupBets, appUser]);

  // Ranking de jugadores SOLO con las apuestas de este partido (todas las del
  // grupo, sin aplicar los filtros de arriba) para ver quién gana/pierde más.
  const matchRanking = useMemo(() => {
    if (!groupBets) return [];
    const byUser = new Map<
      string,
      { profit: number; count: number; pending: number }
    >();
    for (const b of groupBets) {
      const cur = byUser.get(b.userId) ?? { profit: 0, count: 0, pending: 0 };
      cur.profit += b.profit ?? 0;
      cur.count += 1;
      if (b.status === "pending") cur.pending += 1;
      byUser.set(b.userId, cur);
    }
    return [...byUser.entries()]
      .map(([uid, v]) => ({
        uid,
        user: usersById[uid] ?? null,
        profit: round2(v.profit),
        count: v.count,
        pending: v.pending,
      }))
      .sort((a, b) => b.profit - a.profit);
  }, [groupBets, usersById]);

  // Jugadores con alguna apuesta en este partido, para el desplegable de
  // filtro por jugador (ordenados alfabéticamente).
  const playerOptions = useMemo(() => {
    return matchRanking
      .map((r) => ({ uid: r.uid, name: r.user?.username ?? "Usuario" }))
      .sort((a, b) =>
        a.name.localeCompare(b.name, "es", { sensitivity: "base" })
      );
  }, [matchRanking]);

  const summary = useMemo(() => {
    if (!visibleBets) return null;
    const total = visibleBets.length;
    const totalStake = visibleBets.reduce((a, b) => a + b.stake, 0);
    const pending = visibleBets.filter((b) => b.status === "pending").length;
    const won = visibleBets.filter((b) => b.status === "won").length;
    const lost = visibleBets.filter((b) => b.status === "lost").length;
    const netProfit = visibleBets.reduce((a, b) => a + (b.profit ?? 0), 0);
    return { total, totalStake, pending, won, lost, netProfit };
  }, [visibleBets]);

  // Separación visual: apuestas directas a ESTE partido vs apuestas a
  // futuro/outright que aparecen solo por tener marcado uno de los equipos.
  const directBets = useMemo(() => {
    if (!visibleBets || !match) return [];
    return visibleBets.filter((b) => isDirectMatchBet(b, match.id));
  }, [visibleBets, match]);

  const outrightBets = useMemo(() => {
    if (!visibleBets || !match) return [];
    return visibleBets.filter((b) => !isDirectMatchBet(b, match.id));
  }, [visibleBets, match]);

  if (!match) return null;

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base">
            Apuestas sobre este partido
          </DialogTitle>
          <DialogDescription>
            <TeamFlag name={match.homeLabel} className="mr-1" />
            {match.homeLabel}{" "}
            <span className="text-muted-foreground">vs</span>{" "}
            <TeamFlag name={match.awayLabel} className="mr-1" />
            {match.awayLabel}
            {match.groupId && ` · Grupo ${match.groupId}`}
            {match.matchday && ` · J${match.matchday}`}
          </DialogDescription>
        </DialogHeader>

        {/* Solo admins: poner/editar el resultado del partido desde aquí. */}
        {isAdmin && (
          <div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setResultOpen(true)}
              className="w-full gap-1.5 sm:w-auto"
            >
              <ClipboardCheck className="h-4 w-4" />
              {match.result ? "Editar resultado" : "Poner resultado"}
            </Button>
          </div>
        )}

        {appUser && (
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant={scope === "all" ? "default" : "outline"}
              size="sm"
              onClick={() => {
                setScope("all");
                setPlayerFilter("all");
              }}
            >
              Todas{groupBets ? ` · ${groupBets.length}` : ""}
            </Button>
            <Button
              type="button"
              variant={scope === "mine" ? "default" : "outline"}
              size="sm"
              onClick={() => {
                setScope("mine");
                setPlayerFilter("all");
              }}
            >
              Mis apuestas{groupBets ? ` · ${myBetsCount}` : ""}
            </Button>
          </div>
        )}

        {/* Filtros — mismos que en la página de Apuestas / Feed */}
        <div className="space-y-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por usuario, selección, mercado, casa…"
              className="h-9 pl-9 pr-9"
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
          {/* Si el partido ha terminado, pestañas por resultado en lugar del
              desplegable de Estado (ambos controlan el mismo filtro). */}
          {matchFinished && (
            <div className="flex flex-wrap gap-1.5">
              {RESULT_TABS.map((t) => (
                <Button
                  key={t.value}
                  type="button"
                  variant={status === t.value ? "default" : "outline"}
                  size="sm"
                  onClick={() => setStatus(t.value)}
                >
                  {t.label}
                  <span className="ml-1 text-xs opacity-70">
                    {tabCounts[t.value]}
                  </span>
                </Button>
              ))}
            </div>
          )}

          <div className="flex flex-wrap items-end gap-2">
            {!matchFinished && (
              <div className="space-y-1">
                <label className="text-[11px] uppercase tracking-wider text-muted-foreground">
                  Estado
                </label>
                <Select
                  value={status}
                  onValueChange={(v) => setStatus(v as Bet["status"] | "all")}
                >
                  <SelectTrigger className="h-9 w-36">
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
            )}
            <div className="space-y-1">
              <label className="text-[11px] uppercase tracking-wider text-muted-foreground">
                Casa
              </label>
              <Select
                value={bookmaker}
                onValueChange={(v) => setBookmaker(v as Bet["bookmaker"] | "all")}
              >
                <SelectTrigger className="h-9 w-36">
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
            {playerOptions.length >= 2 && (
              <div className="space-y-1">
                <label className="text-[11px] uppercase tracking-wider text-muted-foreground">
                  Jugador
                </label>
                <Select
                  value={playerFilter}
                  onValueChange={(v) => {
                    setPlayerFilter(v);
                    // Evita que choque con el atajo "Mis apuestas".
                    if (v !== "all") setScope("all");
                  }}
                >
                  <SelectTrigger className="h-9 w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    {playerOptions.map((p) => (
                      <SelectItem key={p.uid} value={p.uid}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {hasActiveFilters && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setStatus("all");
                  setBookmaker("all");
                  setPlayerFilter("all");
                  setQuery("");
                }}
              >
                Limpiar
              </Button>
            )}
          </div>
        </div>

        {summary && summary.total > 0 && (
          <div className="grid grid-cols-2 gap-2 rounded-md border bg-muted/30 p-3 text-sm sm:grid-cols-4">
            <SummaryStat label="Apuestas" value={String(summary.total)} />
            <SummaryStat
              label="Total apostado"
              value={formatCurrency(summary.totalStake)}
            />
            <SummaryStat
              label="Pendientes"
              value={String(summary.pending)}
            />
            <SummaryStat
              label="Resultado"
              value={`${summary.netProfit > 0 ? "+" : ""}${formatCurrency(summary.netProfit)}`}
              valueClass={profitClass(summary.netProfit)}
            />
          </div>
        )}

        {/* Ranking de este partido — quién gana/pierde más con las apuestas
            relacionadas (todas las del grupo, al margen de los filtros). */}
        {matchRanking.length >= 2 && (
          <div className="space-y-1.5">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Ranking del partido
            </p>
            <ul className="max-h-44 divide-y overflow-y-auto rounded-md border">
              {matchRanking.map((r, i) => (
                <li
                  key={r.uid}
                  className="flex items-center gap-2 px-3 py-1.5 text-sm"
                >
                  <span className="w-6 shrink-0 text-center text-xs font-semibold">
                    {medal(i + 1)}
                  </span>
                  <Avatar className="h-6 w-6 shrink-0">
                    {r.user?.avatarUrl && <AvatarImage src={r.user.avatarUrl} />}
                    <AvatarFallback className="text-[10px]">
                      {initials(r.user?.username ?? "?")}
                    </AvatarFallback>
                  </Avatar>
                  <span className="min-w-0 flex-1 truncate">
                    {r.user?.username ?? "Usuario"}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {r.count} ap.
                    {r.pending > 0 ? ` · ${r.pending} pdte.` : ""}
                  </span>
                  <span
                    className={cn(
                      "shrink-0 font-mono font-semibold",
                      profitClass(r.profit)
                    )}
                  >
                    {r.profit > 0 ? "+" : ""}
                    {formatCurrency(r.profit)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* La lista tiene su propio scroll y altura acotada: así el ranking y
            los filtros quedan siempre visibles arriba y el pop-up mantiene un
            tamaño consistente aunque haya muchas apuestas. */}
        <div className="max-h-[45vh] overflow-y-auto">
          {visibleBets === null ? (
            <p className="px-2 py-6 text-center text-sm text-muted-foreground">
              Cargando apuestas…
            </p>
          ) : visibleBets.length === 0 ? (
            <p className="px-2 py-6 text-center text-sm text-muted-foreground">
              {hasActiveFilters
                ? "No hay apuestas que coincidan con los filtros."
                : scope === "mine"
                ? "No tienes apuestas registradas para este partido."
                : "Aún nadie ha registrado apuestas para este partido."}
            </p>
          ) : (
            <div className="space-y-3">
              {directBets.length > 0 && (
                <div>
                  <p className="px-1 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Apuestas de este partido
                  </p>
                  <ul className="divide-y">
                    {directBets.map((bet) => (
                      <BetRow
                        key={bet.id}
                        bet={bet}
                        user={usersById[bet.userId] ?? null}
                        onOpen={openBet}
                      />
                    ))}
                  </ul>
                </div>
              )}
              {outrightBets.length > 0 && (
                <div>
                  <p className="px-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    A futuro · del equipo
                  </p>
                  <p className="px-1 pb-1 text-[10px] text-muted-foreground">
                    Apuestas a futuro/outright vinculadas a {match.homeLabel} o{" "}
                    {match.awayLabel}, no a este partido en concreto.
                  </p>
                  <ul className="divide-y">
                    {outrightBets.map((bet) => (
                      <BetRow
                        key={bet.id}
                        bet={bet}
                        user={usersById[bet.userId] ?? null}
                        onOpen={openBet}
                      />
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>

      {isAdmin && (
        <MatchResultDialog
          match={match}
          open={resultOpen}
          onOpenChange={setResultOpen}
        />
      )}
    </>
  );
}

function SummaryStat({
  label,
  value,
  valueClass,
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className={cn("font-mono text-sm font-semibold", valueClass)}>
        {value}
      </p>
    </div>
  );
}
