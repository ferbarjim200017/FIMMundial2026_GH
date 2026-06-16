import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { suggestionConverter } from "@/lib/firebase/converters";

const SUGGESTIONS = "suggestions";

export function suggestionsCol() {
  return collection(db, SUGGESTIONS).withConverter(suggestionConverter);
}

export function suggestionDoc(id: string) {
  return doc(db, SUGGESTIONS, id).withConverter(suggestionConverter);
}

// ---------- Queries ----------

/**
 * Suscripción en tiempo real a TODAS las sugerencias, más recientes primero.
 * Como `createdAt` se fija con `Timestamp.now()` en el cliente al crear, la
 * ordenación es estable desde el primer render (sin saltos por timestamps
 * pendientes de servidor). No necesita índice compuesto (un solo `orderBy`).
 */
export function subscribeToSuggestions(
  cb: (items: import("@/types/domain").Suggestion[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  return onSnapshot(
    query(suggestionsCol(), orderBy("createdAt", "desc")),
    (snap) => cb(snap.docs.map((d) => d.data())),
    (err) => onError?.(err)
  );
}

// ---------- Mutations ----------

export interface CreateSuggestionInput {
  userId: string;
  authorName: string;
  authorAvatarUrl: string | null;
  text: string;
}

/** Crea una sugerencia. El autor es siempre el usuario autenticado. */
export async function createSuggestion(
  input: CreateSuggestionInput
): Promise<string> {
  const text = input.text.trim();
  if (!text) throw new Error("La sugerencia no puede estar vacía.");

  const ref = await addDoc(collection(db, SUGGESTIONS), {
    userId: input.userId,
    authorName: input.authorName,
    authorAvatarUrl: input.authorAvatarUrl ?? null,
    text,
    done: false,
    doneBy: null,
    doneAt: null,
    createdAt: Timestamp.now(),
    updatedAt: null,
  });
  return ref.id;
}

/** Edita el texto de una sugerencia (autor o admin, según reglas Firestore). */
export async function updateSuggestionText(
  id: string,
  text: string
): Promise<void> {
  const trimmed = text.trim();
  if (!trimmed) throw new Error("La sugerencia no puede estar vacía.");
  await updateDoc(doc(db, SUGGESTIONS, id), {
    text: trimmed,
    updatedAt: serverTimestamp(),
  });
}

/**
 * Marca/desmarca una sugerencia como hecha. Reservado a admins: las reglas de
 * Firestore impiden que un autor no-admin cambie el campo `done`.
 */
export async function setSuggestionDone(
  id: string,
  done: boolean,
  adminUid: string
): Promise<void> {
  await updateDoc(doc(db, SUGGESTIONS, id), {
    done,
    doneBy: done ? adminUid : null,
    doneAt: done ? serverTimestamp() : null,
  });
}

/** Elimina una sugerencia (autor o admin, según reglas Firestore). */
export async function deleteSuggestion(id: string): Promise<void> {
  await deleteDoc(doc(db, SUGGESTIONS, id));
}
