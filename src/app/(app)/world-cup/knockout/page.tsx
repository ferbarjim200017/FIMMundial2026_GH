"use client";

import { useEffect, useState } from "react";
import { MatchCard } from "@/components/world-cup/match-card";
import { MatchBetsDialog } from "@/components/world-cup/match-bets-dialog";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { subscribeToMatches } from "@/features/matches/matches.service";
import { resolveBracketProvisional } from "@/features/matches/bracket-resolver";
import { WORLDCUP_2026_MATCHES } from "@/features/matches/worldcup-fixtures";
import { STAGE_STYLES } from "@/features/matches/stage-styles";
import { cn } from "@/lib/utils";
import type { Match, MatchStage } from "@/types/domain";

const BRACKET_STAGES: MatchStage[] = ["r32", "r16", "qf", "sf", "final"];

// ── Lados del cuadro (izquierda / derecha) ──────────────────────────────────
// Se derivan UNA vez del seed estático: la final referencia las 2 semis; el
// subárbol de la primera semi es la mitad izquierda y el de la segunda, la
// derecha. (La estructura del cuadro no cambia con los resultados.)
const matchNum = (id: string) => Number(id.replace("wc26-m", ""));
const BRACKET_SIDES: { left: Set<number>; right: Set<number> } = (() => {
  const sources = new Map<number, number[]>();
  for (const m of WORLDCUP_2026_MATCHES) {
    if (m.stage === "group") continue;
    const srcs: number[] = [];
    for (const label of [m.homeLabel, m.awayLabel]) {
      const mt = label.match(/^(?:Ganador|Perdedor) M(\d+)$/);
      if (mt) srcs.push(Number(mt[1]));
    }
    sources.set(matchNum(m.seedId), srcs);
  }
  const left = new Set<number>();
  const right = new Set<number>();
  const fin = WORLDCUP_2026_MATCHES.find((m) => m.stage === "final");
  const collect = (root: number | null, set: Set<number>) => {
    if (root == null) return;
    const stack = [root];
    while (stack.length) {
      const cur = stack.pop()!;
      if (set.has(cur)) continue;
      set.add(cur);
      for (const s of sources.get(cur) ?? []) stack.push(s);
    }
  };
  if (fin) {
    const srcOf = (label: string) => {
      const mt = label.match(/M(\d+)/);
      return mt ? Number(mt[1]) : null;
    };
    collect(srcOf(fin.homeLabel), left);
    collect(srcOf(fin.awayLabel), right);
  }
  return { left, right };
})();

export default function KnockoutPage() {
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [betsFor, setBetsFor] = useState<Match | null>(null);
  // Vista del cuadro: columnas (todo hacia abajo) o cuadro a dos lados.
  const [view, setView] = useState<"columns" | "bracket">("columns");

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

  if (loading) return <p className="text-sm text-muted-foreground">Cargando…</p>;

  const knockout = matches.filter((m) => m.stage !== "group");
  if (knockout.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-12 text-center text-sm text-muted-foreground">
        Aún no hay eliminatorias cargadas.
      </div>
    );
  }

  const byStage: Record<MatchStage, Match[]> = {
    group: [],
    r32: [],
    r16: [],
    qf: [],
    sf: [],
    third: [],
    final: [],
  };
  for (const m of knockout) {
    byStage[m.stage].push(m);
  }
  for (const s of BRACKET_STAGES) {
    byStage[s].sort((a, b) => a.kickoffUtc.toMillis() - b.kickoffUtc.toMillis());
  }
  byStage.third.sort((a, b) => a.kickoffUtc.toMillis() - b.kickoffUtc.toMillis());

  const presentStages = BRACKET_STAGES.filter((s) => byStage[s].length > 0);

  // Resolución PROVISIONAL del cuadro con la clasificación actual (se recalcula
  // en cada render, así cada resultado nuevo actualiza los cruces). No persiste.
  const overrides = resolveBracketProvisional(matches);
  const displayProps = (m: Match) => {
    const ov = overrides.get(m.id);
    const sub = (s: { slot: string; provisional: boolean } | null | undefined) =>
      s ? `${s.slot}${s.provisional ? " · prov." : ""}` : undefined;
    return {
      match: {
        ...m,
        homeLabel: ov?.home?.team ?? m.homeLabel,
        awayLabel: ov?.away?.team ?? m.awayLabel,
      },
      homeSub: sub(ov?.home),
      awaySub: sub(ov?.away),
    };
  };

  // Columnas para la vista "cuadro a dos lados": mitad izquierda → final → mitad
  // derecha (las columnas de la derecha van en orden inverso para que apunten
  // hacia el centro).
  const sideOf = (m: Match): "left" | "right" | "center" =>
    BRACKET_SIDES.left.has(matchNum(m.id))
      ? "left"
      : BRACKET_SIDES.right.has(matchNum(m.id))
        ? "right"
        : "center";
  type BracketCol = { stage: MatchStage; side: "left" | "right" | "center"; items: Match[] };
  const bracketCols: BracketCol[] = [];
  for (const s of ["r32", "r16", "qf", "sf"] as MatchStage[]) {
    const items = byStage[s].filter((m) => sideOf(m) === "left");
    if (items.length) bracketCols.push({ stage: s, side: "left", items });
  }
  if (byStage.final.length)
    bracketCols.push({ stage: "final", side: "center", items: byStage.final });
  for (const s of ["sf", "qf", "r16", "r32"] as MatchStage[]) {
    const items = byStage[s].filter((m) => sideOf(m) === "right");
    if (items.length) bracketCols.push({ stage: s, side: "right", items });
  }

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden border-yellow-500/40 bg-gradient-to-br from-yellow-500/10 via-amber-500/5 to-transparent">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            🏆 Cuadro eliminatorio
          </CardTitle>
          <CardDescription>
            Los cruces se rellenan con la clasificación{" "}
            <span className="font-medium">actual</span> de los grupos (marcados
            «prov.»); se actualizan con cada resultado hasta que terminen los
            grupos.
          </CardDescription>
          <div className="mt-3 inline-flex rounded-lg border bg-background/60 p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setView("columns")}
              className={cn(
                "rounded-md px-3 py-1 font-medium transition-colors",
                view === "columns"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              Columnas
            </button>
            <button
              type="button"
              onClick={() => setView("bracket")}
              className={cn(
                "rounded-md px-3 py-1 font-medium transition-colors",
                view === "bracket"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              Cuadro (2 lados)
            </button>
          </div>
        </CardHeader>
      </Card>

      {/* ──────────── Vista columnas (todo hacia abajo) ──────────── */}
      {view === "columns" && (
      <div className="overflow-x-auto rounded-xl border bg-card/40 p-4">
        <div
          className="grid min-w-[1100px] gap-4"
          style={{
            gridTemplateColumns: `repeat(${presentStages.length}, minmax(220px, 1fr))`,
            minHeight: "640px",
          }}
        >
          {presentStages.map((stage) => {
            const style = STAGE_STYLES[stage];
            const items = byStage[stage];
            return (
              <div key={stage} className="flex flex-col">
                <div
                  className={cn(
                    "mb-3 flex items-center justify-between rounded-md px-2 py-1 text-xs font-semibold uppercase tracking-wider",
                    style.chip
                  )}
                >
                  <span>
                    {style.emoji} {style.label}
                  </span>
                  <span className="opacity-70">({items.length})</span>
                </div>
                <div className="relative flex flex-1 flex-col justify-around gap-2">
                  {items.map((m) => (
                    <div
                      key={m.id}
                      className={cn(
                        "relative rounded-lg bg-gradient-to-br p-[1px]",
                        style.gradient
                      )}
                    >
                      <MatchCard
                        {...displayProps(m)}
                        compact
                        className="bg-card"
                        onClick={setBetsFor}
                      />
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      )}

      {/* ──────────── Vista cuadro a dos lados (final en el centro) ──────────── */}
      {view === "bracket" && (
        <div className="overflow-x-auto rounded-xl border bg-card/40 p-4">
          <div
            className="flex gap-3"
            style={{
              minWidth: `${bracketCols.length * 210}px`,
              minHeight: "640px",
            }}
          >
            {bracketCols.map((col, i) => {
              const style = STAGE_STYLES[col.stage];
              const arrow =
                col.side === "left" ? " →" : col.side === "right" ? " ←" : "";
              return (
                <div
                  key={`${col.stage}-${col.side}-${i}`}
                  className="flex min-w-[200px] flex-1 flex-col"
                >
                  <div
                    className={cn(
                      "mb-3 flex items-center justify-between rounded-md px-2 py-1 text-xs font-semibold uppercase tracking-wider",
                      style.chip
                    )}
                  >
                    <span>
                      {style.emoji} {style.label}
                      {arrow}
                    </span>
                    <span className="opacity-70">({col.items.length})</span>
                  </div>
                  <div className="relative flex flex-1 flex-col justify-around gap-2">
                    {col.items.map((m) => (
                      <div
                        key={m.id}
                        className={cn(
                          "relative rounded-lg bg-gradient-to-br p-[1px]",
                          style.gradient
                        )}
                      >
                        <MatchCard
                          {...displayProps(m)}
                          compact
                          className="bg-card"
                          onClick={setBetsFor}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ──────────── 3.er puesto, mostrado aparte ──────────── */}
      {byStage.third.length > 0 && (
        <Card className="border-amber-500/40 bg-gradient-to-br from-amber-500/10 via-amber-500/5 to-transparent">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              🥉 3.er puesto
            </CardTitle>
            <CardDescription>
              Partido por la medalla de bronce.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2 sm:grid-cols-2">
              {byStage.third.map((m) => (
                <MatchCard key={m.id} {...displayProps(m)} onClick={setBetsFor} />
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <MatchBetsDialog
        match={betsFor}
        open={!!betsFor}
        onOpenChange={(o) => !o && setBetsFor(null)}
      />
    </div>
  );
}
