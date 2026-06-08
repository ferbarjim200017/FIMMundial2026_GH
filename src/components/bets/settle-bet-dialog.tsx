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
import { calcProfit } from "@/features/bets/bets.utils";
import { formatCurrency, profitClass } from "@/lib/utils";
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
  const alreadySettled = bet.status !== "pending";
  // Si la apuesta ya estaba liquidada (corrección), arrancamos con su estado
  // actual seleccionado para que sea obvio que se está editando.
  const initialChoice: Choice =
    bet.status === "won" ||
    bet.status === "lost" ||
    bet.status === "void" ||
    bet.status === "cashout"
      ? bet.status
      : "won";
  const [choice, setChoice] = useState<Choice>(initialChoice);
  // El usuario introduce el IMPORTE recibido al cerrar la apuesta. El
  // beneficio se calcula automáticamente. En una freebet el importe
  // recibido ES el beneficio (no hay stake que recuperar porque no era
  // tuyo); en una apuesta normal es importe − stake.
  // Si ya estaba en cashout, pre-rellenamos con el importe que produce el
  // profit actual (inversa de la fórmula) para que el admin lo vea.
  const initialCashoutAmount = (() => {
    if (bet.status !== "cashout") {
      return bet.isFreebet ? "0" : bet.stake.toFixed(2);
    }
    const profit = bet.profit ?? 0;
    const amount = bet.isFreebet ? profit : profit + bet.stake;
    return Math.max(0, amount).toFixed(2);
  })();
  const [cashoutAmount, setCashoutAmount] = useState<string>(initialCashoutAmount);
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

  async function handleConfirm() {
    if (choice === "cashout" && !Number.isFinite(cashoutAmountNum)) {
      setError("Introduce un importe de cashout válido");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await settleBet(
        bet.id,
        choice,
        choice === "cashout" ? cashoutProfit : undefined
      );
      onOpenChange(false);
      onSettled?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al liquidar");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {alreadySettled ? "Cambiar estado de la apuesta" : "Liquidar apuesta"}
          </DialogTitle>
          <DialogDescription>
            {bet.matchLabel} · {bet.selection} @ {bet.odds.toFixed(2)} ·{" "}
            {formatCurrency(bet.stake)}
            {alreadySettled && (
              <>
                <br />
                <span className="text-xs text-amber-600 dark:text-amber-400">
                  La apuesta ya está liquidada. Si cambias el estado, el
                  beneficio y el saldo se recalculan con la diferencia.
                </span>
              </>
            )}
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
            {submitting
              ? "Guardando…"
              : alreadySettled
              ? "Aplicar cambio"
              : "Confirmar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
