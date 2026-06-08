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
import {
  setActiveGroup,
  subscribeToGroups,
} from "@/features/groups/groups.service";
import type { AppGroup } from "@/types/domain";

interface GroupContextValue {
  /** Catálogo completo de grupos del sistema. */
  allGroups: AppGroup[];
  /** Grupos a los que pertenece el usuario actual, en el mismo orden que
   *  los devuelve Firestore. */
  userGroups: AppGroup[];
  /** Grupo activo seleccionado por el usuario. `null` si no tiene ninguno
   *  asignado todavía (estado de onboarding). */
  activeGroup: AppGroup | null;
  /** True hasta que llega el primer snapshot de grupos. */
  loading: boolean;
  /** Cambia el grupo activo. Persiste en Firestore. */
  switchActiveGroup: (groupId: string) => Promise<void>;
}

const GroupContext = createContext<GroupContextValue>({
  allGroups: [],
  userGroups: [],
  activeGroup: null,
  loading: true,
  switchActiveGroup: async () => {},
});

export function GroupProvider({ children }: { children: ReactNode }) {
  const { appUser } = useAuth();
  const [allGroups, setAllGroups] = useState<AppGroup[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = subscribeToGroups((groups) => {
      setAllGroups(groups);
      setLoading(false);
    });
    return unsub;
  }, []);

  const userGroupIds = useMemo(
    () => new Set(appUser?.groups ?? []),
    [appUser?.groups]
  );

  const userGroups = useMemo(
    () => allGroups.filter((g) => userGroupIds.has(g.id)),
    [allGroups, userGroupIds]
  );

  // Resolución del grupo activo:
  //   1. Si activeGroupId existe Y el usuario pertenece a ese grupo → ese.
  //   2. Si activeGroupId está obsoleto o vacío pero tiene grupos → el primero
  //      de su lista (y guardamos esa elección como nuevo default).
  //   3. Si no tiene grupos → null (caso de onboarding).
  const activeGroup = useMemo(() => {
    if (userGroups.length === 0) return null;
    const wanted = appUser?.activeGroupId;
    if (wanted) {
      const hit = userGroups.find((g) => g.id === wanted);
      if (hit) return hit;
    }
    return userGroups[0];
  }, [userGroups, appUser?.activeGroupId]);

  // Persiste el default si el activeGroupId no estaba alineado con lo que
  // resolvemos. Evita escrituras infinitas con guards.
  useEffect(() => {
    if (!appUser) return;
    if (loading) return;
    if (!activeGroup) return;
    if (appUser.activeGroupId === activeGroup.id) return;
    void setActiveGroup(appUser.uid, activeGroup.id).catch((err) => {
      console.error("[groups] no se pudo persistir activeGroupId", err);
    });
  }, [appUser, activeGroup, loading]);

  const switchActiveGroup = useCallback(
    async (groupId: string) => {
      if (!appUser) return;
      if (!userGroupIds.has(groupId)) {
        throw new Error("No perteneces a este grupo");
      }
      await setActiveGroup(appUser.uid, groupId);
    },
    [appUser, userGroupIds]
  );

  const value: GroupContextValue = {
    allGroups,
    userGroups,
    activeGroup,
    loading,
    switchActiveGroup,
  };

  return (
    <GroupContext.Provider value={value}>{children}</GroupContext.Provider>
  );
}

export function useGroup(): GroupContextValue {
  return useContext(GroupContext);
}
