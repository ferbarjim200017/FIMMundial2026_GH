"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckCircle2, MoreHorizontal, Pencil, Receipt, Trash2 } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { useBetDetail } from "@/components/bets/bet-detail-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { BetStatusBadge } from "@/components/bets/bet-status-badge";
import { BetMatchFlags } from "@/components/bets/bet-match-flags";
import { BookmakerPill } from "@/components/bets/bookmaker-pill";
import { SettleBetDialog } from "@/components/bets/settle-bet-dialog";
import { BulkEditDialog } from "@/components/bets/bulk-edit-dialog";
import { deleteBet, unsettleBet } from "@/features/bets/bets.service";
import { queueSettle } from "@/features/bets/pending-settles";
import { betDisplayLabel } from "@/features/bets/bets.utils";
import { MARKET_OPTIONS } from "@/features/bets/bets.schema";
import { formatCurrency, formatDateTime, profitClass } from "@/lib/utils";
import type { Bet, Match } from "@/types/domain";

interface Props {
  bets: Bet[];
  ownerUid: string;
  isAdmin?: boolean;
  /** Apuestas cuya liquidación está guardada en local sin subir (badge). */
  pendingIds?: Set<string>;
  /** Quita un borrador local (apuesta aún sin subir) de la cola. Recibe el
   *  localId (el id de la fila es "local:<localId>"). */
  onRemoveDraft?: (localId: string) => void;
  /** Partidos (con etiquetas ya resueltas) por id, para mostrar el equipo de
   *  verdad en la columna "Partido" aunque la apuesta se guardara con un hueco
   *  de eliminatoria. */
  matchById?: Map<string, Match>;
}

function marketLabel(value: string): string {
  return MARKET_OPTIONS.find((m) => m.value === value)?.label ?? value;
}

/** Una fila es un borrador local (aún no subido) si su id empieza por "local:". */
const isDraft = (b: Bet) => b.id.startsWith("local:");

export function BetsTable({
  bets,
  ownerUid,
  isAdmin,
  pendingIds,
  onRemoveDraft,
  matchById,
}: Props) {
  const { openBet } = useBetDetail();
  const [settling, setSettling] = useState<Bet | null>(null);
  // Selección múltiple para liquidar o editar en bloque.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // Diálogo de edición en bloque de las apuestas seleccionadas.
  const [bulkEditOpen, setBulkEditOpen] = useState(false);

  function canManage(bet: Bet): boolean {
    return isAdmin || bet.userId === ownerUid;
  }

  // Se pueden seleccionar todas las que el usuario puede gestionar (cualquier
  // estado): la edición en bloque vale para pendientes y liquidadas. La
  // liquidación en bloque solo aplica al subconjunto pendiente.
  const selectableIds = bets
    .filter((b) => canManage(b) && !isDraft(b))
    .map((b) => b.id);
  const allSelected =
    selectableIds.length > 0 && selectableIds.every((id) => selected.has(id));

  // Apuestas seleccionadas presentes en la vista + subconjunto pendiente (el
  // único que se puede liquidar en bloque).
  const selectedBets = bets.filter((b) => selected.has(b.id));
  const pendingSelectedIds = selectedBets
    .filter((b) => b.status === "pending")
    .map((b) => b.id);

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected((prev) =>
      selectableIds.every((id) => prev.has(id))
        ? new Set()
        : new Set(selectableIds)
    );
  }

  function handleBulk(status: "won" | "lost" | "void") {
    // Solo las pendientes: liquidar una ya liquidada no tiene sentido.
    const ids = pendingSelectedIds;
    if (ids.length === 0) return;
    const label = { won: "ganadas", lost: "perdidas", void: "nulas" }[status];
    if (
      !confirm(
        `¿Marcar ${ids.length} apuesta(s) como ${label}? Se añaden a la cola y se suben en lote desde "Subir".`
      )
    )
      return;
    // Acumula en LOCAL (no sube al momento); el botón "Subir" las manda todas
    // en una sola escritura.
    for (const id of ids) {
      const b = bets.find((x) => x.id === id);
      queueSettle({
        betId: id,
        status,
        label: b ? `${b.matchLabel} · ${b.selection}` : id,
        queuedAt: Date.now(),
      });
    }
    setSelected(new Set());
  }

  async function handleDelete(bet: Bet) {
    if (!confirm(`¿Eliminar la apuesta "${bet.matchLabel} - ${bet.selection}"?`)) return;
    try {
      await deleteBet(bet.id);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Error al eliminar");
    }
  }

  /** Click en el botón "Liquidar":
   *  - Si la apuesta está pending → abre el diálogo de elegir estado.
   *  - Si ya está liquidada → confirm para volver a pendiente (el beneficio
   *    se anula y el saldo se ajusta). Tras esto el usuario puede volver
   *    a darle a "Liquidar" para elegir el estado correcto. */
  async function handleSettleClick(bet: Bet) {
    if (bet.status === "pending") {
      setSettling(bet);
      return;
    }
    const ok = confirm(
      `Volver a pendiente la apuesta "${bet.matchLabel}"?\n\n` +
        "Se anulará el beneficio actual y se restará del saldo del usuario. " +
        "Después podrás liquidarla de nuevo con el estado correcto."
    );
    if (!ok) return;
    try {
      await unsettleBet(bet.id);
    } catch (err) {
      alert(
        err instanceof Error
          ? `No se pudo cambiar: ${err.message}`
          : "No se pudo volver a pendiente"
      );
    }
  }

  if (bets.length === 0) {
    return (
      <EmptyState
        icon={Receipt}
        title="No hay apuestas todavía"
        subtitle="Cuando se registre alguna que cuadre con los filtros, aparecerá aquí."
      />
    );
  }

  return (
    <>
      {/* Barra de acciones en bloque (aparece al seleccionar) */}
      {selected.size > 0 && (
        <div className="sticky top-16 z-20 mb-3 flex flex-wrap items-center gap-2 rounded-lg border bg-card p-2 shadow-sm">
          <span className="text-sm font-medium">
            {selected.size} seleccionada{selected.size > 1 ? "s" : ""}
          </span>
          <div className="ml-auto flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setBulkEditOpen(true)}
              className="gap-1.5"
            >
              <Pencil className="h-4 w-4" />
              Editar
            </Button>
            {pendingSelectedIds.length > 0 && (
              <>
                <Button
                  size="sm"
                  onClick={() => handleBulk("won")}
                  className="bg-emerald-600 text-white hover:bg-emerald-700"
                >
                  Ganadas
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => handleBulk("lost")}
                >
                  Perdidas
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleBulk("void")}
                >
                  Nulas
                </Button>
              </>
            )}
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setSelected(new Set())}
            >
              Cancelar
            </Button>
          </div>
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/30 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="w-8 px-3 py-2">
                {selectableIds.length > 0 && (
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleAll}
                    aria-label="Seleccionar todas"
                    className="cursor-pointer"
                  />
                )}
              </th>
              <th className="px-3 py-2">Fecha</th>
              <th className="px-3 py-2">Partido</th>
              <th className="px-3 py-2">Mercado / Selección</th>
              <th className="px-3 py-2">Casa</th>
              <th className="px-3 py-2 text-right">Cuota</th>
              <th className="px-3 py-2 text-right">Stake</th>
              <th className="px-3 py-2 text-right">Beneficio</th>
              <th className="px-3 py-2">Estado</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {bets.map((b) => (
              <tr
                key={b.id}
                className={`cursor-pointer border-b last:border-0 hover:bg-accent/30 ${
                  selected.has(b.id) ? "bg-primary/10" : ""
                }`}
                onClick={() => {
                  // Los borradores locales aún no existen en Firestore: no abren
                  // detalle (sus enlaces de ficha/edición no resolverían).
                  if (isDraft(b)) return;
                  // En modo selección (ya hay algo marcado) un clic en cualquier
                  // parte de la fila la marca/desmarca, si es seleccionable. Si no
                  // hay nada marcado, se comporta como antes: abre el detalle.
                  if (selected.size > 0 && canManage(b) && !isDraft(b)) {
                    toggleOne(b.id);
                  } else {
                    openBet(b);
                  }
                }}
              >
                <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                  {canManage(b) && !isDraft(b) && (
                    <input
                      type="checkbox"
                      checked={selected.has(b.id)}
                      onChange={() => toggleOne(b.id)}
                      aria-label="Seleccionar apuesta"
                      className="cursor-pointer"
                    />
                  )}
                </td>
                <td className="px-3 py-2 text-xs text-muted-foreground">
                  {formatDateTime(b.createdAt.toDate())}
                </td>
                <td className="px-3 py-2 font-medium">
                  <span className="flex items-center gap-1.5">
                    {matchById && <BetMatchFlags bet={b} matchById={matchById} />}
                    <span>
                      {matchById ? betDisplayLabel(b, matchById) : b.matchLabel}
                    </span>
                  </span>
                </td>
                <td className="px-3 py-2">
                  <div className="text-xs text-muted-foreground">
                    {marketLabel(b.market)}
                    {b.marketDetail && ` · ${b.marketDetail}`}
                  </div>
                  <div>{b.selection}</div>
                </td>
                <td className="px-3 py-2 text-xs">
                  <BookmakerPill
                    bookmaker={b.bookmaker}
                    customLabel={b.bookmakerLabel}
                  />
                </td>
                <td className="px-3 py-2 text-right font-mono">{b.odds.toFixed(2)}</td>
                <td className="px-3 py-2 text-right font-mono">
                  <div className="flex items-center justify-end gap-1.5">
                    {b.isFreebet && (
                      <span
                        className="rounded-[3px] bg-purple-600 px-1 py-0 text-[9px] font-semibold uppercase tracking-wide text-white"
                        title="Freebet: el stake no era dinero del usuario"
                      >
                        FB
                      </span>
                    )}
                    <span>{formatCurrency(b.stake)}</span>
                  </div>
                </td>
                <td className={`px-3 py-2 text-right font-mono ${profitClass(b.profit)}`}>
                  {b.status === "pending"
                    ? "—"
                    : `${b.profit >= 0 ? "+" : ""}${formatCurrency(b.profit)}`}
                </td>
                <td className="px-3 py-2">
                  <div className="flex flex-col items-start gap-1">
                    <BetStatusBadge status={b.status} />
                    {pendingIds?.has(b.id) && (
                      <span
                        className="rounded bg-amber-500/20 px-1 py-0 text-[9px] font-bold uppercase tracking-wide text-amber-700 dark:text-amber-400"
                        title="Guardada en este dispositivo, pendiente de subir"
                      >
                        ⏳ sin subir
                      </span>
                    )}
                  </div>
                </td>
                <td
                  className="px-3 py-2 text-right"
                  onClick={(e) => e.stopPropagation()}
                >
                  {isDraft(b) ? (
                    onRemoveDraft && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => onRemoveDraft(b.id.slice("local:".length))}
                        title="Quitar borrador (no subido)"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )
                  ) : canManage(b) ? (
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleSettleClick(b)}
                        title={
                          b.status === "pending"
                            ? "Liquidar"
                            : "Volver a pendiente para corregir"
                        }
                      >
                        <CheckCircle2 className="h-4 w-4" />
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button size="icon" variant="ghost" aria-label="Acciones">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem asChild>
                            <Link href={`/bets/${b.id}`}>
                              <Pencil className="h-4 w-4" /> Abrir / editar
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => handleSettleClick(b)}>
                            <CheckCircle2 className="h-4 w-4" />{" "}
                            {b.status === "pending"
                              ? "Liquidar"
                              : "Volver a pendiente"}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onSelect={() => handleDelete(b)}
                            className="text-destructive focus:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" /> Eliminar
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {settling && (
        <SettleBetDialog
          bet={settling}
          open={!!settling}
          onOpenChange={(o) => !o && setSettling(null)}
        />
      )}

      {bulkEditOpen && selectedBets.length > 0 && (
        <BulkEditDialog
          bets={selectedBets}
          open={bulkEditOpen}
          onOpenChange={setBulkEditOpen}
          onDone={() => setSelected(new Set())}
        />
      )}
    </>
  );
}
