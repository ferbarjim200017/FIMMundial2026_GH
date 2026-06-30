"use client";

import { useEffect, useState } from "react";
import { subscribeToAllBets } from "@/features/bets/bets.service";
import { useAuth } from "@/features/auth/auth.context";
import { useGroup } from "@/features/groups/groups.context";
import { betInGroup, computeUserStats } from "@/features/bets/bets.utils";
import { computeAchievements } from "@/features/bets/achievements";
import { isFirebaseConfigured } from "@/lib/firebase/client";
import type { Bet } from "@/types/domain";

interface ToastItem {
  key: string;
  title: string;
  emoji: string;
}

/**
 * Muestra un aviso "¡Logro desbloqueado!" cuando el usuario consigue un logro
 * nuevo. Compara los logros actuales con los ya vistos (guardados en
 * localStorage por grupo+usuario). La PRIMERA vez solo siembra el estado (no
 * spamea con todo lo ya logrado). Reutiliza el listener compartido de apuestas.
 */
export function AchievementToaster() {
  const { appUser } = useAuth();
  const { activeGroup } = useGroup();
  const [bets, setBets] = useState<Bet[] | null>(null);
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  useEffect(() => {
    if (!isFirebaseConfigured || !appUser) return;
    return subscribeToAllBets((all) =>
      setBets(all.filter((b) => b.userId === appUser.uid))
    );
  }, [appUser]);

  useEffect(() => {
    if (!appUser || !activeGroup || bets === null) return;
    const key = `fim:ach-seen:${activeGroup.id}:${appUser.uid}`;
    const myBets = bets.filter((b) => betInGroup(b, activeGroup.id));
    const earned = computeAchievements(myBets, computeUserStats(myBets)).filter(
      (a) => a.earned
    );
    const earnedIds = earned.map((a) => a.id);

    let prev: string[] | null = null;
    try {
      const raw = localStorage.getItem(key);
      prev = raw ? (JSON.parse(raw) as string[]) : null;
    } catch {
      prev = null;
    }

    // Primera vez: sembramos sin avisar.
    if (prev === null) {
      try {
        localStorage.setItem(key, JSON.stringify(earnedIds));
      } catch {
        /* sin persistencia */
      }
      return;
    }

    const prevSet = new Set(prev);
    const fresh = earned.filter((a) => !prevSet.has(a.id));
    if (fresh.length === 0) {
      // Mantén sincronizado el estado aunque no haya nada nuevo.
      if (earnedIds.length !== prev.length) {
        try {
          localStorage.setItem(key, JSON.stringify(earnedIds));
        } catch {
          /* sin persistencia */
        }
      }
      return;
    }

    const now = Date.now();
    setToasts((t) => [
      ...t,
      ...fresh.map((a) => ({
        key: `${a.id}-${now}`,
        title: a.title,
        emoji: a.emoji,
      })),
    ]);
    try {
      localStorage.setItem(key, JSON.stringify(earnedIds));
    } catch {
      /* sin persistencia */
    }
  }, [appUser, activeGroup, bets]);

  // Auto-cierre del más antiguo cada 5 s.
  useEffect(() => {
    if (toasts.length === 0) return;
    const t = setTimeout(() => setToasts((cur) => cur.slice(1)), 5000);
    return () => clearTimeout(t);
  }, [toasts]);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed inset-x-0 bottom-20 z-50 flex flex-col items-center gap-2 px-4 md:bottom-6">
      {toasts.map((t) => (
        <button
          key={t.key}
          type="button"
          onClick={() => setToasts((cur) => cur.filter((x) => x.key !== t.key))}
          className="flex items-center gap-3 rounded-xl border border-primary/40 bg-card px-4 py-2.5 text-left shadow-lg animate-in fade-in slide-in-from-bottom-2"
        >
          <span className="text-2xl">{t.emoji}</span>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-primary">
              ¡Logro desbloqueado!
            </p>
            <p className="text-sm font-medium">{t.title}</p>
          </div>
        </button>
      ))}
    </div>
  );
}
