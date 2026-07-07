"use client";

import { useState, type ReactNode } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  betFormSchema,
  BOOKMAKER_OPTIONS,
  MARKET_OPTIONS,
  type BetFormValues,
} from "@/features/bets/bets.schema";
import { queueEdit } from "@/features/bets/pending-edits";
import type { Bet } from "@/types/domain";

interface Props {
  /** Apuestas seleccionadas que se van a editar en bloque. */
  bets: Bet[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Se llama tras encolar los cambios (para limpiar la selección). */
  onDone?: () => void;
}

/** Campos que se pueden cambiar a la vez en varias apuestas. */
type Field = "bookmaker" | "market" | "odds" | "stake" | "isFreebet" | "notes" | "placedAt";

function toLocalDatetimeValue(d: Date): string {
  const tz = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tz).toISOString().slice(0, 16);
}

/** Convierte una apuesta ya guardada en los valores que espera el formulario,
 *  para poder reusar la misma validación y el mismo `queueEdit` que la edición
 *  individual. Solo cambiaremos los campos marcados; el resto se conserva. */
function betToFormValues(bet: Bet): BetFormValues {
  const groupIds =
    bet.groupIds && bet.groupIds.length > 0
      ? bet.groupIds
      : bet.groupId
      ? [bet.groupId]
      : [];
  const matchIds = bet.matchIds ?? (bet.matchId ? [bet.matchId] : []);
  return {
    bookmaker: bet.bookmaker,
    bookmakerLabel: bet.bookmakerLabel ?? "",
    matchIds,
    matchLabel: bet.matchLabel,
    market: bet.market,
    marketDetail: bet.marketDetail ?? "",
    selection: bet.selection,
    odds: bet.odds,
    stake: bet.stake,
    placedAt: toLocalDatetimeValue(bet.createdAt.toDate()),
    isFreebet: !!bet.isFreebet,
    notes: bet.notes ?? "",
    teams: bet.teams ?? [],
    groupIds,
  };
}

export function BulkEditDialog({ bets, open, onOpenChange, onDone }: Props) {
  // Qué campos se van a cambiar (solo se aplican los marcados).
  const [enabled, setEnabled] = useState<Record<Field, boolean>>({
    bookmaker: false,
    market: false,
    odds: false,
    stake: false,
    isFreebet: false,
    notes: false,
    placedAt: false,
  });

  // Valores nuevos por campo.
  const [bookmaker, setBookmaker] =
    useState<BetFormValues["bookmaker"]>("winamax");
  const [bookmakerLabel, setBookmakerLabel] = useState("");
  const [market, setMarket] = useState<BetFormValues["market"]>("winner");
  const [odds, setOdds] = useState("");
  const [stake, setStake] = useState("");
  const [isFreebet, setIsFreebet] = useState(false);
  const [notes, setNotes] = useState("");
  const [placedAt, setPlacedAt] = useState(() =>
    toLocalDatetimeValue(new Date())
  );
  const [error, setError] = useState<string | null>(null);

  function toggle(field: Field, value: boolean) {
    setEnabled((e) => ({ ...e, [field]: value }));
    setError(null);
  }

  const anyEnabled = Object.values(enabled).some(Boolean);

  function handleApply() {
    setError(null);
    if (!anyEnabled) {
      setError("Marca al menos un campo para cambiar.");
      return;
    }

    // Overrides comunes a todas las apuestas (solo los campos marcados).
    const overrides: Partial<BetFormValues> = {};
    if (enabled.bookmaker) {
      overrides.bookmaker = bookmaker;
      overrides.bookmakerLabel =
        bookmaker === "other" ? bookmakerLabel.trim() : "";
    }
    if (enabled.market) overrides.market = market;
    if (enabled.odds) overrides.odds = odds as unknown as number;
    if (enabled.stake) overrides.stake = stake as unknown as number;
    if (enabled.isFreebet) overrides.isFreebet = isFreebet;
    if (enabled.notes) overrides.notes = notes;
    if (enabled.placedAt) overrides.placedAt = placedAt;

    let queued = 0;
    const skipped: string[] = [];
    const now = Date.now();
    bets.forEach((bet, i) => {
      const parsed = betFormSchema.safeParse({
        ...betToFormValues(bet),
        ...overrides,
      });
      if (!parsed.success) {
        skipped.push(parsed.error.issues[0]?.message ?? "datos inválidos");
        return;
      }
      // Mismo camino que la edición individual: se guarda en la cola local
      // ("sin subir") y se sube en lote desde la lista con el botón "Subir".
      queueEdit({
        betId: bet.id,
        input: { ...parsed.data, betId: bet.id },
        label: `${bet.matchLabel} · ${bet.selection}`,
        queuedAt: now + (bets.length - i),
      });
      queued += 1;
    });

    if (queued === 0) {
      setError(
        skipped[0]
          ? `No se pudo aplicar: ${skipped[0]}`
          : "No se pudo aplicar el cambio."
      );
      return;
    }

    onOpenChange(false);
    onDone?.();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar {bets.length} apuestas a la vez</DialogTitle>
          <DialogDescription>
            Marca los campos que quieras cambiar. Solo se modifican esos; el
            resto de cada apuesta se mantiene igual.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {/* Casa de apuestas */}
          <FieldRow
            label="Casa de apuestas"
            checked={enabled.bookmaker}
            onCheckedChange={(v) => toggle("bookmaker", v)}
          >
            <div className="space-y-2">
              <Select
                value={bookmaker}
                onValueChange={(v) =>
                  setBookmaker(v as BetFormValues["bookmaker"])
                }
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
              {bookmaker === "other" && (
                <Input
                  placeholder="Nombre de la casa"
                  value={bookmakerLabel}
                  onChange={(e) => setBookmakerLabel(e.target.value)}
                  className="h-9"
                />
              )}
            </div>
          </FieldRow>

          {/* Mercado */}
          <FieldRow
            label="Mercado"
            checked={enabled.market}
            onCheckedChange={(v) => toggle("market", v)}
          >
            <Select
              value={market}
              onValueChange={(v) => setMarket(v as BetFormValues["market"])}
            >
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MARKET_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FieldRow>

          {/* Cuota */}
          <FieldRow
            label="Cuota"
            checked={enabled.odds}
            onCheckedChange={(v) => toggle("odds", v)}
          >
            <Input
              type="number"
              step="0.01"
              min="1.01"
              inputMode="decimal"
              placeholder="Ej: 1.85"
              value={odds}
              onChange={(e) => setOdds(e.target.value)}
              className="h-9"
            />
          </FieldRow>

          {/* Stake */}
          <FieldRow
            label="Stake (€)"
            checked={enabled.stake}
            onCheckedChange={(v) => toggle("stake", v)}
          >
            <Input
              type="number"
              step="0.01"
              min="0.01"
              inputMode="decimal"
              placeholder="Ej: 10"
              value={stake}
              onChange={(e) => setStake(e.target.value)}
              className="h-9"
            />
          </FieldRow>

          {/* Freebet */}
          <FieldRow
            label="Freebet"
            checked={enabled.isFreebet}
            onCheckedChange={(v) => toggle("isFreebet", v)}
          >
            <Select
              value={isFreebet ? "yes" : "no"}
              onValueChange={(v) => setIsFreebet(v === "yes")}
            >
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="yes">Sí, son freebet</SelectItem>
                <SelectItem value="no">No son freebet</SelectItem>
              </SelectContent>
            </Select>
          </FieldRow>

          {/* Fecha y hora */}
          <FieldRow
            label="Fecha y hora"
            checked={enabled.placedAt}
            onCheckedChange={(v) => toggle("placedAt", v)}
          >
            <Input
              type="datetime-local"
              value={placedAt}
              onChange={(e) => setPlacedAt(e.target.value)}
              className="h-9"
            />
          </FieldRow>

          {/* Notas */}
          <FieldRow
            label="Notas"
            checked={enabled.notes}
            onCheckedChange={(v) => toggle("notes", v)}
          >
            <Textarea
              rows={2}
              placeholder="Se reemplazarán las notas de todas las seleccionadas"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </FieldRow>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter className="flex-col items-stretch gap-2 sm:flex-row sm:items-center">
          <p className="mr-auto text-xs text-muted-foreground">
            Se guardan en la cola y se suben en lote desde la lista.
          </p>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleApply} disabled={!anyEnabled}>
            Aplicar a {bets.length}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Fila de un campo editable: checkbox para activarlo + su control. Cuando no
 *  está marcado, el control se ve atenuado y no se aplica. */
function FieldRow({
  label,
  checked,
  onCheckedChange,
  children,
}: {
  label: string;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  children: ReactNode;
}) {
  return (
    <div className="rounded-md border p-3">
      <label className="flex cursor-pointer items-center gap-2">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onCheckedChange(e.target.checked)}
          className="h-4 w-4 cursor-pointer"
        />
        <span className="text-sm font-medium">{label}</span>
      </label>
      <div
        className={
          "mt-2 " + (checked ? "" : "pointer-events-none opacity-40")
        }
        aria-hidden={!checked}
      >
        {children}
      </div>
    </div>
  );
}
