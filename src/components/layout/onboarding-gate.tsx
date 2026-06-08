"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/features/auth/auth.context";
import { useGroup } from "@/features/groups/groups.context";

const ONBOARDING_PATH = "/onboarding/groups";

/**
 * Redirige a `/onboarding/groups` a cualquier usuario logueado que:
 *   - ya tenga su documento (`appUser` cargado)
 *   - no pertenezca a ningún grupo
 *   - no sea admin (el admin necesita poder entrar a /admin para arreglar
 *     el sistema y ejecutar el bootstrap del grupo FIM)
 *   - y el sistema tenga al menos un grupo creado (si no, no hay nada que
 *     elegir y le dejamos navegar sin bloqueo)
 *
 * No bloquea las rutas /onboarding/* ni /admin (los admins las usan).
 */
export function OnboardingGate() {
  const { appUser, isAdmin, loading: authLoading } = useAuth();
  const { allGroups, loading: groupsLoading } = useGroup();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (authLoading || groupsLoading) return;
    if (!appUser) return;
    if (isAdmin) return;
    if (allGroups.length === 0) return;
    const hasGroups = (appUser.groups?.length ?? 0) > 0;
    if (hasGroups) return;
    if (pathname.startsWith("/onboarding")) return;
    router.replace(ONBOARDING_PATH);
  }, [
    appUser,
    isAdmin,
    authLoading,
    groupsLoading,
    allGroups.length,
    pathname,
    router,
  ]);

  return null;
}
