import {
  arrayUnion,
  deleteDoc,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  getDocs,
  onSnapshot,
  query,
  limit as limitTo,
  serverTimestamp,
  Timestamp,
  where,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { userConverter } from "@/lib/firebase/converters";
import {
  EMPTY_BOOKMAKER_BALANCES,
  EMPTY_USER_STATS,
  type AppUser,
  type BookmakerBalances,
  type CashMovement,
  type RankMovementMap,
  type UserRole,
} from "@/types/domain";
import { ADMIN_EMAILS } from "@/lib/constants";

const USERS = "users";
const RANK_MOVEMENTS = "rankMovements";

export function usersCol() {
  return collection(db, USERS).withConverter(userConverter);
}

export function userDoc(uid: string) {
  return doc(db, USERS, uid).withConverter(userConverter);
}

export async function getUser(uid: string): Promise<AppUser | null> {
  const snap = await getDoc(userDoc(uid));
  return snap.exists() ? snap.data() : null;
}

export async function listUsers(): Promise<AppUser[]> {
  const snap = await getDocs(usersCol());
  return snap.docs.map((d) => d.data());
}

/**
 * Comparador del ranking. Ordena por ROI (% beneficio/pérdida sobre lo
 * apostado) descendente. Usa el saldo actual como desempate.
 *
 *  - Mayor ROI primero.
 *  - Si dos usuarios tienen el mismo ROI, gana el de mayor `currentBalance`.
 *  - Usuarios sin apuestas (totalStaked = 0 → ROI = 0) van al medio.
 */
export function compareUsersForRanking(a: AppUser, b: AppUser): number {
  const ra = a.stats?.roi ?? 0;
  const rb = b.stats?.roi ?? 0;
  if (rb !== ra) return rb - ra;
  return (b.currentBalance ?? 0) - (a.currentBalance ?? 0);
}

// Suscripción COMPARTIDA al ranking de usuarios. Como el carrusel (montado en
// todas las páginas) la mantiene viva, el resto de pantallas reutilizan el
// mismo listener y no vuelven a leer la colección al navegar.
let rankUnsub: Unsubscribe | null = null;
let rankLatest: AppUser[] | null = null;
const rankSubscribers = new Set<(users: AppUser[]) => void>();

export function subscribeToRanking(
  callback: (users: AppUser[]) => void,
  max?: number
): Unsubscribe {
  // Caso con límite (poco habitual): listener propio sin compartir.
  if (max) {
    return onSnapshot(query(usersCol(), limitTo(max)), (snap) => {
      const users = snap.docs.map((d) => d.data());
      users.sort(compareUsersForRanking);
      callback(users);
    });
  }

  rankSubscribers.add(callback);
  if (rankLatest) callback(rankLatest);

  if (!rankUnsub) {
    rankUnsub = onSnapshot(usersCol(), (snap) => {
      const users = snap.docs.map((d) => d.data());
      users.sort(compareUsersForRanking);
      rankLatest = users;
      for (const cb of rankSubscribers) cb(users);
    });
  }

  return () => {
    rankSubscribers.delete(callback);
    if (rankSubscribers.size === 0 && rankUnsub) {
      rankUnsub();
      rankUnsub = null;
      rankLatest = null;
    }
  };
}

/**
 * Suscripción a los miembros de un grupo concreto (`users` donde
 * `groups` array-contains groupId). Usado por el GroupContext para saber
 * a quién filtrar en cada pantalla.
 */
export function subscribeToGroupMembers(
  groupId: string,
  callback: (users: AppUser[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  return onSnapshot(
    query(usersCol(), where("groups", "array-contains", groupId)),
    (snap) => {
      const users = snap.docs.map((d) => d.data());
      users.sort(compareUsersForRanking);
      callback(users);
    },
    (err) => onError?.(err)
  );
}

export interface CreateUserInput {
  uid: string;
  email: string;
  username: string;
  avatarUrl?: string | null;
  initialBalance?: number;
}

/**
 * Crea el documento del usuario en Firestore. Si su email está en ADMIN_EMAILS,
 * se le asigna rol admin automáticamente (solo al crear; luego solo otro admin
 * puede modificarlo).
 */
export async function createUserDoc(input: CreateUserInput): Promise<AppUser> {
  const role: UserRole = ADMIN_EMAILS.includes(input.email.toLowerCase())
    ? "admin"
    : "member";

  const initialBalance = input.initialBalance ?? 0;

  // No podemos guardar AppUser directamente porque joinedAt es Timestamp.
  // Usamos setDoc sin converter para poder pasar serverTimestamp().
  const payload = {
    username: input.username,
    email: input.email,
    avatarUrl: input.avatarUrl ?? null,
    role,
    joinedAt: serverTimestamp(),
    initialBalance,
    currentBalance: initialBalance,
    stats: EMPTY_USER_STATS,
  };

  await setDoc(doc(db, USERS, input.uid), payload, { merge: false });
  const created = await getUser(input.uid);
  if (!created) throw new Error("No se pudo crear el usuario");
  return created;
}

export async function updateUserProfile(
  uid: string,
  data: Partial<Pick<AppUser, "username" | "avatarUrl">>
): Promise<void> {
  await updateDoc(doc(db, USERS, uid), data);
}

export async function setUserRole(uid: string, role: UserRole): Promise<void> {
  await updateDoc(doc(db, USERS, uid), { role });
}

/**
 * Elimina el documento del usuario en Firestore. NO elimina la cuenta de
 * Firebase Auth (eso requiere el Admin SDK desde un entorno servidor); si
 * el usuario vuelve a iniciar sesión podría regenerarse su documento. Las
 * apuestas asociadas se mantienen en Firestore para preservar el historial
 * del grupo.
 */
export async function deleteUserDoc(uid: string): Promise<void> {
  await deleteDoc(doc(db, USERS, uid));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Actualiza los saldos iniciales por casa de apuestas. Si se pasa `groupId`,
 * el cambio se guarda en `balancesPerGroup[groupId]`. Sin groupId, conserva
 * el comportamiento legacy (saldos globales). Recomputa los totales agregados
 * para que el ranking global "antiguo" se mantenga consistente.
 */
export async function updateInitialBalances(
  uid: string,
  patch: Partial<BookmakerBalances>,
  groupId?: string
): Promise<void> {
  const user = await getUser(uid);
  if (!user) throw new Error("Usuario no encontrado");

  // Saldo base sobre el que se aplica el patch
  let base: BookmakerBalances;
  if (groupId) {
    base =
      user.balancesPerGroup?.[groupId] ??
      // En FIM caemos al saldo legacy si todavía no se ha migrado
      (groupId === "FIM" ? user.initialBalances : null) ??
      EMPTY_BOOKMAKER_BALANCES;
  } else {
    base = user.initialBalances ?? EMPTY_BOOKMAKER_BALANCES;
  }

  const merged: BookmakerBalances = {
    bet365: round2(patch.bet365 ?? base.bet365),
    winamax: round2(patch.winamax ?? base.winamax),
    betfair: round2(patch.betfair ?? base.betfair ?? 0),
    other: round2(patch.other ?? base.other),
  };
  const initialBalance = round2(
    merged.bet365 + merged.winamax + merged.betfair + merged.other
  );
  const totalProfit = user.stats?.totalProfit ?? 0;

  if (groupId) {
    await updateDoc(doc(db, USERS, uid), {
      [`balancesPerGroup.${groupId}`]: merged,
    });
  } else {
    await updateDoc(doc(db, USERS, uid), {
      initialBalances: merged,
      initialBalance,
      currentBalance: round2(initialBalance + totalProfit),
    });
  }
}

// ---------- Ingresos / retiradas (cash movements) ----------

/**
 * Añade un ingreso o retirada al documento del usuario (array `cashMovements`).
 * Es 1 sola escritura y no necesita listeners: los movimientos viajan con los
 * datos del usuario que ya se cargan. No toca el beneficio ni el ROI.
 */
export async function addCashMovement(
  uid: string,
  movement: CashMovement
): Promise<void> {
  await updateDoc(doc(db, USERS, uid), {
    cashMovements: arrayUnion(movement),
  });
}

/**
 * Reemplaza la lista completa de movimientos (para editar/borrar). El que llama
 * pasa el array ya modificado a partir del que tiene en memoria.
 */
export async function setCashMovements(
  uid: string,
  movements: CashMovement[]
): Promise<void> {
  await updateDoc(doc(db, USERS, uid), { cashMovements: movements });
}

/**
 * Suscripción al snapshot de movimiento de posiciones de un grupo
 * (`rankMovements/{groupId}` → { [uid]: RankMovement }). Si las reglas aún no
 * permiten leerlo, devuelve un mapa vacío en vez de romper (flechas en guion).
 */
export function subscribeToRankMovements(
  groupId: string,
  callback: (map: RankMovementMap) => void
): Unsubscribe {
  return onSnapshot(
    doc(db, RANK_MOVEMENTS, groupId),
    (snap) => callback((snap.data() as RankMovementMap) ?? {}),
    (err) => {
      console.error("[rankMovements] subscribe", err);
      callback({});
    }
  );
}

/**
 * Escribe (merge) las entradas de movimiento que han cambiado. Lo llama el
 * cliente de cualquier miembro al abrir el ranking, tras recalcular la
 * posición de TODOS y detectar quién ha subido/bajado. `changedAt` se sella
 * con la hora del cliente para medir la ventana de 24 h de visibilidad.
 */
export async function writeRankMovements(
  groupId: string,
  changes: Record<string, { rank: number; dir: "up" | "down" | "flat" }>
): Promise<void> {
  const uids = Object.keys(changes);
  if (uids.length === 0) return;
  const now = Timestamp.now();
  const payload: RankMovementMap = {};
  for (const uid of uids) {
    payload[uid] = { rank: changes[uid].rank, dir: changes[uid].dir, changedAt: now };
  }
  await setDoc(doc(db, RANK_MOVEMENTS, groupId), payload, { merge: true });
}

export async function ensureUserDoc(input: CreateUserInput): Promise<AppUser> {
  const existing = await getUser(input.uid);
  if (existing) return existing;
  return createUserDoc(input);
}
