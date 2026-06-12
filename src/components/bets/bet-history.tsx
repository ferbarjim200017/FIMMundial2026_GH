"use client";

import { formatDateTime } from "@/lib/utils";
import type {
  Bet,
  BetHistoryAction,
  BetHistoryEntry,
  BetStatus,
} from "@/types/domain";

const ACTION_LABEL: Record<BetHistoryAction, string> = {
  created: "Creada",
  edited: "Editada",
  settled: "Liquidada",
  unsettled: "Reabierta",
};

const STATUS_LABEL: Record<BetStatus, string> = {
  pending: "Pendiente",
  won: "Ganada",
  lost: "Perdida",
  void: "Nula",
  cashout: "Cashout",
};

/**
 * Lista del historial de cambios de una apuesta (uso interno admin). Si la
 * apuesta no tiene historial explícito (apuestas antiguas), lo deriva de
 * `createdAt` y `settledAt` para que igualmente muestre algo útil.
 */
export function BetHistory({ bet }: { bet: Bet }) {
  const entries: BetHistoryEntry[] =
    bet.history && bet.history.length > 0
      ? bet.history
      : [
          ...(bet.createdAt
            ? [{ at: bet.createdAt, action: "created" as const }]
            : []),
          ...(bet.settledAt
            ? [
                {
                  at: bet.settledAt,
                  action: "settled" as const,
                  status: bet.status,
                },
              ]
            : []),
        ];

  if (entries.length === 0) {
    return (
      <p className="px-4 py-3 text-sm text-muted-foreground">
        Sin movimientos registrados.
      </p>
    );
  }

  const sorted = [...entries].sort((a, b) => b.at.toMillis() - a.at.toMillis());

  return (
    <ul className="divide-y text-sm">
      {sorted.map((h, i) => (
        <li
          key={i}
          className="flex items-center justify-between gap-3 px-4 py-2"
        >
          <span className="font-medium">
            {ACTION_LABEL[h.action] ?? h.action}
            {h.status && (
              <span className="ml-1.5 text-muted-foreground">
                · {STATUS_LABEL[h.status] ?? h.status}
              </span>
            )}
          </span>
          <span className="shrink-0 font-mono text-xs text-muted-foreground">
            {formatDateTime(h.at.toDate())}
          </span>
        </li>
      ))}
    </ul>
  );
}
