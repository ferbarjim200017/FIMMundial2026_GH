"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  /** Destino al que ir si el navegador no tiene historial dentro de la app
   *  (p.ej. acceso por URL directa al pulsar el atajo). */
  fallbackHref: string;
  ariaLabel?: string;
}

/**
 * Botón "Volver" que hace `router.back()` cuando hay historial dentro de
 * la pestaña, y cae al `fallbackHref` solo cuando el usuario abrió la
 * página directamente (sin historial previo). Así la flecha siempre
 * lleva a la pantalla real anterior — feed, ranking, popup, upcoming…
 * — y no a un sitio hardcoded como antes.
 */
export function BackButton({ fallbackHref, ariaLabel = "Volver" }: Props) {
  const router = useRouter();
  function handleClick() {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
    } else {
      router.push(fallbackHref);
    }
  }
  return (
    <Button variant="ghost" size="icon" onClick={handleClick} aria-label={ariaLabel}>
      <ArrowLeft className="h-4 w-4" />
    </Button>
  );
}
