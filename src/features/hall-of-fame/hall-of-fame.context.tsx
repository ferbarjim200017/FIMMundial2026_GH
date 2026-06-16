"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "@/features/auth/auth.context";
import { useGroup } from "@/features/groups/groups.context";
import { subscribeToAllBets } from "@/features/bets/bets.service";
import { betInGroup } from "@/features/bets/bets.utils";
import { isFirebaseConfigured } from "@/lib/firebase/client";
import {
  computeHofMembership,
  membershipSig,
} from "@/features/hall-of-fame/hall-of-fame.utils";
import {
  reconcileHof,
  subscribeToHof,
  type HofEvent,
} from "@/features/hall-of-fame/hall-of-fame.service";
import type { Bet } from "@/types/domain";

interface HofContextValue {
  /** Eventos de nuevos entrantes que este usuario aún no ha cerrado. */
  unseen: HofEvent[];
  /** Cierra el banner: marca como vistos todos los eventos actuales. */
  dismiss: () => void;
}

const HofContext = createContext<HofContextValue>({
  unseen: [],
  dismiss: () => {},
});

// "Último visto" por usuario y grupo (los eventos son por grupo).
const LS_PREFIX = "fim:hofSeen:";

export function HallOfFameProvider({ children }: { children: ReactNode }) {
  const { appUser } = useAuth();
  const { activeGroup, memberUids, groupMembers } = useGroup();
  const uid = appUser?.uid ?? null;
  const gid = activeGroup?.id ?? null;

  const [allBets, setAllBets] = useState<Bet[] | null>(null);
  const [events, setEvents] = useState<HofEvent[]>([]);
  // "__none__" = aún sin primer snapshot; "__missing__" = doc no existe.
  const [storedSig, setStoredSig] = useState<string>("__none__");
  const [lastSeen, setLastSeen] = useState(0);

  // Suscripción global a apuestas (compartida con el resto de la app).
  useEffect(() => {
    if (!isFirebaseConfigured) {
      setAllBets([]);
      return;
    }
    return subscribeToAllBets(setAllBets);
  }, []);

  // Documento del Salón de la Fama del grupo activo.
  useEffect(() => {
    if (!gid || !isFirebaseConfigured) {
      setEvents([]);
      setStoredSig("__none__");
      return;
    }
    setStoredSig("__none__");
    return subscribeToHof(
      gid,
      (d) => {
        if (!d) {
          setEvents([]);
          setStoredSig("__missing__");
          return;
        }
        setEvents(d.events ?? []);
        setStoredSig(membershipSig(d.membership ?? {}));
      },
      () => setEvents([])
    );
  }, [gid]);

  // "Último visto" guardado para este usuario en este grupo.
  useEffect(() => {
    if (!uid || !gid || typeof window === "undefined") {
      setLastSeen(0);
      return;
    }
    const raw = window.localStorage.getItem(`${LS_PREFIX}${uid}:${gid}`);
    setLastSeen(raw ? Number(raw) || 0 : 0);
  }, [uid, gid]);

  // Apuestas del grupo activo (misma visibilidad que el feed/salón).
  const groupBets = useMemo(() => {
    if (allBets === null || !gid || memberUids.size === 0) return null;
    return allBets.filter((b) => betInGroup(b, gid) && memberUids.has(b.userId));
  }, [allBets, gid, memberUids]);

  const currentMembership = useMemo(
    () => (groupBets ? computeHofMembership(groupBets) : null),
    [groupBets]
  );

  const usernameByUid = useMemo(() => {
    const m: Record<string, string> = {};
    for (const u of groupMembers) m[u.uid] = u.username;
    return m;
  }, [groupMembers]);

  // Reconcilia cuando la pertenencia actual difiere de la guardada. Evita
  // reintentos en bucle con una firma del último intento.
  const lastAttempt = useRef<string>("");
  useEffect(() => {
    if (!gid || !currentMembership || groupMembers.length === 0) return;
    if (storedSig === "__none__") return; // esperamos el primer snapshot
    const curSig = membershipSig(currentMembership);
    if (curSig === storedSig) return; // nada que registrar
    const attemptKey = `${gid}|${curSig}`;
    if (lastAttempt.current === attemptKey) return;
    lastAttempt.current = attemptKey;
    reconcileHof(gid, currentMembership, usernameByUid).catch((e) => {
      console.error("[hof reconcile]", e);
      lastAttempt.current = ""; // permite reintentar al siguiente cambio
    });
  }, [gid, currentMembership, storedSig, usernameByUid, groupMembers.length]);

  const unseen = useMemo(
    () => events.filter((e) => e.at > lastSeen).sort((a, b) => b.at - a.at),
    [events, lastSeen]
  );

  const dismiss = useCallback(() => {
    const maxAt = events.reduce((m, e) => Math.max(m, e.at), lastSeen);
    setLastSeen(maxAt);
    if (uid && gid && typeof window !== "undefined") {
      window.localStorage.setItem(`${LS_PREFIX}${uid}:${gid}`, String(maxAt));
    }
  }, [events, lastSeen, uid, gid]);

  const value = useMemo(() => ({ unseen, dismiss }), [unseen, dismiss]);

  return <HofContext.Provider value={value}>{children}</HofContext.Provider>;
}

export function useHallOfFame(): HofContextValue {
  return useContext(HofContext);
}
