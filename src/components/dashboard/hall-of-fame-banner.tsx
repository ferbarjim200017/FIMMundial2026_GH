"use client";

import Link from "next/link";
import { Crown, X } from "lucide-react";
import { useHallOfFame } from "@/features/hall-of-fame/hall-of-fame.context";
import { ROUTES } from "@/lib/constants";
import { cn } from "@/lib/utils";

/**
 * Banner que aparece en el dashboard cuando alguien ENTRA NUEVO en cualquier
 * ranking del Salón de la Fama. Muestra todos los entrantes pendientes a la vez
 * y se cierra a mano; no vuelve a salir hasta que entre otra persona.
 */
export function HallOfFameBanner() {
  const { unseen, dismiss } = useHallOfFame();
  if (unseen.length === 0) return null;

  const hasGood = unseen.some((e) => e.tone === "good");
  const hasBad = unseen.some((e) => e.tone === "bad");

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-lg border p-4 pr-10 shadow-sm",
        "bg-gradient-to-r",
        hasGood && hasBad
          ? "border-gold/40 from-gold/10 via-card to-loss/10"
          : hasBad
          ? "border-loss/40 from-loss/15 to-card"
          : "border-gold/40 from-gold/15 to-card"
      )}
    >
      <button
        type="button"
        onClick={dismiss}
        aria-label="Cerrar"
        className="absolute right-2 top-2 rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        <X className="h-4 w-4" />
      </button>

      <div className="flex items-center gap-2">
        <Crown className="h-5 w-5 text-gold" />
        <h3 className="text-sm font-bold">
          {unseen.length === 1
            ? "¡Novedad en el Salón de la Fama!"
            : `¡${unseen.length} novedades en el Salón de la Fama!`}
        </h3>
      </div>

      <ul className="mt-2 space-y-1.5">
        {unseen.map((e) => (
          <li key={e.id} className="flex items-start gap-2 text-sm">
            <span
              className={cn(
                "mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full",
                e.tone === "bad" ? "bg-loss" : "bg-profit"
              )}
            />
            <span>{e.phrase}</span>
          </li>
        ))}
      </ul>

      <Link
        href={ROUTES.hallOfFame}
        className="mt-2 inline-block text-xs font-medium text-primary hover:underline"
      >
        Ver el Salón de la Fama →
      </Link>
    </div>
  );
}
