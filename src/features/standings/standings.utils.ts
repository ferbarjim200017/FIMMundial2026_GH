import type { GroupId, Match, MatchResult } from "@/types/domain";
import { fifaRank } from "@/features/matches/fifa-ranking";

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
 *  5. Ranking FIFA (menor posición = mejor)
 *  (Los criterios head-to-head se aplicarían entre equipos empatados, pero
 *   con datos manuales y para un grupo de amigos, la regla global es
 *   suficiente y mucho más predecible.)
 */
function compareStandings(a: TeamStanding, b: TeamStanding): number {
  if (b.points !== a.points) return b.points - a.points;
  if (b.goalDiff !== a.goalDiff) return b.goalDiff - a.goalDiff;
  if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
  if (b.fairPlay !== a.fairPlay) return b.fairPlay - a.fairPlay;
  const rankA = fifaRank(a.teamLabel);
  const rankB = fifaRank(b.teamLabel);
  if (rankA !== rankB) return rankA - rankB;
  return a.teamLabel.localeCompare(b.teamLabel);
}

/**
 * Equipos del grupo que YA NO pueden acabar en el top-2 (clasificación directa),
 * pase lo que pase en los partidos que faltan. Lo calcula simulando TODOS los
 * resultados posibles de los partidos pendientes del grupo: si en ningún
 * escenario el equipo termina 1.º o 2.º, está eliminado de la clasificación
 * directa. Devuelve vacío si el grupo aún no está completo o no se ha jugado
 * nada (al principio nadie está eliminado).
 *
 * Nota: un 3.º eliminado del top-2 aún podría colarse como mejor tercero; esto
 * marca la eliminación de la clasificación DIRECTA, que es la lectura práctica
 * de "está fuera" (p. ej. un último de grupo sin opciones).
 */
export function eliminatedFromTop2(
  groupId: GroupId,
  matches: Match[]
): Set<string> {
  const groupMatches = matches.filter(
    (m) => m.stage === "group" && m.groupId === groupId
  );
  const labels = [
    ...new Set(groupMatches.flatMap((m) => [m.homeLabel, m.awayLabel])),
  ];
  if (labels.length < 4) return new Set();

  const finished = groupMatches.filter(
    (m) => m.status === "finished" && m.result
  );
  if (finished.length === 0) return new Set();
  const remaining = groupMatches.filter(
    (m) => !(m.status === "finished" && m.result)
  );

  const base: Record<string, number> = {};
  for (const l of labels) base[l] = 0;
  for (const m of finished) {
    const r = m.result!;
    if (r.homeGoals > r.awayGoals) base[m.homeLabel] += 3;
    else if (r.homeGoals === r.awayGoals) {
      base[m.homeLabel] += 1;
      base[m.awayLabel] += 1;
    } else base[m.awayLabel] += 3;
  }

  const canTop2: Record<string, boolean> = {};
  for (const l of labels) canTop2[l] = false;

  const total = 3 ** remaining.length;
  for (let mask = 0; mask < total; mask++) {
    const pts = { ...base };
    let x = mask;
    for (const m of remaining) {
      const outcome = x % 3;
      x = Math.floor(x / 3);
      if (outcome === 0) pts[m.homeLabel] += 3; // gana local
      else if (outcome === 1) {
        pts[m.homeLabel] += 1; // empate
        pts[m.awayLabel] += 1;
      } else pts[m.awayLabel] += 3; // gana visitante
    }
    for (const l of labels) {
      // Si menos de 2 equipos tienen ESTRICTAMENTE más puntos, este equipo
      // podría quedar 1.º o 2.º (le damos el beneficio del empate).
      const strictlyAbove = labels.filter(
        (o) => o !== l && pts[o] > pts[l]
      ).length;
      if (strictlyAbove < 2) canTop2[l] = true;
    }
  }

  const out = new Set<string>();
  for (const l of labels) if (!canTop2[l]) out.add(l);
  return out;
}

/**
 * Equipos del grupo que YA TIENEN ASEGURADO el top-2 (clasificación DIRECTA)
 * pase lo que pase en los partidos pendientes del grupo. Es el "dual" de
 * `eliminatedFromTop2`, pero PESIMISTA con los desempates: como la diferencia
 * de goles de los partidos que faltan no se puede prever, un equipo solo se
 * considera clasificado MATEMÁTICAMENTE si termina 1.º o 2.º en TODOS los
 * escenarios posibles, incluso perdiendo cualquier desempate (peor caso).
 *
 *  - Si el grupo ya ha terminado: el 1.º y el 2.º reales están asegurados.
 *  - Si quedan partidos: simula todos los resultados posibles de los pendientes
 *    y exige que en NINGÚN escenario haya 2 o más equipos con puntos >= a los
 *    suyos (si los hubiera, podría caer al 3.º por desempate).
 *
 * Sirve para distinguir "va 1.º/2.º en la foto actual" de "ya no se le puede
 * escapar la clasificación directa".
 */
export function guaranteedTop2(
  groupId: GroupId,
  matches: Match[]
): Set<string> {
  const groupMatches = matches.filter(
    (m) => m.stage === "group" && m.groupId === groupId
  );
  const labels = [
    ...new Set(groupMatches.flatMap((m) => [m.homeLabel, m.awayLabel])),
  ];
  if (labels.length < 4) return new Set();

  const finished = groupMatches.filter(
    (m) => m.status === "finished" && m.result
  );
  if (finished.length === 0) return new Set();
  const remaining = groupMatches.filter(
    (m) => !(m.status === "finished" && m.result)
  );

  // Grupo terminado: el 1.º y el 2.º reales ya están clasificados directos.
  if (remaining.length === 0) {
    const st = computeGroupStandings(groupId, matches);
    const out = new Set<string>();
    if (st[0] && st[0].played > 0) out.add(st[0].teamLabel);
    if (st[1] && st[1].played > 0) out.add(st[1].teamLabel);
    return out;
  }

  const base: Record<string, number> = {};
  for (const l of labels) base[l] = 0;
  for (const m of finished) {
    const r = m.result!;
    if (r.homeGoals > r.awayGoals) base[m.homeLabel] += 3;
    else if (r.homeGoals === r.awayGoals) {
      base[m.homeLabel] += 1;
      base[m.awayLabel] += 1;
    } else base[m.awayLabel] += 3;
  }

  // Asumimos que todos están asegurados y descartamos a quien, en algún
  // escenario, podría quedar fuera del top-2 (peor caso de desempates).
  const safe: Record<string, boolean> = {};
  for (const l of labels) safe[l] = true;

  const total = 3 ** remaining.length;
  for (let mask = 0; mask < total; mask++) {
    const pts = { ...base };
    let x = mask;
    for (const m of remaining) {
      const outcome = x % 3;
      x = Math.floor(x / 3);
      if (outcome === 0) pts[m.homeLabel] += 3;
      else if (outcome === 1) {
        pts[m.homeLabel] += 1;
        pts[m.awayLabel] += 1;
      } else pts[m.awayLabel] += 3;
    }
    for (const l of labels) {
      // Peor caso: cualquiera con puntos >= a los míos podría quedar por encima
      // (perdería el desempate). Si hay 2 o más, podría caer al 3.º.
      const geqOrAbove = labels.filter(
        (o) => o !== l && pts[o] >= pts[l]
      ).length;
      if (geqOrAbove > 1) safe[l] = false;
    }
  }

  const out = new Set<string>();
  for (const l of labels) {
    const played = finished.some(
      (m) => m.homeLabel === l || m.awayLabel === l
    );
    if (safe[l] && played) out.add(l);
  }
  return out;
}

/**
 * Equipos del grupo REALMENTE eliminados del Mundial (no solo de la directa).
 * Como en el formato 2026 los 8 MEJORES TERCEROS también pasan, un equipo solo
 * está eliminado si:
 *  - no puede acabar ni 3.º de su grupo en ningún escenario posible (queda
 *    encerrado en el 4.º), o
 *  - ya terminaron TODOS los grupos y es 4.º, o 3.º fuera de los 8 mejores.
 * Así, un 3.º con un partido por jugar (p. ej. Senegal) NO se marca eliminado:
 * aún puede ganar y/o colarse como mejor tercero.
 */
export function eliminatedFromKnockout(
  groupId: GroupId,
  matches: Match[]
): Set<string> {
  const groupMatches = matches.filter(
    (m) => m.stage === "group" && m.groupId === groupId
  );
  const labels = [
    ...new Set(groupMatches.flatMap((m) => [m.homeLabel, m.awayLabel])),
  ];
  if (labels.length < 4) return new Set();

  const finished = groupMatches.filter((m) => m.status === "finished" && m.result);
  if (finished.length === 0) return new Set();
  const remaining = groupMatches.filter(
    (m) => !(m.status === "finished" && m.result)
  );

  const base: Record<string, number> = {};
  for (const l of labels) base[l] = 0;
  for (const m of finished) {
    const r = m.result!;
    if (r.homeGoals > r.awayGoals) base[m.homeLabel] += 3;
    else if (r.homeGoals === r.awayGoals) {
      base[m.homeLabel] += 1;
      base[m.awayLabel] += 1;
    } else base[m.awayLabel] += 3;
  }

  // ¿Puede acabar en el top-3 del grupo en ALGÚN escenario de los pendientes?
  const canTop3: Record<string, boolean> = {};
  for (const l of labels) canTop3[l] = false;
  const total = 3 ** remaining.length;
  for (let mask = 0; mask < total; mask++) {
    const pts = { ...base };
    let x = mask;
    for (const m of remaining) {
      const outcome = x % 3;
      x = Math.floor(x / 3);
      if (outcome === 0) pts[m.homeLabel] += 3;
      else if (outcome === 1) {
        pts[m.homeLabel] += 1;
        pts[m.awayLabel] += 1;
      } else pts[m.awayLabel] += 3;
    }
    for (const l of labels) {
      // Menos de 3 equipos estrictamente por encima ⇒ podría ser 3.º o mejor
      // (le damos el beneficio del empate en los desempates).
      const strictlyAbove = labels.filter((o) => o !== l && pts[o] > pts[l]).length;
      if (strictlyAbove < 3) canTop3[l] = true;
    }
  }

  const out = new Set<string>();
  for (const l of labels) if (!canTop3[l]) out.add(l);

  // Si TODOS los grupos han terminado, ya se sabe quién pasa: el 4.º está fuera
  // y el 3.º solo pasa si está entre los 8 mejores terceros.
  if (remaining.length === 0) {
    const allGroupIds = [
      ...new Set(
        matches
          .filter((m) => m.stage === "group" && m.groupId)
          .map((m) => m.groupId as GroupId)
      ),
    ];
    const allFinished =
      allGroupIds.length > 0 &&
      matches
        .filter((m) => m.stage === "group")
        .every((m) => m.status === "finished");
    if (allFinished) {
      const st = computeGroupStandings(groupId, matches);
      if (st[3]) out.add(st[3].teamLabel); // 4.º fuera
      const third = st[2];
      if (third) {
        const me = computeBestThirds(allGroupIds, matches).find(
          (t) => t.teamLabel === third.teamLabel
        );
        if (me && !me.qualified) out.add(third.teamLabel);
      }
    }
  }

  return out;
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
 *  5. Ranking FIFA (menor posición = mejor)
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
    const rankA = fifaRank(a.teamLabel);
    const rankB = fifaRank(b.teamLabel);
    if (rankA !== rankB) return rankA - rankB;
    return a.teamLabel.localeCompare(b.teamLabel);
  });

  for (let i = 0; i < entries.length; i++) {
    entries[i].qualified = i < 8;
  }
  return entries;
}
