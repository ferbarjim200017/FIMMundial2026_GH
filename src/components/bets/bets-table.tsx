"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckCircle2, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { useBetDetail } from "@/components/bets/bet-detail-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { BetStatusBadge } from "@/components/bets/bet-status-badge";
import { BookmakerPill } from "@/components/bets/bookmaker-pill";
import { SettleBetDialog } from "@/components/bets/settle-bet-dialog";
import { deleteBet, settleManyBets, unsettleBet } from "@/features/bets/bets.service";
import { MARKET_OPTIONS } from "@/features/bets/bets.schema";
import { formatCurrency, formatDateTime, profitClass } from "@/lib/utils";
import type { Bet } from "@/types/domain";

interface Props {
  bets: Bet[];
  ownerUid: string;
  isAdmin?: boolean;
}

function marketLabel(value: string): string {
  return MARKET_OPTIONS.find((m) => m.value === value)?.label ?? value;
}

export function BetsTable({ bets, ownerUid, isAdmin }: Props) {
  const { openBet } = useBetDetail();
  const [settling, setSettling] = useState<Bet | null>(null);
  // Selección múltiple para liquidar en bloque.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

  function canManage(bet: Bet): boolean {
    return isAdmin || bet.userId === ownerUid;
  }

  // Solo se pueden seleccionar las que el usuario puede gestionar y están
  // pendientes (la liquidación en bloque es ganada/perdida/nula).
  const selectableIds = bets
    .filter((b) => canManage(b) && b.status === "pending")
    .map((b) => b.id);
  const allSelected =
    selectableIds.length > 0 && selectableIds.every((id) => selected.has(id));

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

  async function handleBulk(status: "won" | "lost" | "void") {
    const ids = [...selected];
    if (ids.length === 0) return;
    const label = { won: "ganadas", lost: "perdidas", void: "nulas" }[status];
    if (!confirm(`¿Marcar ${ids.length} apuesta(s) como ${label}?`)) return;
    setBulkBusy(true);
    try {
      await settleManyBets(ids, status);
      setSelected(new Set());
    } catch (err) {
      alert(err instanceof Error ? err.message : "Error al actualizar");
    } finally {
      setBulkBusy(false);
    }
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
      <div className="rounded-lg border border-dashed p-12 text-center text-sm text-muted-foreground">
        No hay apuestas registradas todavía.
      </div>
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
              onClick={() => handleBulk("won")}
              disabled={bulkBusy}
              className="bg-emerald-600 text-white hover:bg-emerald-700"
            >
              Ganadas
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => handleBulk("lost")}
              disabled={bulkBusy}
            >
              Perdidas
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleBulk("void")}
              disabled={bulkBusy}
            >
              Nulas
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setSelected(new Set())}
              disabled={bulkBusy}
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
                  selected.has(b.id) ? "bg-primary/5" : ""
                }`}
                onClick={() => openBet(b)}
              >
                <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                  {canManage(b) && b.status === "pending" && (
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
                <td className="px-3 py-2 font-medium">{b.matchLabel}</td>
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
                  <BetStatusBadge status={b.status} />
                </td>
                <td
                  className="px-3 py-2 text-right"
                  onClick={(e) => e.stopPropagation()}
                >
                  {canManage(b) && (
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
                  )}
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
    </>
  );
}
