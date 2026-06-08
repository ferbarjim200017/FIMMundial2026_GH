"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Users } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/auth.context";
import { useGroup } from "@/features/groups/groups.context";
import { addUserToGroup, setActiveGroup } from "@/features/groups/groups.service";
import { ROUTES } from "@/lib/constants";

/**
 * Onboarding obligatorio: los usuarios nuevos deben elegir al menos un
 * grupo antes de poder usar la app. El layout (app)/layout.tsx redirige
 * aquí automáticamente cuando un user sin grupos accede a cualquier otra
 * ruta. La página solo se carga si hay grupos disponibles y al usuario
 * aún no se le ha asignado ninguno.
 */
export default function OnboardingGroupsPage() {
  const router = useRouter();
  const { appUser } = useAuth();
  const { allGroups, loading: loadingGroups } = useGroup();

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const visibleGroups = useMemo(
    () =>
      [...allGroups].sort((a, b) =>
        a.name.localeCompare(b.name, "es", { sensitivity: "base" })
      ),
    [allGroups]
  );

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleContinue() {
    if (!appUser) return;
    if (selected.size === 0) {
      setError("Selecciona al menos un grupo para continuar.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const ids = [...selected];
      for (const id of ids) {
        await addUserToGroup(id, appUser.uid);
      }
      await setActiveGroup(appUser.uid, ids[0]);
      router.replace(ROUTES.dashboard);
    } catch (err) {
      console.error("[onboarding groups]", err);
      setError(
        err instanceof Error
          ? `No se pudo guardar: ${err.message}`
          : "No se pudo guardar la selección."
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/15 text-primary">
          <Users className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Elige tu grupo</h1>
          <p className="text-sm text-muted-foreground">
            En FIM Mundial 2026 cada usuario pertenece a uno o varios grupos.
            Solo verás información de la gente que comparta grupo contigo.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Grupos disponibles</CardTitle>
          <CardDescription>
            Marca los grupos a los que perteneces. Puedes elegir varios. Más
            tarde, sólo un admin podrá cambiártelos.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {loadingGroups ? (
            <p className="text-sm text-muted-foreground">Cargando grupos…</p>
          ) : visibleGroups.length === 0 ? (
            <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
              Todavía no hay grupos creados. Pide a un admin que ejecute el
              bootstrap del grupo FIM desde el panel de administración.
            </p>
          ) : (
            <ul className="space-y-2">
              {visibleGroups.map((g) => {
                const checked = selected.has(g.id);
                return (
                  <li key={g.id}>
                    <button
                      type="button"
                      onClick={() => toggle(g.id)}
                      className={
                        "flex w-full items-center justify-between gap-3 rounded-md border px-3 py-2 text-left text-sm transition-colors " +
                        (checked
                          ? "border-primary bg-primary/10"
                          : "hover:bg-accent/40")
                      }
                      aria-pressed={checked}
                    >
                      <span className="font-medium">{g.name}</span>
                      <span
                        className={
                          "flex h-5 w-5 items-center justify-center rounded-full border " +
                          (checked
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-muted-foreground/40")
                        }
                        aria-hidden
                      >
                        {checked && (
                          <svg
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth={3}
                            className="h-3 w-3"
                          >
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        )}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {error && (
            <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}

          <div className="flex justify-end pt-2">
            <Button
              onClick={handleContinue}
              disabled={saving || visibleGroups.length === 0}
            >
              {saving ? "Guardando…" : "Continuar"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
