import type { GroupId, Match } from "@/types/domain";
import {
  computeBestThirds,
  computeGroupStandings,
} from "@/features/standings/standings.utils";

// Patrones de los placeholders que viene desde el seed
const FIRST_RE = /^1\.º Grupo ([A-L])$/;
const SECOND_RE = /^2\.º Grupo ([A-L])$/;
const BEST3_RE = /^Mejor 3\.º ([A-L/]+)$/;
const WINNER_RE = /^Ganador M(\d+)$/;
const LOSER_RE = /^Perdedor M(\d+)$/;

export interface BracketChange {
  matchId: string;
  field: "homeLabel" | "awayLabel";
  oldLabel: string;
  newLabel: string;
}

export interface BracketPending {
  matchId: string;
  field: "homeLabel" | "awayLabel";
  label: string;
  reason: string;
}

export interface BracketResolutionResult {
  resolved: BracketChange[];
  pending: BracketPending[];
}

const GROUP_IDS_LOCAL: GroupId[] = [
  "A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L",
];

function getWinnerLabel(m: Match): string | null {
  if (m.status !== "finished" || !m.result) return null;
  const r = m.result;
  if (r.homeGoals > r.awayGoals) return m.homeLabel;
  if (r.awayGoals > r.homeGoals) return m.awayLabel;
  if (r.penaltyWinner === "home") return m.homeLabel;
  if (r.penaltyWinner === "away") return m.awayLabel;
  return null;
}

function getLoserLabel(m: Match): string | null {
  if (m.status !== "finished" || !m.result) return null;
  const r = m.result;
  if (r.homeGoals > r.awayGoals) return m.awayLabel;
  if (r.awayGoals > r.homeGoals) return m.homeLabel;
  if (r.penaltyWinner === "home") return m.awayLabel;
  if (r.penaltyWinner === "away") return m.homeLabel;
  return null;
}

/**
 * Calcula los 1.º/2.º clasificados de cada grupo SOLO si ya terminaron
 * los 6 partidos del grupo. Si falta cualquier resultado, devuelve null
 * para ese grupo para evitar resolver con datos incompletos.
 */
function computeFinalGroupRanks(matches: Match[]): Record<GroupId, {
  first: string | null;
  second: string | null;
  isFinal: boolean;
}> {
  const out = {} as Record<GroupId, { first: string | null; second: string | null; isFinal: boolean }>;
  for (const g of GROUP_IDS_LOCAL) {
    const groupMatches = matches.filter(
      (m) => m.stage === "group" && m.groupId === g
    );
    const isFinal =
      groupMatches.length > 0 &&
      groupMatches.every((m) => m.status === "finished");
    const standings = computeGroupStandings(g, matches);
    out[g] = {
      first: isFinal ? standings[0]?.teamLabel ?? null : null,
      second: isFinal ? standings[1]?.teamLabel ?? null : null,
      isFinal,
    };
  }
  return out;
}

/**
 * Asigna greedy los 8 mejores terceros a sus slots "Mejor 3.º X/Y/Z/W/V"
 * del bracket. Recorre los terceros en orden de ranking (mejor primero) y
 * para cada uno busca el primer slot vacío cuyo grupo permitido contenga
 * la letra del grupo del tercero. Esto no replica exactamente la tabla
 * combinatoria oficial de la FIFA (495 entradas) pero produce una
 * asignación válida y determinista.
 */
function assignThirds(matches: Match[]): Map<string, string> {
  const assignments = new Map<string, string>();
  const usedTeams = new Set<string>();

  const slots: Array<{
    key: string;
    allowed: Set<string>;
  }> = [];
  for (const m of matches) {
    if (m.stage !== "r32") continue;
    for (const field of ["homeLabel", "awayLabel"] as const) {
      const label = m[field];
      const mt = label.match(BEST3_RE);
      if (mt) {
        slots.push({
          key: `${m.id}:${field}`,
          allowed: new Set(mt[1].split("/")),
        });
      }
    }
  }

  if (slots.length === 0) return assignments;

  // ¿Acabaron TODOS los grupos? Si no, no asignamos terceros (datos parciales).
  const groupRanks = computeFinalGroupRanks(matches);
  const allGroupsFinished = GROUP_IDS_LOCAL.every((g) => groupRanks[g].isFinal);
  if (!allGroupsFinished) return assignments;

  const thirds = computeBestThirds(GROUP_IDS_LOCAL, matches).filter(
    (t) => t.qualified
  );

  for (const third of thirds) {
    if (usedTeams.has(third.teamLabel)) continue;
    const slot = slots.find(
      (s) => !assignments.has(s.key) && s.allowed.has(third.groupId)
    );
    if (slot) {
      assignments.set(slot.key, third.teamLabel);
      usedTeams.add(third.teamLabel);
    }
  }

  return assignments;
}

/**
 * Resuelve placeholders de los partidos eliminatorios a equipos reales,
 * iterando hasta que no haya más cambios. Cada pasada propaga ganadores
 * de una ronda a la siguiente (r32 → r16 → qf → sf → final/3.º).
 */
export function resolveBracket(matches: Match[]): BracketResolutionResult {
  const working = new Map<string, Match>();
  for (const m of matches) working.set(m.id, { ...m });

  const groupRanks = computeFinalGroupRanks(matches);
  const thirds = assignThirds(matches);

  const allChanges: BracketChange[] = [];
  let lastPending: BracketPending[] = [];

  let iters = 0;
  let changed = true;
  while (changed && iters < 8) {
    changed = false;
    iters += 1;
    lastPending = [];

    const arr = [...working.values()];
    for (const m of arr) {
      if (m.stage === "group") continue;
      for (const field of ["homeLabel", "awayLabel"] as const) {
        const label = m[field];

        let newLabel: string | null = null;
        let reason: string | null = null;

        let mt: RegExpMatchArray | null;
        if ((mt = label.match(FIRST_RE))) {
          const g = mt[1] as GroupId;
          const rank = groupRanks[g];
          if (!rank?.isFinal) {
            reason = `Faltan partidos del Grupo ${g} por jugarse`;
          } else {
            newLabel = rank.first;
            if (!newLabel) reason = `Sin 1.º del Grupo ${g}`;
          }
        } else if ((mt = label.match(SECOND_RE))) {
          const g = mt[1] as GroupId;
          const rank = groupRanks[g];
          if (!rank?.isFinal) {
            reason = `Faltan partidos del Grupo ${g} por jugarse`;
          } else {
            newLabel = rank.second;
            if (!newLabel) reason = `Sin 2.º del Grupo ${g}`;
          }
        } else if (label.match(BEST3_RE)) {
          newLabel = thirds.get(`${m.id}:${field}`) ?? null;
          if (!newLabel) {
            const allGroupsFinished = GROUP_IDS_LOCAL.every(
              (g) => groupRanks[g].isFinal
            );
            reason = allGroupsFinished
              ? "No se pudo asignar un tercero clasificado a esta plaza"
              : "Pendiente: necesita que terminen todos los grupos";
          }
        } else if ((mt = label.match(WINNER_RE))) {
          const n = Number(mt[1]);
          const source = working.get(`wc26-m${n}`);
          if (!source) {
            reason = `No se encuentra el partido M${n}`;
          } else {
            newLabel = getWinnerLabel(source);
            if (!newLabel) reason = `M${n} sin ganador (pendiente o empate sin penaltis)`;
          }
        } else if ((mt = label.match(LOSER_RE))) {
          const n = Number(mt[1]);
          const source = working.get(`wc26-m${n}`);
          if (!source) {
            reason = `No se encuentra el partido M${n}`;
          } else {
            newLabel = getLoserLabel(source);
            if (!newLabel) reason = `M${n} sin perdedor (pendiente o empate sin penaltis)`;
          }
        } else {
          // No es un placeholder reconocible — ya está rellenado, no tocar.
          continue;
        }

        if (newLabel && newLabel !== label) {
          const updated = { ...working.get(m.id)! };
          updated[field] = newLabel;
          working.set(m.id, updated);
          allChanges.push({ matchId: m.id, field, oldLabel: label, newLabel });
          changed = true;
        } else if (!newLabel && reason) {
          lastPending.push({ matchId: m.id, field, label, reason });
        }
      }
    }
  }

  return { resolved: allChanges, pending: lastPending };
}

