"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "@/features/auth/auth.context";
import { useGroup } from "@/features/groups/groups.context";
import { subscribeToAllBets } from "@/features/bets/bets.service";
import { betInGroup } from "@/features/bets/bets.utils";
import { isFirebaseConfigured } from "@/lib/firebase/client";
import {
  HOF_PODIUMS,
  buildEntryPhrase,
  computeHofMembership,
  type HofMembership,
  type HofTone,
} from "@/features/hall-of-fame/hall-of-fame.utils";
import { fimMemberByUsername } from "@/features/hall-of-fame/fim-members";
import type { Bet } from "@/types/domain";

/** Evento de "fulano ha entrado nuevo en tal ranking" (calculado en cliente). */
export interface HofEvent {
  id: string;
  uid: string;
  username: string;
  podiumKey: string;
  podiumLabel: string;
  tone: HofTone;
  phrase: string;
}

interface HofContextValue {
  unseen: HofEvent[];
  dismiss: () => void;
}

const HofContext = createContext<HofContextValue>({
  unseen: [],
  dismiss: () => {},
});

// "Base ya reconocida": la pertenencia de cada ranking que este usuario ya ha
// visto, guardada en localStorage por usuario + grupo. Comparando la
// pertenencia ACTUAL con esta base detectamos quién entra nuevo, SIN tocar
// Firestore (las apuestas ya están en memoria por el listener compartido).
const LS_PREFIX = "fim:hofBaseline:";

export function HallOfFameProvider({ children }: { children: ReactNode }) {
  const { appUser } = useAuth();
  const { activeGroup, memberUids, groupMembers } = useGroup();
  const uid = appUser?.uid ?? null;
  const gid = activeGroup?.id ?? null;

  const [allBets, setAllBets] = useState<Bet[] | null>(null);
  const [baseline, setBaseline] = useState<HofMembership | null>(null);
  const [baselineLoaded, setBaselineLoaded] = useState(false);

  // Listener compartido de apuestas (ya está siempre activo por el carrusel).
  useEffect(() => {
    if (!isFirebaseConfigured) {
      setAllBets([]);
      return;
    }
    return subscribeToAllBets(setAllBets);
  }, []);

  // Carga la base guardada para este usuario en este grupo.
  useEffect(() => {
    setBaselineLoaded(false);
    if (!uid || !gid || typeof window === "undefined") {
      setBaseline(null);
      return;
    }
    const raw = window.localStorage.getItem(`${LS_PREFIX}${uid}:${gid}`);
    let parsed: HofMembership | null = null;
    if (raw) {
      try {
        parsed = JSON.parse(raw) as HofMembership;
      } catch {
        parsed = null;
      }
    }
    setBaseline(parsed);
    setBaselineLoaded(true);
  }, [uid, gid]);

  const groupBets = useMemo(() => {
    if (allBets === null || !gid || memberUids.size === 0) return null;
    return allBets.filter((b) => betInGroup(b, gid) && memberUids.has(b.userId));
  }, [allBets, gid, memberUids]);

  const current = useMemo(
    () => (groupBets ? computeHofMembership(groupBets) : null),
    [groupBets]
  );

  const nameByUid = useMemo(() => {
    const m = new Map<string, string>();
    for (const u of groupMembers) {
      m.set(u.uid, fimMemberByUsername(u.username)?.name ?? u.username);
    }
    return m;
  }, [groupMembers]);

  const persist = useCallback(
    (membership: HofMembership) => {
      if (uid && gid && typeof window !== "undefined") {
        window.localStorage.setItem(
          `${LS_PREFIX}${uid}:${gid}`,
          JSON.stringify(membership)
        );
      }
    },
    [uid, gid]
  );

  // Primera vez (sin base guardada): fijamos la pertenencia actual SIN mostrar
  // banner, para no soltar un aluvión con la gente que ya estaba dentro.
  useEffect(() => {
    if (!baselineLoaded || !current) return;
    if (baseline === null) {
      persist(current);
      setBaseline(current);
    }
  }, [baselineLoaded, current, baseline, persist]);

  // Nuevos entrantes = uids que ahora están en un podio y no estaban en la base.
  const unseen = useMemo<HofEvent[]>(() => {
    if (!current || !baseline) return [];
    const evs: HofEvent[] = [];
    for (const def of HOF_PODIUMS) {
      const before = new Set(baseline[def.key] ?? []);
      for (const u of current[def.key] ?? []) {
        if (before.has(u)) continue;
        const name = nameByUid.get(u) ?? "Alguien";
        evs.push({
          id: `${def.key}:${u}`,
          uid: u,
          username: name,
          podiumKey: def.key,
          podiumLabel: def.label,
          tone: def.tone,
          phrase: buildEntryPhrase(def.key, name),
        });
      }
    }
    return evs;
  }, [current, baseline, nameByUid]);

  // Cerrar el banner = aceptar la pertenencia actual como nueva base.
  const dismiss = useCallback(() => {
    if (current) {
      persist(current);
      setBaseline(current);
    }
  }, [current, persist]);

  const value = useMemo(() => ({ unseen, dismiss }), [unseen, dismiss]);

  return <HofContext.Provider value={value}>{children}</HofContext.Provider>;
}

export function useHallOfFame(): HofContextValue {
  return useContext(HofContext);
}
