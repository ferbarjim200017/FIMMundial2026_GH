import {
  doc,
  onSnapshot,
  runTransaction,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import {
  HOF_PODIUMS,
  buildEntryPhrase,
  type HofMembership,
  type HofTone,
} from "./hall-of-fame.utils";

const COL = "hallOfFame";

/** Evento de "fulano ha entrado nuevo en tal ranking". */
export interface HofEvent {
  id: string;
  uid: string;
  username: string;
  podiumKey: string;
  podiumLabel: string;
  tone: HofTone;
  phrase: string;
  at: number; // ms (hora del cliente que lo detectó)
}

export interface HofDoc {
  membership: HofMembership;
  events: HofEvent[];
}

/** Suscripción al documento del Salón de la Fama de un grupo. */
export function subscribeToHof(
  groupId: string,
  cb: (doc: HofDoc | null) => void,
  onError?: (e: Error) => void
): Unsubscribe {
  return onSnapshot(
    doc(db, COL, groupId),
    (snap) => {
      if (!snap.exists()) {
        cb(null);
        return;
      }
      const data = snap.data() as Partial<HofDoc>;
      cb({ membership: data.membership ?? {}, events: data.events ?? [] });
    },
    (e) => onError?.(e)
  );
}

const MAX_EVENTS = 30;

/**
 * Reconcilia la pertenencia actual del Salón de la Fama con la guardada y, de
 * forma TRANSACCIONAL, registra un evento por cada persona que entra nueva en
 * algún podio. La transacción serializa a clientes concurrentes: el primero
 * escribe los eventos; los siguientes ya leen la pertenencia actualizada y no
 * duplican.
 *
 * La PRIMERA vez (documento inexistente) fija la base SIN generar eventos, para
 * no soltar un aluvión cuando el Salón de la Fama se puebla por primera vez.
 */
export async function reconcileHof(
  groupId: string,
  current: HofMembership,
  usernameByUid: Record<string, string>
): Promise<void> {
  const ref = doc(db, COL, groupId);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) {
      tx.set(ref, { membership: current, events: [] });
      return;
    }
    const data = snap.data() as Partial<HofDoc>;
    const stored = data.membership ?? {};
    const events: HofEvent[] = data.events ?? [];

    const now = Date.now();
    const newEvents: HofEvent[] = [];
    for (const def of HOF_PODIUMS) {
      const before = new Set(stored[def.key] ?? []);
      for (const uid of current[def.key] ?? []) {
        if (before.has(uid)) continue;
        const name = usernameByUid[uid] ?? "Alguien";
        newEvents.push({
          id: `${def.key}:${uid}:${now}`,
          uid,
          username: name,
          podiumKey: def.key,
          podiumLabel: def.label,
          tone: def.tone,
          phrase: buildEntryPhrase(def.key, name),
          at: now,
        });
      }
    }

    if (newEvents.length === 0) {
      // La pertenencia pudo cambiar solo por SALIDAS: actualizamos sin eventos.
      tx.update(ref, { membership: current });
      return;
    }
    const merged = [...events, ...newEvents].slice(-MAX_EVENTS);
    tx.set(ref, { membership: current, events: merged });
  });
}
