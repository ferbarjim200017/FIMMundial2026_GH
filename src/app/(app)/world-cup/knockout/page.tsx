"use client";

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
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
import { PREVIA_STAGES, FINAL_STAGES } from "@/features/matches/phases";
import { TeamFlag } from "@/components/matches/team-flag";
import { teamFlagCode } from "@/features/matches/teams-2026";
import { cn } from "@/lib/utils";
import type { Match, MatchStage } from "@/types/domain";

/** Código corto para la vista mini: ARG, 2ºA, G73… */
function abbrev(label: string): string {
  if (teamFlagCode(label)) {
    return label
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-zA-Z]/g, "")
      .slice(0, 3)
      .toUpperCase();
  }
  let mt: RegExpMatchArray | null;
  if ((mt = label.match(/^1\.º Grupo ([A-L])$/))) return `1º${mt[1]}`;
  if ((mt = label.match(/^2\.º Grupo ([A-L])$/))) return `2º${mt[1]}`;
  if (label.match(/^Mejor 3\.º/)) return "3º";
  if ((mt = label.match(/^Ganador M(\d+)$/))) return `G${mt[1]}`;
  if ((mt = label.match(/^Perdedor M(\d+)$/))) return `P${mt[1]}`;
  return label.slice(0, 4);
}

/** Tarjeta minúscula para el cuadro a dos lados (cabe entero sin scroll). */
function MiniBracketCard({
  match,
  onClick,
}: {
  match: Match;
  onClick: (m: Match) => void;
}) {
  const finished = match.status === "finished" && match.result;
  const r = match.result;
  const row = (label: string, score: number | null, win: boolean) => {
    const hasFlag = !!teamFlagCode(label);
    return (
      <div className="flex items-center justify-between gap-0.5">
        <span className="flex min-w-0 items-center gap-0.5">
          <TeamFlag name={label} className="h-2.5 w-3.5" />
          {/* Con bandera, el código solo en PC; sin bandera (placeholders),
              siempre (si no, la celda quedaría vacía en móvil). */}
          <span
            className={cn(
              "truncate",
              hasFlag ? "hidden sm:inline" : "inline",
              win && "font-bold"
            )}
          >
            {abbrev(label)}
          </span>
        </span>
        {score != null && (
          <span className={cn("font-mono", win && "font-bold text-profit")}>{score}</span>
        )}
      </div>
    );
  };
  // Ganador (para resaltar): mayor marcador final, o el de los penaltis si
  // quedó empate. homeGoals/awayGoals ya es el marcador final (tras prórroga).
  const homeWin =
    !!finished &&
    (r!.homeGoals > r!.awayGoals ||
      (r!.homeGoals === r!.awayGoals && r!.penaltyWinner === "home"));
  const awayWin =
    !!finished &&
    (r!.awayGoals > r!.homeGoals ||
      (r!.homeGoals === r!.awayGoals && r!.penaltyWinner === "away"));
  return (
    <button
      type="button"
      onClick={() => onClick(match)}
      className="w-full rounded border bg-card px-1 py-0.5 text-left text-[9px] leading-tight transition-colors hover:bg-accent/40"
    >
      {row(match.homeLabel, finished ? r!.homeGoals : null, homeWin)}
      {row(match.awayLabel, finished ? r!.awayGoals : null, awayWin)}
    </button>
  );
}

/**
 * Columna de CONECTORES entre dos rondas del cuadro (las líneas que unen cada
 * pareja de partidos con el de la ronda siguiente, como en el cuadro oficial).
 * Geometría en porcentajes: con `n` partidos de origen (centrados por `flex-1`),
 * el partido i está al `(i+0.5)/n` de la altura; cada pareja (2k, 2k+1) se une
 * con una línea vertical y sale una horizontal hacia el partido siguiente.
 *  - dir="right": orígenes a la izquierda, salida a la derecha.
 *  - dir="left":  orígenes a la derecha, salida a la izquierda (lado derecho).
 */
function BracketConnector({ n, dir }: { n: number; dir: "right" | "left" }) {
  const feedersLeft = dir === "right";
  const hLine = (top: number, fromLeft: number): CSSProperties => ({
    position: "absolute",
    top: `${top}%`,
    left: `${fromLeft}%`,
    width: "50%",
    height: "1px",
  });
  const segments: CSSProperties[] = [];
  for (let k = 0; k < Math.ceil(n / 2); k++) {
    const a = 2 * k;
    const b = Math.min(2 * k + 1, n - 1);
    const ya = ((a + 0.5) / n) * 100;
    const yb = ((b + 0.5) / n) * 100;
    const ymid = (ya + yb) / 2;
    // Horizontales de cada origen hacia el bus vertical (centro de la columna).
    segments.push(hLine(ya, feedersLeft ? 0 : 50));
    segments.push(hLine(yb, feedersLeft ? 0 : 50));
    // Bus vertical que une la pareja.
    if (yb > ya) {
      segments.push({
        position: "absolute",
        left: "50%",
        top: `${ya}%`,
        height: `${yb - ya}%`,
        width: "1px",
      });
    }
    // Horizontal de salida hacia el partido de la ronda siguiente.
    segments.push(hLine(ymid, feedersLeft ? 50 : 0));
  }
  return (
    <div className="flex w-2.5 shrink-0 flex-col sm:w-5">
      {/* Espaciador de la MISMA altura fija que la cabecera de ronda (h-5 +
          mb-1.5), para que el cuerpo del conector arranque exactamente a la
          misma altura que el de las columnas y las líneas caigan en el centro
          de cada tarjeta. */}
      <div className="mb-1.5 h-5" aria-hidden />
      <div className="relative flex-1">
        {segments.map((s, i) => (
          <span key={i} className="absolute bg-border" style={s} />
        ))}
      </div>
    </div>
  );
}

/** Sección plegable para agrupar fases del cuadro (Fases previas / Fase final). */
function CollapsibleSection({
  open,
  onToggle,
  title,
  subtitle,
  emoji,
  count,
  children,
}: {
  open: boolean;
  onToggle: () => void;
  title: string;
  subtitle?: string;
  emoji?: string;
  count?: number;
  children: ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-xl border bg-card/40">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-accent/30"
      >
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
            !open && "-rotate-90"
          )}
        />
        {emoji && <span className="text-base">{emoji}</span>}
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold leading-tight">
            {title}
          </span>
          {subtitle && (
            <span className="block text-xs text-muted-foreground">
              {subtitle}
            </span>
          )}
        </span>
        {count != null && (
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
            {count}
          </span>
        )}
      </button>
      {open && <div className="border-t p-3">{children}</div>}
    </div>
  );
}

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

// Orden VERTICAL del cuadro (como el cuadro oficial): recorrido in-order del
// árbol (hijo-home arriba · nodo · hijo-away abajo) desde la final. Así los dos
// partidos que se cruzan en la ronda siguiente quedan adyacentes, en vez de
// ordenarse por hora. Map<nº de partido, índice vertical>.
const BRACKET_ORDER: Map<number, number> = (() => {
  const sources = new Map<number, [number?, number?]>();
  for (const m of WORLDCUP_2026_MATCHES) {
    if (m.stage === "group") continue;
    const srcs: number[] = [];
    for (const label of [m.homeLabel, m.awayLabel]) {
      const mt = label.match(/^(?:Ganador|Perdedor) M(\d+)$/);
      if (mt) srcs.push(Number(mt[1]));
    }
    sources.set(matchNum(m.seedId), [srcs[0], srcs[1]]);
  }
  const order = new Map<number, number>();
  let idx = 0;
  const visit = (n: number | undefined) => {
    if (n == null) return;
    const [h, a] = sources.get(n) ?? [];
    if (h == null && a == null) {
      order.set(n, idx++); // hoja (dieciseisavos)
      return;
    }
    visit(h);
    order.set(n, idx++);
    visit(a);
  };
  const fin = WORLDCUP_2026_MATCHES.find((m) => m.stage === "final");
  if (fin) visit(matchNum(fin.seedId));
  return order;
})();

export default function KnockoutPage() {
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [betsFor, setBetsFor] = useState<Match | null>(null);
  // Vista del cuadro: cuadro a dos lados (por defecto) o columnas hacia abajo.
  const [view, setView] = useState<"columns" | "bracket">("bracket");
  // Desplegables de la vista por columnas: "Fases previas" y "Fase final".
  const [openPrev, setOpenPrev] = useState(true);
  const [openFinal, setOpenFinal] = useState(true);

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

  // Rejilla de columnas (una por fase) para un conjunto de fases dado. Se usa
  // dentro de cada desplegable ("Fases previas" / "Fase final").
  const renderColumns = (stages: MatchStage[]) => {
    const present = stages.filter((s) => byStage[s].length > 0);
    if (present.length === 0) {
      return (
        <p className="px-4 py-8 text-center text-sm text-muted-foreground">
          Aún no disponible.
        </p>
      );
    }
    return (
      <div className="overflow-x-auto rounded-lg border bg-card/40 p-4">
        <div
          className="grid gap-4"
          style={{
            gridTemplateColumns: `repeat(${present.length}, minmax(220px, 1fr))`,
            minWidth: present.length > 1 ? `${present.length * 240}px` : undefined,
            minHeight: "560px",
          }}
        >
          {present.map((stage) => {
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
    );
  };

  // Cuadro a dos lados (estructura del árbol): mitad izquierda → final → mitad
  // derecha. Dentro de cada ronda los partidos van en ORDEN DEL CUADRO
  // (recorrido in-order, BRACKET_ORDER), NO por hora, para que cada partido
  // quede pegado a su pareja igual que en el cuadro oficial. Entre cada par de
  // rondas se intercala una columna de conectores.
  const sideOf = (m: Match): "left" | "right" | "center" =>
    BRACKET_SIDES.left.has(matchNum(m.id))
      ? "left"
      : BRACKET_SIDES.right.has(matchNum(m.id))
        ? "right"
        : "center";
  const orderIdx = (m: Match) => BRACKET_ORDER.get(matchNum(m.id)) ?? 0;
  const colItems = (stage: MatchStage, side: "left" | "right") =>
    byStage[stage]
      .filter((m) => sideOf(m) === side)
      .sort((a, b) => orderIdx(a) - orderIdx(b));

  type BCol =
    | {
        kind: "round";
        stage: MatchStage;
        side: "left" | "right" | "center";
        items: Match[];
      }
    | { kind: "conn"; n: number; dir: "right" | "left"; key: string };

  const leftRounds = (["r32", "r16", "qf", "sf"] as MatchStage[])
    .map((stage) => ({ stage, items: colItems(stage, "left") }))
    .filter((c) => c.items.length > 0);
  const rightRounds = (["sf", "qf", "r16", "r32"] as MatchStage[])
    .map((stage) => ({ stage, items: colItems(stage, "right") }))
    .filter((c) => c.items.length > 0);
  const hasFinal = byStage.final.length > 0;

  const bracketCols: BCol[] = [];
  leftRounds.forEach((c, idx) => {
    bracketCols.push({ kind: "round", stage: c.stage, side: "left", items: c.items });
    if (idx < leftRounds.length - 1 || hasFinal) {
      bracketCols.push({ kind: "conn", n: c.items.length, dir: "right", key: `cl-${c.stage}` });
    }
  });
  if (hasFinal) {
    bracketCols.push({ kind: "round", stage: "final", side: "center", items: byStage.final });
  }
  rightRounds.forEach((c, idx) => {
    if (idx > 0 || hasFinal) {
      bracketCols.push({ kind: "conn", n: c.items.length, dir: "left", key: `cr-${c.stage}` });
    }
    bracketCols.push({ kind: "round", stage: c.stage, side: "right", items: c.items });
  });

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

      {/* ──── Vista columnas, agrupada en Fases previas / Fase final ──── */}
      {view === "columns" && (
        <div className="space-y-4">
          <CollapsibleSection
            open={openPrev}
            onToggle={() => setOpenPrev((o) => !o)}
            title="Fases previas"
            subtitle="Dieciseisavos · Octavos"
            emoji="🎯"
            count={PREVIA_STAGES.reduce((a, s) => a + byStage[s].length, 0)}
          >
            {renderColumns(PREVIA_STAGES)}
          </CollapsibleSection>

          <CollapsibleSection
            open={openFinal}
            onToggle={() => setOpenFinal((o) => !o)}
            title="Fase final"
            subtitle="Cuartos · Semis · Final"
            emoji="🏆"
            count={FINAL_STAGES.reduce((a, s) => a + byStage[s].length, 0)}
          >
            {renderColumns(FINAL_STAGES)}
          </CollapsibleSection>
        </div>
      )}

      {/* ──── Vista cuadro a dos lados: final en el centro, partidos centrados
              entre su pareja y unidos con conectores (como el cuadro oficial) ──── */}
      {view === "bracket" && (
        <div className="overflow-x-auto rounded-xl border bg-card/40 p-1.5 sm:p-3">
          <div className="flex w-full items-stretch" style={{ minHeight: "460px" }}>
            {bracketCols.map((col, i) => {
              if (col.kind === "conn") {
                return <BracketConnector key={col.key} n={col.n} dir={col.dir} />;
              }
              const style = STAGE_STYLES[col.stage];
              const arrow =
                col.side === "left" ? "→" : col.side === "right" ? "←" : "";
              return (
                <div
                  key={`${col.stage}-${col.side}-${i}`}
                  className="flex min-w-0 flex-1 flex-col"
                >
                  <div
                    className={cn(
                      "mb-1.5 flex h-5 items-center justify-center gap-0.5 rounded px-0.5 text-[8px] font-bold uppercase tracking-tight sm:text-[10px]",
                      style.chip
                    )}
                  >
                    <span>{style.emoji}</span>
                    <span className="hidden sm:inline">
                      {style.shortLabel ?? style.label}
                    </span>
                    {arrow && <span>{arrow}</span>}
                  </div>
                  {/* Cada partido en una celda flex-1: al haber la mitad de
                      partidos en la ronda siguiente, su celda ocupa el doble y
                      el partido queda centrado entre su pareja. */}
                  <div className="relative flex flex-1 flex-col">
                    {col.items.map((m) => (
                      <div
                        key={m.id}
                        className="flex flex-1 items-center px-0.5"
                      >
                        <MiniBracketCard
                          match={displayProps(m).match}
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
