"use client";

import { useEffect, useState } from "react";
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
import { setMatchResult } from "@/features/matches/matches.service";
import { useAuth } from "@/features/auth/auth.context";
import { TeamFlag } from "@/components/matches/team-flag";
import { cn } from "@/lib/utils";
import type { Match, MatchResult } from "@/types/domain";

interface Props {
  match: Match;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}

interface FormState {
  homeGoals: string;
  awayGoals: string;
  homeYellow: string;
  awayYellow: string;
  homeRed: string;
  awayRed: string;
  // Eliminatorias:
  afterExtraTime: boolean;
  penalties: boolean;
  homePenalties: string;
  awayPenalties: string;
}

function initialFor(m: Match): FormState {
  const r = m.result;
  const hasPenalties =
    r?.homePenalties != null || r?.awayPenalties != null || !!r?.penaltyWinner;
  return {
    homeGoals: String(r?.homeGoals ?? 0),
    awayGoals: String(r?.awayGoals ?? 0),
    homeYellow: String(r?.homeYellow ?? 0),
    awayYellow: String(r?.awayYellow ?? 0),
    homeRed: String(r?.homeRed ?? 0),
    awayRed: String(r?.awayRed ?? 0),
    afterExtraTime: !!r?.afterExtraTime,
    penalties: hasPenalties,
    homePenalties: String(r?.homePenalties ?? 0),
    awayPenalties: String(r?.awayPenalties ?? 0),
  };
}

export function MatchResultDialog({ match, open, onOpenChange, onSaved }: Props) {
  const { firebaseUser } = useAuth();
  const [values, setValues] = useState<FormState>(initialFor(match));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setValues(initialFor(match));
      setError(null);
    }
  }, [open, match]);

  function update<K extends keyof FormState>(key: K, v: FormState[K]) {
    setValues((s) => ({ ...s, [key]: v }));
  }

  const isKnockout = match.stage !== "group";
  const isTie = Number(values.homeGoals) === Number(values.awayGoals);
  // La tanda de penaltis se muestra si el usuario la activa o si en
  // eliminatoria el resultado quedó empatado (es obligatoria).
  const showPenalties = isKnockout && (values.penalties || isTie);
  const penH = Number(values.homePenalties);
  const penA = Number(values.awayPenalties);
  const penWinner: "home" | "away" | null =
    showPenalties && penH !== penA ? (penH > penA ? "home" : "away") : null;

  async function handleSave() {
    if (!firebaseUser) return;
    setSaving(true);
    setError(null);
    try {
      const homeGoals = clampInt(values.homeGoals, 0, 30);
      const awayGoals = clampInt(values.awayGoals, 0, 30);
      const tie = homeGoals === awayGoals;

      let result: MatchResult;

      if (isKnockout) {
        // En eliminatorias no contamos tarjetas (solo importa el resultado y
        // el ganador). Si quedó empate, hace falta la tanda de penaltis.
        const usePenalties = values.penalties || tie;
        let homePens: number | null = null;
        let awayPens: number | null = null;
        let winner: "home" | "away" | null = null;
        if (usePenalties) {
          homePens = clampInt(values.homePenalties, 0, 40);
          awayPens = clampInt(values.awayPenalties, 0, 40);
          winner =
            homePens > awayPens ? "home" : awayPens > homePens ? "away" : null;
        }

        if (tie && winner === null) {
          setError(
            "En eliminatorias no puede quedar empate: marca los penaltis (y no pueden acabar empatados)."
          );
          setSaving(false);
          return;
        }

        result = {
          homeGoals,
          awayGoals,
          homeYellow: 0,
          awayYellow: 0,
          homeRed: 0,
          awayRed: 0,
          afterExtraTime: !!values.afterExtraTime,
          // El marcador de penaltis y el ganador solo se guardan cuando hubo
          // empate (es cuando deciden el partido).
          homePenalties: tie ? homePens : null,
          awayPenalties: tie ? awayPens : null,
          penaltyWinner: tie ? winner : null,
        };
      } else {
        result = {
          homeGoals,
          awayGoals,
          homeYellow: clampInt(values.homeYellow, 0, 30),
          awayYellow: clampInt(values.awayYellow, 0, 30),
          homeRed: clampInt(values.homeRed, 0, 11),
          awayRed: clampInt(values.awayRed, 0, 11),
          afterExtraTime: false,
          homePenalties: null,
          awayPenalties: null,
          penaltyWinner: null,
        };
      }

      await setMatchResult(match.id, result, firebaseUser.uid);
      onOpenChange(false);
      onSaved?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  }

  async function handleClear() {
    if (!firebaseUser) return;
    if (!confirm("¿Borrar el resultado y volver a marcarlo como programado?")) return;
    setSaving(true);
    setError(null);
    try {
      await setMatchResult(match.id, null, firebaseUser.uid);
      onOpenChange(false);
      onSaved?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al borrar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Resultado del partido</DialogTitle>
          <DialogDescription>
            <TeamFlag name={match.homeLabel} className="mr-1" />
            {match.homeLabel} vs{" "}
            <TeamFlag name={match.awayLabel} className="mr-1" />
            {match.awayLabel}
            {match.groupId && ` · Grupo ${match.groupId}`}
            {match.matchday && ` · J${match.matchday}`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <ResultRow
            label="Goles"
            home={values.homeGoals}
            away={values.awayGoals}
            onHome={(v) => update("homeGoals", v)}
            onAway={(v) => update("awayGoals", v)}
            homeTeam={match.homeLabel}
            awayTeam={match.awayLabel}
            big
          />

          {/* ── Eliminatorias: prórroga y penaltis (sin tarjetas) ── */}
          {isKnockout && (
            <div className="space-y-3 border-t pt-3">
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant={values.afterExtraTime ? "default" : "outline"}
                  onClick={() => update("afterExtraTime", !values.afterExtraTime)}
                >
                  ⏱️ Prórroga
                </Button>
                <Button
                  type="button"
                  variant={values.penalties || isTie ? "default" : "outline"}
                  onClick={() => update("penalties", !values.penalties)}
                  disabled={isTie}
                  title={
                    isTie
                      ? "Obligatorio: el partido quedó empatado"
                      : "Marca si se decidió en los penaltis"
                  }
                >
                  🥅 Penaltis
                </Button>
              </div>

              {showPenalties && (
                <div className="rounded-md border bg-muted/20 p-3">
                  <p className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">
                    Tanda de penaltis
                  </p>
                  <ResultRow
                    label="Penaltis"
                    home={values.homePenalties}
                    away={values.awayPenalties}
                    onHome={(v) => update("homePenalties", v)}
                    onAway={(v) => update("awayPenalties", v)}
                  />
                  <p className="mt-2 text-center text-xs">
                    {penWinner ? (
                      <span className="font-semibold text-profit">
                        Gana{" "}
                        {penWinner === "home" ? match.homeLabel : match.awayLabel}{" "}
                        en los penaltis
                      </span>
                    ) : (
                      <span className="text-muted-foreground">
                        Indica el marcador de penaltis (no puede quedar empate).
                      </span>
                    )}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* ── Fase de grupos: tarjetas para el fair play ── */}
          {!isKnockout && (
            <div className="border-t pt-3">
              <p className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">
                Disciplina (para tabla de fair play)
              </p>
              <div className="space-y-2">
                <ResultRow
                  label="🟨 Amarillas"
                  home={values.homeYellow}
                  away={values.awayYellow}
                  onHome={(v) => update("homeYellow", v)}
                  onAway={(v) => update("awayYellow", v)}
                />
                <ResultRow
                  label="🟥 Rojas"
                  home={values.homeRed}
                  away={values.awayRed}
                  onHome={(v) => update("homeRed", v)}
                  onAway={(v) => update("awayRed", v)}
                />
              </div>
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter className="sm:justify-between">
          {match.result ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClear}
              disabled={saving}
              className="text-destructive hover:text-destructive"
            >
              Borrar resultado
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Guardando…" : "Guardar resultado"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ResultRow({
  label,
  home,
  away,
  onHome,
  onAway,
  homeTeam,
  awayTeam,
  big,
}: {
  label: string;
  home: string;
  away: string;
  onHome: (v: string) => void;
  onAway: (v: string) => void;
  homeTeam?: string;
  awayTeam?: string;
  big?: boolean;
}) {
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
      <div className="text-right">
        {homeTeam && (
          <p className="mb-1 text-xs text-muted-foreground">
            <TeamFlag name={homeTeam} className="mr-1" />
            {homeTeam}
          </p>
        )}
        <Input
          type="number"
          min="0"
          inputMode="numeric"
          value={home}
          onChange={(e) => onHome(e.target.value)}
          className={cn(
            big
              ? "h-16 text-center text-3xl font-bold font-mono"
              : "h-9 text-center text-sm font-mono"
          )}
        />
      </div>
      <div
        className={cn(
          "text-center text-xs uppercase tracking-wider text-muted-foreground",
          big && "px-4 pt-5"
        )}
      >
        {label}
      </div>
      <div>
        {awayTeam && (
          <p className="mb-1 text-xs text-muted-foreground">
            <TeamFlag name={awayTeam} className="mr-1" />
            {awayTeam}
          </p>
        )}
        <Input
          type="number"
          min="0"
          inputMode="numeric"
          value={away}
          onChange={(e) => onAway(e.target.value)}
          className={cn(
            big
              ? "h-16 text-center text-3xl font-bold font-mono"
              : "h-9 text-center text-sm font-mono"
          )}
        />
      </div>
    </div>
  );
}

function clampInt(v: string, min: number, max: number): number {
  const n = Math.floor(Number(v));
  if (Number.isNaN(n)) return min;
  return Math.max(min, Math.min(max, n));
}
