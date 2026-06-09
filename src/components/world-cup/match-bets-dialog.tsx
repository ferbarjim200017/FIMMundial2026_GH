"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Eye } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { BetStatusBadge } from "@/components/bets/bet-status-badge";
import { BookmakerPill } from "@/components/bets/bookmaker-pill";
import { useAuth } from "@/features/auth/auth.context";
import { useGroup } from "@/features/groups/groups.context";
import { subscribeToBetsForMatch } from "@/features/bets/bets.service";
import { MARKET_OPTIONS } from "@/features/bets/bets.schema";
import { TeamFlag } from "@/components/matches/team-flag";
import { subscribeToRanking } from "@/features/users/users.service";
import { betInGroup, bookmakerLabel } from "@/features/bets/bets.utils";
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

interface Props {
  match: Match | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function MatchBetsDialog({ match, open, onOpenChange }: Props) {
  const { appUser } = useAuth();
  const { memberUids, activeGroup } = useGroup();
  const [bets, setBets] = useState<Bet[] | null>(null);
  const [usersById, setUsersById] = useState<Record<string, AppUser>>({});
  // "all"  → comportamiento por defecto (todas las apuestas).
  // "mine" → solo las del usuario logueado.
  const [scope, setScope] = useState<"all" | "mine">("all");
  // Reseteamos a "all" cada vez que cambia el partido para que el usuario
  // no se quede atrapado en el filtro al saltar entre popups.
  useEffect(() => {
    setScope("all");
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

  const visibleBets = useMemo(() => {
    if (!groupBets) return null;
    if (scope === "mine" && appUser) {
      return groupBets.filter((b) => b.userId === appUser.uid);
    }
    return groupBets;
  }, [groupBets, scope, appUser]);

  const myBetsCount = useMemo(() => {
    if (!groupBets || !appUser) return 0;
    return groupBets.filter((b) => b.userId === appUser.uid).length;
  }, [groupBets, appUser]);

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

  if (!match) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
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

        {appUser && (
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant={scope === "all" ? "default" : "outline"}
              size="sm"
              onClick={() => setScope("all")}
            >
              Todas{groupBets ? ` · ${groupBets.length}` : ""}
            </Button>
            <Button
              type="button"
              variant={scope === "mine" ? "default" : "outline"}
              size="sm"
              onClick={() => setScope("mine")}
            >
              Mis apuestas{groupBets ? ` · ${myBetsCount}` : ""}
            </Button>
          </div>
        )}

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

        <div className="max-h-[60vh] overflow-y-auto">
          {visibleBets === null ? (
            <p className="px-2 py-6 text-center text-sm text-muted-foreground">
              Cargando apuestas…
            </p>
          ) : visibleBets.length === 0 ? (
            <p className="px-2 py-6 text-center text-sm text-muted-foreground">
              {scope === "mine"
                ? "No tienes apuestas registradas para este partido."
                : "Aún nadie ha registrado apuestas para este partido."}
            </p>
          ) : (
            <ul className="divide-y">
              {visibleBets.map((bet) => {
                const user = usersById[bet.userId] ?? null;
                return (
                  <li
                    key={bet.id}
                    className="flex items-start gap-3 px-1 py-3 text-sm"
                  >
                    <Link
                      href={user ? ROUTES.profile(user.uid) : "#"}
                      className="shrink-0"
                    >
                      <Avatar className="h-9 w-9">
                        {user?.avatarUrl && <AvatarImage src={user.avatarUrl} />}
                        <AvatarFallback>
                          {initials(user?.username ?? "?")}
                        </AvatarFallback>
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
                      <p className="truncate text-sm font-medium">
                        {bet.selection}
                      </p>
                      <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                        <span className="truncate">
                          Cuota {bet.odds.toFixed(2)} · Stake{" "}
                          {formatCurrency(bet.stake)}
                        </span>
                        <BookmakerPill
                          bookmaker={bet.bookmaker}
                          customLabel={bet.bookmakerLabel}
                          size="xs"
                        />
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
                      <Button asChild size="sm" variant="outline" className="h-7 gap-1 px-2 text-xs">
                        <Link href={`${ROUTES.bets}/${bet.id}`}>
                          <Eye className="h-3.5 w-3.5" />
                          Ver
                        </Link>
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
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
