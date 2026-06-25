"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { settleBet } from "@/features/bets/bets.service";
import { queueSettle } from "@/features/bets/pending-settles";
import { calcProfit } from "@/features/bets/bets.utils";
import { formatCurrency, profitClass, TimeoutError, withTimeout } from "@/lib/utils";
import type { Bet, BetStatus } from "@/types/domain";

interface Props {
  bet: Bet;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSettled?: () => void;
}

type Choice = Exclude<BetStatus, "pending">;

const CHOICES: { value: Choice; label: string; tone: string }[] = [
  { value: "won", label: "Ganada", tone: "bg-profit/15 text-profit hover:bg-profit/25" },
  { value: "lost", label: "Perdida", tone: "bg-loss/15 text-loss hover:bg-loss/25" },
  { value: "void", label: "Nula", tone: "bg-muted hover:bg-muted/70" },
  {
    value: "cashout",
    label: "Cashout",
    tone: "bg-primary/15 text-primary hover:bg-primary/25",
  },
];

export function SettleBetDialog({ bet, open, onOpenChange, onSettled }: Props) {
  const [choice, setChoice] = useState<Choice>("won");
  // El usuario introduce el IMPORTE recibido al cerrar la apuesta. El
  // beneficio se calcula automáticamente. En una freebet el importe
  // recibido ES el beneficio (no hay stake que recuperar porque no era
  // tuyo); en una apuesta normal es importe − stake.
  const [cashoutAmount, setCashoutAmount] = useState<string>(
    bet.isFreebet ? "0" : bet.stake.toFixed(2)
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cashoutAmountNum = Number(cashoutAmount.replace(",", "."));
  const cashoutProfit = Number.isFinite(cashoutAmountNum)
    ? bet.isFreebet
      ? cashoutAmountNum
      : cashoutAmountNum - bet.stake
    : 0;

  const previewProfit = calcProfit(
    bet.stake,
    bet.odds,
    choice,
    choice === "cashout" ? cashoutProfit : undefined,
    !!bet.isFreebet
  );

  /** Guarda la liquidación en LOCAL (cola "sin subir") y cierra. Se usa tanto
   *  cuando la subida falla/tarda como cuando el usuario lo pide a mano. */
  function queueOffline() {
    queueSettle({
      betId: bet.id,
      status: choice,
      cashoutProfit: choice === "cashout" ? cashoutProfit : undefined,
      label: `${bet.matchLabel} · ${bet.selection}`,
      queuedAt: Date.now(),
    });
    onOpenChange(false);
    onSettled?.();
  }

  /** Botón "Sin subir": el usuario sabe que la cuota está saturada y no quiere
   *  esperar; lo guardamos en local directamente, sin intentar subirlo. */
  function handleQueueOffline() {
    if (choice === "cashout" && !Number.isFinite(cashoutAmountNum)) {
      setError("Introduce un importe de cashout válido");
      return;
    }
    queueOffline();
  }

  async function handleConfirm() {
    if (choice === "cashout" && !Number.isFinite(cashoutAmountNum)) {
      setError("Introduce un importe de cashout válido");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await withTimeout(
        settleBet(
          bet.id,
          choice,
          choice === "cashout" ? cashoutProfit : undefined
        ),
        9000
      );
      onOpenChange(false);
      onSettled?.();
    } catch {
      // Tanto si tarda demasiado (TimeoutError) como si Firebase la rechaza
      // (quota), la guardamos en LOCAL para NO perderla: se marca "sin subir" y
      // se reintenta subir sola. Si la escritura sí llegó a aplicarse, el
      // reintento es idempotente (no duplica el beneficio).
      queueOffline();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Liquidar apuesta</DialogTitle>
          <DialogDescription>
            {bet.matchLabel} · {bet.selection} @ {bet.odds.toFixed(2)} ·{" "}
            {formatCurrency(bet.stake)}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            {CHOICES.map((c) => (
              <button
                key={c.value}
                type="button"
                onClick={() => setChoice(c.value)}
                className={`rounded-md border px-3 py-3 text-sm font-medium transition-colors ${
                  c.tone
                } ${choice === c.value ? "ring-2 ring-ring" : "opacity-70"}`}
              >
                {c.label}
              </button>
            ))}
          </div>

          {choice === "cashout" && (
            <div className="space-y-1.5">
              <Label htmlFor="cashout">
                {bet.isFreebet
                  ? "Beneficio del cashout (€)"
                  : "Importe del cashout (€)"}
              </Label>
              <Input
                id="cashout"
                type="number"
                step="0.01"
                min="0"
                value={cashoutAmount}
                onChange={(e) => setCashoutAmount(e.target.value)}
                placeholder={
                  bet.isFreebet
                    ? "Lo que te paga la casa (todo es beneficio)"
                    : `Stake original: ${formatCurrency(bet.stake)}`
                }
              />
              <p className="text-xs text-muted-foreground">
                {bet.isFreebet
                  ? "En una freebet no hay stake que recuperar: lo que te pague la casa al cerrar es directamente beneficio."
                  : "Indica por cuánto cerraste la apuesta. El beneficio se calcula automáticamente (importe − stake)."}
              </p>
            </div>
          )}

          <div className="space-y-1 rounded-md border bg-muted/30 p-3 text-sm">
            {choice === "cashout" && !bet.isFreebet && (
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{formatCurrency(cashoutAmountNum || 0)} − {formatCurrency(bet.stake)} (stake)</span>
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Beneficio resultante:</span>
              <span className={`font-mono font-bold ${profitClass(previewProfit)}`}>
                {previewProfit >= 0 ? "+" : ""}
                {formatCurrency(previewProfit)}
              </span>
            </div>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Cancelar
          </Button>
          <Button onClick={handleConfirm} disabled={submitting}>
            {submitting ? "Liquidando…" : "Confirmar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
