"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Swords } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/features/auth/auth.context";
import { useGroup } from "@/features/groups/groups.context";
import { getUser, updateUserProfile } from "@/features/users/users.service";
import { subscribeToBets } from "@/features/bets/bets.service";
import { betInGroup, computeUserStats, getInitialBalances } from "@/features/bets/bets.utils";
import { ROUTES } from "@/lib/constants";
import {
  formatCurrency,
  formatDate,
  formatPercent,
  initials,
  profitClass,
} from "@/lib/utils";
import type { AppUser, Bet } from "@/types/domain";

export default function ProfilePage() {
  const params = useParams<{ userId: string }>();
  const { appUser: me } = useAuth();
  const { activeGroup, memberUids } = useGroup();
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [username, setUsername] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [bets, setBets] = useState<Bet[]>([]);

  useEffect(() => {
    if (!params.userId) return;
    getUser(params.userId).then((u) => {
      setUser(u);
      setUsername(u?.username ?? "");
      setAvatarUrl(u?.avatarUrl ?? "");
      setLoading(false);
    });
  }, [params.userId]);

  // Apuestas del usuario en el grupo activo — base para stats y saldos
  // contextualizados.
  useEffect(() => {
    if (!params.userId) return;
    const unsub = subscribeToBets({ userId: params.userId }, setBets);
    return unsub;
  }, [params.userId]);

  const groupBets = useMemo(() => {
    if (!activeGroup) return [];
    return bets.filter((b) => betInGroup(b, activeGroup.id));
  }, [bets, activeGroup]);

  const groupStats = useMemo(() => computeUserStats(groupBets), [groupBets]);

  // Cuánto dinero tiene "en juego" ahora mismo: suma de stakes de las
  // apuestas pendientes que NO sean freebet (las freebets no inmovilizan
  // dinero del usuario). Mismo criterio que `computeBookmakerSummary`.
  const inPlay = useMemo(() => {
    const pending = groupBets.filter(
      (b) => b.status === "pending" && !b.isFreebet
    );
    const amount = pending.reduce((acc, b) => acc + b.stake, 0);
    return { amount, count: pending.length };
  }, [groupBets]);

  const groupBalances = useMemo(() => {
    if (!user || !activeGroup) {
      return { initial: 0, current: 0 };
    }
    const initials = getInitialBalances(user, activeGroup.id);
    const initial = initials.bet365 + initials.winamax + initials.other;
    return {
      initial,
      current: initial + groupStats.totalProfit,
    };
  }, [user, activeGroup, groupStats.totalProfit]);

  if (loading) return <p className="text-sm text-muted-foreground">Cargando perfil…</p>;
  if (!user) return <p className="text-sm text-muted-foreground">Usuario no encontrado.</p>;

  const isOwner = me?.uid === user.uid;
  // Bloqueo cross-group: si el target no comparte grupo activo y no eres tú
  // mismo, no enseñamos nada (decisión del usuario: misma regla para admin).
  // memberUids puede estar vacío durante el primer render — solo bloqueamos
  // cuando los miembros ya han cargado (size > 0).
  const outsideOfGroup =
    !!activeGroup && memberUids.size > 0 && !isOwner && !memberUids.has(user.uid);
  if (outsideOfGroup) {
    return (
      <div className="rounded-lg border border-dashed p-12 text-center text-sm text-muted-foreground">
        Este usuario no está en tu grupo <strong>{activeGroup.name}</strong>.
        Cambia de grupo activo desde el icono de grupos si necesitas verlo.
      </div>
    );
  }

  async function handleSave() {
    if (!user) return;
    setSaving(true);
    try {
      await updateUserProfile(user.uid, {
        username,
        avatarUrl: avatarUrl || null,
      });
      const updated = await getUser(user.uid);
      setUser(updated);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center">
          <Avatar className="h-20 w-20">
            {user.avatarUrl && <AvatarImage src={user.avatarUrl} alt={user.username} />}
            <AvatarFallback className="text-lg">{initials(user.username)}</AvatarFallback>
          </Avatar>
          <div className="flex-1">
            <h1 className="text-2xl font-bold">{user.username}</h1>
            <p className="text-sm text-muted-foreground">{user.email}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Miembro desde {user.joinedAt ? formatDate(user.joinedAt.toDate()) : "—"}
              {user.role === "admin" && (
                <span className="ml-2 rounded bg-primary/10 px-1.5 py-0.5 text-primary">
                  ADMIN
                </span>
              )}
            </p>
          </div>
          {isOwner && !editing && (
            <Button variant="outline" onClick={() => setEditing(true)}>
              Editar perfil
            </Button>
          )}
          {!isOwner && me && (
            <Button asChild variant="outline" className="gap-1.5">
              <Link href={ROUTES.compare(me.uid, user.uid)}>
                <Swords className="h-4 w-4" />
                Comparar conmigo
              </Link>
            </Button>
          )}
        </CardContent>
      </Card>

      {editing && isOwner && (
        <Card>
          <CardHeader>
            <CardTitle>Editar perfil</CardTitle>
            <CardDescription>
              Actualiza tu nombre de usuario y avatar (URL de imagen)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="username">Nombre de usuario</Label>
              <Input
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                minLength={3}
                maxLength={20}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="avatar">Avatar (URL)</Label>
              <Input
                id="avatar"
                type="url"
                value={avatarUrl}
                onChange={(e) => setAvatarUrl(e.target.value)}
                placeholder="https://…"
              />
              <p className="text-xs text-muted-foreground">
                En el Módulo 5 añadiremos subida directa a Firebase Storage.
              </p>
            </div>
            <div className="flex gap-2 pt-2">
              <Button onClick={handleSave} disabled={saving}>
                {saving ? "Guardando…" : "Guardar"}
              </Button>
              <Button variant="outline" onClick={() => setEditing(false)} disabled={saving}>
                Cancelar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatBox label="Saldo inicial" value={formatCurrency(groupBalances.initial)} />
        <StatBox label="Saldo actual" value={formatCurrency(groupBalances.current)} />
        <StatBox
          label="Dinero en juego"
          value={formatCurrency(inPlay.amount)}
          valueClass={inPlay.amount > 0 ? "text-amber-600 dark:text-amber-400" : undefined}
          subtitle={
            inPlay.count === 0
              ? "Sin apuestas pendientes"
              : `${inPlay.count} apuesta${inPlay.count === 1 ? "" : "s"} pendiente${inPlay.count === 1 ? "" : "s"}`
          }
        />
        <StatBox
          label="Beneficio total"
          value={formatCurrency(groupStats.totalProfit)}
          valueClass={profitClass(groupStats.totalProfit)}
        />
        <StatBox
          label="ROI"
          value={formatPercent(groupStats.roi)}
          valueClass={profitClass(groupStats.roi)}
        />
        <StatBox label="Yield" value={formatPercent(groupStats.yield)} />
        <StatBox label="Apuestas" value={String(groupStats.betsCount)} />
        <StatBox label="Ganadas" value={String(groupStats.betsWon)} />
        <StatBox label="Perdidas" value={String(groupStats.betsLost)} />
        <StatBox label="Racha actual" value={String(groupStats.currentStreak)} />
        <StatBox label="Mejor racha" value={String(groupStats.bestStreak)} />
        <StatBox label="Cuota media" value={groupStats.avgOdds.toFixed(2)} />
        <StatBox label="Stake medio" value={formatCurrency(groupStats.avgStake)} />
      </div>
    </div>
  );
}

function StatBox({
  label,
  value,
  valueClass,
  subtitle,
}: {
  label: string;
  value: string;
  valueClass?: string;
  subtitle?: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
        <p className={`mt-1 text-xl font-bold ${valueClass ?? ""}`}>{value}</p>
        {subtitle && (
          <p className="mt-0.5 text-[11px] text-muted-foreground">{subtitle}</p>
        )}
      </CardContent>
    </Card>
  );
}
