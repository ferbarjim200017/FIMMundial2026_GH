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
import { Label } from "@/components/ui/label";
import { setMatchResult } from "@/features/matches/matches.service";
import { useAuth } from "@/features/auth/auth.context";
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
}

function initialFor(m: Match): FormState {
  const r = m.result;
  return {
    homeGoals: String(r?.homeGoals ?? 0),
    awayGoals: String(r?.awayGoals ?? 0),
    homeYellow: String(r?.homeYellow ?? 0),
    awayYellow: String(r?.awayYellow ?? 0),
    homeRed: String(r?.homeRed ?? 0),
    awayRed: String(r?.awayRed ?? 0),
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

  function update<K extends keyof FormState>(key: K, v: string) {
    setValues((s) => ({ ...s, [key]: v }));
  }

  async function handleSave() {
    if (!firebaseUser) return;
    setSaving(true);
    setError(null);
    try {
      const result: MatchResult = {
        homeGoals: clampInt(values.homeGoals, 0, 30),
        awayGoals: clampInt(values.awayGoals, 0, 30),
        homeYellow: clampInt(values.homeYellow, 0, 30),
        awayYellow: clampInt(values.awayYellow, 0, 30),
        homeRed: clampInt(values.homeRed, 0, 11),
        awayRed: clampInt(values.awayRed, 0, 11),
      };
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
            {match.homeLabel} vs {match.awayLabel}
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
        {homeTeam && <p className="mb-1 text-xs text-muted-foreground">{homeTeam}</p>}
        <Input
          type="number"
          min="0"
          inputMode="numeric"
          value={home}
          onChange={(e) => onHome(e.target.value)}
          className={
            big
              ? "h-16 text-center text-3xl font-bold font-mono"
              : "h-9 text-center text-sm font-mono"
          }
        />
      </div>
      <div
        className={`text-center text-xs uppercase tracking-wider text-muted-foreground ${
          big ? "px-4 pt-5" : ""
        }`}
      >
        {label}
      </div>
      <div>
        {awayTeam && <p className="mb-1 text-xs text-muted-foreground">{awayTeam}</p>}
        <Input
          type="number"
          min="0"
          inputMode="numeric"
          value={away}
          onChange={(e) => onAway(e.target.value)}
          className={
            big
              ? "h-16 text-center text-3xl font-bold font-mono"
              : "h-9 text-center text-sm font-mono"
          }
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
