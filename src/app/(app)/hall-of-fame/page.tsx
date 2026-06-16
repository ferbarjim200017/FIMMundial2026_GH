"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Coins,
  Crown,
  Flame,
  Medal,
  Receipt,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Trophy,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { subscribeToAllBets } from "@/features/bets/bets.service";
import { betInGroup, betOutcome, round2 } from "@/features/bets/bets.utils";
import { useGroup } from "@/features/groups/groups.context";
import { isFirebaseConfigured } from "@/lib/firebase/client";
import { ROUTES } from "@/lib/constants";
import {
  cn,
  formatCurrency,
  formatDate,
  initials,
  profitClass,
} from "@/lib/utils";
import type { AppUser, Bet } from "@/types/domain";

/** Fecha "efectiva" de una apuesta: cuándo se resolvió, o cuándo se creó. */
function eventDate(bet: Bet): Date {
  return (bet.settledAt ?? bet.createdAt).toDate();
}

/** Valor mostrado a la derecha de una fila de apuesta. */
type RowValue = { text: string; className?: string };

function profitValue(profit: number): RowValue {
  return {
    text: `${profit > 0 ? "+" : ""}${formatCurrency(profit)}`,
    className: profitClass(profit),
  };
}

/** Tinte de fila según el puesto: oro / plata / bronce, con borde lateral. */
function rowTint(rank: number): string {
  if (rank === 1) return "bg-gold/10 border-l-4 border-l-gold";
  if (rank === 2) return "bg-silver/10 border-l-4 border-l-silver";
  if (rank === 3) return "bg-bronze/10 border-l-4 border-l-bronze";
  return "border-l-4 border-l-border";
}

interface MatchAgg {
  matchId: string;
  label: string;
  profit: number;
  staked: number;
  count: number;
}

export default function HallOfFamePage() {
  const { memberUids, activeGroup, groupMembers } = useGroup();
  const [allBets, setAllBets] = useState<Bet[] | null>(null);

  useEffect(() => {
    if (!isFirebaseConfigured) {
      setAllBets([]);
      return;
    }
    const unsub = subscribeToAllBets(setAllBets);
    return unsub;
  }, []);

  const usersById = useMemo(() => {
    const map: Record<string, AppUser> = {};
    for (const u of groupMembers) map[u.uid] = u;
    return map;
  }, [groupMembers]);

  // Apuestas del grupo activo (mismas reglas de visibilidad que el feed).
  const bets = useMemo(() => {
    if (allBets === null) return null;
    if (!activeGroup || memberUids.size === 0) return null;
    return allBets.filter(
      (b) => betInGroup(b, activeGroup.id) && memberUids.has(b.userId)
    );
  }, [allBets, memberUids, activeGroup]);

  const settled = useMemo(
    () => (bets ?? []).filter((b) => b.status !== "pending"),
    [bets]
  );

  // ----- Podios por APUESTA individual -----
  const topGains = useMemo(
    () =>
      [...settled]
        .filter((b) => (b.profit ?? 0) > 0)
        .sort((a, b) => b.profit - a.profit)
        .slice(0, 3),
    [settled]
  );

  const topLosses = useMemo(
    () =>
      [...settled]
        .filter((b) => (b.profit ?? 0) < 0)
        .sort((a, b) => a.profit - b.profit)
        .slice(0, 3),
    [settled]
  );

  // La machada: solo apuestas ACERTADAS por completo (status "won"). Quedan
  // fuera cashouts y anuladas/push, aunque tengan beneficio.
  const machadaTop = useMemo(
    () =>
      settled
        .filter((b) => b.status === "won")
        .sort((a, b) => b.odds - a.odds)
        .slice(0, 3),
    [settled]
  );

  // El valiente: mayor stake de dinero real (las freebets no son tu dinero).
  const valienteTop = useMemo(
    () =>
      (bets ?? [])
        .filter((b) => !b.isFreebet)
        .sort((a, b) => b.stake - a.stake)
        .slice(0, 3),
    [bets]
  );

  // ----- Podios por PARTIDO -----
  // Agregamos las apuestas por partido. Una apuesta que toca N partidos (combo)
  // reparte su beneficio y su stake entre esos N partidos; para el conteo de
  // apuestas cuenta como 1 en cada partido que incluye. La etiqueta del partido
  // se saca de la propia apuesta (matchLabel) o de cada pata del combo.
  const matchAgg = useMemo<MatchAgg[]>(() => {
    if (!bets) return [];
    const map = new Map<string, MatchAgg>();
    for (const b of bets) {
      const idLabel = new Map<string, string>();
      if (b.matchId) idLabel.set(b.matchId, b.matchLabel);
      for (const leg of b.legs ?? []) {
        if (leg.matchId) idLabel.set(leg.matchId, leg.matchLabel || b.matchLabel);
      }
      for (const id of b.matchIds ?? []) {
        if (id && !idLabel.has(id)) idLabel.set(id, b.matchLabel);
      }
      const ids = [...idLabel.keys()];
      if (ids.length === 0) continue;
      const share = ids.length;
      const profitShare = (b.profit ?? 0) / share;
      const stakeShare = b.isFreebet ? 0 : b.stake / share;
      for (const id of ids) {
        const cur =
          map.get(id) ??
          ({
            matchId: id,
            label: idLabel.get(id) || "Partido",
            profit: 0,
            staked: 0,
            count: 0,
          } as MatchAgg);
        if ((cur.label === "Partido" || !cur.label) && idLabel.get(id)) {
          cur.label = idLabel.get(id)!;
        }
        cur.profit += profitShare;
        cur.staked += stakeShare;
        cur.count += 1;
        map.set(id, cur);
      }
    }
    return [...map.values()].map((m) => ({
      ...m,
      profit: round2(m.profit),
      staked: round2(m.staked),
    }));
  }, [bets]);

  const matchTopGains = useMemo(
    () =>
      matchAgg
        .filter((m) => m.profit > 0)
        .sort((a, b) => b.profit - a.profit)
        .slice(0, 3),
    [matchAgg]
  );
  const matchTopLosses = useMemo(
    () =>
      matchAgg
        .filter((m) => m.profit < 0)
        .sort((a, b) => a.profit - b.profit)
        .slice(0, 3),
    [matchAgg]
  );
  const matchMostBets = useMemo(
    () =>
      matchAgg
        .filter((m) => m.count > 0)
        .sort((a, b) => b.count - a.count)
        .slice(0, 3),
    [matchAgg]
  );
  const matchMostStaked = useMemo(
    () =>
      matchAgg
        .filter((m) => m.staked > 0)
        .sort((a, b) => b.staked - a.staked)
        .slice(0, 3),
    [matchAgg]
  );

  // ----- Podios por USUARIO -----
  const userAgg = useMemo(() => {
    if (!bets) return [];
    const byUid = new Map<
      string,
      { profit: number; won: number; lost: number }
    >();
    for (const b of bets) {
      if (b.status === "pending") continue;
      const cur = byUid.get(b.userId) ?? { profit: 0, won: 0, lost: 0 };
      cur.profit += b.profit ?? 0;
      const outcome = betOutcome(b);
      if (outcome === "won") cur.won += 1;
      else if (outcome === "lost") cur.lost += 1;
      byUid.set(b.userId, cur);
    }
    return [...byUid.entries()].map(([uid, v]) => ({
      user: usersById[uid] ?? null,
      ...v,
    }));
  }, [bets, usersById]);

  const kings = useMemo(
    () =>
      userAgg
        .filter((u) => u.profit > 0)
        .sort((a, b) => b.profit - a.profit)
        .slice(0, 3),
    [userAgg]
  );
  const biggestLosers = useMemo(
    () =>
      userAgg
        .filter((u) => u.profit < 0)
        .sort((a, b) => a.profit - b.profit)
        .slice(0, 3),
    [userAgg]
  );
  const mostWinners = useMemo(
    () =>
      userAgg
        .filter((u) => u.won > 0)
        .sort((a, b) => b.won - a.won)
        .slice(0, 3),
    [userAgg]
  );

  const loading = bets === null;
  const isEmpty = !loading && (bets?.length ?? 0) === 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1">
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <Crown className="h-6 w-6 text-gold" />
          Salón de la Fama
        </h1>
        <p className="text-sm text-muted-foreground">
          Las apuestas y partidos para la historia del grupo: mayores pelotazos,
          peores batacazos y récords varios.
        </p>
      </div>

      {loading ? (
        <Card>
          <CardContent className="px-6 py-10 text-center text-sm text-muted-foreground">
            Cargando salón de la fama…
          </CardContent>
        </Card>
      ) : isEmpty ? (
        <Card>
          <CardContent className="px-6 py-10 text-center text-sm text-muted-foreground">
            Todavía no hay apuestas en el grupo. ¡Cuando las haya, aquí saldrán
            los mejores y peores momentos!
          </CardContent>
        </Card>
      ) : (
        <>
          <SectionTitle>Apuestas legendarias</SectionTitle>
          <div className="grid gap-4 lg:grid-cols-2">
            <BetPodium
              title="Top 3 ganancias"
              subtitle="Los mayores pelotazos"
              icon={<TrendingUp className="h-5 w-5 text-profit" />}
              accent="border-t-profit"
              bets={topGains}
              usersById={usersById}
              emptyLabel="Aún no hay apuestas ganadas."
            />
            <BetPodium
              title="Top 3 pérdidas"
              subtitle="Los peores batacazos"
              icon={<TrendingDown className="h-5 w-5 text-loss" />}
              accent="border-t-loss"
              bets={topLosses}
              usersById={usersById}
              emptyLabel="Aún no hay apuestas perdidas."
            />
            <BetPodium
              title="Top 3 machadas"
              subtitle="Mayor cuota acertada (sin cashout)"
              icon={<Sparkles className="h-5 w-5 text-gold" />}
              accent="border-t-gold"
              bets={machadaTop}
              usersById={usersById}
              emptyLabel="Aún no hay apuestas acertadas enteras."
              renderValue={(b) => ({
                text: `@ ${b.odds.toFixed(2)}`,
                className: "text-gold",
              })}
            />
            <BetPodium
              title="Top 3 valientes"
              subtitle="Apuestas de mayor stake"
              icon={<Coins className="h-5 w-5 text-primary" />}
              accent="border-t-primary"
              bets={valienteTop}
              usersById={usersById}
              emptyLabel="Aún no hay apuestas."
              renderValue={(b) => ({
                text: formatCurrency(b.stake),
                className: "text-primary",
              })}
            />
          </div>

          <SectionTitle>Partidos top</SectionTitle>
          <div className="grid gap-4 lg:grid-cols-2">
            <MatchPodium
              title="Partidos con más ganancias"
              subtitle="Los que más dinero han dado"
              icon={<TrendingUp className="h-5 w-5 text-profit" />}
              accent="border-t-profit"
              rows={matchTopGains.map((m) => ({
                key: m.matchId,
                label: m.label,
                value: profitValue(m.profit),
              }))}
              emptyLabel="Aún no hay partidos con ganancias."
            />
            <MatchPodium
              title="Partidos con más pérdidas"
              subtitle="Los que más dinero se han llevado"
              icon={<TrendingDown className="h-5 w-5 text-loss" />}
              accent="border-t-loss"
              rows={matchTopLosses.map((m) => ({
                key: m.matchId,
                label: m.label,
                value: profitValue(m.profit),
              }))}
              emptyLabel="Aún no hay partidos con pérdidas."
            />
            <MatchPodium
              title="Partidos con más apuestas"
              subtitle="Los que más han movido al grupo"
              icon={<Receipt className="h-5 w-5 text-primary" />}
              accent="border-t-primary"
              rows={matchMostBets.map((m) => ({
                key: m.matchId,
                label: m.label,
                value: { text: `${m.count} apuestas`, className: "text-primary" },
              }))}
              emptyLabel="Aún no hay apuestas en partidos."
            />
            <MatchPodium
              title="Partidos con más dinero apostado"
              subtitle="Donde más se han mojado"
              icon={<Coins className="h-5 w-5 text-gold" />}
              accent="border-t-gold"
              rows={matchMostStaked.map((m) => ({
                key: m.matchId,
                label: m.label,
                value: { text: formatCurrency(m.staked), className: "text-gold" },
              }))}
              emptyLabel="Aún no hay dinero apostado en partidos."
            />
          </div>

          {(kings.length > 0 ||
            biggestLosers.length > 0 ||
            mostWinners.length > 0) && (
            <>
              <SectionTitle>Jugadores de leyenda</SectionTitle>
              <div className="grid gap-4 lg:grid-cols-3">
                <UserPodium
                  title="Reyes del beneficio"
                  subtitle="Top 3 con más beneficio total"
                  icon={<Flame className="h-5 w-5 text-orange-500" />}
                  accent="border-t-orange-500"
                  rows={kings.map((u) => ({
                    user: u.user,
                    value: profitValue(u.profit),
                  }))}
                  emptyLabel="Nadie está en positivo todavía."
                />
                <UserPodium
                  title="Los más sufridores"
                  subtitle="Top 3 con más pérdidas totales"
                  icon={<TrendingDown className="h-5 w-5 text-loss" />}
                  accent="border-t-loss"
                  rows={biggestLosers.map((u) => ({
                    user: u.user,
                    value: profitValue(u.profit),
                  }))}
                  emptyLabel="Nadie está en negativo todavía."
                />
                <UserPodium
                  title="Más ganadoras"
                  subtitle="Top 3 por apuestas acertadas"
                  icon={<Trophy className="h-5 w-5 text-gold" />}
                  accent="border-t-gold"
                  rows={mostWinners.map((u) => ({
                    user: u.user,
                    value: { text: `${u.won} ganadas`, className: "text-profit" },
                  }))}
                  emptyLabel="Aún no hay apuestas ganadas."
                />
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="pt-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
      {children}
    </h2>
  );
}

const MEDAL_CLASSES = ["text-gold", "text-silver", "text-bronze"] as const;

function RankBadge({ rank }: { rank: number }) {
  const medal = MEDAL_CLASSES[rank - 1];
  return (
    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted">
      {medal ? (
        <Medal className={cn("h-4 w-4", medal)} />
      ) : (
        <span className="text-xs font-bold text-muted-foreground">{rank}</span>
      )}
    </span>
  );
}

/** Card con acento de color arriba, cabecera y cuerpo. Base de todos los podios. */
function PodiumCard({
  title,
  subtitle,
  icon,
  accent,
  children,
}: {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  accent: string;
  children: React.ReactNode;
}) {
  return (
    <Card className={cn("border-t-4", accent)}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          {icon}
          {title}
        </CardTitle>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </CardHeader>
      <CardContent className="space-y-2">{children}</CardContent>
    </Card>
  );
}

function EmptyRow({ label }: { label: string }) {
  return (
    <p className="py-4 text-center text-sm text-muted-foreground">{label}</p>
  );
}

function BetPodium({
  title,
  subtitle,
  icon,
  accent,
  bets,
  usersById,
  emptyLabel,
  renderValue,
}: {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  accent: string;
  bets: Bet[];
  usersById: Record<string, AppUser>;
  emptyLabel: string;
  renderValue?: (bet: Bet) => RowValue;
}) {
  return (
    <PodiumCard title={title} subtitle={subtitle} icon={icon} accent={accent}>
      {bets.length === 0 ? (
        <EmptyRow label={emptyLabel} />
      ) : (
        bets.map((bet, i) => (
          <BetRow
            key={bet.id}
            rank={i + 1}
            bet={bet}
            user={usersById[bet.userId] ?? null}
            value={renderValue ? renderValue(bet) : profitValue(bet.profit)}
          />
        ))
      )}
    </PodiumCard>
  );
}

function BetRow({
  rank,
  bet,
  user,
  value,
}: {
  rank: number;
  bet: Bet;
  user: AppUser | null;
  value: RowValue;
}) {
  return (
    <Link
      href={`${ROUTES.bets}/${bet.id}`}
      className={cn(
        "flex items-start gap-3 rounded-md border border-border/60 px-3 py-2 transition-colors hover:bg-accent/40",
        rowTint(rank)
      )}
    >
      <RankBadge rank={rank} />
      <Avatar className="h-9 w-9 shrink-0">
        {user?.avatarUrl && <AvatarImage src={user.avatarUrl} />}
        <AvatarFallback>{initials(user?.username ?? "?")}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">
          {user?.username ?? "Usuario"}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {bet.matchLabel}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {bet.selection} @ {bet.odds.toFixed(2)} · {formatCurrency(bet.stake)} ·{" "}
          {formatDate(eventDate(bet))}
        </p>
      </div>
      <span
        className={cn("shrink-0 font-mono text-sm font-bold", value.className)}
      >
        {value.text}
      </span>
    </Link>
  );
}

function MatchPodium({
  title,
  subtitle,
  icon,
  accent,
  rows,
  emptyLabel,
}: {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  accent: string;
  rows: { key: string; label: string; value: RowValue }[];
  emptyLabel: string;
}) {
  return (
    <PodiumCard title={title} subtitle={subtitle} icon={icon} accent={accent}>
      {rows.length === 0 ? (
        <EmptyRow label={emptyLabel} />
      ) : (
        rows.map((row, i) => (
          <div
            key={row.key}
            className={cn(
              "flex items-center gap-3 rounded-md border border-border/60 px-3 py-2",
              rowTint(i + 1)
            )}
          >
            <RankBadge rank={i + 1} />
            <span className="min-w-0 flex-1 truncate text-sm font-medium">
              {row.label}
            </span>
            <span
              className={cn(
                "shrink-0 font-mono text-sm font-bold",
                row.value.className
              )}
            >
              {row.value.text}
            </span>
          </div>
        ))
      )}
    </PodiumCard>
  );
}

function UserPodium({
  title,
  subtitle,
  icon,
  accent,
  rows,
  emptyLabel,
}: {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  accent: string;
  rows: { user: AppUser | null; value: RowValue }[];
  emptyLabel: string;
}) {
  return (
    <PodiumCard title={title} subtitle={subtitle} icon={icon} accent={accent}>
      {rows.length === 0 ? (
        <EmptyRow label={emptyLabel} />
      ) : (
        rows.map((row, i) => (
          <UserRow
            key={row.user?.uid ?? i}
            rank={i + 1}
            user={row.user}
            value={row.value}
          />
        ))
      )}
    </PodiumCard>
  );
}

function UserRow({
  rank,
  user,
  value,
}: {
  rank: number;
  user: AppUser | null;
  value: RowValue;
}) {
  const content = (
    <>
      <RankBadge rank={rank} />
      <Avatar className="h-8 w-8 shrink-0">
        {user?.avatarUrl && <AvatarImage src={user.avatarUrl} />}
        <AvatarFallback>{initials(user?.username ?? "?")}</AvatarFallback>
      </Avatar>
      <span className="min-w-0 flex-1 truncate text-sm font-medium">
        {user?.username ?? "Usuario"}
      </span>
      <span className={cn("shrink-0 font-mono text-sm font-bold", value.className)}>
        {value.text}
      </span>
    </>
  );
  const base = cn(
    "flex items-center gap-3 rounded-md border border-border/60 px-3 py-2",
    rowTint(rank)
  );
  if (!user) return <div className={base}>{content}</div>;
  return (
    <Link
      href={ROUTES.profile(user.uid)}
      className={cn(base, "transition-colors hover:bg-accent/40")}
    >
      {content}
    </Link>
  );
}
