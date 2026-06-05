"use client";

import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { useAuth } from "@/features/auth/auth.context";
import { ROUTES } from "@/lib/constants";

export function AuthGuard({ children }: { children: ReactNode }) {
  const { firebaseUser, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !firebaseUser) router.replace(ROUTES.login);
  }, [loading, firebaseUser, router]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-sm text-muted-foreground">Cargando…</div>
      </div>
    );
  }
  if (!firebaseUser) return null;
  return <>{children}</>;
}
