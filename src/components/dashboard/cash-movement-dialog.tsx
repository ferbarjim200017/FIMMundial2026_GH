"use client";

import { useMemo, useState, type FormEvent } from "react";
import { Timestamp } from "firebase/firestore";
import { ArrowDownToLine, ArrowUpFromLine, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  addCashMovement,
  setCashMovements,
} from "@/features/users/users.service";
import { bookmakerLabel, computeCashSummary } from "@/features/bets/bets.utils";
import { BOOKMAKER_OPTIONS } from "@/features/bets/bets.schema";
import {
  cn,
  formatCurrency,
  formatDateTime,
  profitClass,
  TimeoutError,
  withTimeout,
} from "@/lib/utils";
import type { AppUser, Bookmaker, CashMovement, CashMovementType } from "@/types/domain";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: AppUser;
  groupId: string;
}

function toLocalInput(d: Date): string {
  const tz = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tz).toISOString().slice(0, 16);
}

export function CashMovementDialog({ open, onOpenChange, user, groupId }: Props) {
  const [type, setType] = useState<CashMovementType>("deposit");
  const [bookmaker, setBookmaker] = useState<Bookmaker>("bet365");
  const [amount, setAmount] = useState("");
  const [placedAt, setPlacedAt] = useState(() => toLocalInput(new Date()));
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const movements = useMemo(
    () =>
      (user.cashMovements ?? [])
        .filter((m) => m.groupId === groupId)
        .sort((a, b) => b.at.toMillis() - a.at.toMillis()),
    [user.cashMovements, groupId]
  );

  const summary = useMemo(
    () => computeCashSummary(user, groupId),
    [user, groupId]
  );

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    const amt = Number(amount.replace(",", "."));
    if (!Number.isFinite(amt) || amt <= 0) {
      setError("Introduce un importe válido (> 0)");
      return;
    }
    setSubmitting(true);
    setError(null);
    const movement: CashMovement = {
      id: crypto.randomUUID(),
      groupId,
      bookmaker,
      type,
      amount: Math.round(amt * 100) / 100,
      at: Timestamp.fromDate(new Date(placedAt)),
      ...(note.trim() ? { note: note.trim() } : {}),
    };
    try {
      await withTimeout(addCashMovement(user.uid, movement), 9000);
      setAmount("");
      setNote("");
    } catch (err) {
      if (err instanceof TimeoutError) {
        setAmount("");
        setNote("");
      } else {
        setError(err instanceof Error ? err.message : "Error al guardar");
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm("¿Eliminar este movimiento?")) return;
    const next = (user.cashMovements ?? []).filter((m) => m.id !== id);
    try {
      await withTimeout(setCashMovements(user.uid, next), 9000);
    } catch (err) {
      if (!(err instanceof TimeoutError)) {
        window.alert(
          err instanceof Error ? err.message : "No se pudo eliminar"
        );
      }
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Ingresos y retiradas</DialogTitle>
          <DialogDescription>
            Dinero real que metes o sacas de tus casas. Ajusta tu saldo
            disponible; no cuenta como beneficio ni en el ROI.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSave} className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setType("deposit")}
              className={cn(
                "flex items-center justify-center gap-1.5 rounded-md border px-3 py-2 text-sm font-medium transition-colors",
                type === "deposit"
                  ? "border-profit bg-profit/15 text-profit"
                  : "opacity-70 hover:bg-accent"
              )}
            >
              <ArrowDownToLine className="h-4 w-4" /> Ingreso
            </button>
            <button
              type="button"
              onClick={() => setType("withdrawal")}
              className={cn(
                "flex items-center justify-center gap-1.5 rounded-md border px-3 py-2 text-sm font-medium transition-colors",
                type === "withdrawal"
                  ? "border-loss bg-loss/15 text-loss"
                  : "opacity-70 hover:bg-accent"
              )}
            >
              <ArrowUpFromLine className="h-4 w-4" /> Retirada
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Casa</Label>
              <Select
                value={bookmaker}
                onValueChange={(v) => setBookmaker(v as Bookmaker)}
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BOOKMAKER_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="cash-amount" className="text-xs">
                Importe (€)
              </Label>
              <Input
                id="cash-amount"
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0,00"
                autoFocus
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label htmlFor="cash-date" className="text-xs">
                Fecha
              </Label>
              <Input
                id="cash-date"
                type="datetime-local"
                value={placedAt}
                onChange={(e) => setPlacedAt(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="cash-note" className="text-xs">
                Nota (opcional)
              </Label>
              <Input
                id="cash-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={120}
                placeholder="p. ej. bizum de…"
              />
            </div>
          </div>

          {error && <p className="text-sm text-loss">{error}</p>}

          <Button type="submit" disabled={submitting} className="w-full">
            {submitting
              ? "Guardando…"
              : type === "deposit"
              ? "Registrar ingreso"
              : "Registrar retirada"}
          </Button>
        </form>

        {/* Totales */}
        <div className="grid grid-cols-3 gap-2 rounded-md border bg-muted/30 p-3 text-center text-sm">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Ingresado
            </p>
            <p className="font-mono font-bold text-profit">
              {formatCurrency(summary.deposits)}
            </p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Retirado
            </p>
            <p className="font-mono font-bold text-loss">
              {formatCurrency(summary.withdrawals)}
            </p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Neto
            </p>
            <p className={cn("font-mono font-bold", profitClass(summary.net))}>
              {summary.net > 0 ? "+" : ""}
              {formatCurrency(summary.net)}
            </p>
          </div>
        </div>

        {/* Historial */}
        <div className="max-h-56 space-y-1.5 overflow-y-auto">
          {movements.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              Aún no has registrado movimientos en este grupo.
            </p>
          ) : (
            movements.map((m) => {
              const isDeposit = m.type === "deposit";
              return (
                <div
                  key={m.id}
                  className="flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-sm"
                >
                  <span
                    className={cn(
                      "flex h-6 w-6 shrink-0 items-center justify-center rounded-full",
                      isDeposit
                        ? "bg-profit/15 text-profit"
                        : "bg-loss/15 text-loss"
                    )}
                  >
                    {isDeposit ? (
                      <ArrowDownToLine className="h-3.5 w-3.5" />
                    ) : (
                      <ArrowUpFromLine className="h-3.5 w-3.5" />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">
                      {bookmakerLabel(m.bookmaker)}
                      {m.note && (
                        <span className="font-normal text-muted-foreground">
                          {" "}
                          · {m.note}
                        </span>
                      )}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {formatDateTime(m.at.toDate())}
                    </p>
                  </div>
                  <span
                    className={cn(
                      "shrink-0 font-mono font-bold",
                      isDeposit ? "text-profit" : "text-loss"
                    )}
                  >
                    {isDeposit ? "+" : "−"}
                    {formatCurrency(m.amount)}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleDelete(m.id)}
                    aria-label="Eliminar"
                    className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:bg-loss/10 hover:text-loss"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              );
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
