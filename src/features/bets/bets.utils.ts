import type { Bet, BetStatus, UserStats } from "@/types/domain";
import { EMPTY_USER_STATS } from "@/types/domain";

/**
 * Calcula el beneficio (€) de una apuesta dada su selección final.
 * - pending: 0
 * - won:    stake * (odds - 1)
 * - lost:   -stake
 * - void:   0
 * - cashout: valor proporcionado manualmente
 */
export function calcProfit(
  stake: number,
  odds: number,
  status: BetStatus,
  cashoutProfit?: number
): number {
  switch (status) {
    case "won":
      return round2(stake * (odds - 1));
    case "lost":
      return round2(-stake);
    case "void":
      return 0;
    case "cashout":
      return round2(cashoutProfit ?? 0);
    case "pending":
    default:
      return 0;
  }
}

/**
 * Recalcula TODAS las estadísticas del usuario a partir de su lista completa
 * de apuestas. Es O(n) pero para un grupo de amigos con cientos de apuestas
 * es trivial y garantiza consistencia.
 */
export function computeUserStats(bets: Bet[]): UserStats {
  const stats: UserStats = { ...EMPTY_USER_STATS };
  if (bets.length === 0) return stats;

  const settled = bets.filter((b) => b.status !== "pending");

  stats.betsCount = bets.length;
  stats.betsPending = bets.filter((b) => b.status === "pending").length;
  stats.betsWon = bets.filter((b) => b.status === "won").length;
  stats.betsLost = bets.filter((b) => b.status === "lost").length;
  stats.betsVoid = bets.filter((b) => b.status === "void").length;

  // Para ROI/Yield: solo cuentan las apuestas decididas (no pending, no void).
  const decided = settled.filter((b) => b.status !== "void");
  const totalStaked = decided.reduce((acc, b) => acc + b.stake, 0);
  const totalProfit = settled.reduce((acc, b) => acc + b.profit, 0);

  stats.totalStaked = round2(totalStaked);
  stats.totalProfit = round2(totalProfit);
  stats.roi = totalStaked > 0 ? round2((totalProfit / totalStaked) * 100) : 0;
  stats.yield = stats.roi; // mismo concepto en este modelo
  stats.hitRate =
    decided.length > 0
      ? round2((stats.betsWon / decided.length) * 100)
      : 0;
  stats.avgOdds =
    bets.length > 0
      ? round2(bets.reduce((acc, b) => acc + b.odds, 0) / bets.length)
      : 0;
  stats.avgStake =
    bets.length > 0
      ? round2(bets.reduce((acc, b) => acc + b.stake, 0) / bets.length)
      : 0;

  // Streaks: secuencia consecutiva más reciente de ganadas (positivo)
  // o perdidas (negativo). Ignoramos void/pending para el cómputo.
  const chronological = [...settled]
    .filter((b) => b.status === "won" || b.status === "lost")
    .sort((a, b) => settledMs(a) - settledMs(b));

  let bestStreak = 0;
  let runningWin = 0;
  let runningLoss = 0;
  for (const b of chronological) {
    if (b.status === "won") {
      runningWin += 1;
      runningLoss = 0;
      if (runningWin > bestStreak) bestStreak = runningWin;
    } else {
      runningLoss += 1;
      runningWin = 0;
    }
  }
  const last = chronological[chronological.length - 1];
  if (!last) {
    stats.currentStreak = 0;
  } else if (last.status === "won") {
    stats.currentStreak = runningWin;
  } else {
    stats.currentStreak = -runningLoss;
  }
  stats.bestStreak = bestStreak;

  // Mejor y peor apuesta (por profit)
  const sortedByProfit = [...settled].sort((a, b) => b.profit - a.profit);
  stats.bestBetId = sortedByProfit[0]?.id ?? null;
  stats.worstBetId = sortedByProfit[sortedByProfit.length - 1]?.id ?? null;

  return stats;
}

function settledMs(b: Bet): number {
  if (b.settledAt) return b.settledAt.toMillis();
  return b.createdAt.toMillis();
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function bookmakerLabel(
  bookmaker: Bet["bookmaker"],
  custom?: string
): string {
  if (bookmaker === "bet365") return "Bet365";
  if (bookmaker === "winamax") return "Winamax";
  return custom?.trim() || "Otra";
}
