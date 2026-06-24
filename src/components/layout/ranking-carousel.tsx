"use client";

import { useEffect, useMemo, useState } from "react";
import { Trophy } from "lucide-react";
import { subscribeToAllBets } from "@/features/bets/bets.service";
import { subscribeToGroupRanking } from "@/features/users/users.service";
import { betInGroup, computeRankingStanding } from "@/features/bets/bets.utils";
import { useGroup } from "@/features/groups/groups.context";
import { isFirebaseConfigured } from "@/lib/firebase/client";
import { formatCurrency, formatPercent, profitClass } from "@/lib/utils";
import type { Bet, GroupRanking } from "@/types/domain";

function medal(rank: number) {
  if (rank === 1) return "🥇";
  if (rank === 2) return "🥈";
  if (rank === 3) return "🥉";
  return `#${rank}`;
}

type Row = { uid: string; username: string; roi: number; balance: number };

export function RankingCarousel() {
  const { memberUids, activeGroup, groupMembers } = useGroup();
  const gid = activeGroup?.id ?? null;

  // 1) Ranking PRECALCULADO (UN documento). El carrusel está montado en TODAS
  //    las páginas; leer este documento evita releer la colección `bets`
  //    entera en cada vista. Se actualiza en tiempo real: cada usuario reescribe
  //    su entrada al liquidar (ver recomputeAndPersistStats) y la página de
  //    ranking reescribe todas las entradas al abrirse.
  const [ranking, setRanking] = useState<GroupRanking | null>(null);
  useEffect(() => {
    setRanking(null);
    if (!isFirebaseConfigured || !gid) return;
    return subscribeToGroupRanking(gid, setRanking);
  }, [gid]);

  // El documento se considera utilizable solo cuando tiene entrada para TODOS
  // los miembros actuales del grupo. Mientras no lo esté (recién desplegado,
  // reglas de `rankings` sin desplegar, o nadie ha abierto aún /ranking) caemos
  // al cálculo desde apuestas, así nunca mostramos cifras incompletas/erróneas.
  const rankingComplete = useMemo(() => {
    if (!ranking || memberUids.size === 0) return false;
    for (const uid of memberUids) if (!ranking[uid]) return false;
    return true;
  }, [ranking, memberUids]);

  // 2) FALLBACK: solo mientras el documento no esté completo abrimos el listener
  //    a la colección de apuestas (comportamiento anterior). En cuanto el doc
  //    está listo, este efecto cierra la suscripción y dejamos de leer `bets`.
  const [allBets, setAllBets] = useState<Bet[]>([]);
  useEffect(() => {
    if (!isFirebaseConfigured || rankingComplete) return;
    return subscribeToAllBets(setAllBets);
  }, [rankingComplete]);

  // Hasta que el listener de miembros responde, memberUids está vacío y el
  // carrusel queda en su placeholder — preferimos eso a enseñar un instante
  // datos sin filtrar antes de saber el grupo.
  const filtered = useMemo<Row[]>(() => {
    if (memberUids.size === 0 || !activeGroup) return [];

    if (rankingComplete && ranking) {
      // Camino optimizado: cifras del documento precalculado (0 lecturas extra).
      return groupMembers
        .map((u) => {
          const e = ranking[u.uid];
          return {
            uid: u.uid,
            username: u.username,
            roi: e?.roi ?? 0,
            balance: e?.balance ?? 0,
          };
        })
        .sort((a, b) => b.roi - a.roi);
    }

    // Fallback: cálculo desde las apuestas del grupo (idéntico al anterior).
    const groupBets = allBets.filter(
      (b) => betInGroup(b, activeGroup.id) && memberUids.has(b.userId)
    );
    return groupMembers
      .map((u) => {
        const userBets = groupBets.filter((b) => b.userId === u.uid);
        const { roi, balance } = computeRankingStanding(u, userBets, activeGroup.id);
        return { uid: u.uid, username: u.username, roi, balance };
      })
      .sort((a, b) => b.roi - a.roi);
  }, [rankingComplete, ranking, groupMembers, allBets, memberUids, activeGroup]);

  // Si no hay usuarios todavía (cargando o estado vacío) reservamos el
  // mismo espacio que ocuparía el carrusel para que los offsets sticky
  // del sidebar no salten al hidratar.
  if (filtered.length === 0) {
    return (
      <div
        aria-hidden
        className="h-9 border-b border-border bg-card/50"
      />
    );
  }

  // Duplicamos suficientes copias para que el marquee llene cualquier ancho
  // (evita el "salto" cuando hay pocos usuarios).
  const minCopies = Math.max(2, Math.ceil(12 / filtered.length));
  const items = Array.from({ length: minCopies }, () => filtered).flat();

  return (
    <div className="relative flex items-center gap-3 overflow-hidden border-b border-border bg-card/50 px-4 py-2">
      <Trophy className="h-4 w-4 shrink-0 text-gold" />
      <div className="relative flex-1 overflow-hidden">
        <div className="flex animate-marquee gap-8 whitespace-nowrap text-sm">
          {items.map((u, i) => {
            const rank = (i % filtered.length) + 1;
            return (
              <div key={`${u.uid}-${i}`} className="flex items-center gap-2">
                <span className="font-semibold">{medal(rank)}</span>
                <span className="text-muted-foreground">@{u.username}</span>
                <span
                  className={`font-mono font-semibold ${profitClass(u.roi)}`}
                >
                  {u.roi > 0 ? "+" : ""}
                  {formatPercent(u.roi)}
                </span>
                <span className="font-mono text-xs text-muted-foreground">
                  {formatCurrency(u.balance)}
                </span>
                <span className="text-border">•</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
