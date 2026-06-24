import type {
  AppUser,
  Bet,
  BetStatus,
  BookmakerBalances,
  UserStats,
} from "@/types/domain";
import { EMPTY_BOOKMAKER_BALANCES, EMPTY_USER_STATS } from "@/types/domain";

/**
 * Calcula el beneficio (€) de una apuesta dada su selección final.
 * - pending: 0
 * - won:    stake * (odds - 1) (igual con o sin freebet)
 * - lost:   -stake si es dinero real; 0 si es freebet (el dinero no era tuyo)
 * - void:   0
 * - cashout: valor proporcionado manualmente
 */
/**
 * Devuelve los grupos a los que pertenece una apuesta. Prioriza el array
 * nuevo `groupIds`; cae al `groupId` legacy si el array no existe
 * (compatibilidad con apuestas creadas antes del modelo multi-grupo).
 */
export function getBetGroupIds(bet: Bet): string[] {
  if (bet.groupIds && bet.groupIds.length > 0) return bet.groupIds;
  return bet.groupId ? [bet.groupId] : [];
}

/** True si la apuesta pertenece al grupo dado. */
export function betInGroup(bet: Bet, groupId: string): boolean {
  return getBetGroupIds(bet).includes(groupId);
}

/** True si la apuesta está vinculada al partido dado (directa o en un combo). */
export function betHasMatch(bet: Bet, matchId: string): boolean {
  if (bet.matchId === matchId) return true;
  if ((bet.matchIds ?? []).includes(matchId)) return true;
  return (bet.legs ?? []).some((l) => l.matchId === matchId);
}

/** IDs de partido vinculados a una apuesta (directos o en combo). */
export function betMatchIds(bet: Bet): string[] {
  const ids = new Set<string>();
  if (bet.matchId) ids.add(bet.matchId);
  for (const x of bet.matchIds ?? []) if (x) ids.add(x);
  for (const leg of bet.legs ?? []) if (leg.matchId) ids.add(leg.matchId);
  return [...ids];
}

/**
 * Ventana de la "jornada" actual, de MEDIODÍA a MEDIODÍA (12:00 → 12:00 del día
 * siguiente). Si aún no es mediodía, devuelve la jornada que arrancó ayer a las
 * 12:00. Así una sesión de noche (19-21h → 8h) cuenta entera en el mismo día.
 */
export function currentDayWindow(nowMs: number = Date.now()): {
  startMs: number;
  endMs: number;
} {
  const start = new Date(nowMs);
  start.setHours(12, 0, 0, 0);
  if (nowMs < start.getTime()) start.setDate(start.getDate() - 1);
  const startMs = start.getTime();
  return { startMs, endMs: startMs + 24 * 60 * 60 * 1000 };
}

/**
 * True si la apuesta es "de ese día": TODOS sus partidos se juegan dentro de
 * [startMs, endMs). La fecha de una apuesta es la de su(s) PARTIDO(s) (kickoff),
 * no la de cuándo se creó o liquidó.
 *
 * - Apuesta a un único partido de hoy → cuenta.
 * - Combinada de partidos TODOS de hoy → cuenta.
 * - Combinada que MEZCLA hoy con otros días → NO cuenta (su resultado pudo
 *   decidirse otro día; no es una apuesta "solo de hoy").
 * - Sin partidos (outright/manual) → no cuenta (no tiene día asignable).
 */
export function betPlaysInWindow(
  bet: Bet,
  kickoffByMatchId: Map<string, number>,
  startMs: number,
  endMs: number
): boolean {
  const ids = betMatchIds(bet);
  if (ids.length === 0) return false;
  return ids.every((id) => {
    const k = kickoffByMatchId.get(id);
    return k != null && k >= startMs && k < endMs;
  });
}

export function calcProfit(
  stake: number,
  odds: number,
  status: BetStatus,
  cashoutProfit?: number,
  isFreebet?: boolean
): number {
  switch (status) {
    case "won":
      return round2(stake * (odds - 1));
    case "lost":
      return isFreebet ? 0 : round2(-stake);
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
 * Resultado EFECTIVO de una apuesta para los conteos (ganadas/perdidas, racha,
 * % acierto). Un CASHOUT cuenta como GANADA si su beneficio es > 0 (cerraste
 * por encima del stake) y como PERDIDA si es < 0 (por debajo); si quedó justo
 * a la par (0) no cuenta ni como una ni como otra.
 */
export function betOutcome(b: Bet): "won" | "lost" | "void" | "pending" {
  if (b.status === "pending") return "pending";
  if (b.status === "void") return "void";
  if (b.status === "won") return "won";
  if (b.status === "lost") return "lost";
  // cashout
  if ((b.profit ?? 0) > 0) return "won";
  if ((b.profit ?? 0) < 0) return "lost";
  return "void";
}

/** Cuota máxima para que una apuesta cuente en las estadísticas. Las apuestas
 *  con cuota POR ENCIMA de esto ("lotería") solo suman a beneficio/pérdida en
 *  euros; quedan fuera de cuota media, ROI, yield, % acierto, conteos, rachas
 *  y stake medio para no distorsionar las métricas. */
export const MAX_STATS_ODDS = 100;

/**
 * Recalcula TODAS las estadísticas del usuario a partir de su lista completa
 * de apuestas. Es O(n) pero para un grupo de amigos con cientos de apuestas
 * es trivial y garantiza consistencia.
 */
export function computeUserStats(bets: Bet[]): UserStats {
  const stats: UserStats = { ...EMPTY_USER_STATS };
  if (bets.length === 0) return stats;

  // Beneficio/pérdida en euros: cuentan TODAS las apuestas liquidadas
  // (incluidas las de cuota > 100). Es el ÚNICO cálculo en el que entran,
  // porque es dinero real.
  const totalProfit = bets
    .filter((b) => b.status !== "pending")
    .reduce((acc, b) => acc + b.profit, 0);
  stats.totalProfit = round2(totalProfit);

  // El resto de métricas se calcula SOLO con las apuestas "elegibles"
  // (cuota <= MAX_STATS_ODDS). Las de cuota > 100 se ignoran por completo aquí.
  const eligible = bets.filter((b) => b.odds <= MAX_STATS_ODDS);
  const settled = eligible.filter((b) => b.status !== "pending");

  stats.betsCount = eligible.length;
  stats.betsPending = eligible.filter((b) => b.status === "pending").length;
  // Los cashout cuentan como ganada/perdida según su beneficio (cashout vs
  // stake), no como una categoría aparte.
  stats.betsWon = eligible.filter((b) => betOutcome(b) === "won").length;
  stats.betsLost = eligible.filter((b) => betOutcome(b) === "lost").length;
  stats.betsVoid = eligible.filter((b) => b.status === "void").length;

  // Para ROI/Yield: solo cuentan las apuestas decididas (no pending, no void)
  // Y excluimos freebets: el stake no era dinero del usuario, así que no
  // debe entrar como denominador del ROI.
  const decided = settled.filter((b) => b.status !== "void");
  const totalStaked = decided
    .filter((b) => !b.isFreebet)
    .reduce((acc, b) => acc + b.stake, 0);
  // Beneficio SOLO de las elegibles, para que el ROI no incluya las de cuota
  // > 100 (ni en numerador ni en denominador).
  const eligibleProfit = settled.reduce((acc, b) => acc + b.profit, 0);

  stats.totalStaked = round2(totalStaked);
  stats.roi =
    totalStaked > 0 ? round2((eligibleProfit / totalStaked) * 100) : 0;
  stats.yield = stats.roi; // mismo concepto en este modelo
  // % acierto = ganadas / (ganadas + perdidas), contando cashouts según su
  // resultado. Las "a la par" y nulas no entran.
  const decidedByOutcome = stats.betsWon + stats.betsLost;
  stats.hitRate =
    decidedByOutcome > 0
      ? round2((stats.betsWon / decidedByOutcome) * 100)
      : 0;
  stats.avgOdds =
    eligible.length > 0
      ? round2(eligible.reduce((acc, b) => acc + b.odds, 0) / eligible.length)
      : 0;
  stats.avgStake =
    eligible.length > 0
      ? round2(eligible.reduce((acc, b) => acc + b.stake, 0) / eligible.length)
      : 0;

  // Streaks: secuencia consecutiva más reciente de ganadas (positivo)
  // o perdidas (negativo). Los cashout cuentan según su resultado; void/
  // pending/"a la par" se ignoran.
  const chronological = [...settled]
    .filter((b) => {
      const o = betOutcome(b);
      return o === "won" || o === "lost";
    })
    .sort((a, b) => settledMs(a) - settledMs(b));

  let bestStreak = 0;
  let runningWin = 0;
  let runningLoss = 0;
  for (const b of chronological) {
    if (betOutcome(b) === "won") {
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
  } else if (betOutcome(last) === "won") {
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

/** Identificador del mercado de apuestas con cuota "superaumentada". */
export const SUPERAUMENTO_MARKET = "superaumento";

export interface SuperaumentoSummary {
  count: number;
  won: number;
  lost: number;
  pending: number;
  /** Beneficio neto (€) de las superaumento liquidadas. */
  profit: number;
}

/**
 * Balance de las apuestas del tipo "superaumento" dentro de un conjunto de
 * apuestas ya filtrado (por usuario y/o grupo). Devuelve el beneficio neto
 * y el desglose por estado.
 */
export function computeSuperaumentoSummary(bets: Bet[]): SuperaumentoSummary {
  const sa = bets.filter((b) => b.market === SUPERAUMENTO_MARKET);
  const profit = sa.reduce((acc, b) => acc + (b.profit ?? 0), 0);
  return {
    count: sa.length,
    won: sa.filter((b) => b.status === "won").length,
    lost: sa.filter((b) => b.status === "lost").length,
    pending: sa.filter((b) => b.status === "pending").length,
    profit: round2(profit),
  };
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Nº de "partes" entre las que se reparte el resultado de una apuesta al
 * imputarlo a UN partido (o equipo) concreto:
 *  - Si está atada a partidos concretos (matchId / matchIds / legs) → nº de
 *    PARTIDOS distintos que cubre (un combo de varios mercados en el MISMO
 *    partido cuenta como 1, no se divide).
 *  - Si es una apuesta a futuro/outright sin partidos → nº de EQUIPOS que
 *    menciona.
 *  - En cualquier otro caso → 1.
 * Mínimo siempre 1 (nunca divide por cero).
 */
export function betShareCount(bet: Bet): number {
  const matchIds = new Set<string>();
  if (bet.matchId) matchIds.add(bet.matchId);
  for (const id of bet.matchIds ?? []) if (id) matchIds.add(id);
  for (const leg of bet.legs ?? []) if (leg.matchId) matchIds.add(leg.matchId);
  if (matchIds.size > 0) return matchIds.size;
  if (bet.market === "outright") {
    const teams = (bet.teams ?? []).filter(Boolean);
    if (teams.length > 0) return teams.length;
  }
  return 1;
}

/** Sobre qué se reparte una apuesta: "match" (partidos) o "team" (outright). */
export function betShareBasis(bet: Bet): "match" | "team" {
  const hasMatch =
    !!bet.matchId ||
    (bet.matchIds?.some(Boolean) ?? false) ||
    (bet.legs?.some((l) => l.matchId) ?? false);
  return hasMatch ? "match" : "team";
}

/**
 * Parte del beneficio/pérdida de una apuesta que corresponde a UN partido (o
 * equipo): reparte el profit total entre `betShareCount`. Solo se usa para
 * atribuir el resultado a cada partido en el popup del Mundial; el profit
 * total de la apuesta (stats globales, ROI, ranking general) NO cambia.
 */
export function matchShareProfit(bet: Bet): number {
  return (bet.profit ?? 0) / betShareCount(bet);
}

export function bookmakerLabel(
  bookmaker: Bet["bookmaker"],
  custom?: string
): string {
  if (bookmaker === "bet365") return "Bet365";
  if (bookmaker === "winamax") return "Winamax";
  if (bookmaker === "betfair") return "Betfair";
  if (bookmaker === "luckia") return "Luckia";
  return custom?.trim() || "Otra";
}

export interface BookmakerSummary {
  initial: number;
  profit: number;
  /** Ingresos − retiradas (dinero real metido/sacado). */
  netCash: number;
  current: number;
  pendingStake: number;
  betsCount: number;
}

export type BookmakerKey = keyof BookmakerBalances;

const KEYS: BookmakerKey[] = [
  "bet365",
  "winamax",
  "betfair",
  "luckia",
  "other",
];

/** Dinero neto (ingresos − retiradas) por casa para un usuario y grupo. */
export function netCashByBookmaker(
  user: AppUser,
  groupId?: string
): Record<BookmakerKey, number> {
  const net: Record<BookmakerKey, number> = {
    bet365: 0,
    winamax: 0,
    betfair: 0,
    luckia: 0,
    other: 0,
  };
  for (const m of user.cashMovements ?? []) {
    if (groupId && m.groupId !== groupId) continue;
    const signed = m.type === "deposit" ? m.amount : -m.amount;
    net[m.bookmaker] = round2((net[m.bookmaker] ?? 0) + signed);
  }
  return net;
}

export interface CashSummary {
  deposits: number;
  withdrawals: number;
  net: number;
}

/** Totales de ingresos/retiradas de un usuario en un grupo. */
export function computeCashSummary(
  user: AppUser,
  groupId?: string
): CashSummary {
  let deposits = 0;
  let withdrawals = 0;
  for (const m of user.cashMovements ?? []) {
    if (groupId && m.groupId !== groupId) continue;
    if (m.type === "deposit") deposits += m.amount;
    else withdrawals += m.amount;
  }
  return {
    deposits: round2(deposits),
    withdrawals: round2(withdrawals),
    net: round2(deposits - withdrawals),
  };
}

/**
 * Devuelve los saldos iniciales del usuario para un grupo concreto. Si el
 * grupo no tiene saldo asignado, intenta usar el `initialBalances` global
 * (legacy) cuando el `groupId` es "FIM" (compatibilidad), y si no, ceros.
 *
 * Llama sin `groupId` para el comportamiento legacy (saldo global del
 * usuario, atravesando grupos).
 */
export function getInitialBalances(
  user: AppUser,
  groupId?: string
): BookmakerBalances {
  if (groupId) {
    const fromGroup = user.balancesPerGroup?.[groupId];
    if (fromGroup) return fromGroup;
    // Compat: si el grupo es FIM y aún no se ha movido a balancesPerGroup,
    // devolvemos los saldos legacy. Para otros grupos, ceros.
    if (groupId === "FIM" && user.initialBalances) return user.initialBalances;
    return EMPTY_BOOKMAKER_BALANCES;
  }
  return user.initialBalances ?? EMPTY_BOOKMAKER_BALANCES;
}

/**
 * Calcula la posición de un usuario en el ranking de un grupo: su ROI y su
 * saldo actual en ese grupo, a partir de SUS apuestas del grupo. Es la fórmula
 * exacta que usaban el carrusel y la página de ranking, extraída a un único
 * sitio para que el ranking precalculado (`rankings/{groupId}`) y la UI siempre
 * cuadren. `userGroupBets` deben ser ya las apuestas del usuario en ese grupo.
 */
export function computeRankingStanding(
  user: AppUser,
  userGroupBets: Bet[],
  groupId: string
): { roi: number; balance: number; profit: number } {
  const stats = computeUserStats(userGroupBets);
  const initial = getInitialBalances(user, groupId);
  const balance =
    initial.bet365 +
    initial.winamax +
    (initial.betfair ?? 0) +
    (initial.luckia ?? 0) +
    initial.other +
    stats.totalProfit +
    computeCashSummary(user, groupId).net;
  return { roi: stats.roi, balance: round2(balance), profit: stats.totalProfit };
}

/**
 * Calcula el saldo (inicial, profit, actual) por casa de apuestas para un
 * usuario. El profit por casa es la suma del campo `profit` de sus apuestas
 * liquidadas en esa casa; el saldo actual = inicial + profit.
 */
export function computeBookmakerSummary(
  user: AppUser,
  bets: Bet[],
  groupId?: string
): Record<BookmakerKey, BookmakerSummary> & { total: BookmakerSummary } {
  const initials = getInitialBalances(user, groupId);
  const netCash = netCashByBookmaker(user, groupId);
  const result = {} as Record<BookmakerKey, BookmakerSummary>;

  for (const key of KEYS) {
    const houseBets = bets.filter((b) => b.bookmaker === key);
    const profit = houseBets.reduce((acc, b) => acc + (b.profit ?? 0), 0);
    // Las freebets no inmovilizan dinero del usuario, así que su stake
    // pendiente no debe restar al saldo disponible.
    const pendingStake = houseBets
      .filter((b) => b.status === "pending" && !b.isFreebet)
      .reduce((acc, b) => acc + b.stake, 0);
    const initial = initials[key] ?? 0;
    const cash = netCash[key] ?? 0;
    result[key] = {
      initial: round2(initial),
      profit: round2(profit),
      netCash: round2(cash),
      // Saldo = inicial + beneficio de apuestas + dinero neto (ingresos −
      // retiradas). El beneficio NO incluye ingresos/retiradas.
      current: round2(initial + profit + cash),
      pendingStake: round2(pendingStake),
      betsCount: houseBets.length,
    };
  }

  const total: BookmakerSummary = {
    initial: round2(KEYS.reduce((a, k) => a + result[k].initial, 0)),
    profit: round2(KEYS.reduce((a, k) => a + result[k].profit, 0)),
    netCash: round2(KEYS.reduce((a, k) => a + result[k].netCash, 0)),
    current: round2(KEYS.reduce((a, k) => a + result[k].current, 0)),
    pendingStake: round2(KEYS.reduce((a, k) => a + result[k].pendingStake, 0)),
    betsCount: KEYS.reduce((a, k) => a + result[k].betsCount, 0),
  };

  return { ...result, total };
}
