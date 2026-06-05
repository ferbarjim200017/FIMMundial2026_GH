import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  getDocs,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { userConverter } from "@/lib/firebase/converters";
import { EMPTY_USER_STATS, type AppUser, type UserRole } from "@/types/domain";
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

export async function ensureUserDoc(input: CreateUserInput): Promise<AppUser> {
  const existing = await getUser(input.uid);
  if (existing) return existing;
  return createUserDoc(input);
}
