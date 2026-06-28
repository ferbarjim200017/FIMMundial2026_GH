import type { GroupId, Match } from "@/types/domain";
import {
  computeBestThirds,
  computeGroupStandings,
} from "@/features/standings/standings.utils";
import { teamFlagCode } from "@/features/matches/teams-2026";

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
 * Empareja terceros clasificados con sus huecos "Mejor 3.º X/Y/Z" mediante un
 * matching bipartito MÁXIMO (algoritmo de Kuhn por caminos aumentantes). El
 * greedy anterior podía dejar huecos vacíos aunque existiera una asignación
 * válida; esto garantiza llenar el máximo de huecos posible respetando los
 * grupos permitidos de cada uno. `thirds` debe venir de mejor a peor.
 */
function matchThirds(
  slots: { key: string; allowed: Set<string> }[],
  thirds: { teamLabel: string; groupId: string }[]
): Map<string, string> {
  const slotMatch: (number | null)[] = slots.map(() => null);
  const augment = (ti: number, seen: boolean[]): boolean => {
    for (let si = 0; si < slots.length; si++) {
      if (seen[si] || !slots[si].allowed.has(thirds[ti].groupId)) continue;
      seen[si] = true;
      const cur = slotMatch[si];
      if (cur === null || augment(cur, seen)) {
        slotMatch[si] = ti;
        return true;
      }
    }
    return false;
  };
  for (let ti = 0; ti < thirds.length; ti++) {
    augment(ti, new Array(slots.length).fill(false));
  }
  const assign = new Map<string, string>();
  slots.forEach((s, si) => {
    const ti = slotMatch[si];
    if (ti !== null) assign.set(s.key, thirds[ti].teamLabel);
  });
  return assign;
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

  if (slots.length === 0) return new Map();

  // ¿Acabaron TODOS los grupos? Si no, no asignamos terceros (datos parciales).
  const groupRanks = computeFinalGroupRanks(matches);
  const allGroupsFinished = GROUP_IDS_LOCAL.every((g) => groupRanks[g].isFinal);
  if (!allGroupsFinished) return new Map();

  const thirds = computeBestThirds(GROUP_IDS_LOCAL, matches).filter(
    (t) => t.qualified
  );

  return matchThirds(slots, thirds);
}

/** Un hueco del cuadro resuelto PROVISIONALMENTE con la clasificación actual. */
export interface ProvisionalSlot {
  /** Equipo que va ahora mismo en esa posición. */
  team: string;
  /** Hueco original abreviado: "2.º A", "Mejor 3.º", "Gan. M1"… */
  slot: string;
  /** true si aún puede cambiar (el grupo no ha terminado). */
  provisional: boolean;
}

/**
 * Resuelve el cuadro con la clasificación ACTUAL (provisional), SIN esperar a
 * que terminen los grupos. Solo para MOSTRAR (no se persiste): se recalcula en
 * cada render, así cada resultado nuevo actualiza los cruces. Devuelve, por
 * partido, el equipo provisional de cada lado (o null si ese hueco aún no se
 * puede resolver, p. ej. "Mejor 3.º" antes de tener terceros).
 */
export function resolveBracketProvisional(
  matches: Match[]
): Map<string, { home: ProvisionalSlot | null; away: ProvisionalSlot | null }> {
  // Rangos ACTUALES por grupo (1.º/2.º de la clasificación de ahora mismo).
  const ranks = {} as Record<
    GroupId,
    { first: string | null; second: string | null; final: boolean }
  >;
  for (const g of GROUP_IDS_LOCAL) {
    const gm = matches.filter((m) => m.stage === "group" && m.groupId === g);
    const final = gm.length > 0 && gm.every((m) => m.status === "finished");
    const st = computeGroupStandings(g, matches);
    ranks[g] = {
      first: st[0]?.teamLabel ?? null,
      second: st[1]?.teamLabel ?? null,
      final,
    };
  }
  const allGroupsFinal = GROUP_IDS_LOCAL.every((g) => ranks[g].final);

  // Mejores terceros ACTUALES, asignados a sus huecos "Mejor 3.º X/Y/Z" con
  // matching máximo (rellena el máximo de huecos posible).
  let thirdAssign = new Map<string, string>();
  const thirdSlots: { key: string; allowed: Set<string> }[] = [];
  for (const m of matches) {
    if (m.stage !== "r32") continue;
    for (const field of ["homeLabel", "awayLabel"] as const) {
      const mt = m[field].match(BEST3_RE);
      if (mt) thirdSlots.push({ key: `${m.id}:${field}`, allowed: new Set(mt[1].split("/")) });
    }
  }
  if (thirdSlots.length > 0) {
    const thirds = computeBestThirds(GROUP_IDS_LOCAL, matches).filter((t) => t.qualified);
    thirdAssign = matchThirds(thirdSlots, thirds);
  }

  const out = new Map<
    string,
    { home: ProvisionalSlot | null; away: ProvisionalSlot | null }
  >();
  const matchById = new Map(matches.map((m) => [m.id, m]));

  // Equipo real ya resuelto de un lado del partido fuente: usa la resolución
  // previa (si el lado era un placeholder de grupo/ganador) o el propio label
  // si ya es un equipo real (p. ej. dieciseisavos ya con nombres reales).
  const resolvedTeam = (
    src: Match,
    side: "home" | "away"
  ): string | null => {
    const prev = out.get(src.id)?.[side];
    if (prev?.team) return prev.team;
    const label = side === "home" ? src.homeLabel : src.awayLabel;
    return teamFlagCode(label) ? label : null;
  };

  // Ganador/perdedor de un partido fuente, ya RESUELTO al equipo real. Avanza
  // el equipo de verdad aunque el dieciseisavos siga con placeholder en BD.
  const advance = (srcId: string, want: "winner" | "loser"): string | null => {
    const src = matchById.get(srcId);
    if (!src || src.status !== "finished" || !src.result) return null;
    const r = src.result;
    let winSide: "home" | "away" | null = null;
    if (r.homeGoals > r.awayGoals) winSide = "home";
    else if (r.awayGoals > r.homeGoals) winSide = "away";
    else if (r.penaltyWinner === "home") winSide = "home";
    else if (r.penaltyWinner === "away") winSide = "away";
    if (!winSide) return null;
    const pick =
      want === "winner" ? winSide : winSide === "home" ? "away" : "home";
    return resolvedTeam(src, pick);
  };

  const resolveField = (
    label: string,
    matchId: string,
    field: "homeLabel" | "awayLabel"
  ): ProvisionalSlot | null => {
    let mt: RegExpMatchArray | null;
    if ((mt = label.match(FIRST_RE))) {
      const g = mt[1] as GroupId;
      return ranks[g]?.first
        ? { team: ranks[g].first!, slot: `1.º ${g}`, provisional: !ranks[g].final }
        : null;
    }
    if ((mt = label.match(SECOND_RE))) {
      const g = mt[1] as GroupId;
      return ranks[g]?.second
        ? { team: ranks[g].second!, slot: `2.º ${g}`, provisional: !ranks[g].final }
        : null;
    }
    if (label.match(BEST3_RE)) {
      const t = thirdAssign.get(`${matchId}:${field}`);
      return t ? { team: t, slot: "Mejor 3.º", provisional: !allGroupsFinal } : null;
    }
    if ((mt = label.match(WINNER_RE))) {
      const w = advance(`wc26-m${mt[1]}`, "winner");
      return w ? { team: w, slot: `Gan. M${mt[1]}`, provisional: false } : null;
    }
    if ((mt = label.match(LOSER_RE))) {
      const l = advance(`wc26-m${mt[1]}`, "loser");
      return l ? { team: l, slot: `Perd. M${mt[1]}`, provisional: false } : null;
    }
    return null;
  };

  // Resolvemos en orden de número de partido ascendente: los seedId siguen el
  // orden del cuadro (r32 < r16 < qf < sf < final), así cuando resolvemos un
  // "Ganador MN" el partido fuente MN ya está resuelto y propagamos su equipo.
  const ordered = matches
    .filter((m) => m.stage !== "group")
    .sort(
      (a, b) =>
        Number(a.id.replace("wc26-m", "")) - Number(b.id.replace("wc26-m", ""))
    );
  for (const m of ordered) {
    out.set(m.id, {
      home: resolveField(m.homeLabel, m.id, "homeLabel"),
      away: resolveField(m.awayLabel, m.id, "awayLabel"),
    });
  }
  return out;
}

/**
 * Devuelve los partidos con sus etiquetas YA RESUELTAS de forma provisional:
 * los huecos de eliminatoria ("2.º Grupo A", "Ganador M73", "Mejor 3.º X/Y"…)
 * se sustituyen por el equipo que va ahora mismo en esa posición. Los partidos
 * de grupos quedan igual (ya tienen equipo real). Pensado para mostrar equipos
 * de verdad en CUALQUIER sitio que pinte partidos (selector de apuestas, filtro,
 * próximos…), no solo en el cuadro. No persiste: se recalcula con los datos
 * actuales.
 */
export function resolveMatchLabels(matches: Match[]): Match[] {
  const overrides = resolveBracketProvisional(matches);
  return matches.map((m) => {
    const ov = overrides.get(m.id);
    if (!ov || (!ov.home?.team && !ov.away?.team)) return m;
    return {
      ...m,
      homeLabel: ov.home?.team ?? m.homeLabel,
      awayLabel: ov.away?.team ?? m.awayLabel,
    };
  });
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

