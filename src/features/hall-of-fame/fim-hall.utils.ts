import { computeUserStats } from "@/features/bets/bets.utils";
import { FIM_PHOTOS } from "./fim-photos.generated";
import {
  fimMemberByKey,
  fimMemberByUsername,
  fimNameByKey,
} from "./fim-members";
import type { AppUser, Bet } from "@/types/domain";

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
  images: string[];
}

export interface FimComboStat {
  key: string;
  size: number;
  names: string[];
  nickname: string | null;
  profit: number;
  betsCount: number;
  images: string[];
  /** Etiqueta de extremo ("Dúo más perdedor"…) si aplica. */
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
    const s = uid ? computeUserStats(bets.filter((b) => b.userId === uid)) : null;
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
      images: p.images,
    });
  }

  // SIEMPRE salen los 8 individuos que tienen foto, ordenados por beneficio.
  const members = [...statByKey.values()].sort((a, b) => b.profit - a.profit);

  // SIEMPRE salen todos los combos que tienen foto (stats sumadas, 0 si falta).
  const combos: FimComboStat[] = [];
  for (const p of FIM_PHOTOS) {
    if (p.members.length < 2) continue;
    const profit = p.members.reduce(
      (a, k) => a + (statByKey.get(k)?.profit ?? 0),
      0
    );
    const betsCount = p.members.reduce(
      (a, k) => a + (statByKey.get(k)?.betsCount ?? 0),
      0
    );
    combos.push({
      key: p.key,
      size: p.members.length,
      names: p.members.map(fimNameByKey),
      nickname: p.nickname,
      profit: Math.round(profit * 100) / 100,
      betsCount,
      images: p.images,
      badge: null,
    });
  }

  const duos = combos.filter((c) => c.size === 2);
  const trios = combos.filter((c) => c.size === 3);
  const quads = combos.filter((c) => c.size >= 4);

  const tagExtremes = (arr: FimComboStat[], label: string) => {
    if (arr.length === 0) return;
    const worst = arr.reduce((m, c) => (c.profit < m.profit ? c : m));
    const best = arr.reduce((m, c) => (c.profit > m.profit ? c : m));
    if (worst.profit < 0) worst.badge = `${label} más perdedor`;
    if (best !== worst && best.profit > 0) best.badge = `${label} más ganador`;
  };
  tagExtremes(duos, "Dúo");
  tagExtremes(trios, "Trío");
  tagExtremes(quads, "Cuarteto");

  return { members, duos, trios, quads };
}
