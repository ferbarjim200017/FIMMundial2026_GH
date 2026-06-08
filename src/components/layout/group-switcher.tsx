"use client";

import { Check, Users } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { useGroup } from "@/features/groups/groups.context";
import { useAuth } from "@/features/auth/auth.context";

/**
 * Botón con icono de grupo que abre un popup mostrando los grupos a los
 * que pertenece el usuario. Si tiene más de uno, cada entrada es clickable
 * para cambiar el grupo activo. Si no pertenece a ninguno (caso de
 * onboarding pendiente), el botón aparece con un punto de aviso.
 */
export function GroupSwitcher() {
  const { firebaseUser } = useAuth();
  const { userGroups, activeGroup, loading, switchActiveGroup } = useGroup();

  // Sin sesión no tiene sentido renderizar el control.
  if (!firebaseUser) return null;

  const hasGroups = userGroups.length > 0;
  const multiple = userGroups.length > 1;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label="Grupos"
          title={activeGroup ? `Grupo activo: ${activeGroup.name}` : "Grupos"}
        >
          <Users className="h-4 w-4" />
          {!loading && !hasGroups && (
            <span
              className="absolute right-1 top-1 h-2 w-2 rounded-full bg-amber-500"
              aria-hidden
            />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {multiple
              ? "Cambia el grupo activo"
              : hasGroups
              ? "Tu grupo"
              : "Aún no tienes grupo"}
          </p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {loading ? (
          <DropdownMenuItem disabled>Cargando…</DropdownMenuItem>
        ) : !hasGroups ? (
          <DropdownMenuItem disabled>
            <span className="text-xs text-muted-foreground">
              Pide al admin que te asigne uno.
            </span>
          </DropdownMenuItem>
        ) : (
          userGroups.map((g) => {
            const isActive = activeGroup?.id === g.id;
            return (
              <DropdownMenuItem
                key={g.id}
                disabled={isActive}
                onSelect={() => {
                  if (isActive) return;
                  void switchActiveGroup(g.id);
                }}
                className="flex items-center justify-between gap-2"
              >
                <span className={isActive ? "font-semibold" : ""}>
                  {g.name}
                </span>
                {isActive && (
                  <Check className="h-4 w-4 text-primary" aria-hidden />
                )}
              </DropdownMenuItem>
            );
          })
        )}
        {multiple && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>
              <p className="text-[10px] text-muted-foreground">
                Toda la web filtra por el grupo activo.
              </p>
            </DropdownMenuLabel>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
