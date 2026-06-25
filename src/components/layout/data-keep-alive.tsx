"use client";

import { useEffect } from "react";
import { subscribeToAllBets } from "@/features/bets/bets.service";
import { subscribeToMatches } from "@/features/matches/matches.service";
import {
  flushPendingSettles,
  getPendingSettles,
} from "@/features/bets/pending-settles";
import {
  flushPendingEdits,
  getPendingEdits,
} from "@/features/bets/pending-edits";
import {
  flushPendingCreates,
  getPendingCreates,
} from "@/features/bets/pending-creates";
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

  // Sube las liquidaciones guardadas en local (sin subir por falta de cuota) en
  // cuanto se pueda: al abrir la app y cada 5 minutos. Así capta el reset diario
  // de la cuota gratuita de Firebase (≈ 9:00 en España) sin que el usuario haga
  // nada.
  useEffect(() => {
    if (!isFirebaseConfigured) return;
    const tryFlush = () => {
      if (getPendingCreates().length > 0) void flushPendingCreates();
      if (getPendingSettles().length > 0) void flushPendingSettles();
      if (getPendingEdits().length > 0) void flushPendingEdits();
    };
    tryFlush();
    const id = setInterval(tryFlush, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, []);

  return null;
}
