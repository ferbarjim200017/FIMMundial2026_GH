import {
  betHasMatch,
  computeUserStats,
  matchShareProfit,
} from "@/features/bets/bets.utils";
import { FIM_PHOTOS } from "./fim-photos.generated";
import {
  fimMemberByKey,
  fimMemberByUsername,
  fimNameByKey,
} from "./fim-members";
import type { AppUser, Bet, Match } from "@/types/domain";

export interface FimMemberStat {
  key: string;
  name: string;
  mote: string;
  profit: number;
  roi: number;
  hitRate: number;
  betsCount: number;
  won: number;
  lost: number;
  bestStreak: number;
  avgOdds: number;
  /** Cuota más alta de una apuesta ACERTADA entera (status "won"). 0 si ninguna. */
  maxWonOdds: number;
  images: string[];
}

export interface FimComboStat {
  key: string;
  size: number;
  names: string[];
  nickname: string | null;
  profit: number;
  betsCount: number;
  won: number;
  lost: number;
  hitRate: number;
  images: string[];
  /** Etiqueta de extremo ("Trío más perdedor"…) si aplica. */
  badge: string | null;
}

export interface FimHallData {
  members: FimMemberStat[];
  duos: FimComboStat[];
  trios: FimComboStat[];
  quads: FimComboStat[];
}

/**
 * Calcula la galería FIM a partir de las apuestas del grupo y sus miembros.
 * - `members`: cada miembro de FIM presente, ordenado por beneficio (top).
 * - `duos/trios/quads`: SOLO los combos que tienen foto Y todos sus miembros en
 *   el grupo. A los extremos de cada tamaño se les pone badge (más perdedor /
 *   más ganador).
 */
export function computeFimHall(bets: Bet[], users: AppUser[]): FimHallData {
  const uidByKey = new Map<string, string>();
  for (const u of users) {
    const m = fimMemberByUsername(u.username);
    if (m) uidByKey.set(m.key, u.uid);
  }

  // Stats por clave (0 si esa persona no casa con ningún usuario del grupo).
  const statByKey = new Map<string, FimMemberStat>();
  for (const p of FIM_PHOTOS) {
    if (p.members.length !== 1) continue;
    const key = p.members[0];
    const fm = fimMemberByKey(key);
    const uid = uidByKey.get(key);
    const userBets = uid ? bets.filter((b) => b.userId === uid) : [];
    const s = uid ? computeUserStats(userBets) : null;
    const maxWonOdds = userBets.reduce(
      (mx, b) => (b.status === "won" && b.odds > mx ? b.odds : mx),
      0
    );
    statByKey.set(key, {
      key,
      name: fm?.name ?? fimNameByKey(key),
      mote: fm?.mote ?? "",
      profit: s?.totalProfit ?? 0,
      roi: s?.roi ?? 0,
      hitRate: s?.hitRate ?? 0,
      betsCount: s?.betsCount ?? 0,
      won: s?.betsWon ?? 0,
      lost: s?.betsLost ?? 0,
      bestStreak: s?.bestStreak ?? 0,
      avgOdds: s?.avgOdds ?? 0,
      maxWonOdds,
      images: p.images,
    });
  }

  // SIEMPRE salen los 8 individuos que tienen foto, ordenados por beneficio.
  const members = [...statByKey.values()].sort((a, b) => b.profit - a.profit);

  // SIEMPRE salen todos los combos que tienen foto (stats sumadas, 0 si falta).
  const combos: FimComboStat[] = [];
  for (const p of FIM_PHOTOS) {
    if (p.members.length < 2) continue;
    const sum = (f: (s: FimMemberStat) => number) =>
      p.members.reduce((a, k) => a + (statByKey.get(k) ? f(statByKey.get(k)!) : 0), 0);
    const profit = sum((s) => s.profit);
    const betsCount = sum((s) => s.betsCount);
    const won = sum((s) => s.won);
    const lost = sum((s) => s.lost);
    combos.push({
      key: p.key,
      size: p.members.length,
      names: p.members.map(fimNameByKey),
      nickname: p.nickname,
      profit: Math.round(profit * 100) / 100,
      betsCount,
      won,
      lost,
      hitRate: won + lost > 0 ? Math.round((won / (won + lost)) * 1000) / 10 : 0,
      images: p.images,
      badge: null,
    });
  }

  const duos = combos.filter((c) => c.size === 2);
  const trios = combos.filter((c) => c.size === 3);
  const quads = combos.filter((c) => c.size >= 4);

  // Badge de extremo solo en tríos/cuartetos (se muestran todos en orden); los
  // dúos van en secciones propias (más rentable / más nefasto / más fiable).
  const tagExtremes = (arr: FimComboStat[], label: string) => {
    if (arr.length === 0) return;
    const worst = arr.reduce((m, c) => (c.profit < m.profit ? c : m));
    const best = arr.reduce((m, c) => (c.profit > m.profit ? c : m));
    if (worst.profit < 0) worst.badge = `${label} más perdedor`;
    if (best !== worst && best.profit > 0) best.badge = `${label} más ganador`;
  };
  tagExtremes(trios, "Trío");
  tagExtremes(quads, "Cuarteto");

  return { members, duos, trios, quads };
}

/* ────────────────────────────────────────────────────────────────────────
 * Tops de PARTIDOS (sin foto → se pintan con banderas). Los datos son GLOBALES
 * por partido: suman TODAS las apuestas del grupo que tocan ese partido (sin
 * dividir combos), para ver el interés total que ha movido cada partido.
 * ──────────────────────────────────────────────────────────────────────── */
export interface FimMatchStat {
  matchId: string;
  home: string;
  away: string;
  profit: number;
  staked: number;
  count: number;
}

export interface FimMatchTops {
  gains: FimMatchStat[];
  losses: FimMatchStat[];
  mostBets: FimMatchStat[];
  mostStaked: FimMatchStat[];
}

export function computeFimMatchTops(
  bets: Bet[],
  matches: Match[]
): FimMatchTops {
  // Misma lógica que el popup del partido: cuentan las apuestas directas al
  // partido Y las a futuro/outright ligadas a alguno de sus dos equipos. El
  // dinero jugado es el stake completo (incluye freebets) y el beneficio se
  // reparte por partido/equipo (`matchShareProfit`), igual que en el popup.
  const all: FimMatchStat[] = [];
  for (const m of matches) {
    const linked = bets.filter(
      (b) =>
        betHasMatch(b, m.id) ||
        (b.teams ?? []).some((t) => t === m.homeLabel || t === m.awayLabel)
    );
    if (linked.length === 0) continue;
    const profit = linked.reduce((a, b) => a + matchShareProfit(b), 0);
    const staked = linked.reduce((a, b) => a + b.stake, 0);
    all.push({
      matchId: m.id,
      home: m.homeLabel,
      away: m.awayLabel,
      profit: Math.round(profit * 100) / 100,
      staked: Math.round(staked * 100) / 100,
      count: linked.length,
    });
  }

  return {
    gains: all.filter((m) => m.profit > 0).sort((a, b) => b.profit - a.profit).slice(0, 3),
    losses: all.filter((m) => m.profit < 0).sort((a, b) => a.profit - b.profit).slice(0, 3),
    mostBets: all.filter((m) => m.count > 0).sort((a, b) => b.count - a.count).slice(0, 3),
    mostStaked: all.filter((m) => m.staked > 0).sort((a, b) => b.staked - a.staked).slice(0, 3),
  };
}
