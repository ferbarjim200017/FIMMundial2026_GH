"use client";

import { useMemo, useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { Match } from "@/types/domain";

/** Etiqueta compacta de un partido para el desplegable: fecha, hora y equipos. */
function matchOptionLabel(m: Match): string {
  const d = m.kickoffUtc.toDate();
  const date = d.toLocaleDateString("es-ES", { day: "2-digit", month: "short" });
  const time = d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
  return `${date} ${time} · ${m.homeLabel} vs ${m.awayLabel}`;
}

/**
 * Filtro por partido. Por defecto muestra solo los 4 PRÓXIMOS partidos (los
 * que aún no han terminado, por orden de inicio). Con el enlace de abajo se
 * despliega la lista COMPLETA, incluidos los ya finalizados (próximos primero,
 * luego los terminados del más reciente al más antiguo).
 *
 * `value` es "all" (sin filtro) o el id del partido seleccionado.
 */
export function MatchFilter({
  matches,
  value,
  onChange,
  className,
}: {
  matches: Match[];
  value: string;
  onChange: (v: string) => void;
  className?: string;
}) {
  const [showAll, setShowAll] = useState(false);

  const options = useMemo(() => {
    const byKickAsc = (a: Match, b: Match) =>
      a.kickoffUtc.toMillis() - b.kickoffUtc.toMillis();
    const upcoming = matches
      .filter((m) => m.status !== "finished")
      .sort(byKickAsc);

    let list: Match[];
    if (showAll) {
      const finished = matches
        .filter((m) => m.status === "finished")
        .sort((a, b) => b.kickoffUtc.toMillis() - a.kickoffUtc.toMillis());
      list = [...upcoming, ...finished];
    } else {
      list = upcoming.slice(0, 4);
    }

    // El partido seleccionado debe seguir disponible aunque no esté en la lista
    // visible (p. ej. elegiste uno finalizado y luego colapsas a "próximos").
    if (value !== "all" && !list.some((m) => m.id === value)) {
      const sel = matches.find((m) => m.id === value);
      if (sel) list = [sel, ...list];
    }
    return list;
  }, [matches, showAll, value]);

  return (
    <div className={cn("space-y-1", className)}>
      <label className="text-xs text-muted-foreground">Partido</label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-9 w-full">
          <SelectValue placeholder="Todos" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todos los partidos</SelectItem>
          {options.map((m) => (
            <SelectItem key={m.id} value={m.id}>
              {matchOptionLabel(m)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <button
        type="button"
        onClick={() => setShowAll((v) => !v)}
        className="block text-[11px] font-medium text-primary hover:underline"
      >
        {showAll ? "Solo los 4 próximos" : "Ver todos (incl. finalizados)"}
      </button>
    </div>
  );
}
