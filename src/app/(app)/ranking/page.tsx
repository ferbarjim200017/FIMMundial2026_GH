"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  BarChart3,
  LineChart,
  Minus,
  Star,
  Ticket,
  TrendingDown,
  Trophy,
  Zap,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { RankingChart } from "@/components/ranking/ranking-chart";
import { BetsBarChart } from "@/components/ranking/bets-bar-chart";
import { CashNetCard } from "@/components/bets/cash-net-card";
import { Skeleton } from "@/components/ui/skeleton";
import { CountUp } from "@/components/ui/count-up";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  betInRankingPhase,
  currentRankingPhase,
  RANKING_PHASE_DESC,
  RANKING_PHASE_LABELS,
  type RankingPhase,
} from "@/features/matches/phases";
import {
  subscribeToRankMovements,
  writeRankingEntries,
  writeRankMovements,
} from "@/features/users/users.service";
import { subscribeToAllBets } from "@/features/bets/bets.service";
import { subscribeToMatches } from "@/features/matches/matches.service";
import {
  betInGroup,
  computeCashSummary,
  computeRankingStanding,
  computeSuperaumentoSummary,
  computeUserStats,
  getInitialBalances,
} from "@/features/bets/bets.utils";
import { useGroup } from "@/features/groups/groups.context";
import { useAuth } from "@/features/auth/auth.context";
import { isFirebaseConfigured } from "@/lib/firebase/client";
import { ROUTES } from "@/lib/constants";
import {
  formatCurrency,
  formatPercent,
  initials,
  profitClass,
} from "@/lib/utils";
import type {
  AppUser,
  Bet,
  Match,
  MatchStage,
  RankMovement,
  RankMovementMap,
} from "@/types/domain";

function medal(rank: number) {
  if (rank === 1) return "🥇";
  if (rank === 2) return "🥈";
  if (rank === 3) return "🥉";
  return `#${rank}`;
}

/** Tinte de fila para el podio (top-3): oro, plata y bronce. */
function podiumRow(rank: number): string {
  if (rank === 1) return "bg-amber-400/10 hover:bg-amber-400/20";
  if (rank === 2) return "bg-zinc-400/10 hover:bg-zinc-400/20";
  if (rank === 3) return "bg-orange-500/10 hover:bg-orange-500/20";
  return "hover:bg-accent/30";
}

/** Aro de color del avatar para el podio. */
function podiumRing(rank: number): string {
  if (rank === 1) return "ring-2 ring-amber-400 ring-offset-1 ring-offset-background";
  if (rank === 2) return "ring-2 ring-zinc-400 ring-offset-1 ring-offset-background";
  if (rank === 3) return "ring-2 ring-orange-500 ring-offset-1 ring-offset-background";
  return "";
}

// La flecha de movimiento solo se muestra durante 24 h desde el cambio.
const MOVEMENT_WINDOW_MS = 24 * 60 * 60 * 1000;

// Formateador entero para el count-up de los tiles.
const asInt = (n: number) => String(Math.round(n));

/** Indicador de movimiento de posición: flecha verde si subió de puesto,
 *  roja si bajó (solo durante 24 h desde el cambio); guion gris si no hay
 *  cambio reciente. */
function RankMovementIndicator({
  entry,
  nowMs,
}: {
  entry: RankMovement | undefined;
  nowMs: number;
}) {
  if (
    entry &&
    entry.dir !== "flat" &&
    entry.changedAt != null &&
    nowMs - entry.changedAt.toMillis() < MOVEMENT_WINDOW_MS
  ) {
    if (entry.dir === "up") {
      return (
        <span title="Ha subido puestos (últimas 24 h)" aria-label="Ha subido puestos">
          <ArrowUp className="h-4 w-4 text-profit" strokeWidth={2.75} />
        </span>
      );
    }
    return (
      <span title="Ha bajado puestos (últimas 24 h)" aria-label="Ha bajado puestos">
        <ArrowDown className="h-4 w-4 text-loss" strokeWidth={2.75} />
      </span>
    );
  }
  return (
    <span
      title="Sin cambios de posición"
      aria-label="Sin cambios de posición"
      className="text-muted-foreground/50"
    >
      <Minus className="h-3.5 w-3.5" />
    </span>
  );
}

type SortKey = "roi" | "profit" | "balance" | "hitRate" | "betsCount" | "username";

export default function RankingPage() {
  const [allBets, setAllBets] = useState<Bet[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  // `groupMembers` ya lo provee el GroupProvider (listener acotado al grupo);
  // el ranking solo muestra a los miembros del grupo activo, así que no abrimos
  // un listener extra a la colección `users` completa.
  const { memberUids, activeGroup, groupMembers } = useGroup();
  const { appUser } = useAuth();

  // "Ahora" para la ventana de 24 h de las flechas de movimiento. Se refresca
  // cada minuto para que la flecha desaparezca al cumplirse el plazo aunque la
  // página siga abierta.
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  // Columna por la que se ordena el ranking (por defecto ROI descendente).
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({
    key: "roi",
    dir: "desc",
  });

  // Fase del torneo que se está viendo (General / Grupos / Previa / Final).
  // Empieza en la fase ACTUAL del torneo; el usuario puede cambiarla y, una vez
  // que la toca a mano, dejamos de auto-seleccionar.
  const [phase, setPhase] = useState<RankingPhase>("general");
  const [phaseTouched, setPhaseTouched] = useState(false);

  function handleSort(key: SortKey) {
    setSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { key, dir: key === "username" ? "asc" : "desc" }
    );
  }

  // Cabecera de columna clicable: ordena por ese campo (y al re-pulsar invierte).
  const sortTh = (k: SortKey, label: string, thClass: string) => (
    <th className={thClass}>
      <button
        type="button"
        onClick={() => handleSort(k)}
        className={`inline-flex items-center gap-1 transition-colors hover:text-foreground ${
          sort.key === k ? "text-foreground" : ""
        }`}
        aria-label={`Ordenar por ${label}`}
      >
        {label}
        {sort.key === k ? (
          sort.dir === "asc" ? (
            <ArrowUp className="h-3 w-3" />
          ) : (
            <ArrowDown className="h-3 w-3" />
          )
        ) : (
          <ArrowUpDown className="h-3 w-3 opacity-30" />
        )}
      </button>
    </th>
  );

  useEffect(() => {
    if (!isFirebaseConfigured) {
      setAllBets([]);
      return;
    }
    const unsubBets = subscribeToAllBets(setAllBets);
    const unsubMatches = subscribeToMatches(setMatches, () => setMatches([]));
    return () => {
      unsubBets();
      unsubMatches();
    };
  }, []);

  // Filtra a los miembros del grupo activo. Si activeGroup aún no está
  // resuelto (carga inicial) devolvemos null para que la tabla se quede
  // en "Cargando…".
  const users = useMemo(() => {
    if (!activeGroup || memberUids.size === 0) return null;
    return groupMembers;
  }, [groupMembers, memberUids, activeGroup]);

  const bets = useMemo(() => {
    if (!activeGroup) return [];
    return allBets.filter(
      (b) => betInGroup(b, activeGroup.id) && memberUids.has(b.userId)
    );
  }, [allBets, memberUids, activeGroup]);

  // Preselección de la fase ACTUAL del torneo (mientras el usuario no elija una
  // a mano). Se recalcula cuando llegan/cambian los partidos.
  useEffect(() => {
    if (phaseTouched || matches.length === 0) return;
    setPhase(currentRankingPhase(matches));
  }, [matches, phaseTouched]);

  // Etapa de cada partido, para clasificar cada apuesta por fase.
  const stageByMatchId = useMemo(() => {
    const map = new Map<string, MatchStage>();
    for (const m of matches) map.set(m.id, m.stage);
    return map;
  }, [matches]);

  // Apuestas que cuentan en la fase seleccionada. En "general" son todas; en el
  // resto, solo las cuyos partidos pertenecen a esa fase (knockout desde 0).
  const phaseBets = useMemo(
    () => bets.filter((b) => betInRankingPhase(b, phase, stageByMatchId)),
    [bets, phase, stageByMatchId]
  );

  // Balance del grupo en apuestas de tipo superaumento, acotado a la fase
  // seleccionada.
  const superaumento = useMemo(
    () => computeSuperaumentoSummary(phaseBets),
    [phaseBets]
  );

  // Caja del grupo: dinero TOTAL ingresado y retirado por todos los miembros.
  // No depende de la fase ni de las apuestas (es dinero real metido/sacado de
  // las casas).
  const groupCash = useMemo(() => {
    let deposits = 0;
    let withdrawals = 0;
    for (const u of users ?? []) {
      const c = computeCashSummary(u, activeGroup?.id);
      deposits += c.deposits;
      withdrawals += c.withdrawals;
    }
    return { deposits, withdrawals };
  }, [users, activeGroup]);

  // Stats por usuario de la FASE seleccionada (las que se ven en pantalla:
  // tabla, gráficas, saldo). En "general" coinciden con todo el torneo.
  const groupStatsByUid = useMemo(() => {
    const map = new Map<string, ReturnType<typeof computeUserStats>>();
    for (const u of users ?? []) {
      const userBets = phaseBets.filter((b) => b.userId === u.uid);
      map.set(u.uid, computeUserStats(userBets));
    }
    return map;
  }, [users, phaseBets]);

  // Stats GENERALES (todas las apuestas del torneo), independientes de la fase.
  // Solo se usan para la posición canónica que alimenta las flechas de
  // movimiento y el ranking precalculado compartido (que deben ser estables y
  // no cambiar según la fase que cada uno tenga seleccionada).
  const generalStatsByUid = useMemo(() => {
    const map = new Map<string, ReturnType<typeof computeUserStats>>();
    for (const u of users ?? []) {
      const userBets = bets.filter((b) => b.userId === u.uid);
      map.set(u.uid, computeUserStats(userBets));
    }
    return map;
  }, [users, bets]);

  // Saldo actual del usuario en el grupo = saldo inicial del grupo + profit.
  const balanceByUid = useMemo(() => {
    const map = new Map<string, number>();
    for (const u of users ?? []) {
      const initial = getInitialBalances(u, activeGroup?.id);
      const initialSum =
        initial.bet365 +
        initial.winamax +
        (initial.betfair ?? 0) +
        (initial.luckia ?? 0) +
        initial.other;
      const profit = groupStatsByUid.get(u.uid)?.totalProfit ?? 0;
      const netCash = computeCashSummary(u, activeGroup?.id).net;
      map.set(u.uid, initialSum + profit + netCash);
    }
    return map;
  }, [users, groupStatsByUid, activeGroup]);

  // Auténtico "último de la clasificación": peor ROI (desempate por menor
  // beneficio), independiente de cómo esté ordenada la tabla en pantalla.
  const lastPlaceUid = useMemo(() => {
    if (!users || users.length < 2) return null;
    let worstUid: string | null = null;
    let worstRoi = Infinity;
    let worstProfit = Infinity;
    for (const u of users) {
      const st = groupStatsByUid.get(u.uid);
      const roi = st?.roi ?? 0;
      const profit = st?.totalProfit ?? 0;
      if (roi < worstRoi || (roi === worstRoi && profit < worstProfit)) {
        worstRoi = roi;
        worstProfit = profit;
        worstUid = u.uid;
      }
    }
    return worstUid;
  }, [users, groupStatsByUid]);

  // Posición canónica (1 = primero) por ROI desc, desempate por beneficio.
  // Independiente de cómo esté ordenada la tabla en pantalla: es la posición
  // "real" en la clasificación, que es la que cuenta para el movimiento.
  const canonicalRankByUid = useMemo(() => {
    const map = new Map<string, number>();
    if (!users) return map;
    const ordered = [...users].sort((a, b) => {
      const sa = generalStatsByUid.get(a.uid);
      const sb = generalStatsByUid.get(b.uid);
      const ra = sa?.roi ?? 0;
      const rb = sb?.roi ?? 0;
      if (rb !== ra) return rb - ra;
      return (sb?.totalProfit ?? 0) - (sa?.totalProfit ?? 0);
    });
    ordered.forEach((u, i) => map.set(u.uid, i + 1));
    return map;
  }, [users, generalStatsByUid]);

  // Snapshot compartido de movimiento del grupo. Lo lee cualquier miembro, así
  // la flecha de TODOS se refresca en cuanto ALGUIEN abre el ranking (no solo
  // cuando entra la persona que se movió).
  const [movements, setMovements] = useState<RankMovementMap>({});
  useEffect(() => {
    setMovements({});
    if (!activeGroup) return;
    return subscribeToRankMovements(activeGroup.id, setMovements);
  }, [activeGroup]);

  // Compara la posición canónica actual de cada usuario con el snapshot y
  // escribe (merge) solo las entradas que cambian. Optimista: marca la firma
  // antes de escribir para no duplicar; si la escritura falla (p. ej. reglas
  // aún sin desplegar), la resetea para reintentar.
  const lastMovementWrite = useRef<string>("");
  useEffect(() => {
    if (!activeGroup || !users || users.length === 0) return;
    const gid = activeGroup.id;
    const changes: Record<
      string,
      { rank: number; dir: "up" | "down" | "flat" }
    > = {};
    for (const u of users) {
      const current = canonicalRankByUid.get(u.uid);
      if (current == null) continue;
      const stored = movements[u.uid];
      if (!stored) {
        // Primera vez: fijamos la posición base, sin flecha.
        changes[u.uid] = { rank: current, dir: "flat" };
      } else if (stored.rank !== current) {
        changes[u.uid] = {
          rank: current,
          dir: current < stored.rank ? "up" : "down",
        };
      }
    }
    const uids = Object.keys(changes);
    if (uids.length === 0) return;
    const sig =
      gid +
      "|" +
      uids
        .map((id) => `${id}:${changes[id].rank}`)
        .sort()
        .join(",");
    if (lastMovementWrite.current === sig) return;
    lastMovementWrite.current = sig;
    writeRankMovements(gid, changes).catch((e) => {
      console.error("[rankMovements]", e);
      lastMovementWrite.current = ""; // permite reintentar
    });
  }, [activeGroup, users, canonicalRankByUid, movements]);

  // Mantiene el ranking PRECALCULADO (`rankings/{groupId}`) que lee el carrusel
  // en TODAS las páginas con una sola lectura. Al abrir/recalcular el ranking
  // reescribimos las entradas de todos los miembros (bootstrap + refresco), con
  // la MISMA fórmula que el carrusel (computeRankingStanding). Dedup optimista
  // por firma; si falla (reglas sin desplegar) se resetea para reintentar.
  const lastRankingWrite = useRef<string>("");
  useEffect(() => {
    if (!activeGroup || !users || users.length === 0) return;
    const gid = activeGroup.id;
    const entries: Record<
      string,
      { username: string; roi: number; balance: number }
    > = {};
    for (const u of users) {
      const userBets = bets.filter((b) => b.userId === u.uid);
      const { roi, balance } = computeRankingStanding(u, userBets, gid);
      entries[u.uid] = { username: u.username, roi, balance };
    }
    const sig =
      gid +
      "|" +
      Object.keys(entries)
        .sort()
        .map(
          (id) =>
            `${id}:${entries[id].roi.toFixed(2)}:${entries[id].balance.toFixed(2)}`
        )
        .join(",");
    if (lastRankingWrite.current === sig) return;
    lastRankingWrite.current = sig;
    writeRankingEntries(gid, entries).catch((e) => {
      console.error("[ranking] writeEntries", e);
      lastRankingWrite.current = ""; // permite reintentar
    });
  }, [activeGroup, users, bets]);

  // Mayor |ROI| del grupo, para escalar la barra de ROI en línea de la tabla.
  const maxAbsRoi = useMemo(() => {
    let m = 0;
    for (const u of users ?? []) {
      const r = Math.abs(groupStatsByUid.get(u.uid)?.roi ?? 0);
      if (r > m) m = r;
    }
    return m || 1;
  }, [users, groupStatsByUid]);

  // Lista ordenada según la columna elegida (por defecto ROI desc). Desempate
  // estable por beneficio.
  const rankedUsers = useMemo(() => {
    if (!users) return null;
    const valueOf = (u: AppUser): number | string => {
      const s = groupStatsByUid.get(u.uid);
      switch (sort.key) {
        case "roi":
          return s?.roi ?? 0;
        case "profit":
          return s?.totalProfit ?? 0;
        case "balance":
          return balanceByUid.get(u.uid) ?? 0;
        case "hitRate":
          return s?.hitRate ?? 0;
        case "betsCount":
          return s?.betsCount ?? 0;
        case "username":
          return u.username.toLowerCase();
      }
    };
    return [...users].sort((a, b) => {
      const va = valueOf(a);
      const vb = valueOf(b);
      let cmp =
        typeof va === "string" && typeof vb === "string"
          ? va.localeCompare(vb, "es")
          : (va as number) - (vb as number);
      cmp = sort.dir === "asc" ? cmp : -cmp;
      if (cmp !== 0) return cmp;
      // Desempate estable: más beneficio primero.
      return (
        (groupStatsByUid.get(b.uid)?.totalProfit ?? 0) -
        (groupStatsByUid.get(a.uid)?.totalProfit ?? 0)
      );
    });
  }, [users, groupStatsByUid, balanceByUid, sort]);

  return (
    <div className="space-y-6">
      {/* ─── Selector de fase (define el alcance de toda la página) ─── */}
      <Card>
        <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <Trophy className="h-5 w-5 shrink-0 text-primary" />
            <div>
              <p className="text-sm font-semibold leading-tight">
                Clasificación por fase
              </p>
              <p className="text-xs text-muted-foreground">
                {RANKING_PHASE_DESC[phase]}
              </p>
            </div>
          </div>
          <Select
            value={phase}
            onValueChange={(v) => {
              setPhase(v as RankingPhase);
              setPhaseTouched(true);
            }}
          >
            <SelectTrigger className="h-9 w-full sm:w-[250px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="general">General</SelectItem>
              <SelectItem value="grupos">Fase de grupos</SelectItem>
              <SelectItem value="previa">
                Fase previa · 16avos y 8avos
              </SelectItem>
              <SelectItem value="final">
                Fase final · cuartos, semis y final
              </SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* ─── Balance general de superaumentos ─── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Zap className="h-4 w-4 text-primary" />
            Balance de superaumentos
          </CardTitle>
          <CardDescription>
            Resultado conjunto del grupo en apuestas de tipo superaumento.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 grid-cols-2 sm:grid-cols-4">
            {[
              {
                label: "Balance",
                value: (
                  <CountUp
                    end={superaumento.profit}
                    format={(n) => `${n > 0 ? "+" : ""}${formatCurrency(n)}`}
                  />
                ),
                accent: profitClass(superaumento.profit),
                icon: <Zap className="h-4 w-4" />,
              },
              {
                label: "Total",
                value: <CountUp end={superaumento.count} format={asInt} />,
                icon: <Ticket className="h-4 w-4" />,
              },
              {
                label: "Ganadas",
                value: <CountUp end={superaumento.won} format={asInt} />,
                accent: "text-profit",
                icon: <Trophy className="h-4 w-4" />,
              },
              {
                label: "Perdidas",
                value: <CountUp end={superaumento.lost} format={asInt} />,
                accent: "text-loss",
                icon: <TrendingDown className="h-4 w-4" />,
              },
            ].map((s) => (
              <div
                key={s.label}
                className="rounded-md border bg-card p-3 transition-shadow hover:shadow-md"
              >
                <div className="flex items-center justify-between">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    {s.label}
                  </p>
                  <span className="text-muted-foreground/60">{s.icon}</span>
                </div>
                <p
                  className={`mt-1 font-mono text-lg font-bold tabular-nums ${
                    s.accent ?? ""
                  }`}
                >
                  {s.value}
                </p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* ─── Balance de caja (global del grupo) ─── */}
      <CashNetCard
        deposits={groupCash.deposits}
        withdrawals={groupCash.withdrawals}
        subject="El grupo ha"
        title="Balance de caja del grupo"
      />

      {/* ─── Bloque de gráficas ─── */}
      {/* grid-cols-1 en móvil: limita la columna al ancho disponible para que
          el SVG de las gráficas no la "estire" y se desborde a la derecha. */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <LineChart className="h-4 w-4 text-primary" />
              Evolución del beneficio
            </CardTitle>
            <CardDescription>
              Beneficio/pérdida acumulado a lo largo del periodo elegido (por
              defecto, todo el historial). Cada línea arranca en 0 € al inicio
              del periodo — solo refleja ganancias y pérdidas, no el saldo de la
              banca. Click en un nombre para ocultar/mostrar su línea.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {users === null ? (
              <div className="space-y-3">
                <Skeleton className="h-8 w-44" />
                <Skeleton className="h-[320px] w-full rounded-lg" />
                <div className="flex flex-wrap gap-2">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="h-6 w-20 rounded-full" />
                  ))}
                </div>
              </div>
            ) : (
              <RankingChart users={users} bets={phaseBets} matches={matches} />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <BarChart3 className="h-4 w-4 text-primary" />
              Apuestas por jugador
            </CardTitle>
            <CardDescription>
              Una barra por jugador. Elige un día concreto o &quot;Total&quot;
              para ver cuántas apuestas ha registrado cada uno.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {users === null ? (
              <div className="space-y-3">
                <Skeleton className="h-8 w-44" />
                <Skeleton className="h-[320px] w-full rounded-lg" />
                <div className="flex flex-wrap gap-2">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="h-6 w-20 rounded-full" />
                  ))}
                </div>
              </div>
            ) : (
              <BetsBarChart users={users} bets={phaseBets} />
            )}
          </CardContent>
        </Card>
      </div>

      {/* ─── Tabla de clasificación ─── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2">
            Clasificación
            <span className="rounded bg-primary/15 px-1.5 py-0.5 text-xs font-semibold text-primary">
              {RANKING_PHASE_LABELS[phase]}
            </span>
          </CardTitle>
          <CardDescription>
            Pulsa una columna para ordenar por ese campo (vuelve a pulsar para
            invertir). Por defecto, por <strong>ROI</strong>. Se actualiza en
            tiempo real.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {users === null ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton className="h-8 w-8 rounded-full" />
                  <Skeleton className="h-4 flex-1" />
                  <Skeleton className="h-4 w-12" />
                  <Skeleton className="h-4 w-16" />
                </div>
              ))}
            </div>
          ) : users.length === 0 ? (
            <div className="px-6 py-8 text-center text-sm text-muted-foreground">
              Aún no hay usuarios registrados.
            </div>
          ) : (
            <div className="overflow-x-auto">
              {/* min-w fuerza que en móvil la tabla sea más ancha que la
                  pantalla → el contenedor (overflow-x-auto) permite desplazar
                  horizontalmente para ver todas las columnas. En PC el
                  contenedor es más ancho que 640px, así que no cambia nada. */}
              <table className="w-full min-w-[640px] text-sm">
                <thead className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground [&_th]:whitespace-nowrap">
                  <tr>
                    <th className="px-3 py-3 w-20">#</th>
                    {sortTh("username", "Usuario", "px-2 py-3")}
                    {sortTh("roi", "ROI", "px-2 py-3 text-right")}
                    {sortTh("profit", "Beneficio", "px-2 py-3 text-right")}
                    {sortTh("balance", "Saldo", "px-2 py-3 text-right")}
                    {sortTh("hitRate", "% Acierto", "px-2 py-3 text-right")}
                    {sortTh("betsCount", "Apuestas", "px-4 py-3 text-right")}
                  </tr>
                </thead>
                <tbody className="divide-y [&_td]:whitespace-nowrap">
                  {(rankedUsers ?? users).map((u, idx) => {
                    const rank = idx + 1;
                    const s = groupStatsByUid.get(u.uid);
                    const roi = s?.roi ?? 0;
                    const profit = s?.totalProfit ?? 0;
                    const hitRate = s?.hitRate ?? 0;
                    const balance = balanceByUid.get(u.uid) ?? 0;
                    const isMe = appUser?.uid === u.uid;
                    // Farolillo rojo: el auténtico último por ROI, da igual
                    // cómo esté ordenada la tabla.
                    const isLast = u.uid === lastPlaceUid;
                    return (
                      <tr
                        key={u.uid}
                        className={`transition-colors ${podiumRow(rank)}`}
                      >
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-1.5 text-base font-semibold">
                            <span>{medal(rank)}</span>
                            <RankMovementIndicator
                              entry={movements[u.uid]}
                              nowMs={nowMs}
                            />
                          </div>
                        </td>
                        <td className="px-2 py-3">
                          <Link
                            href={ROUTES.profile(u.uid)}
                            className="flex items-center gap-3 hover:underline"
                          >
                            <Avatar className={`h-8 w-8 ${podiumRing(rank)}`}>
                              {u.avatarUrl && <AvatarImage src={u.avatarUrl} />}
                              <AvatarFallback>{initials(u.username)}</AvatarFallback>
                            </Avatar>
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="truncate font-medium">
                                  {u.username}
                                </span>
                                {isMe && (
                                  <Star
                                    className="h-4 w-4 shrink-0 fill-primary text-primary"
                                    aria-label="Eres tú"
                                  />
                                )}
                                {isLast && (
                                  <span
                                    className="shrink-0 text-xl leading-none"
                                    role="img"
                                    aria-label="Farolillo rojo: último de la clasificación"
                                    title="Farolillo rojo: último de la clasificación"
                                  >
                                    🤡
                                  </span>
                                )}
                              </div>
                              <p className="truncate text-xs text-muted-foreground">
                                @{u.username}
                              </p>
                            </div>
                          </Link>
                        </td>
                        <td className="px-2 py-3">
                          <div className="flex flex-col items-end gap-1">
                            <span
                              className={`font-mono font-bold tabular-nums ${profitClass(
                                roi
                              )}`}
                            >
                              {roi > 0 ? "+" : ""}
                              {formatPercent(roi)}
                            </span>
                            <span className="block h-1 w-16 overflow-hidden rounded-full bg-muted">
                              <span
                                className="block h-full rounded-full"
                                style={{
                                  width: `${Math.min(
                                    100,
                                    (Math.abs(roi) / maxAbsRoi) * 100
                                  )}%`,
                                  marginLeft: roi < 0 ? "auto" : undefined,
                                  backgroundColor:
                                    roi >= 0
                                      ? "hsl(var(--profit))"
                                      : "hsl(var(--loss))",
                                }}
                              />
                            </span>
                          </div>
                        </td>
                        <td
                          className={`px-2 py-3 text-right font-mono ${profitClass(
                            profit
                          )}`}
                        >
                          {profit > 0 ? "+" : ""}
                          {formatCurrency(profit)}
                        </td>
                        <td className="px-2 py-3 text-right font-mono">
                          {formatCurrency(balance)}
                        </td>
                        <td className="px-2 py-3 text-right font-mono text-muted-foreground">
                          {formatPercent(hitRate)}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-muted-foreground">
                          {s?.betsCount ?? 0}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
