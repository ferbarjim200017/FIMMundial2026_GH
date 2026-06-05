"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { CalendarPlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { MatchPickerDialog } from "@/components/bets/match-picker-dialog";
import {
  betFormSchema,
  BOOKMAKER_OPTIONS,
  MARKET_OPTIONS,
  type BetFormValues,
} from "@/features/bets/bets.schema";
import { createBet, updateBet } from "@/features/bets/bets.service";
import {
  STAGE_LABELS,
  getMatch,
  matchLabel,
} from "@/features/matches/matches.service";
import { formatCurrency } from "@/lib/utils";
import { ROUTES } from "@/lib/constants";
import type { Bet, Match } from "@/types/domain";

interface Props {
  userId: string;
  initial?: Bet;
  onDone?: () => void;
}

function toLocalDatetimeValue(d: Date): string {
  const tz = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tz).toISOString().slice(0, 16);
}

function composeLabel(matches: Match[]): string {
  if (matches.length === 0) return "";
  if (matches.length === 1) return matchLabel(matches[0]);
  return matches.map((m) => `${m.homeLabel} vs ${m.awayLabel}`).join(" + ");
}

export function BetForm({ userId, initial, onDone }: Props) {
  const router = useRouter();
  const [values, setValues] = useState<BetFormValues>(() => ({
    bookmaker: initial?.bookmaker ?? "bet365",
    bookmakerLabel: initial?.bookmakerLabel ?? "",
    matchIds: initial?.matchIds ?? (initial?.matchId ? [initial.matchId] : []),
    matchLabel: initial?.matchLabel ?? "",
    market: initial?.market ?? "winner",
    marketDetail: initial?.marketDetail ?? "",
    selection: initial?.selection ?? "",
    odds: initial?.odds ?? 1.5,
    stake: initial?.stake ?? 10,
    placedAt: initial
      ? toLocalDatetimeValue(initial.createdAt.toDate())
      : toLocalDatetimeValue(new Date()),
    isFreebet: initial?.isFreebet ?? false,
    notes: initial?.notes ?? "",
  }));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [selectedMatches, setSelectedMatches] = useState<Match[]>([]);
  const [manualLabel, setManualLabel] = useState<boolean>(
    !!initial &&
      ((initial.matchIds?.length ?? 0) === 0 && !initial.matchId)
  );

  // Las apuestas a futuro (outright) no van ligadas a un partido concreto;
  // forzamos el modo manual para que el usuario escriba el evento (p.ej.
  // "Ganador Grupo A", "Mejor equipo africano", "Top scorer del Mundial").
  const isOutright = values.market === "outright";
  useEffect(() => {
    if (isOutright && !manualLabel) {
      setManualLabel(true);
      setSelectedMatches([]);
      setValues((v) => ({ ...v, matchIds: [] }));
    }
  }, [isOutright, manualLabel]);

  // Cargar matches iniciales (modo edición) para mostrar chips
  useEffect(() => {
    if (!values.matchIds || values.matchIds.length === 0) return;
    let cancelled = false;
    Promise.all(values.matchIds.map((id) => getMatch(id))).then((arr) => {
      if (cancelled) return;
      const valid = arr.filter((m): m is Match => !!m);
      setSelectedMatches(valid);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-clear server error on edit
  useEffect(() => setServerError(null), [values]);

  // Cuando hay 2+ partidos, forzar combo
  useEffect(() => {
    if (selectedMatches.length > 1 && values.market !== "combo") {
      setValues((v) => ({ ...v, market: "combo" }));
    }
    // Recalcular label a partir de los matches seleccionados (si no es manual)
    if (selectedMatches.length > 0 && !manualLabel) {
      setValues((v) => ({
        ...v,
        matchLabel: composeLabel(selectedMatches),
        matchIds: selectedMatches.map((m) => m.id),
      }));
    } else if (selectedMatches.length === 0 && !manualLabel && values.matchIds?.length) {
      setValues((v) => ({ ...v, matchIds: [] }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMatches, manualLabel]);

  const potentialReturn = useMemo(
    () => (Number(values.odds) || 0) * (Number(values.stake) || 0),
    [values.odds, values.stake]
  );
  // stake * (odds - 1) — el beneficio potencial es igual con o sin freebet.
  // En una freebet, sin embargo, no hay "retorno total" porque el stake
  // era un token de la casa: solo se cobra el beneficio.
  const potentialProfit = potentialReturn - (Number(values.stake) || 0);

  function update<K extends keyof BetFormValues>(key: K, v: BetFormValues[K]) {
    setValues((s) => ({ ...s, [key]: v }));
    setErrors((e) => {
      const { [key as string]: _omit, ...rest } = e;
      return rest;
    });
  }

  function removeMatch(id: string) {
    setSelectedMatches((prev) => prev.filter((m) => m.id !== id));
  }

  function switchToManual() {
    setSelectedMatches([]);
    setManualLabel(true);
    setValues((v) => ({ ...v, matchIds: [], matchLabel: "" }));
  }

  function switchToPicker() {
    setManualLabel(false);
    setValues((v) => ({ ...v, matchLabel: "" }));
    setPickerOpen(true);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const parsed = betFormSchema.safeParse(values);
    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as string;
        if (!fieldErrors[key]) fieldErrors[key] = issue.message;
      }
      setErrors(fieldErrors);
      return;
    }

    setSubmitting(true);
    setServerError(null);
    try {
      if (initial) {
        await updateBet({ ...parsed.data, betId: initial.id });
      } else {
        await createBet({ ...parsed.data, userId });
      }
      if (onDone) onDone();
      else router.push(ROUTES.bets);
    } catch (err) {
      setServerError(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Card>
        <CardContent className="grid grid-cols-1 gap-4 p-6 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Casa de apuestas</Label>
            <Select
              value={values.bookmaker}
              onValueChange={(v) => update("bookmaker", v as BetFormValues["bookmaker"])}
            >
              <SelectTrigger>
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

          {values.bookmaker === "other" && (
            <div className="space-y-1.5">
              <Label htmlFor="bookmakerLabel">Nombre casa</Label>
              <Input
                id="bookmakerLabel"
                value={values.bookmakerLabel ?? ""}
                onChange={(e) => update("bookmakerLabel", e.target.value)}
              />
              {errors.bookmakerLabel && (
                <p className="text-xs text-destructive">{errors.bookmakerLabel}</p>
              )}
            </div>
          )}

          {/* ---------- Selector de partidos ---------- */}
          <div className="space-y-2 sm:col-span-2">
            <div className="flex items-center justify-between gap-2">
              <Label>
                {isOutright ? "Evento / mercado a futuro" : "Partido(s) del Mundial"}
              </Label>
              <div className="flex items-center gap-1 text-xs">
                {isOutright ? (
                  <span className="text-muted-foreground">
                    Apuesta a futuro — escribe el evento
                  </span>
                ) : manualLabel ? (
                  <button
                    type="button"
                    onClick={switchToPicker}
                    className="text-primary hover:underline"
                  >
                    Usar selector de partidos
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={switchToManual}
                    className="text-muted-foreground hover:underline"
                  >
                    Escribir manualmente
                  </button>
                )}
              </div>
            </div>

            {manualLabel ? (
              <>
                <Input
                  placeholder={
                    isOutright
                      ? "Ej: Ganador Grupo A · Mejor equipo africano · Top scorer"
                      : "España vs Cabo Verde"
                  }
                  value={values.matchLabel}
                  onChange={(e) => update("matchLabel", e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  {isOutright
                    ? "Apuestas a futuro / outright: ganador de grupo, qué selección se clasifica, mejor equipo de cada continente, máximo goleador…"
                    : "Modo libre: úsalo solo para partidos fuera del Mundial."}
                </p>
              </>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-2 rounded-md border border-dashed bg-muted/20 p-2">
                  {selectedMatches.length === 0 ? (
                    <span className="px-2 text-xs text-muted-foreground">
                      Sin partidos seleccionados.
                    </span>
                  ) : (
                    selectedMatches.map((m) => (
                      <MatchChip key={m.id} match={m} onRemove={() => removeMatch(m.id)} />
                    ))
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setPickerOpen(true)}
                    className="ml-auto"
                  >
                    <CalendarPlus className="h-3.5 w-3.5" />
                    {selectedMatches.length === 0 ? "Seleccionar partidos" : "Modificar"}
                  </Button>
                </div>
                {selectedMatches.length > 1 && (
                  <p className="text-xs text-primary">
                    Se marcará como <strong>combinada</strong> ({selectedMatches.length} partidos).
                  </p>
                )}
              </>
            )}
            {errors.matchLabel && (
              <p className="text-xs text-destructive">{errors.matchLabel}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Mercado</Label>
            <Select
              value={values.market}
              onValueChange={(v) => update("market", v as BetFormValues["market"])}
            >
              <SelectTrigger>
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
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="selection">Selección</Label>
            <Input
              id="selection"
              placeholder={
                isOutright
                  ? "Ej: España · Marruecos · Mbappé"
                  : selectedMatches.length > 1
                  ? "Ej: España gana + Brasil gana + Over 2.5 Alemania"
                  : "Gana España, Sí, Más de 2.5…"
              }
              value={values.selection}
              onChange={(e) => update("selection", e.target.value)}
            />
            {errors.selection && (
              <p className="text-xs text-destructive">{errors.selection}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="odds">Cuota{selectedMatches.length > 1 && " (total combinada)"}</Label>
            <Input
              id="odds"
              type="number"
              step="0.01"
              min="1.01"
              value={values.odds}
              onChange={(e) => update("odds", e.target.value as unknown as number)}
            />
            {errors.odds && <p className="text-xs text-destructive">{errors.odds}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="stake">
              Stake (€){values.isFreebet && " · freebet"}
            </Label>
            <Input
              id="stake"
              type="number"
              step="0.01"
              min="0.01"
              value={values.stake}
              onChange={(e) => update("stake", e.target.value as unknown as number)}
            />
            {errors.stake && <p className="text-xs text-destructive">{errors.stake}</p>}
            <label className="mt-1.5 flex cursor-pointer items-center gap-2 rounded-md border bg-muted/20 px-2.5 py-2 text-xs">
              <input
                type="checkbox"
                checked={!!values.isFreebet}
                onChange={(e) => update("isFreebet", e.target.checked)}
              />
              <span className="font-medium text-foreground">Freebet</span>
            </label>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="placedAt">Fecha y hora</Label>
            <Input
              id="placedAt"
              type="datetime-local"
              value={values.placedAt}
              onChange={(e) => update("placedAt", e.target.value)}
            />
            {errors.placedAt && (
              <p className="text-xs text-destructive">{errors.placedAt}</p>
            )}
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="notes">Notas (opcional)</Label>
            <Textarea
              id="notes"
              rows={3}
              value={values.notes ?? ""}
              onChange={(e) => update("notes", e.target.value)}
              placeholder="Razones, contexto, value…"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm text-muted-foreground">
            {values.isFreebet ? (
              <>
                Beneficio potencial (freebet):{" "}
                <span className="font-mono font-medium text-profit">
                  {formatCurrency(potentialProfit)}
                </span>
              </>
            ) : (
              <>
                Retorno potencial:{" "}
                <span className="font-mono font-medium text-foreground">
                  {formatCurrency(potentialReturn)}
                </span>
                <span className="mx-2 text-border">•</span>
                Beneficio potencial:{" "}
                <span className="font-mono font-medium text-profit">
                  {formatCurrency(potentialProfit)}
                </span>
              </>
            )}
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => (onDone ? onDone() : router.back())}
              disabled={submitting}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Guardando…" : initial ? "Guardar cambios" : "Registrar apuesta"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {serverError && (
        <p className="text-sm text-destructive">{serverError}</p>
      )}

      <MatchPickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        multi
        initialSelected={selectedMatches.map((m) => m.id)}
        onConfirm={(matches) => setSelectedMatches(matches)}
      />
    </form>
  );
}

function MatchChip({ match, onRemove }: { match: Match; onRemove: () => void }) {
  const kickoff = new Date(match.kickoffUtc.toMillis());
  return (
    <span className="group inline-flex items-center gap-2 rounded-full border bg-background py-0.5 pl-2.5 pr-1 text-xs">
      <span className="font-medium">
        {match.homeLabel} <span className="text-muted-foreground">vs</span> {match.awayLabel}
      </span>
      <span className="text-muted-foreground">
        · {STAGE_LABELS[match.stage]}
        {match.groupId && ` · ${match.groupId}`}
        ·{" "}
        {kickoff.toLocaleDateString("es-ES", {
          day: "2-digit",
          month: "short",
        })}{" "}
        {kickoff.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}
      </span>
      <button
        type="button"
        onClick={onRemove}
        className="rounded-full p-0.5 text-muted-foreground transition-colors hover:bg-destructive/15 hover:text-destructive"
        aria-label="Quitar partido"
      >
        <X className="h-3 w-3" />
      </button>
    </span>
  );
}
