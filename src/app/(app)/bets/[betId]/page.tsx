"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  CheckCircle2,
  Copy,
  Pencil,
  X,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { BetForm } from "@/components/bets/bet-form";
import { BetHistory } from "@/components/bets/bet-history";
import { BetStatusBadge } from "@/components/bets/bet-status-badge";
import { BookmakerPill } from "@/components/bets/bookmaker-pill";
import { SettleBetDialog } from "@/components/bets/settle-bet-dialog";
import { BackButton } from "@/components/layout/back-button";
import { TeamFlag } from "@/components/matches/team-flag";
import { useAuth } from "@/features/auth/auth.context";
import { useGroup } from "@/features/groups/groups.context";
import { getBet, unsettleBet } from "@/features/bets/bets.service";
import { betInGroup, getBetGroupIds } from "@/features/bets/bets.utils";
import { MARKET_OPTIONS } from "@/features/bets/bets.schema";
import { getUser } from "@/features/users/users.service";
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

export default function BetDetailPage() {
  const params = useParams<{ betId: string }>();
  const router = useRouter();
  const { appUser, isAdmin } = useAuth();
  const { activeGroup, memberUids, allGroups } = useGroup();
  const [bet, setBet] = useState<Bet | null>(null);
  const [author, setAuthor] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [settleOpen, setSettleOpen] = useState(false);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (!params.betId) return;
    let cancelled = false;
    setLoading(true);
    getBet(params.betId)
      .then(async (b) => {
        if (cancelled) return;
        setBet(b);
        if (b) {
          // Si falla la lectura del autor no bloqueamos la ficha: queda null.
          const a = await getUser(b.userId).catch(() => null);
          if (!cancelled) setAuthor(a);
        }
      })
      .catch((err) => console.error("[bet detail] getBet", err))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [params.betId]);

  // Deep-link `?edit=1` (p.ej. desde el botón Editar del pop-up de detalle):
  // entra directo en modo edición si el usuario puede gestionar la apuesta.
  useEffect(() => {
    if (!bet || !appUser) return;
    if (typeof window === "undefined") return;
    const wantsEdit =
      new URLSearchParams(window.location.search).get("edit") === "1";
    if (wantsEdit && (bet.userId === appUser.uid || isAdmin)) {
      setEditing(true);
    }
  }, [bet, appUser, isAdmin]);

  if (loading) {
    return <p className="text-sm text-muted-foreground">Cargando…</p>;
  }
  if (!bet || !appUser) {
    return (
      <div className="rounded-lg border border-dashed p-12 text-center text-sm text-muted-foreground">
        Apuesta no encontrada.
      </div>
    );
  }

  const isOwner = bet.userId === appUser.uid;
  const canManage = isOwner || isAdmin;
  const authorName = author?.username ?? "Usuario";

  // Bloqueo cross-group por (a) tag de la apuesta y (b) membresía del autor.
  // Una apuesta etiquetada con otro grupo NO se muestra ni a su propio autor
  // — la idea es que dentro de cada grupo solo "existen" las apuestas hechas
  // en ese contexto.
  const wrongGroup = !!activeGroup && !betInGroup(bet, activeGroup.id);
  const authorNotInGroup =
    !!activeGroup && memberUids.size > 0 && !memberUids.has(bet.userId);
  if (wrongGroup || (authorNotInGroup && !isOwner)) {
    return (
      <div className="rounded-lg border border-dashed p-12 text-center text-sm text-muted-foreground">
        Esta apuesta no pertenece a tu grupo activo{" "}
        <strong>{activeGroup?.name}</strong>. Cambia de grupo desde el icono
        de la barra superior si quieres verla.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <BackButton fallbackHref={ROUTES.bets} />
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">
              Detalle de apuesta
            </h1>
            <BetStatusBadge status={bet.status} />
          </div>
          <p className="text-sm text-muted-foreground">
            {isOwner ? "Tu apuesta." : "Apuesta del grupo."} Pulsa{" "}
            <span className="font-medium">Copiar</span> para registrarla a tu
            nombre y editarla antes de guardar.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant="outline" className="gap-1.5">
            <Link href={`${ROUTES.bets}/new?from=${bet.id}`}>
              <Copy className="h-4 w-4" />
              Copiar
            </Link>
          </Button>
          {canManage && (
            <Button
              variant="outline"
              onClick={async () => {
                if (bet.status === "pending") {
                  setSettleOpen(true);
                  return;
                }
                const ok = window.confirm(
                  `Volver a pendiente la apuesta "${bet.matchLabel}"?\n\n` +
                    "Se anulará el beneficio actual y se restará del saldo del usuario. " +
                    "Después podrás liquidarla de nuevo con el estado correcto."
                );
                if (!ok) return;
                try {
                  await unsettleBet(bet.id);
                  router.refresh();
                } catch (err) {
                  window.alert(
                    err instanceof Error
                      ? `No se pudo cambiar: ${err.message}`
                      : "No se pudo volver a pendiente"
                  );
                }
              }}
              className="gap-1.5"
              title={
                bet.status === "pending"
                  ? "Liquidar"
                  : "Volver a pendiente para corregir"
              }
            >
              <CheckCircle2 className="h-4 w-4" />
              {bet.status === "pending" ? "Liquidar" : "Volver a pendiente"}
            </Button>
          )}
          {canManage && (
            <Button
              variant={editing ? "default" : "outline"}
              onClick={() => setEditing((v) => !v)}
              className="gap-1.5"
            >
              {editing ? (
                <>
                  <X className="h-4 w-4" />
                  Cancelar
                </>
              ) : (
                <>
                  <Pencil className="h-4 w-4" />
                  Editar
                </>
              )}
            </Button>
          )}
        </div>
      </div>

      {/* ─── Cabecera con autor ─── */}
      <Card>
        <CardContent className="flex items-center gap-3 p-4">
          <Link href={ROUTES.profile(bet.userId)}>
            <Avatar className="h-10 w-10">
              {author?.avatarUrl && (
                <AvatarImage src={author.avatarUrl} alt={authorName} />
              )}
              <AvatarFallback>{initials(authorName)}</AvatarFallback>
            </Avatar>
          </Link>
          <div className="min-w-0 flex-1">
            <Link
              href={ROUTES.profile(bet.userId)}
              className="font-semibold hover:underline"
            >
              {authorName}
              {isOwner && (
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  (tú)
                </span>
              )}
            </Link>
            <p className="text-xs text-muted-foreground">
              Registrada el {formatDateTime(bet.createdAt.toDate())}
              {bet.settledAt && (
                <>
                  {" "}
                  · Liquidada el {formatDateTime(bet.settledAt.toDate())}
                </>
              )}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* ─── Detalle de la apuesta ─── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{bet.matchLabel}</CardTitle>
          <CardDescription className="flex flex-wrap items-center gap-2 pt-1">
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
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground">
              Selección
            </p>
            <p className="text-base font-medium">{bet.selection}</p>
          </div>

          <div className="grid gap-3 sm:grid-cols-4">
            <Fact label="Cuota" value={bet.odds.toFixed(2)} mono />
            <Fact
              label="Stake"
              value={formatCurrency(bet.stake)}
              mono
              hint={
                bet.isFreebet ? "Freebet — no era dinero del usuario" : undefined
              }
            />
            <Fact
              label="Retorno potencial"
              value={formatCurrency(bet.potentialReturn)}
              mono
            />
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

          {(() => {
            const betGroupIds = getBetGroupIds(bet);
            if (betGroupIds.length <= 1) return null;
            return (
              <div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground">
                  Compartida en {betGroupIds.length} grupos
                </p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {betGroupIds.map((gid) => {
                    const g = allGroups.find((x) => x.id === gid);
                    return (
                      <span
                        key={gid}
                        className="rounded-full border bg-card px-2.5 py-0.5 text-xs font-medium"
                      >
                        {g?.name ?? gid}
                      </span>
                    );
                  })}
                </div>
              </div>
            );
          })()}

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
        </CardContent>
      </Card>

      {/* ─── Historial (solo admin) ─── */}
      {isAdmin && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Historial</CardTitle>
            <CardDescription>
              Registro de cambios de esta apuesta (visible solo para admins).
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0 pb-2">
            <BetHistory bet={bet} />
          </CardContent>
        </Card>
      )}

      {/* ─── Modo edición (toggle) ─── */}
      {canManage && editing && (
        <Card className="border-primary/40">
          <CardHeader>
            <CardTitle className="text-base">Editar apuesta</CardTitle>
            <CardDescription>
              {bet.status === "pending"
                ? "Cambia los campos que necesites y guarda."
                : "Esta apuesta ya está liquidada. Los cambios solo afectan al registro, no recalculan el balance."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <BetForm
              userId={bet.userId}
              initial={bet}
              onDone={() => {
                setEditing(false);
                router.refresh();
              }}
            />
          </CardContent>
        </Card>
      )}

      <SettleBetDialog
        bet={bet}
        open={settleOpen}
        onOpenChange={setSettleOpen}
        onSettled={() => router.refresh()}
      />
    </div>
  );
}

function Fact({
  label,
  value,
  hint,
  mono,
}: {
  label: string;
  value: string;
  hint?: string;
  mono?: boolean;
}) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className={cn("text-base font-semibold", mono && "font-mono")}>
        {value}
      </p>
      {hint && <p className="text-[10px] text-muted-foreground">{hint}</p>}
    </div>
  );
}
