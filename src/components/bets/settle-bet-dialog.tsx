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
  const [choice, setChoice] = useState<Choice>("won");
  const [cashoutProfit, setCashoutProfit] = useState<string>("0");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const previewProfit = calcProfit(
    bet.stake,
    bet.odds,
    choice,
    choice === "cashout" ? Number(cashoutProfit) : undefined
  );

  async function handleConfirm() {
    setSubmitting(true);
    setError(null);
    try {
      await settleBet(
        bet.id,
        choice,
        choice === "cashout" ? Number(cashoutProfit) : undefined
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
              <Label htmlFor="cashout">Beneficio del cashout (€)</Label>
              <Input
                id="cashout"
                type="number"
                step="0.01"
                value={cashoutProfit}
                onChange={(e) => setCashoutProfit(e.target.value)}
                placeholder="Ej: 5.50 (positivo) o -3 (negativo)"
              />
              <p className="text-xs text-muted-foreground">
                Introduce el beneficio neto recibido (puede ser negativo).
              </p>
            </div>
          )}

          <div className="rounded-md border bg-muted/30 p-3 text-sm">
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
