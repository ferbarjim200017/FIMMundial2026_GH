"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import { ExternalLink, Pencil } from "lucide-react";
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
import { BetHistory } from "@/components/bets/bet-history";
import { TeamFlag } from "@/components/matches/team-flag";
import { useAuth } from "@/features/auth/auth.context";
import { getUser } from "@/features/users/users.service";
import { MARKET_OPTIONS } from "@/features/bets/bets.schema";
import { ROUTES } from "@/lib/constants";
import {
  cn,
  formatCurrency,
  formatDateTime,
  initials,
  profitClass,
} from "@/lib/utils";
import type { AppUser, Bet } from "@/types/domain";

function marketLabel(value: string): string {
  return MARKET_OPTIONS.find((m) => m.value === value)?.label ?? value;
}

interface BetDetailContextValue {
  /** Abre el pop-up con el detalle ampliado de una apuesta. Opcionalmente se
   *  puede pasar el autor ya resuelto para evitar una lectura extra. */
  openBet: (bet: Bet, author?: AppUser | null) => void;
}

const BetDetailContext = createContext<BetDetailContextValue>({
  openBet: () => {},
});

export function useBetDetail() {
  return useContext(BetDetailContext);
}

/**
 * Provider global (montado en el layout autenticado) que expone `openBet`
 * para mostrar cualquier apuesta —propia o ajena— en grande, en un pop-up de
 * solo lectura. Si la apuesta es del usuario, aparece el botón "Editar" que
 * lleva a su página de edición.
 */
export function BetDetailProvider({ children }: { children: ReactNode }) {
  const [bet, setBet] = useState<Bet | null>(null);
  const [author, setAuthor] = useState<AppUser | null>(null);
  const [open, setOpen] = useState(false);

  const openBet = useCallback((b: Bet, a?: AppUser | null) => {
    setBet(b);
    setAuthor(a ?? null);
    setOpen(true);
  }, []);

  return (
    <BetDetailContext.Provider value={{ openBet }}>
      {children}
      <BetDetailDialog
        bet={bet}
        author={author}
        open={open}
        onOpenChange={setOpen}
        onAuthorResolved={setAuthor}
      />
    </BetDetailContext.Provider>
  );
}

function BetDetailDialog({
  bet,
  author,
  open,
  onOpenChange,
  onAuthorResolved,
}: {
  bet: Bet | null;
  author: AppUser | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAuthorResolved: (u: AppUser | null) => void;
}) {
  const { appUser, isAdmin } = useAuth();

  // Si no nos pasaron el autor (o es de otra apuesta), lo resolvemos por uid.
  useEffect(() => {
    if (!open || !bet) return;
    if (author && author.uid === bet.userId) return;
    let cancelled = false;
    getUser(bet.userId).then((u) => {
      if (!cancelled) onAuthorResolved(u);
    });
    return () => {
      cancelled = true;
    };
  }, [open, bet, author, onAuthorResolved]);

  if (!bet) return null;

  const isOwner = !!appUser && bet.userId === appUser.uid;
  const authorName = author?.username ?? "Usuario";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2 text-base">
            Detalle de apuesta
            <BetStatusBadge status={bet.status} />
          </DialogTitle>
          <DialogDescription className="sr-only">
            Vista ampliada de la apuesta de {authorName}
          </DialogDescription>
        </DialogHeader>

        {/* Autor */}
        <div className="flex items-center gap-3 rounded-md border p-3">
          <Avatar className="h-9 w-9">
            {author?.avatarUrl && <AvatarImage src={author.avatarUrl} />}
            <AvatarFallback>{initials(authorName)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="font-semibold">
              {authorName}
              {isOwner && (
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  (tú)
                </span>
              )}
            </p>
            <p className="text-xs text-muted-foreground">
              {formatDateTime(bet.createdAt.toDate())}
              {bet.settledAt && (
                <> · Liquidada {formatDateTime(bet.settledAt.toDate())}</>
              )}
            </p>
          </div>
        </div>

        {/* Apuesta */}
        <div className="space-y-3">
          <div>
            <p className="text-base font-semibold">{bet.matchLabel}</p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] uppercase tracking-wider">
                {marketLabel(bet.market)}
              </span>
              {bet.marketDetail && (
                <span className="text-xs text-muted-foreground">
                  {bet.marketDetail}
                </span>
              )}
              {bet.isCombo && (
                <span className="rounded-full border px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
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
          </div>

          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground">
              Selección
            </p>
            <p className="text-base font-medium">{bet.selection}</p>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Fact label="Cuota" value={bet.odds.toFixed(2)} />
            <Fact label="Stake" value={formatCurrency(bet.stake)} />
            <Fact label="Retorno" value={formatCurrency(bet.potentialReturn)} />
            <div>
              <p className="text-xs uppercase tracking-wider text-muted-foreground">
                Casa
              </p>
              <p className="mt-1">
                <BookmakerPill
                  bookmaker={bet.bookmaker}
                  customLabel={bet.bookmakerLabel}
                />
              </p>
            </div>
          </div>

          {bet.teams && bet.teams.length > 0 && (
            <div>
              <p className="text-xs uppercase tracking-wider text-muted-foreground">
                Vinculada a equipos
              </p>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {bet.teams.map((t) => (
                  <span
                    key={t}
                    className="inline-flex items-center gap-1 rounded-full border bg-card px-2.5 py-0.5 text-xs"
                  >
                    <TeamFlag name={t} />
                    {t}
                  </span>
                ))}
              </div>
            </div>
          )}

          {bet.status !== "pending" && (
            <div className="border-t pt-3">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">
                Beneficio
              </p>
              <p
                className={cn(
                  "font-mono text-2xl font-bold",
                  profitClass(bet.profit)
                )}
              >
                {bet.profit > 0 ? "+" : ""}
                {formatCurrency(bet.profit)}
              </p>
            </div>
          )}

          {bet.notes && (
            <div className="border-t pt-3">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">
                Notas
              </p>
              <p className="whitespace-pre-wrap text-sm">{bet.notes}</p>
            </div>
          )}
        </div>

        {/* Historial — solo admins */}
        {isAdmin && (
          <div className="border-t pt-3">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">
              Historial (admin)
            </p>
            <div className="mt-1 overflow-hidden rounded-md border">
              <BetHistory bet={bet} />
            </div>
          </div>
        )}

        {/* Acciones */}
        <div className="flex flex-wrap items-center justify-end gap-2 border-t pt-3">
          <Button asChild variant="ghost" size="sm" className="gap-1.5">
            <Link
              href={`${ROUTES.bets}/${bet.id}`}
              onClick={() => onOpenChange(false)}
            >
              <ExternalLink className="h-4 w-4" />
              Ver ficha completa
            </Link>
          </Button>
          {isOwner && (
            <Button asChild size="sm" className="gap-1.5">
              <Link
                href={`${ROUTES.bets}/${bet.id}?edit=1`}
                onClick={() => onOpenChange(false)}
              >
                <Pencil className="h-4 w-4" />
                Editar
              </Link>
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className="font-mono text-base font-semibold">{value}</p>
    </div>
  );
}
