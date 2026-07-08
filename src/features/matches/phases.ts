import type { Bet, Match, MatchStage } from "@/types/domain";
import { betMatchIds } from "@/features/bets/bets.utils";

// ============================================================
// Fases del ranking (agrupación de las fases del Mundial)
// ============================================================
/**
 * El ranking de apuestas se puede ver por "fases" para que el knockout
 * empiece desde 0 sin perder lo de grupos:
 *
 *  - "general": todo el torneo (comportamiento clásico).
 *  - "grupos":  solo apuestas de la fase de grupos.
 *  - "previa":  Segunda fase → dieciseisavos (r32) + octavos (r16).
 *  - "final":   Fase final → cuartos (qf) + semis (sf) + 3.er puesto + final.
 *
 * Una apuesta cuenta en una fase si TODOS sus partidos pertenecen a ella
 * ("por fase del partido"); las apuestas a futuro/outright sin partido, o los
 * combos que mezclan fases, solo cuentan en "general".
 */
export type RankingPhase = "general" | "grupos" | "previa" | "final";

/** Orden en que se ofrecen las fases en el desplegable. */
export const RANKING_PHASES: RankingPhase[] = [
  "general",
  "grupos",
  "previa",
  "final",
];

export const RANKING_PHASE_LABELS: Record<RankingPhase, string> = {
  general: "General",
  grupos: "Fase de grupos",
  previa: "Segunda fase",
  final: "Fase final",
};

export const RANKING_PHASE_DESC: Record<RankingPhase, string> = {
  general: "Todo el torneo (todas las apuestas).",
  grupos: "Solo apuestas de la fase de grupos.",
  previa: "Dieciseisavos y octavos.",
  final: "Cuartos, semifinales y final.",
};

/** Fases del Mundial agrupadas en "Segunda fase" y "Fase final" (para el
 *  cuadro eliminatorio). El 3.er puesto se muestra aparte. */
export const PREVIA_STAGES: MatchStage[] = ["r32", "r16"];
export const FINAL_STAGES: MatchStage[] = ["qf", "sf", "final"];

/** Mapea una fase de partido a su grupo de ranking (sin "general"). */
export function phaseOfStage(
  stage: MatchStage
): Exclude<RankingPhase, "general"> {
  if (stage === "group") return "grupos";
  if (stage === "r32" || stage === "r16") return "previa";
  return "final"; // qf, sf, third, final
}

/**
 * Fase "actual" del torneo, para preseleccionar el ranking:
 *  - Si la final ya se jugó → "general" (torneo terminado).
 *  - Si ya arrancó la fase final (cuartos/semis/3.º/final) → "final".
 *  - Si ya arrancaron las fases previas (16avos/8avos) → "previa".
 *  - En otro caso (aún en grupos o sin knockout) → "general", para no esconder
 *    todavía las apuestas a futuro/outright que sí cuentan en el global.
 * Una fase "ha arrancado" cuando alguno de sus partidos está en juego/terminado
 * o su hora de inicio ya pasó.
 */
export function currentRankingPhase(
  matches: Match[],
  nowMs: number = Date.now()
): RankingPhase {
  const finalMatch = matches.find((m) => m.stage === "final");
  if (finalMatch && finalMatch.status === "finished") return "general";

  const started = (stages: MatchStage[]) =>
    matches.some(
      (m) =>
        stages.includes(m.stage) &&
        (m.status !== "scheduled" || m.kickoffUtc.toMillis() <= nowMs)
    );

  if (started(["qf", "sf", "third", "final"])) return "final";
  if (started(["r32", "r16"])) return "previa";
  return "general";
}

/**
 * True si la apuesta pertenece a la fase de ranking dada. "general" siempre.
 * Para el resto: TODOS los partidos de la apuesta deben caer en esa fase.
 * Apuestas sin partido (outright/manual) solo cuentan en "general".
 */
export function betInRankingPhase(
  bet: Bet,
  phase: RankingPhase,
  stageByMatchId: Map<string, MatchStage>
): boolean {
  if (phase === "general") return true;
  const ids = betMatchIds(bet);
  if (ids.length === 0) return false;
  return ids.every((id) => {
    const st = stageByMatchId.get(id);
    return st != null && phaseOfStage(st) === phase;
  });
}
