import {
  addDoc,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  getDocsFromCache,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
  type QueryConstraint,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { betConverter, userConverter } from "@/lib/firebase/converters";
import type {
  Bet,
  BetHistoryAction,
  BetHistoryEntry,
  BetStatus,
} from "@/types/domain";
import type { BetFormValues } from "./bets.schema";
import { calcProfit, computeUserStats, round2 } from "./bets.utils";

const BETS = "bets";

/** Entrada de historial con la hora del cliente (no se puede usar
 *  serverTimestamp dentro de un array). */
function historyEntry(
  action: BetHistoryAction,
  status?: BetStatus
): BetHistoryEntry {
  return status
    ? { at: Timestamp.now(), action, status }
    : { at: Timestamp.now(), action };
}
const USERS = "users";

export function betsCol() {
  return collection(db, BETS).withConverter(betConverter);
}

export function betDoc(betId: string) {
  return doc(db, BETS, betId).withConverter(betConverter);
}

// ---------- Queries ----------

export interface BetsFilter {
  userId?: string;
  status?: BetStatus | "all";
  bookmaker?: Bet["bookmaker"] | "all";
}

function buildConstraints(f: BetsFilter): QueryConstraint[] {
  const c: QueryConstraint[] = [];
  if (f.userId) c.push(where("userId", "==", f.userId));
  if (f.status && f.status !== "all") c.push(where("status", "==", f.status));
  if (f.bookmaker && f.bookmaker !== "all")
    c.push(where("bookmaker", "==", f.bookmaker));
  c.push(orderBy("createdAt", "desc"));
  return c;
}

export async function listBets(filter: BetsFilter = {}): Promise<Bet[]> {
  const snap = await getDocs(query(betsCol(), ...buildConstraints(filter)));
  return snap.docs.map((d) => d.data());
}

/**
 * Igual que `listBets`, pero intenta servirse de la CACHÉ local primero (esas
 * lecturas no se facturan en Firestore). Como la app mantiene un listener
 * global de apuestas (carrusel + provider del salón de la fama), la caché está
 * sincronizada y devuelve datos correctos. Si la caché está vacía/fría (p. ej.
 * recién abierta), cae al servidor. Se usa en el recálculo de stats, que se
 * lanza tras cada acción y antes leía TODAS las apuestas del usuario del
 * servidor en cada una.
 */
async function listBetsCacheFirst(filter: BetsFilter = {}): Promise<Bet[]> {
  const q = query(betsCol(), ...buildConstraints(filter));
  try {
    const cached = await getDocsFromCache(q);
    if (!cached.empty) return cached.docs.map((d) => d.data());
  } catch {
    // Sin caché disponible (offline frío, etc.): caemos al servidor.
  }
  const snap = await getDocs(q);
  return snap.docs.map((d) => d.data());
}

export function subscribeToBets(
  filter: BetsFilter,
  cb: (bets: Bet[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  return onSnapshot(
    query(betsCol(), ...buildConstraints(filter)),
    (snap) => cb(snap.docs.map((d) => d.data())),
    (err) => onError?.(err)
  );
}

// ---------- Suscripción global compartida ----------
//
// Varias pantallas necesitan "todas las apuestas del sistema" a la vez: el
// carrusel del ranking (montado en TODAS las páginas), la página de ranking,
// el feed y el comparador. Antes cada una abría su propio `subscribeToBets({})`,
// con lo que en /ranking y /feed convivían dos listeners idénticos y se
// deserializaba la colección por duplicado en memoria.
//
// `subscribeToAllBets` mantiene UN único `onSnapshot` subyacente, compartido y
// con conteo de referencias: se abre con el primer suscriptor y se cierra con
// el último. A un suscriptor nuevo se le entrega de inmediato el último
// snapshot conocido, así que el comportamiento visible es idéntico (incluso
// algo más rápido). El array que se reparte es de solo lectura para los
// consumidores: todos copian (`[...]`, `.filter`, `.map`) antes de ordenar.
let sharedUnsub: Unsubscribe | null = null;
let sharedLatest: Bet[] | null = null;
const sharedSubscribers = new Set<(bets: Bet[]) => void>();

export function subscribeToAllBets(cb: (bets: Bet[]) => void): Unsubscribe {
  sharedSubscribers.add(cb);

  // Si ya hay datos en memoria, los servimos al instante al nuevo suscriptor.
  if (sharedLatest) cb(sharedLatest);

  // Abrimos el listener subyacente solo la primera vez.
  if (!sharedUnsub) {
    sharedUnsub = onSnapshot(
      query(betsCol(), ...buildConstraints({})),
      (snap) => {
        sharedLatest = snap.docs.map((d) => d.data());
        for (const sub of sharedSubscribers) sub(sharedLatest);
      }
    );
  }

  return () => {
    sharedSubscribers.delete(cb);
    if (sharedSubscribers.size === 0 && sharedUnsub) {
      sharedUnsub();
      sharedUnsub = null;
      sharedLatest = null;
    }
  };
}

/**
 * Suscripción a todas las apuestas que incluyan un partido concreto. Usa
 * `array-contains` sobre `matchIds`, que en todas las apuestas creadas
 * desde la app contiene el id del partido (incluso para apuestas no
 * combinadas). Ordena en cliente para evitar el requisito de un índice
 * compuesto en Firestore (`array-contains` + `orderBy` exige índice).
 */
export function subscribeToBetsByMatch(
  matchId: string,
  cb: (bets: Bet[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  return onSnapshot(
    query(betsCol(), where("matchIds", "array-contains", matchId)),
    (snap) => {
      const bets = snap.docs.map((d) => d.data());
      bets.sort((a, b) => b.createdAt.toMillis() - a.createdAt.toMillis());
      cb(bets);
    },
    (err) => onError?.(err)
  );
}

/**
 * Suscripción combinada: apuestas directas al partido (`matchIds
 * array-contains` matchId) + apuestas a futuro vinculadas a alguno de los
 * dos equipos (`teams array-contains-any` [homeLabel, awayLabel]).
 *
 * Permite que un outright sobre, p. ej., "España" aparezca automáticamente
 * en el popup de cualquier partido suyo. Dedup en cliente por `id`.
 */
export function subscribeToBetsForMatch(
  match: { id: string; homeLabel: string; awayLabel: string },
  cb: (bets: Bet[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  let byMatch: Bet[] = [];
  let byTeam: Bet[] = [];

  const emit = () => {
    const map = new Map<string, Bet>();
    for (const b of byMatch) map.set(b.id, b);
    for (const b of byTeam) map.set(b.id, b);
    const bets = [...map.values()];
    bets.sort((a, b) => b.createdAt.toMillis() - a.createdAt.toMillis());
    cb(bets);
  };

  const unsubMatch = onSnapshot(
    query(betsCol(), where("matchIds", "array-contains", match.id)),
    (snap) => {
      byMatch = snap.docs.map((d) => d.data());
      emit();
    },
    (err) => onError?.(err)
  );

  const teamLabels = [match.homeLabel, match.awayLabel].filter(
    (s): s is string => typeof s === "string" && s.length > 0
  );

  let unsubTeam: Unsubscribe = () => {};
  if (teamLabels.length > 0) {
    unsubTeam = onSnapshot(
      query(betsCol(), where("teams", "array-contains-any", teamLabels)),
      (snap) => {
        byTeam = snap.docs.map((d) => d.data());
        emit();
      },
      (err) => onError?.(err)
    );
  }

  return () => {
    unsubMatch();
    unsubTeam();
  };
}

export async function getBet(betId: string): Promise<Bet | null> {
  const snap = await getDoc(betDoc(betId));
  return snap.exists() ? snap.data() : null;
}

// ---------- Mutations ----------

export interface CreateBetInput extends BetFormValues {
  userId: string;
}

export async function createBet(input: CreateBetInput): Promise<string> {
  const placedAtDate = new Date(input.placedAt);
  const stake = round2(input.stake);
  const odds = round2(input.odds);
  const matchIds = input.matchIds ?? [];
  const groupIds = (input.groupIds ?? []).filter((g) => g.length > 0);
  if (groupIds.length === 0) {
    throw new Error("La apuesta necesita pertenecer al menos a un grupo.");
  }

  const payload = {
    userId: input.userId,
    // Legacy denormalizado: el primer grupo se sigue escribiendo en
    // `groupId` para que consumidores antiguos no se rompan.
    groupId: groupIds[0],
    groupIds,
    createdAt: Timestamp.fromDate(placedAtDate),
    settledAt: null,
    bookmaker: input.bookmaker,
    ...(input.bookmaker === "other" && input.bookmakerLabel
      ? { bookmakerLabel: input.bookmakerLabel.trim() }
      : {}),
    matchId: matchIds[0] ?? null,
    matchIds,
    matchLabel: input.matchLabel.trim(),
    market: input.market,
    marketDetail: input.marketDetail?.trim() ?? "",
    selection: input.selection.trim(),
    odds,
    stake,
    potentialReturn: round2(stake * odds),
    status: "pending" as BetStatus,
    profit: 0,
    isCombo: input.market === "combo" || matchIds.length > 1,
    isFreebet: !!input.isFreebet,
    notes: input.notes?.trim() ?? "",
    history: [historyEntry("created")],
    // Equipos vinculados solo tienen sentido en apuestas a futuro.
    ...(input.market === "outright" && (input.teams?.length ?? 0) > 0
      ? { teams: input.teams }
      : {}),
  };

  // Ignoramos converter aquí porque queremos pasar serverTimestamp si quisiéramos
  const ref = await addDoc(collection(db, BETS), payload);
  return ref.id;
}

export interface UpdateBetInput extends BetFormValues {
  betId: string;
}

/**
 * Edita una apuesta existente. Si la apuesta ya está liquidada (won/lost/
 * cashout/void), recalcula su profit con la nueva combinación stake/odds
 * y aplica el delta al saldo del usuario, todo en una transacción. Para
 * cashout mantiene el profit que el usuario introdujo (es manual).
 */
export async function updateBet(input: UpdateBetInput): Promise<void> {
  const stake = round2(input.stake);
  const odds = round2(input.odds);
  const matchIds = input.matchIds ?? [];
  const groupIds = (input.groupIds ?? []).filter((g) => g.length > 0);
  if (groupIds.length === 0) {
    throw new Error("La apuesta necesita pertenecer al menos a un grupo.");
  }

  const patch: Record<string, unknown> = {
    bookmaker: input.bookmaker,
    bookmakerLabel:
      input.bookmaker === "other" ? input.bookmakerLabel?.trim() ?? "" : "",
    matchId: matchIds[0] ?? null,
    matchIds,
    groupId: groupIds[0],
    groupIds,
    matchLabel: input.matchLabel.trim(),
    market: input.market,
    marketDetail: input.marketDetail?.trim() ?? "",
    selection: input.selection.trim(),
    odds,
    stake,
    potentialReturn: round2(stake * odds),
    createdAt: Timestamp.fromDate(new Date(input.placedAt)),
    notes: input.notes?.trim() ?? "",
    isCombo: input.market === "combo" || matchIds.length > 1,
    isFreebet: !!input.isFreebet,
    // En edición sobrescribimos siempre el campo (incluyendo array vacío) para
    // que si el usuario quita todos los equipos también se borre.
    teams: input.market === "outright" ? input.teams ?? [] : [],
    history: arrayUnion(historyEntry("edited")),
  };

  let userIdToRecompute: string | null = null;

  await runTransaction(db, async (tx) => {
    const betRef = doc(db, BETS, input.betId);
    const betSnap = await tx.get(betRef);
    if (!betSnap.exists()) throw new Error("Apuesta no encontrada");
    const bet = { id: betSnap.id, ...(betSnap.data() as Omit<Bet, "id">) };

    const oldProfit = bet.profit ?? 0;
    // Para cashout mantenemos el profit que metió el usuario en settleBet;
    // para won/lost recalculamos con la nueva stake/odds (y respetando si
    // es freebet: una freebet perdida no resta del saldo).
    const isFreebet =
      input.isFreebet !== undefined ? !!input.isFreebet : !!bet.isFreebet;
    const newProfit =
      bet.status === "pending"
        ? 0
        : bet.status === "cashout"
        ? oldProfit
        : calcProfit(stake, odds, bet.status, undefined, isFreebet);

    patch.profit = round2(newProfit);
    tx.update(betRef, patch);

    const deltaProfit = newProfit - oldProfit;
    if (deltaProfit !== 0) {
      const userRef = doc(db, USERS, bet.userId).withConverter(userConverter);
      const userSnap = await tx.get(userRef);
      if (userSnap.exists()) {
        const user = userSnap.data();
        tx.update(doc(db, USERS, bet.userId), {
          currentBalance: round2(user.currentBalance + deltaProfit),
        });
      }
    }

    userIdToRecompute = bet.userId;
  });

  if (userIdToRecompute) {
    await recomputeAndPersistStats(userIdToRecompute);
  }
}

/**
 * Cierra una apuesta y actualiza, de forma TRANSACCIONAL, las estadísticas
 * y `currentBalance` del usuario propietario.
 */
export async function settleBet(
  betId: string,
  newStatus: Exclude<BetStatus, "pending">,
  cashoutProfit?: number
): Promise<void> {
  await runTransaction(db, async (tx) => {
    // 1. Leer apuesta
    const betRef = doc(db, BETS, betId);
    const betSnap = await tx.get(betRef);
    if (!betSnap.exists()) throw new Error("Apuesta no encontrada");
    const bet = { id: betSnap.id, ...(betSnap.data() as Omit<Bet, "id">) };

    // 2. Leer usuario
    const userRef = doc(db, USERS, bet.userId).withConverter(userConverter);
    const userSnap = await tx.get(userRef);
    if (!userSnap.exists()) throw new Error("Usuario no encontrado");
    const user = userSnap.data();

    // 3. Cargar el resto de apuestas del usuario (fuera de la transacción
    //    para evitar reads masivos dentro; aceptamos pequeña ventana de
    //    inconsistencia: ok para grupo privado).
    //    En su lugar, podemos recalcular incrementalmente desde el delta.
    const oldProfit = bet.profit ?? 0;
    const newProfit = calcProfit(
      bet.stake,
      bet.odds,
      newStatus,
      cashoutProfit,
      !!bet.isFreebet
    );
    const deltaProfit = newProfit - oldProfit;

    // 4. Update apuesta
    tx.update(betRef, {
      status: newStatus,
      profit: newProfit,
      settledAt: serverTimestamp(),
      history: arrayUnion(historyEntry("settled", newStatus)),
    });

    // 5. Update balance (incremental). Las stats se recalcularán fuera
    //    de la transacción con un segundo fetch+update, para mantener la
    //    transacción acotada y rápida.
    tx.update(doc(db, USERS, bet.userId), {
      currentBalance: round2(user.currentBalance + deltaProfit),
    });
  });

  // Recalcular stats agregadas con todas las apuestas (post-tx, mejor esfuerzo)
  const bet = await getBet(betId);
  if (bet) await recomputeAndPersistStats(bet.userId);
}

export async function deleteBet(betId: string): Promise<void> {
  const bet = await getBet(betId);
  if (!bet) return;
  await deleteDoc(doc(db, BETS, betId));
  // Si estaba liquidada, revertir profit y recalcular stats
  if (bet.status !== "pending" && bet.profit !== 0) {
    await runTransaction(db, async (tx) => {
      const userRef = doc(db, USERS, bet.userId).withConverter(userConverter);
      const userSnap = await tx.get(userRef);
      if (!userSnap.exists()) return;
      const user = userSnap.data();
      tx.update(doc(db, USERS, bet.userId), {
        currentBalance: round2(user.currentBalance - bet.profit),
      });
    });
  }
  await recomputeAndPersistStats(bet.userId);
}

/**
 * Devuelve una apuesta liquidada (won/lost/void/cashout) al estado
 * pending y deshace por completo cualquier efecto que tuviera en las
 * stats y el saldo del usuario. Se apoya en `recomputeAndPersistStats`,
 * que es autoritativo: recalcula stats y `currentBalance` desde el
 * array real de apuestas, así que aunque viniera alguna deriva
 * acumulada queda corregida.
 *
 * No-op si la apuesta ya estaba en pending.
 */
export async function unsettleBet(betId: string): Promise<void> {
  const betRef = doc(db, BETS, betId);
  const existing = await getDoc(betRef);
  if (!existing.exists()) throw new Error("Apuesta no encontrada");
  const data = existing.data();
  if (data.status === "pending") return;

  // Resetear los campos del bet en una sola escritura atómica.
  await updateDoc(betRef, {
    status: "pending" as BetStatus,
    profit: 0,
    settledAt: null,
    history: arrayUnion(historyEntry("unsettled", "pending")),
  });

  // Cleanup autoritativo del usuario: stats + currentBalance recalculados
  // desde cero a partir del array de apuestas actual (que ya tiene esta
  // apuesta como pending). Así no queda nada de la liquidación previa
  // en ranking, dashboard, /admin ni feed.
  await recomputeAndPersistStats(data.userId);
}

/**
 * Recalcula y persiste las estadísticas agregadas Y el `currentBalance`
 * legacy del usuario desde cero, a partir de su array actual de apuestas.
 * Es autoritativo (idempotente): aunque venga una deriva acumulada de
 * liquidaciones previas, esta función la corrige porque parte del estado
 * real de los `bets` en Firestore y no de incrementos. Se llama tras
 * cualquier mutación de apuestas (settle, unsettle, edit, delete).
 */
export async function recomputeAndPersistStats(userId: string): Promise<void> {
  const userBets = await listBetsCacheFirst({ userId });
  const stats = computeUserStats(userBets);

  const userSnap = await getDoc(doc(db, USERS, userId).withConverter(userConverter));
  if (!userSnap.exists()) {
    await updateDoc(doc(db, USERS, userId), { stats });
    return;
  }
  const user = userSnap.data();
  const initials =
    user.initialBalances ?? { bet365: 0, winamax: 0, betfair: 0, other: 0 };
  const initialBalance = round2(
    (initials.bet365 ?? 0) +
      (initials.winamax ?? 0) +
      (initials.betfair ?? 0) +
      (initials.other ?? 0)
  );
  // currentBalance se mantiene como agregado legacy global. La UI por
  // grupos no lo lee, pero conviene que esté coherente para /admin y
  // cualquier consumidor externo.
  const currentBalance = round2(initialBalance + stats.totalProfit);

  await updateDoc(doc(db, USERS, userId), {
    stats,
    initialBalance,
    currentBalance,
  });
}

export interface RecomputeAllResult {
  usersProcessed: number;
  errors: number;
}

/**
 * Lanza `recomputeAndPersistStats` para todos los usuarios del sistema.
 * Útil cuando hubo operaciones (settle/unsettle/edit) antes de que
 * `recomputeAndPersistStats` fuera autoritativo y quedó deriva en
 * `user.stats` o `user.currentBalance`. Es idempotente: se puede
 * ejecutar las veces que haga falta.
 */
export async function recomputeAllUsersStats(): Promise<RecomputeAllResult> {
  const snap = await getDocs(query(collection(db, USERS)));
  let usersProcessed = 0;
  let errors = 0;
  for (const d of snap.docs) {
    try {
      await recomputeAndPersistStats(d.id);
      usersProcessed += 1;
    } catch (err) {
      console.error(`[recomputeAllUsersStats] uid=${d.id}`, err);
      errors += 1;
    }
  }
  return { usersProcessed, errors };
}

export interface MigrateBetsResult {
  total: number;
  alreadyTagged: number;
  migrated: number;
}

/**
 * Migración one-shot: asigna `groupId` a todas las apuestas que aún no
 * lo tengan, usando el `defaultGroupId` (típicamente "FIM"). Es idempotente
 * — las que ya tengan groupId se saltan.
 */
export async function migrateBetsToGroup(
  defaultGroupId: string
): Promise<MigrateBetsResult> {
  const snap = await getDocs(query(betsCol()));
  let alreadyTagged = 0;
  let migrated = 0;
  const total = snap.size;

  const BATCH_SIZE = 400;
  const docs = snap.docs;
  for (let i = 0; i < docs.length; i += BATCH_SIZE) {
    const slice = docs.slice(i, i + BATCH_SIZE);
    const batch = writeBatch(db);
    let dirty = false;
    for (const d of slice) {
      const data = d.data();
      if (data.groupId) {
        alreadyTagged += 1;
        continue;
      }
      batch.update(doc(db, BETS, d.id), { groupId: defaultGroupId });
      migrated += 1;
      dirty = true;
    }
    if (dirty) await batch.commit();
  }

  return { total, alreadyTagged, migrated };
}
