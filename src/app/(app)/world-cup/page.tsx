"use client";

import { useEffect, useMemo, useState } from "react";
import { Filter, Search } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MatchCard } from "@/components/world-cup/match-card";
import { MatchBetsDialog } from "@/components/world-cup/match-bets-dialog";
import {
  STAGE_LABELS,
  subscribeToMatches,
} from "@/features/matches/matches.service";
import type { Match } from "@/types/domain";

type StageFilter = "all" | Match["stage"];
type StatusFilter = "all" | "upcoming" | "finished";

export default function CalendarPage() {
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [stage, setStage] = useState<StageFilter>("all");
  // Por defecto solo los partidos no jugados; con el filtro Estado se pueden
  // mostrar los finalizados ("Finalizados" o "Todos").
  const [status, setStatus] = useState<StatusFilter>("upcoming");
  const [betsFor, setBetsFor] = useState<Match | null>(null);

  useEffect(() => {
    const unsub = subscribeToMatches(
      (list) => {
        setMatches(list);
        setLoading(false);
      },
      () => setLoading(false)
    );
    return unsub;
  }, []);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return matches.filter((m) => {
      if (stage !== "all" && m.stage !== stage) return false;
      if (status === "upcoming" && m.status === "finished") return false;
      if (status === "finished" && m.status !== "finished") return false;
      if (!s) return true;
      return (
        m.homeLabel.toLowerCase().includes(s) ||
        m.awayLabel.toLowerCase().includes(s) ||
        (m.groupId ?? "").toLowerCase().includes(s) ||
        (m.city ?? "").toLowerCase().includes(s) ||
        (m.venue ?? "").toLowerCase().includes(s)
      );
    });
  }, [matches, search, stage, status]);

  const grouped = useMemo(() => {
    const map = new Map<string, Match[]>();
    for (const m of filtered) {
      const day = new Date(m.kickoffUtc.toMillis()).toLocaleDateString("es-ES", {
        weekday: "long",
        day: "2-digit",
        month: "long",
        year: "numeric",
      });
      const arr = map.get(day) ?? [];
      arr.push(m);
      map.set(day, arr);
    }
    return [...map.entries()];
  }, [filtered]);

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 p-4">
          <div className="flex items-center gap-2 text-xs uppercase text-muted-foreground">
            <Filter className="h-3.5 w-3.5" /> Filtros
          </div>

          <div className="relative flex-1 min-w-[220px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar equipo, grupo, ciudad…"
              className="h-9 pl-9"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Fase</label>
            <Select value={stage} onValueChange={(v) => setStage(v as StageFilter)}>
              <SelectTrigger className="h-9 w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                <SelectItem value="group">Fase de grupos</SelectItem>
                <SelectItem value="r32">1/16 Final</SelectItem>
                <SelectItem value="r16">Octavos</SelectItem>
                <SelectItem value="qf">Cuartos</SelectItem>
                <SelectItem value="sf">Semifinales</SelectItem>
                <SelectItem value="third">3.er puesto</SelectItem>
                <SelectItem value="final">Final</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Estado</label>
            <Select value={status} onValueChange={(v) => setStatus(v as StatusFilter)}>
              <SelectTrigger className="h-9 w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="upcoming">Próximos</SelectItem>
                <SelectItem value="finished">Finalizados</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <p className="text-sm text-muted-foreground">Cargando partidos…</p>
      ) : grouped.length === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center text-sm text-muted-foreground">
          No hay partidos con esos filtros.
        </div>
      ) : (
        grouped.map(([day, items]) => (
          <div key={day}>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {day}
            </h2>
            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {items.map((m) => (
                <MatchCard key={m.id} match={m} onClick={setBetsFor} />
              ))}
            </div>
          </div>
        ))
      )}

      <MatchBetsDialog
        match={betsFor}
        open={!!betsFor}
        onOpenChange={(o) => !o && setBetsFor(null)}
      />
    </div>
  );
}
