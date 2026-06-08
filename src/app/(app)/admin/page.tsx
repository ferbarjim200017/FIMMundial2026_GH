"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ShieldCheck, ShieldOff, Trash2, Users as UsersIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/auth.context";
import {
  deleteUserDoc,
  setUserRole,
  subscribeToRanking,
} from "@/features/users/users.service";
import { seedFIMGroup, type SeedFIMResult } from "@/features/groups/groups.service";
import { formatCurrency, formatDate, initials, profitClass } from "@/lib/utils";
import { ROUTES } from "@/lib/constants";
import type { AppUser } from "@/types/domain";

export default function AdminPage() {
  const { appUser: me, isAdmin, loading } = useAuth();
  const router = useRouter();
  const [users, setUsers] = useState<AppUser[] | null>(null);
  const [pendingUid, setPendingUid] = useState<string | null>(null);
  const [seeding, setSeeding] = useState(false);
  const [seedMsg, setSeedMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !isAdmin) router.replace(ROUTES.dashboard);
  }, [loading, isAdmin, router]);

  useEffect(() => {
    if (!isAdmin) return;
    const unsub = subscribeToRanking(setUsers);
    return unsub;
  }, [isAdmin]);

  if (loading || !isAdmin) return null;

  async function handleToggleRole(target: AppUser) {
    const makeAdmin = target.role !== "admin";
    const message = makeAdmin
      ? `¿Hacer admin a ${target.username}? Tendrá permisos para gestionar usuarios, partidos y resultados.`
      : `¿Quitar el rol admin a ${target.username}?`;
    if (!window.confirm(message)) return;
    setPendingUid(target.uid);
    try {
      await setUserRole(target.uid, makeAdmin ? "admin" : "member");
    } catch (err) {
      console.error("[admin role]", err);
      window.alert(
        err instanceof Error
          ? `No se pudo cambiar el rol: ${err.message}`
          : "No se pudo cambiar el rol"
      );
    } finally {
      setPendingUid(null);
    }
  }

  async function handleSeedFIM() {
    if (
      !window.confirm(
        "Crear el grupo \"FIM\" si no existe y asignar a todos los usuarios " +
          "actuales como miembros (es seguro reejecutarlo). ¿Continuar?"
      )
    )
      return;
    setSeeding(true);
    setSeedMsg(null);
    try {
      const res: SeedFIMResult = await seedFIMGroup(me?.uid ?? null);
      setSeedMsg(
        `✅ Listo. Grupo ${res.groupCreated ? "creado" : "ya existía"} · ` +
          `Asignados: ${res.usersAssigned} · Ya miembros: ${res.usersAlreadyMember} · ` +
          `Activo nuevo: ${res.usersWithNewActive} · Total usuarios: ${res.total}`
      );
    } catch (err) {
      console.error("[admin seed FIM]", err);
      setSeedMsg(
        `❌ ${err instanceof Error ? err.message : "Error al crear el grupo"}`
      );
    } finally {
      setSeeding(false);
    }
  }

  async function handleDeleteUser(target: AppUser) {
    const ok = window.confirm(
      `¿Eliminar a ${target.username}?\n\n` +
        "Esto borra su PERFIL (ranking, saldos, estadísticas). Sus APUESTAS " +
        "se conservan en el historial del grupo y aparecerán sin nombre.\n\n" +
        "La cuenta de autenticación NO se elimina automáticamente — si quieres " +
        "que el usuario no pueda volver a entrar, bórrala manualmente desde " +
        "Firebase Console → Authentication."
    );
    if (!ok) return;
    setPendingUid(target.uid);
    try {
      await deleteUserDoc(target.uid);
    } catch (err) {
      console.error("[admin delete user]", err);
      window.alert(
        err instanceof Error
          ? `No se pudo eliminar: ${err.message}`
          : "No se pudo eliminar el usuario"
      );
    } finally {
      setPendingUid(null);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Panel de administración</h1>
        <p className="text-sm text-muted-foreground">
          Gestión de usuarios y partidos del Mundial.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <AdminTile
          href="/admin/matches"
          title="Partidos del Mundial"
          description="Añade y gestiona el calendario"
        />
        <AdminTile
          href="#users"
          title="Usuarios"
          description="Lista de miembros del grupo"
        />
      </div>

      <Card className="border-primary/40 bg-primary/5">
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <UsersIcon className="h-4 w-4 text-primary" />
              Bootstrap del grupo FIM
            </CardTitle>
            <CardDescription>
              Crea el grupo &quot;FIM&quot; si no existe y asigna a todos los
              usuarios actuales como miembros. Idempotente — puedes volver a
              ejecutarlo sin riesgo.
            </CardDescription>
          </div>
          <Button onClick={handleSeedFIM} disabled={seeding}>
            {seeding ? "Asignando…" : "Crear y asignar"}
          </Button>
        </CardHeader>
        {seedMsg && (
          <CardContent>
            <p className="text-sm">{seedMsg}</p>
          </CardContent>
        )}
      </Card>

      <Card id="users">
        <CardHeader>
          <CardTitle>Usuarios del grupo</CardTitle>
          <CardDescription>
            {users === null
              ? "Cargando…"
              : `${users.length} usuario(s) registrado(s)`}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/30 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-2">Usuario</th>
                  <th className="px-4 py-2">Email</th>
                  <th className="px-4 py-2">Rol</th>
                  <th className="px-4 py-2">Alta</th>
                  <th className="px-4 py-2 text-right">Saldo</th>
                  <th className="px-4 py-2 text-right">Beneficio</th>
                  <th className="px-4 py-2 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {(users ?? []).map((u) => {
                  const isSelf = u.uid === me?.uid;
                  const isUserAdmin = u.role === "admin";
                  const busy = pendingUid === u.uid;
                  return (
                    <tr key={u.uid} className="border-b last:border-0 hover:bg-accent/30">
                      <td className="px-4 py-2">
                        <Link
                          href={ROUTES.profile(u.uid)}
                          className="flex items-center gap-2 hover:text-primary"
                        >
                          <Avatar className="h-7 w-7">
                            {u.avatarUrl && <AvatarImage src={u.avatarUrl} alt={u.username} />}
                            <AvatarFallback className="text-[10px]">
                              {initials(u.username)}
                            </AvatarFallback>
                          </Avatar>
                          <span>{u.username}</span>
                        </Link>
                      </td>
                      <td className="px-4 py-2 text-muted-foreground">{u.email}</td>
                      <td className="px-4 py-2">
                        <span
                          className={
                            isUserAdmin
                              ? "rounded bg-primary/10 px-1.5 py-0.5 text-xs text-primary"
                              : "text-muted-foreground"
                          }
                        >
                          {u.role}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-muted-foreground">
                        {u.joinedAt ? formatDate(u.joinedAt.toDate()) : "—"}
                      </td>
                      <td className="px-4 py-2 text-right font-mono">
                        {formatCurrency(u.currentBalance)}
                      </td>
                      <td className={`px-4 py-2 text-right font-mono ${profitClass(u.stats.totalProfit)}`}>
                        {formatCurrency(u.stats.totalProfit)}
                      </td>
                      <td className="px-4 py-2 text-right">
                        {isSelf ? (
                          <span className="text-xs text-muted-foreground">—</span>
                        ) : (
                          <div className="inline-flex items-center justify-end gap-2">
                            {isUserAdmin ? (
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={busy}
                                onClick={() => handleToggleRole(u)}
                              >
                                <ShieldOff className="mr-1 h-3.5 w-3.5" />
                                {busy ? "…" : "Quitar admin"}
                              </Button>
                            ) : (
                              <Button
                                size="sm"
                                disabled={busy}
                                onClick={() => handleToggleRole(u)}
                              >
                                <ShieldCheck className="mr-1 h-3.5 w-3.5" />
                                {busy ? "…" : "Hacer admin"}
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={busy}
                              onClick={() => handleDeleteUser(u)}
                              className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                            >
                              <Trash2 className="mr-1 h-3.5 w-3.5" />
                              {busy ? "…" : "Eliminar"}
                            </Button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {users !== null && users.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-6 text-center text-muted-foreground">
                      Aún no hay usuarios registrados.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function AdminTile({
  href,
  title,
  description,
}: {
  href: string;
  title: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="rounded-lg border bg-card p-4 transition-colors hover:border-primary/40 hover:bg-accent/30"
    >
      <p className="text-sm font-semibold">{title}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
    </Link>
  );
}
