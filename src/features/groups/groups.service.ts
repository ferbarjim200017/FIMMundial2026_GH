import {
  arrayRemove,
  arrayUnion,
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  writeBatch,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { groupConverter } from "@/lib/firebase/converters";
import type { AppGroup } from "@/types/domain";
import { listUsers } from "@/features/users/users.service";

const GROUPS = "groups";
const USERS = "users";

/** ID y nombre del grupo único creado durante el bootstrap. */
export const FIM_GROUP_ID = "FIM";
export const FIM_GROUP_NAME = "FIM";

export function groupsCol() {
  return collection(db, GROUPS).withConverter(groupConverter);
}

export function groupDoc(id: string) {
  return doc(db, GROUPS, id).withConverter(groupConverter);
}

export async function getGroup(id: string): Promise<AppGroup | null> {
  const snap = await getDoc(groupDoc(id));
  return snap.exists() ? snap.data() : null;
}

export async function listGroups(): Promise<AppGroup[]> {
  const snap = await getDocs(query(groupsCol()));
  return snap.docs.map((d) => d.data());
}

export function subscribeToGroups(
  cb: (groups: AppGroup[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  return onSnapshot(
    query(groupsCol()),
    (snap) => cb(snap.docs.map((d) => d.data())),
    (err) => onError?.(err)
  );
}

export interface CreateGroupInput {
  id: string;
  name: string;
  createdBy?: string | null;
}

/**
 * Crea un grupo. Si ya existe un documento con ese id, lanza un error para
 * no sobrescribir membresías existentes (los UIDs viven en `user.groups`).
 */
export async function createGroup(input: CreateGroupInput): Promise<AppGroup> {
  const existing = await getGroup(input.id);
  if (existing) {
    throw new Error(`El grupo "${input.id}" ya existe`);
  }
  await setDoc(doc(db, GROUPS, input.id), {
    name: input.name.trim(),
    createdAt: serverTimestamp(),
    createdBy: input.createdBy ?? null,
  });
  const created = await getGroup(input.id);
  if (!created) throw new Error("No se pudo leer el grupo recién creado");
  return created;
}

/** Añade un usuario a un grupo. Idempotente — `arrayUnion` no duplica. */
export async function addUserToGroup(
  groupId: string,
  uid: string
): Promise<void> {
  await updateDoc(doc(db, USERS, uid), {
    groups: arrayUnion(groupId),
  });
}

/** Quita un usuario de un grupo. Si era su `activeGroupId`, lo limpia
 *  también para que el siguiente acceso elija otro. */
export async function removeUserFromGroup(
  groupId: string,
  uid: string
): Promise<void> {
  const userRef = doc(db, USERS, uid);
  const snap = await getDoc(userRef);
  const data = snap.data();
  const patch: Record<string, unknown> = {
    groups: arrayRemove(groupId),
  };
  if (data?.activeGroupId === groupId) {
    patch.activeGroupId = null;
  }
  await updateDoc(userRef, patch);
}

/** Cambia el grupo activo del usuario. El llamador debe asegurarse de que
 *  el usuario pertenece a `groupId`. */
export async function setActiveGroup(
  uid: string,
  groupId: string | null
): Promise<void> {
  await updateDoc(doc(db, USERS, uid), {
    activeGroupId: groupId,
  });
}

export interface SeedFIMResult {
  groupCreated: boolean;
  usersAssigned: number;
  usersAlreadyMember: number;
  usersWithNewActive: number;
  total: number;
}

/**
 * Bootstrap: crea el grupo "FIM" si no existe y asigna a TODOS los usuarios
 * actuales como miembros, fijando también su `activeGroupId` cuando no lo
 * tenían. Idempotente — se puede volver a ejecutar sin efectos colaterales.
 */
export async function seedFIMGroup(currentAdminUid?: string | null): Promise<SeedFIMResult> {
  // 1. Asegurar grupo FIM
  let groupCreated = false;
  const existing = await getGroup(FIM_GROUP_ID);
  if (!existing) {
    await setDoc(doc(db, GROUPS, FIM_GROUP_ID), {
      name: FIM_GROUP_NAME,
      createdAt: Timestamp.now(),
      createdBy: currentAdminUid ?? null,
    });
    groupCreated = true;
  }

  // 2. Asignar todos los usuarios
  const users = await listUsers();
  let usersAssigned = 0;
  let usersAlreadyMember = 0;
  let usersWithNewActive = 0;

  // Firestore limita a 500 ops por batch; sobra margen pero parto por si acaso.
  const BATCH_SIZE = 400;
  for (let i = 0; i < users.length; i += BATCH_SIZE) {
    const slice = users.slice(i, i + BATCH_SIZE);
    const batch = writeBatch(db);
    for (const u of slice) {
      const ref = doc(db, USERS, u.uid);
      const groups = u.groups ?? [];
      const isMember = groups.includes(FIM_GROUP_ID);
      const patch: Record<string, unknown> = {};
      if (!isMember) {
        patch.groups = arrayUnion(FIM_GROUP_ID);
        usersAssigned += 1;
      } else {
        usersAlreadyMember += 1;
      }
      if (!u.activeGroupId) {
        patch.activeGroupId = FIM_GROUP_ID;
        usersWithNewActive += 1;
      }
      if (Object.keys(patch).length > 0) batch.update(ref, patch);
    }
    await batch.commit();
  }

  return {
    groupCreated,
    usersAssigned,
    usersAlreadyMember,
    usersWithNewActive,
    total: users.length,
  };
}
