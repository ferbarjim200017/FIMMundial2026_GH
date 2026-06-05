"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { BetStatusBadge } from "@/components/bets/bet-status-badge";
import { subscribeToBetsByMatch } from "@/features/bets/bets.service";
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
import type { AppUser, Bet, Match } from "@/types/domain";

interface Props {
  match: Match | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function MatchBetsDialog({ match, open, onOpenChange }: Props) {
  const [bets, setBets] = useState<Bet[] | null>(null);
  const [usersById, setUsersById] = useState<Record<string, AppUser>>({});

  useEffect(() => {
    if (!open || !match || !isFirebaseConfigured) {
      setBets(null);
      return;
    }
    const unsubBets = subscribeToBetsByMatch(match.id, setBets);
    const unsubUsers = subscribeToRanking((users) => {
      const map: Record<string, AppUser> = {};
      for (const u of users) map[u.uid] = u;
      setUsersById(map);
    });
    return () => {
      unsubBets();
      unsubUsers();
    };
  }, [open, match]);

  const summary = useMemo(() => {
    if (!bets) return null;
    const total = bets.length;
    const totalStake = bets.reduce((a, b) => a + b.stake, 0);
    const pending = bets.filter((b) => b.status === "pending").length;
    const won = bets.filter((b) => b.status === "won").length;
    const lost = bets.filter((b) => b.status === "lost").length;
    const netProfit = bets.reduce((a, b) => a + (b.profit ?? 0), 0);
    return { total, totalStake, pending, won, lost, netProfit };
  }, [bets]);

  if (!match) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-base">
            Apuestas sobre este partido
          </DialogTitle>
          <DialogDescription>
            {match.homeLabel}{" "}
            <span className="text-muted-foreground">vs</span> {match.awayLabel}
            {match.groupId && ` · Grupo ${match.groupId}`}
            {match.matchday && ` · J${match.matchday}`}
          </DialogDescription>
        </DialogHeader>

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
          {bets === null ? (
            <p className="px-2 py-6 text-center text-sm text-muted-foreground">
              Cargando apuestas…
            </p>
          ) : bets.length === 0 ? (
            <p className="px-2 py-6 text-center text-sm text-muted-foreground">
              Aún nadie ha registrado apuestas para este partido.
            </p>
          ) : (
            <ul className="divide-y">
              {bets.map((bet) => {
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
                      </div>
                      <p className="truncate text-sm font-medium">
                        {bet.selection}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        Cuota {bet.odds.toFixed(2)} · Stake{" "}
                        {formatCurrency(bet.stake)} ·{" "}
                        {bookmakerLabel(bet.bookmaker, bet.bookmakerLabel)}
                      </p>
                    </div>
                    {bet.status !== "pending" && (
                      <div className="text-right">
                        <p
                          className={cn(
                            "font-mono text-sm font-bold",
                            profitClass(bet.profit)
                          )}
                        >
                          {bet.profit > 0 ? "+" : ""}
                          {formatCurrency(bet.profit)}
                        </p>
                      </div>
                    )}
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
