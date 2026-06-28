"use client";

import {
  memo,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Search, Check, Flag, Star } from "lucide-react";
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
import { resolveMatchLabels } from "@/features/matches/bracket-resolver";
import { currentDayWindow } from "@/features/bets/bets.utils";
import { isSpainMatch, isTveMatch } from "@/features/matches/tve-matches";
import { TeamFlag } from "@/components/matches/team-flag";
import { formatDateTime } from "@/lib/utils";
import type { Match } from "@/types/domain";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  multi?: boolean;
  initialSelected?: string[];
  onConfirm: (matches: Match[]) => void;
}

/**
 * Fila de un partido. Memoizada: al marcar/desmarcar un partido solo se
 * re-renderiza la fila cuyo `selected` cambia, no las ~104 de la lista (eso
 * era lo que dejaba el selector lento al tocar o escribir).
 */
const MatchRow = memo(function MatchRow({
  m,
  selected,
  onToggle,
}: {
  m: Match;
  selected: boolean;
  onToggle: (id: string) => void;
}) {
  const kickoff = new Date(m.kickoffUtc.toMillis());
  return (
    <li
      className={`flex cursor-pointer items-center gap-3 px-3 py-2 text-sm transition-colors hover:bg-accent/40 ${
        selected ? "bg-primary/10" : ""
      }`}
      onClick={() => onToggle(m.id)}
    >
      <div
        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border ${
          selected
            ? "border-primary bg-primary text-primary-foreground"
            : "border-input"
        }`}
      >
        {selected && <Check className="h-3.5 w-3.5" />}
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
            <TeamFlag name={m.homeLabel} className="mr-1" />
            {m.homeLabel} <span className="text-muted-foreground">vs</span>{" "}
            <TeamFlag name={m.awayLabel} className="mr-1" />
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
        {m.status === "finished" && (
          <span className="rounded-[3px] bg-muted px-1 py-0 text-[10px] font-semibold uppercase text-muted-foreground">
            Final
          </span>
        )}
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
});

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
  // Valor diferido: el input se actualiza al instante y el filtrado pesado de
  // la lista se hace en baja prioridad, así escribir no se atasca.
  const deferredSearch = useDeferredValue(search);
  const [showFinished, setShowFinished] = useState(false);
  // Por defecto el selector muestra solo los partidos de la jornada de hoy
  // (ventana 12:00 → 12:00, la misma del dashboard). Con "Ver todos" se
  // muestran el resto. Además de ser más cómodo, renderizar menos filas hace
  // que el diálogo abra más fluido.
  const [showAll, setShowAll] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // Renderizar las ~104 filas a la vez que corre la animación de apertura del
  // diálogo la dejaba lageada/bugeada. Esperamos a que termine la animación
  // (~200ms) y solo entonces montamos la lista: el popup abre suave y la lista
  // aparece justo después.
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!open) {
      setReady(false);
      return;
    }
    setSelected(new Set(initialSelected));
    setSearch("");
    setShowFinished(false);
    setShowAll(false);
    const t = setTimeout(() => setReady(true), 220);
    const unsub = subscribeToMatches(
      (list) => {
        setMatches(list);
        setLoading(false);
      },
      () => setLoading(false)
    );
    return () => {
      clearTimeout(t);
      unsub();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Partidos con los huecos de eliminatoria ya resueltos al equipo provisional
  // (como el cuadro): así se ven equipos de verdad y se pueden buscar por
  // nombre, en vez de "2.º Grupo A vs 2.º Grupo B".
  const displayMatches = useMemo(() => resolveMatchLabels(matches), [matches]);

  const filtered = useMemo(() => {
    // Por defecto ocultamos los partidos ya finalizados; con el botón
    // "Finalizados" se incluyen (p. ej. para registrar una apuesta de un
    // partido que ya se jugó).
    const base = showFinished
      ? displayMatches
      : displayMatches.filter((m) => m.status !== "finished");
    const s = deferredSearch.trim().toLowerCase();
    if (s) {
      // Al buscar, miramos en TODOS los partidos (ignoramos el filtro de
      // jornada): si buscas un equipo concreto, quieres encontrarlo aunque no
      // juegue hoy.
      return base.filter(
        (m) =>
          m.homeLabel.toLowerCase().includes(s) ||
          m.awayLabel.toLowerCase().includes(s) ||
          (m.groupId ?? "").toLowerCase().includes(s) ||
          (m.city ?? "").toLowerCase().includes(s)
      );
    }
    // Sin búsqueda: por defecto solo la jornada actual (12:00 → 12:00). El
    // botón "Ver todos los partidos" desactiva este filtro.
    if (!showAll) {
      const { startMs, endMs } = currentDayWindow();
      return base.filter((m) => {
        const k = m.kickoffUtc.toMillis();
        return k >= startMs && k < endMs;
      });
    }
    return base;
  }, [displayMatches, deferredSearch, showFinished, showAll]);

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

  const toggle = useCallback(
    (id: string) => {
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
    },
    [multi]
  );

  function handleConfirm() {
    // Devolvemos los partidos con la etiqueta ya resuelta, así la apuesta se
    // guarda con el equipo (p. ej. "España vs Australia") y no con el hueco.
    const chosen = displayMatches.filter((m) => selected.has(m.id));
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

        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar por equipo, grupo o ciudad…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
              autoFocus
            />
          </div>
          <Button
            type="button"
            variant={showFinished ? "default" : "outline"}
            size="sm"
            onClick={() => setShowFinished((v) => !v)}
            className="shrink-0 gap-1.5"
            title="Mostrar también los partidos ya finalizados"
          >
            <Flag className="h-4 w-4" />
            Finalizados
          </Button>
        </div>

        {/* Solo cuando no se está buscando: indicador de jornada + "Ver todos". */}
        {!deferredSearch.trim() && (
          <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>
              {showAll
                ? "Mostrando todos los partidos"
                : "Mostrando la jornada de hoy (desde las 12:00)"}
            </span>
            <button
              type="button"
              onClick={() => setShowAll((v) => !v)}
              className="font-medium text-primary hover:underline"
            >
              {showAll ? "Ver solo hoy" : "Ver todos los partidos"}
            </button>
          </div>
        )}

        <div className="max-h-[55vh] overflow-y-auto rounded-md border">
          {loading || !ready ? (
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
              ) : deferredSearch.trim() ? (
                "Sin resultados para esa búsqueda."
              ) : !showAll ? (
                <>
                  No hay partidos en la jornada de hoy.
                  <br />
                  <button
                    type="button"
                    onClick={() => setShowAll(true)}
                    className="mt-1 text-xs font-medium text-primary hover:underline"
                  >
                    Ver todos los partidos
                  </button>
                </>
              ) : (
                "No hay partidos."
              )}
            </div>
          ) : (
            grouped.map((g) => (
              <div key={g.day}>
                <div className="sticky top-0 z-10 border-b bg-muted/80 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground backdrop-blur">
                  {g.day}
                </div>
                <ul className="divide-y">
                  {g.items.map((m) => (
                    <MatchRow
                      key={m.id}
                      m={m}
                      selected={selected.has(m.id)}
                      onToggle={toggle}
                    />
                  ))}
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
