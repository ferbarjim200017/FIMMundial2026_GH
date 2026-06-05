"use client";

import { useEffect, useMemo, useState } from "react";
import { Search, Check, Star } from "lucide-react";
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
import { subscribeToMatches, STAGE_LABELS } from "@/features/matches/matches.service";
import { isSpainMatch, isTveMatch } from "@/features/matches/tve-matches";
import { formatDateTime } from "@/lib/utils";
import type { Match } from "@/types/domain";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  multi?: boolean;
  initialSelected?: string[];
  onConfirm: (matches: Match[]) => void;
}

export function MatchPickerDialog({
  open,
  onOpenChange,
  multi = true,
  initialSelected = [],
  onConfirm,
}: Props) {
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open) return;
    setSelected(new Set(initialSelected));
    setSearch("");
    const unsub = subscribeToMatches(
      (list) => {
        setMatches(list);
        setLoading(false);
      },
      () => setLoading(false)
    );
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const filtered = useMemo(() => {
    // Excluir partidos ya terminados: no tiene sentido apostar a un partido
    // cuyo resultado ya está cerrado.
    const upcoming = matches.filter((m) => m.status !== "finished");
    const s = search.trim().toLowerCase();
    if (!s) return upcoming;
    return upcoming.filter(
      (m) =>
        m.homeLabel.toLowerCase().includes(s) ||
        m.awayLabel.toLowerCase().includes(s) ||
        (m.groupId ?? "").toLowerCase().includes(s) ||
        (m.city ?? "").toLowerCase().includes(s)
    );
  }, [matches, search]);

  // Agrupar por día (ordenado por kickoff asc en el servicio)
  const grouped = useMemo(() => {
    const groups: { day: string; items: Match[] }[] = [];
    for (const m of filtered) {
      const day = new Date(m.kickoffUtc.toMillis()).toLocaleDateString("es-ES", {
        weekday: "long",
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
      const last = groups[groups.length - 1];
      if (last && last.day === day) last.items.push(m);
      else groups.push({ day, items: [m] });
    }
    return groups;
  }, [filtered]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (multi) {
        if (next.has(id)) next.delete(id);
        else next.add(id);
      } else {
        next.clear();
        next.add(id);
      }
      return next;
    });
  }

  function handleConfirm() {
    const chosen = matches.filter((m) => selected.has(m.id));
    onConfirm(chosen);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Seleccionar partidos del Mundial</DialogTitle>
          <DialogDescription>
            Ordenados por fecha. {multi ? "Selecciona uno o varios para crear una combinada." : "Selecciona un partido."}
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por equipo, grupo o ciudad…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
            autoFocus
          />
        </div>

        <div className="max-h-[55vh] overflow-y-auto rounded-md border">
          {loading ? (
            <p className="p-6 text-center text-sm text-muted-foreground">Cargando partidos…</p>
          ) : grouped.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              {matches.length === 0 ? (
                <>
                  Aún no hay partidos cargados.
                  <br />
                  <span className="text-xs">
                    Pídele al admin que los registre en{" "}
                    <code className="rounded bg-muted px-1">/admin/matches</code>.
                  </span>
                </>
              ) : (
                "Sin resultados para esa búsqueda."
              )}
            </div>
          ) : (
            grouped.map((g) => (
              <div key={g.day}>
                <div className="sticky top-0 z-10 border-b bg-muted/80 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground backdrop-blur">
                  {g.day}
                </div>
                <ul className="divide-y">
                  {g.items.map((m) => {
                    const isSelected = selected.has(m.id);
                    const kickoff = new Date(m.kickoffUtc.toMillis());
                    return (
                      <li
                        key={m.id}
                        className={`flex cursor-pointer items-center gap-3 px-3 py-2 text-sm transition-colors hover:bg-accent/40 ${
                          isSelected ? "bg-primary/10" : ""
                        }`}
                        onClick={() => toggle(m.id)}
                      >
                        <div
                          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border ${
                            isSelected
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-input"
                          }`}
                        >
                          {isSelected && <Check className="h-3.5 w-3.5" />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="flex items-center gap-1.5 truncate font-medium">
                            {isSpainMatch(m) && (
                              <Star
                                className="h-3.5 w-3.5 shrink-0 fill-yellow-400 text-yellow-500"
                                aria-label="Partido de España"
                              />
                            )}
                            <span className="truncate">
                              {m.homeLabel}{" "}
                              <span className="text-muted-foreground">vs</span>{" "}
                              {m.awayLabel}
                            </span>
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {STAGE_LABELS[m.stage]}
                            {m.groupId && ` · Grupo ${m.groupId}`}
                            {m.matchday && ` · J${m.matchday}`}
                            {m.city && ` · ${m.city}`}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 text-right text-xs text-muted-foreground">
                          {isTveMatch(m) && (
                            <span className="rounded-[3px] bg-blue-600 px-1 py-0 text-[10px] font-semibold uppercase text-white">
                              TVE
                            </span>
                          )}
                          {kickoff.toLocaleTimeString("es-ES", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))
          )}
        </div>

        <DialogFooter className="items-center justify-between sm:flex">
          <p className="text-xs text-muted-foreground">
            {selected.size} partido(s) seleccionado(s)
            {multi && selected.size > 1 && " — se marcará como combinada"}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button onClick={handleConfirm} disabled={selected.size === 0}>
              Confirmar
            </Button>
          </div>
        </DialogFooter>

        {/* Hint de uso */}
        <p className="text-[10px] text-muted-foreground">
          Truco: pulsa <kbd className="rounded bg-muted px-1">Esc</kbd> para cerrar o usa el buscador para filtrar.
        </p>
        <span className="sr-only">{formatDateTime(new Date())}</span>
      </DialogContent>
    </Dialog>
  );
}
