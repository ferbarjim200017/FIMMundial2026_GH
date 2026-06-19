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
  betfair: number;
  luckia: number;
  other: number;
}

export const EMPTY_BOOKMAKER_BALANCES: BookmakerBalances = {
  bet365: 0,
  winamax: 0,
  betfair: 0,
  luckia: 0,
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
  /** Ingresos/retiradas de dinero real, por grupo y casa. Afectan al saldo
   *  disponible, no al beneficio/ROI. */
  cashMovements?: CashMovement[];
  /** Casas opcionales (Betfair/Luckia) que el usuario ha elegido mostrar en su
   *  dashboard. Las que tienen actividad (apuestas/movimientos) se muestran
   *  solas aunque no estén aquí. */
  shownBookmakers?: Bookmaker[];
}

/** Última posición conocida de un usuario en un grupo + dirección del último
 *  cambio y cuándo ocurrió (para la ventana de visibilidad de 24 h). Vive en
 *  el documento compartido `rankMovements/{groupId}`, indexado por uid. */
export interface RankMovement {
  /** Posición conocida la última vez (1 = primero). */
  rank: number;
  /** Dirección del último cambio respecto a la posición previa. */
  dir: "up" | "down" | "flat";
  /** Momento del último cambio de posición. */
  changedAt: Timestamp;
}

/** Snapshot de movimiento de un grupo: { [uid]: RankMovement }. */
export type RankMovementMap = Record<string, RankMovement>;

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
export type Bookmaker = "bet365" | "winamax" | "betfair" | "luckia" | "other";

// ============================================================
// CASH MOVEMENTS (ingresos / retiradas de dinero real)
// ============================================================
export type CashMovementType = "deposit" | "withdrawal";

/**
 * Ingreso o retirada de dinero real en una casa de apuestas. Se guarda como un
 * array dentro del documento del usuario (`AppUser.cashMovements`) para no
 * añadir colecciones/listeners ni coste extra de Firestore. Afecta SOLO al
 * saldo disponible; NO cuenta como beneficio ni en el ROI/ranking.
 */
export interface CashMovement {
  id: string;
  groupId: string;
  bookmaker: Bookmaker;
  type: CashMovementType;
  /** Importe SIEMPRE positivo; el signo lo marca `type`. */
  amount: number;
  at: Timestamp;
  note?: string;
}

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
  | "superaumento"   // cuota "superaumentada" por la casa (super boost)
  | "asegurada"  // apuesta asegurada (seguro/cobertura de la casa)
  | "outright"   // apuestas a futuro: ganador grupo, mejor equipo de un continente, top scorer…
  | "combo"
  | "custom";

export type BetStatus = "pending" | "won" | "lost" | "void" | "cashout";

/** Acción registrada en el historial de una apuesta (control para admins). */
export type BetHistoryAction = "created" | "edited" | "settled" | "unsettled";

export interface BetHistoryEntry {
  /** Cuándo ocurrió (hora del cliente que realizó el cambio). */
  at: Timestamp;
  action: BetHistoryAction;
  /** Estado resultante de la apuesta (para settled/unsettled). */
  status?: BetStatus;
}

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
  /** Grupos a los que pertenece la apuesta. Por defecto solo el grupo
   *  activo del autor en el momento de crearla, pero el usuario puede
   *  compartirla con varios grupos a la vez. Filtros usan
   *  `getBetGroupIds(bet)` por compatibilidad con bets legacy. */
  groupIds?: string[];
  /** Legacy: groupId único anterior al modelo multi-grupo. Se sigue
   *  escribiendo a `groupIds[0]` por backwards-compat para que cualquier
   *  consumidor antiguo no se rompa, pero las apuestas nuevas no lo
   *  consultan. */
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
  /** Historial de cambios (creada/editada/liquidada/reabierta) con fecha-hora.
   *  Solo se muestra a admins en la ficha de la apuesta. */
  history?: BetHistoryEntry[];
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
