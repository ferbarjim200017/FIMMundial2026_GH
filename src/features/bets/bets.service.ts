import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
  type QueryConstraint,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { betConverter, userConverter } from "@/lib/firebase/converters";
import type { Bet, BetStatus } from "@/types/domain";
import type { BetFormValues } from "./bets.schema";
import { calcProfit, computeUserStats, round2 } from "./bets.utils";

const BETS = "bets";
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

  const payload = {
    userId: input.userId,
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

  const patch: Record<string, unknown> = {
    bookmaker: input.bookmaker,
    bookmakerLabel:
      input.bookmaker === "other" ? input.bookmakerLabel?.trim() ?? "" : "",
    matchId: matchIds[0] ?? null,
    matchIds,
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
 * Recalcula y persiste las estadísticas agregadas del usuario en su
 * documento. Se llama tras cualquier mutación de apuestas.
 */
export async function recomputeAndPersistStats(userId: string): Promise<void> {
  const userBets = await listBets({ userId });
  const stats = computeUserStats(userBets);
  await updateDoc(doc(db, USERS, userId), { stats });
}
