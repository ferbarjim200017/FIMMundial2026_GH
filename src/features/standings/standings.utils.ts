import type { GroupId, Match, MatchResult } from "@/types/domain";

// ============================================================
// Standings (clasificación de grupos)
// ============================================================

export interface TeamStanding {
  teamLabel: string;            // nombre mostrado (homeLabel / awayLabel)
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDiff: number;
  yellow: number;
  red: number;
  fairPlay: number;             // -(yellow*1 + red*3)
  points: number;
  rank?: number;                // asignado tras ordenar
}

const FAIR_PLAY_YELLOW = -1;
const FAIR_PLAY_RED = -3;

function emptyStanding(label: string): TeamStanding {
  return {
    teamLabel: label,
    played: 0,
    won: 0,
    drawn: 0,
    lost: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    goalDiff: 0,
    yellow: 0,
    red: 0,
    fairPlay: 0,
    points: 0,
  };
}

function applyResult(
  s: TeamStanding,
  goalsFor: number,
  goalsAgainst: number,
  yellow: number,
  red: number
): void {
  s.played += 1;
  s.goalsFor += goalsFor;
  s.goalsAgainst += goalsAgainst;
  s.goalDiff = s.goalsFor - s.goalsAgainst;
  s.yellow += yellow;
  s.red += red;
  s.fairPlay = s.yellow * FAIR_PLAY_YELLOW + s.red * FAIR_PLAY_RED;

  if (goalsFor > goalsAgainst) {
    s.won += 1;
    s.points += 3;
  } else if (goalsFor === goalsAgainst) {
    s.drawn += 1;
    s.points += 1;
  } else {
    s.lost += 1;
  }
}

/**
 * Calcula la tabla de un grupo a partir de los partidos finalizados.
 * Solo cuenta partidos `stage === "group"` con `status === "finished"`.
 * Ordena por puntos → diferencia de goles → goles a favor → fair play.
 */
export function computeGroupStandings(
  groupId: GroupId,
  matches: Match[]
): TeamStanding[] {
  const groupMatches = matches.filter(
    (m) => m.stage === "group" && m.groupId === groupId
  );

  // Conjunto de equipos del grupo (a partir de TODOS los partidos del grupo,
  // incluso los no jugados, para mostrar 0-0-0 antes de que empiece)
  const labels = new Set<string>();
  for (const m of groupMatches) {
    labels.add(m.homeLabel);
    labels.add(m.awayLabel);
  }

  const standings = new Map<string, TeamStanding>();
  for (const label of labels) standings.set(label, emptyStanding(label));

  for (const m of groupMatches) {
    if (m.status !== "finished" || !m.result) continue;
    const r = m.result;
    const home = standings.get(m.homeLabel);
    const away = standings.get(m.awayLabel);
    if (!home || !away) continue;
    applyResult(home, r.homeGoals, r.awayGoals, r.homeYellow, r.homeRed);
    applyResult(away, r.awayGoals, r.homeGoals, r.awayYellow, r.awayRed);
  }

  const ordered = [...standings.values()].sort(compareStandings);
  ordered.forEach((s, idx) => (s.rank = idx + 1));
  return ordered;
}

/**
 * Criterios de orden FIFA dentro de un grupo:
 *  1. Puntos
 *  2. Diferencia de goles
 *  3. Goles a favor
 *  4. Fair play
 *  (Los criterios head-to-head se aplicarían entre equipos empatados, pero
 *   con datos manuales y para un grupo de amigos, la regla global es
 *   suficiente y mucho más predecible.)
 */
function compareStandings(a: TeamStanding, b: TeamStanding): number {
  if (b.points !== a.points) return b.points - a.points;
  if (b.goalDiff !== a.goalDiff) return b.goalDiff - a.goalDiff;
  if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
  if (b.fairPlay !== a.fairPlay) return b.fairPlay - a.fairPlay;
  return a.teamLabel.localeCompare(b.teamLabel);
}

// ============================================================
// Tabla de los 12 terceros (criterios FIFA)
// ============================================================

export interface ThirdPlaceEntry {
  groupId: GroupId;
  teamLabel: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDiff: number;
  yellow: number;
  red: number;
  fairPlay: number;
  points: number;
  qualified: boolean;
}

/**
 * Construye la tabla de los terceros clasificados de cada grupo, ordenada
 * según el reglamento FIFA, y marca los 8 mejores como `qualified`.
 *
 *  1. Mayor cantidad de puntos
 *  2. Diferencia de goles
 *  3. Mayor cantidad de goles a favor
 *  4. Puntuación Fair Play
 *  5. Ranking FIFA (no disponible aquí — desempate alfabético)
 */
export function computeBestThirds(
  allGroupIds: readonly GroupId[],
  matches: Match[]
): ThirdPlaceEntry[] {
  const entries: ThirdPlaceEntry[] = [];

  for (const g of allGroupIds) {
    const standings = computeGroupStandings(g, matches);
    const third = standings[2];
    if (!third) continue;
    // Solo lo añadimos si ese tercer puesto ha jugado al menos un partido
    if (third.played === 0) continue;
    entries.push({
      groupId: g,
      teamLabel: third.teamLabel,
      played: third.played,
      won: third.won,
      drawn: third.drawn,
      lost: third.lost,
      goalsFor: third.goalsFor,
      goalsAgainst: third.goalsAgainst,
      goalDiff: third.goalDiff,
      yellow: third.yellow,
      red: third.red,
      fairPlay: third.fairPlay,
      points: third.points,
      qualified: false,
    });
  }

  entries.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.goalDiff !== a.goalDiff) return b.goalDiff - a.goalDiff;
    if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
    if (b.fairPlay !== a.fairPlay) return b.fairPlay - a.fairPlay;
    return a.teamLabel.localeCompare(b.teamLabel);
  });

  for (let i = 0; i < entries.length; i++) {
    entries[i].qualified = i < 8;
  }
  return entries;
}
