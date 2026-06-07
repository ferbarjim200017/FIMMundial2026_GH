import {
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
} from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { userConverter } from "@/lib/firebase/converters";
import {
  EMPTY_BOOKMAKER_BALANCES,
  EMPTY_USER_STATS,
  type AppUser,
  type BookmakerBalances,
  type UserRole,
} from "@/types/domain";
import { ADMIN_EMAILS } from "@/lib/constants";

const USERS = "users";

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

export function subscribeToRanking(
  callback: (users: AppUser[]) => void,
  max?: number
) {
  // Ordenamos cliente-side por ROI (campo anidado en stats). Evita pedir
  // un índice compuesto en Firestore y nos da control sobre el desempate.
  const q = max ? query(usersCol(), limitTo(max)) : usersCol();
  return onSnapshot(q, (snap) => {
    const users = snap.docs.map((d) => d.data());
    users.sort(compareUsersForRanking);
    callback(users);
  });
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
 * Actualiza los saldos iniciales por casa de apuestas. Recalcula también
 * `initialBalance` (suma) y `currentBalance` (= initial + totalProfit) para
 * que el ranking global se mantenga consistente.
 */
export async function updateInitialBalances(
  uid: string,
  patch: Partial<BookmakerBalances>
): Promise<void> {
  const user = await getUser(uid);
  if (!user) throw new Error("Usuario no encontrado");
  const current = user.initialBalances ?? EMPTY_BOOKMAKER_BALANCES;
  const merged: BookmakerBalances = {
    bet365: round2(patch.bet365 ?? current.bet365),
    winamax: round2(patch.winamax ?? current.winamax),
    other: round2(patch.other ?? current.other),
  };
  const initialBalance = round2(merged.bet365 + merged.winamax + merged.other);
  const totalProfit = user.stats?.totalProfit ?? 0;
  await updateDoc(doc(db, USERS, uid), {
    initialBalances: merged,
    initialBalance,
    currentBalance: round2(initialBalance + totalProfit),
  });
}

export async function ensureUserDoc(input: CreateUserInput): Promise<AppUser> {
  const existing = await getUser(input.uid);
  if (existing) return existing;
  return createUserDoc(input);
}
