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
import { subscribeToSuggestions } from "@/features/suggestions/suggestions.service";
import { isFirebaseConfigured } from "@/lib/firebase/client";
import type { Suggestion } from "@/types/domain";

interface SuggestionsContextValue {
  /** Lista completa de sugerencias (null mientras carga). Una sola suscripción
   *  compartida por toda la app (nav + página). */
  suggestions: Suggestion[] | null;
  /** True si hay alguna sugerencia de OTRO usuario más reciente que la última
   *  vez que este usuario abrió la pestaña. Sirve para pintar el aviso rojo. */
  hasUnread: boolean;
  /** Marca todo como visto (se llama al entrar en la pestaña de sugerencias). */
  markAllSeen: () => void;
}

const SuggestionsContext = createContext<SuggestionsContextValue>({
  suggestions: null,
  hasUnread: false,
  markAllSeen: () => {},
});

// La "última vez visto" se guarda en localStorage por uid: es un indicador de
// novedad por dispositivo, no hace falta sincronizarlo en Firestore.
const LS_PREFIX = "fim:suggestionsLastSeen:";

export function SuggestionsProvider({ children }: { children: ReactNode }) {
  const { appUser } = useAuth();
  const uid = appUser?.uid ?? null;
  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null);
  const [lastSeen, setLastSeen] = useState(0);

  // Cargar el "último visto" guardado para este usuario.
  useEffect(() => {
    if (!uid || typeof window === "undefined") {
      setLastSeen(0);
      return;
    }
    const raw = window.localStorage.getItem(LS_PREFIX + uid);
    setLastSeen(raw ? Number(raw) || 0 : 0);
  }, [uid]);

  // Suscripción única a las sugerencias.
  useEffect(() => {
    if (!isFirebaseConfigured) {
      setSuggestions([]);
      return;
    }
    const unsub = subscribeToSuggestions(setSuggestions, () =>
      setSuggestions([])
    );
    return unsub;
  }, []);

  const markAllSeen = useCallback(() => {
    const now = Date.now();
    setLastSeen((prev) => (now > prev ? now : prev));
    if (uid && typeof window !== "undefined") {
      window.localStorage.setItem(LS_PREFIX + uid, String(now));
    }
  }, [uid]);

  // Hay novedad si existe una sugerencia de OTRO usuario creada después de la
  // última vez que abrí la pestaña. Las propias no cuentan como novedad.
  const hasUnread = useMemo(() => {
    if (!suggestions || suggestions.length === 0) return false;
    return suggestions.some(
      (s) =>
        s.userId !== uid &&
        !!s.createdAt &&
        s.createdAt.toMillis() > lastSeen
    );
  }, [suggestions, lastSeen, uid]);

  const value = useMemo(
    () => ({ suggestions, hasUnread, markAllSeen }),
    [suggestions, hasUnread, markAllSeen]
  );

  return (
    <SuggestionsContext.Provider value={value}>
      {children}
    </SuggestionsContext.Provider>
  );
}

export function useSuggestions(): SuggestionsContextValue {
  return useContext(SuggestionsContext);
}
