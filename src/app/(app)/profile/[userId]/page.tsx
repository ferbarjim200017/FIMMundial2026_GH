"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/features/auth/auth.context";
import { getUser, updateUserProfile } from "@/features/users/users.service";
import {
  formatCurrency,
  formatDate,
  formatPercent,
  initials,
  profitClass,
} from "@/lib/utils";
import type { AppUser } from "@/types/domain";

export default function ProfilePage() {
  const params = useParams<{ userId: string }>();
  const { appUser: me } = useAuth();
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [username, setUsername] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!params.userId) return;
    getUser(params.userId).then((u) => {
      setUser(u);
      setUsername(u?.username ?? "");
      setAvatarUrl(u?.avatarUrl ?? "");
      setLoading(false);
    });
  }, [params.userId]);

  if (loading) return <p className="text-sm text-muted-foreground">Cargando perfil…</p>;
  if (!user) return <p className="text-sm text-muted-foreground">Usuario no encontrado.</p>;

  const isOwner = me?.uid === user.uid;

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
        <StatBox label="Saldo inicial" value={formatCurrency(user.initialBalance)} />
        <StatBox label="Saldo actual" value={formatCurrency(user.currentBalance)} />
        <StatBox
          label="Beneficio total"
          value={formatCurrency(user.stats.totalProfit)}
          valueClass={profitClass(user.stats.totalProfit)}
        />
        <StatBox
          label="ROI"
          value={formatPercent(user.stats.roi)}
          valueClass={profitClass(user.stats.roi)}
        />
        <StatBox label="Yield" value={formatPercent(user.stats.yield)} />
        <StatBox label="Apuestas" value={String(user.stats.betsCount)} />
        <StatBox label="Ganadas" value={String(user.stats.betsWon)} />
        <StatBox label="Perdidas" value={String(user.stats.betsLost)} />
        <StatBox label="Racha actual" value={String(user.stats.currentStreak)} />
        <StatBox label="Mejor racha" value={String(user.stats.bestStreak)} />
        <StatBox label="Cuota media" value={user.stats.avgOdds.toFixed(2)} />
        <StatBox label="Stake medio" value={formatCurrency(user.stats.avgStake)} />
      </div>
    </div>
  );
}

function StatBox({
  label,
  value,
  valueClass,
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
        <p className={`mt-1 text-xl font-bold ${valueClass ?? ""}`}>{value}</p>
      </CardContent>
    </Card>
  );
}
