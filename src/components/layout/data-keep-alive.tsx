"use client";

import { useEffect } from "react";
import { subscribeToAllBets } from "@/features/bets/bets.service";
import { subscribeToMatches } from "@/features/matches/matches.service";
import { isFirebaseConfigured } from "@/lib/firebase/client";

/**
 * Mantiene VIVOS durante toda la sesión los listeners COMPARTIDOS de apuestas y
 * partidos. Ambos están compartidos con conteo de referencias: al tener aquí un
 * suscriptor permanente, nunca llegan a cero y, por tanto, no se cierran y
 * reabren al navegar entre páginas o al abrir/cerrar popups. El efecto es que
 * todas esas pantallas reutilizan lo que ya hay en memoria en lugar de releer
 * la colección en Firestore (menos llamadas, menos riesgo de "quota exceeded").
 *
 * No pinta nada: es solo un soporte de datos. Se monta dentro del AuthGuard,
 * así que solo se suscribe cuando hay un usuario autenticado.
 *
 * NOTA: aquí NO se sube nada de forma automática. Las colas locales
 * (borradores, liquidaciones y ediciones "sin subir") solo se suben cuando el
 * usuario pulsa "Subir todo" en la lista de apuestas. Antes había un auto-flush
 * cada 5 min, pero subía las apuestas mientras el usuario aún las estaba
 * preparando ("se subían solas"), así que se quitó: el usuario controla cuándo.
 */
export function DataKeepAlive() {
  useEffect(() => {
    if (!isFirebaseConfigured) return;
    const unsubBets = subscribeToAllBets(() => {});
    const unsubMatches = subscribeToMatches(() => {});
    return () => {
      unsubBets();
      unsubMatches();
    };
  }, []);

  return null;
}
