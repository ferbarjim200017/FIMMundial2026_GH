import type { Timestamp } from "firebase/firestore";

// ============================================================
// USERS
// ============================================================
export type UserRole = "admin" | "member";

export interface UserStats {
  totalProfit: number;        // beneficio total acumulado (€)
  roi: number;                // (profit / totalStaked) * 100
  yield: number;              // alias estadístico; en Firestore guardamos ambos
  betsCount: number;
  betsWon: number;
  betsLost: number;
  betsVoid: number;
  betsPending: number;
  currentStreak: number;      // positivo: ganadas seguidas, negativo: perdidas seguidas
  bestStreak: number;
  bestBetId: string | null;
  worstBetId: string | null;
  avgOdds: number;
  avgStake: number;
  hitRate: number;            // %
  totalStaked: number;
}

export interface BookmakerBalances {
  bet365: number;
  winamax: number;
  other: number;
}

export const EMPTY_BOOKMAKER_BALANCES: BookmakerBalances = {
  bet365: 0,
  winamax: 0,
  other: 0,
};

export interface AppUser {
  uid: string;
  username: string;
  email: string;
  avatarUrl: string | null;
  role: UserRole;
  joinedAt: Timestamp;
  initialBalance: number;             // suma de initialBalances (legacy / fallback)
  currentBalance: number;             // legacy / fallback (initialBalance + totalProfit global)
  initialBalances?: BookmakerBalances; // legacy: saldo inicial global por casa
  /** Saldos iniciales por grupo y casa. Reemplaza a `initialBalances`
   *  cuando hay un grupo activo. Si un grupo no tiene entrada, se cae a
   *  ceros (cada grupo empieza desde cero por defecto). */
  balancesPerGroup?: Record<string, BookmakerBalances>;
  stats: UserStats;
  /** Grupos a los que pertenece el usuario (IDs de la colección `groups`).
   *  Toda la información visible en la app (ranking, feed, popups de apuestas,
   *  comparador, perfiles…) se filtra a los miembros del `activeGroupId`. */
  groups?: string[];
  /** Grupo seleccionado actualmente como contexto. Si el usuario pertenece a
   *  un solo grupo, este campo coincide. Cuando hay varios, el usuario puede
   *  alternar desde el topbar. Persistido en Firestore para sincronizar entre
   *  dispositivos. */
  activeGroupId?: string | null;
}

// ============================================================
// GROUPS
// ============================================================
export interface AppGroup {
  id: string;
  name: string;
  createdAt: Timestamp;
  /** UID del admin que creó el grupo. Sólo informativo. */
  createdBy?: string | null;
}

export const EMPTY_USER_STATS: UserStats = {
  totalProfit: 0,
  roi: 0,
  yield: 0,
  betsCount: 0,
  betsWon: 0,
  betsLost: 0,
  betsVoid: 0,
  betsPending: 0,
  currentStreak: 0,
  bestStreak: 0,
  bestBetId: null,
  worstBetId: null,
  avgOdds: 0,
  avgStake: 0,
  hitRate: 0,
  totalStaked: 0,
};

// ============================================================
// BETS (preparado para próximo módulo)
// ============================================================
export type Bookmaker = "bet365" | "winamax" | "other";

export type BetMarket =
  | "winner"
  | "double_chance"
  | "over_under"
  | "btts"
  | "correct_score"
  | "scorer"
  | "cards"
  | "corners"
  | "shots"
  | "shots_on_target"
  | "fouls"
  | "outright"   // apuestas a futuro: ganador grupo, mejor equipo de un continente, top scorer…
  | "combo"
  | "custom";

export type BetStatus = "pending" | "won" | "lost" | "void" | "cashout";

export interface BetLeg {
  matchId?: string;
  matchLabel: string;
  market: BetMarket;
  marketDetail: string;
  selection: string;
  odds: number;
  status: BetStatus;
}

export interface Bet {
  id: string;
  userId: string;
  /** Grupo al que pertenece la apuesta — se fija al crearla con el
   *  `activeGroupId` del autor en ese momento y NO se cambia al editar.
   *  Toda la información derivada (ranking, feed, dashboard) se filtra
   *  por este campo, así una apuesta hecha en el grupo A nunca aparece
   *  en el grupo B aunque el autor pertenezca a ambos. */
  groupId: string;
  createdAt: Timestamp;
  settledAt: Timestamp | null;
  bookmaker: Bookmaker;
  bookmakerLabel?: string;     // si es "other"
  matchId: string | null;       // legado: una sola apuesta -> un partido
  matchIds?: string[];          // nuevo: lista de partidos vinculados (combos)
  matchLabel: string;
  market: BetMarket;
  marketDetail: string;
  selection: string;
  odds: number;
  stake: number;
  potentialReturn: number;
  status: BetStatus;
  profit: number;              // se calcula al cerrar
  isCombo: boolean;
  /** Si true, el stake es un token regalado por la casa, no dinero del
   *  usuario. Si se pierde, profit = 0 (no se descuenta del saldo). Si
   *  se gana, profit = stake * (odds - 1) (igual que apuesta normal). El
   *  stake NO cuenta como dinero "en juego" en el saldo disponible ni
   *  como denominador del ROI. */
  isFreebet?: boolean;
  legs?: BetLeg[];
  notes?: string;
  /** Equipos vinculados a la apuesta — solo aplica a apuestas a futuro
   *  (outright). Si esta lista incluye, p.ej. "España", la apuesta
   *  aparecerá automáticamente en el popup de cualquier partido cuyo
   *  homeLabel o awayLabel sea "España". Es opcional: vacío = no se
   *  vincula a ningún partido y solo se ve en /bets y /feed. */
  teams?: string[];
}

// ============================================================
// MUNDIAL — Teams & Matches
// ============================================================
export interface Team {
  id: string;          // p.ej. "esp"
  name: string;        // "España"
  code: string;        // "ESP" (ISO)
  flagUrl?: string | null;
  fifaRanking?: number | null;
  confederation?: "UEFA" | "CONMEBOL" | "AFC" | "CAF" | "CONCACAF" | "OFC" | null;
}

export type MatchStage =
  | "group"
  | "r32"
  | "r16"
  | "qf"
  | "sf"
  | "third"
  | "final";

export type MatchStatus = "scheduled" | "live" | "finished";

export type GroupId =
  | "A" | "B" | "C" | "D" | "E" | "F"
  | "G" | "H" | "I" | "J" | "K" | "L";

export interface MatchResult {
  homeGoals: number;
  awayGoals: number;
  homeYellow: number;
  awayYellow: number;
  homeRed: number;
  awayRed: number;
  /** En eliminatorias, si terminó empatado tras 90' + prórroga, quién ganó
   *  los penaltis. Solo se rellena cuando hay empate en knockouts. */
  penaltyWinner?: "home" | "away" | null;
}

export interface Match {
  id: string;
  stage: MatchStage;
  groupId?: GroupId | null;
  matchday?: 1 | 2 | 3 | null;
  kickoffUtc: Timestamp;
  venue?: string | null;
  city?: string | null;
  homeTeamId: string | null;
  awayTeamId: string | null;
  // Etiquetas mostradas cuando el partido aún no tiene equipos asignados
  // (p. ej. "1º Grupo A vs 2º Grupo B" en cuadros eliminatorios)
  homeLabel: string;
  awayLabel: string;
  status: MatchStatus;
  result?: MatchResult | null;
  enteredBy?: string | null;    // uid del admin que metió el resultado
}
