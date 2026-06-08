"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, ShieldCheck, ShieldOff, Trash2, Users as UsersIcon, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/features/auth/auth.context";
import { useGroup } from "@/features/groups/groups.context";
import {
  deleteUserDoc,
  setUserRole,
  subscribeToRanking,
} from "@/features/users/users.service";
import {
  addUserToGroup,
  createGroup,
  removeUserFromGroup,
} from "@/features/groups/groups.service";
import {
  migrateBetsToGroup,
  type MigrateBetsResult,
} from "@/features/bets/bets.service";
import { formatCurrency, formatDate, initials, profitClass } from "@/lib/utils";
import { ROUTES } from "@/lib/constants";
import type { AppUser } from "@/types/domain";

export default function AdminPage() {
  const { appUser: me, isAdmin, loading } = useAuth();
  const router = useRouter();
  const { allGroups } = useGroup();
  const [users, setUsers] = useState<AppUser[] | null>(null);
  const [pendingUid, setPendingUid] = useState<string | null>(null);
  const [groupBusy, setGroupBusy] = useState<string | null>(null);

  // Estado del formulario para crear un grupo nuevo.
  const [newGroupName, setNewGroupName] = useState("");
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [createMsg, setCreateMsg] = useState<string | null>(null);

  // Migración one-shot de apuestas sin groupId al grupo FIM.
  const [migrating, setMigrating] = useState(false);
  const [migrateMsg, setMigrateMsg] = useState<string | null>(null);

  async function handleMigrateBets() {
    if (
      !window.confirm(
        "Vas a asignar todas las apuestas SIN grupo al grupo FIM. " +
          "Es idempotente — las que ya tengan grupo no se tocan. ¿Continuar?"
      )
    )
      return;
    setMigrating(true);
    setMigrateMsg(null);
    try {
      const res: MigrateBetsResult = await migrateBetsToGroup("FIM");
      setMigrateMsg(
        `✅ Total apuestas: ${res.total} · Ya etiquetadas: ${res.alreadyTagged} · Migradas a FIM: ${res.migrated}`
      );
    } catch (err) {
      console.error("[admin migrate bets]", err);
      setMigrateMsg(
        `❌ ${err instanceof Error ? err.message : "Error al migrar las apuestas"}`
      );
    } finally {
      setMigrating(false);
    }
  }

  /** Deriva un ID válido de Firestore a partir del nombre. Conserva la
   *  caja; sustituye espacios por guiones bajos; quita caracteres
   *  conflictivos. */
  function deriveGroupId(name: string): string {
    return name.trim().replace(/\s+/g, "_").replace(/[/.#$\[\]]/g, "");
  }

  async function handleCreateGroup() {
    const name = newGroupName.trim();
    if (name.length < 2) {
      setCreateMsg("El nombre debe tener al menos 2 caracteres.");
      return;
    }
    const id = deriveGroupId(name);
    if (!id) {
      setCreateMsg("Ese nombre no produce un ID válido. Prueba otro.");
      return;
    }
    setCreatingGroup(true);
    setCreateMsg(null);
    try {
      await createGroup({ id, name, createdBy: me?.uid ?? null });
      setCreateMsg(`✅ Grupo "${name}" creado (id: ${id}).`);
      setNewGroupName("");
    } catch (err) {
      console.error("[admin create group]", err);
      setCreateMsg(
        err instanceof Error ? `❌ ${err.message}` : "❌ Error al crear el grupo"
      );
    } finally {
      setCreatingGroup(false);
    }
  }

  async function handleAddGroup(u: AppUser, groupId: string) {
    setGroupBusy(`${u.uid}:${groupId}`);
    try {
      await addUserToGroup(groupId, u.uid);
    } catch (err) {
      console.error("[admin add group]", err);
      window.alert(
        err instanceof Error ? `No se pudo añadir: ${err.message}` : "Error"
      );
    } finally {
      setGroupBusy(null);
    }
  }

  async function handleRemoveGroup(u: AppUser, groupId: string) {
    if (
      !window.confirm(
        `¿Quitar a ${u.username} del grupo "${groupId}"? Si era su grupo ` +
          "activo, se le marcará como sin grupo activo hasta que elija otro."
      )
    )
      return;
    setGroupBusy(`${u.uid}:${groupId}`);
    try {
      await removeUserFromGroup(groupId, u.uid);
    } catch (err) {
      console.error("[admin remove group]", err);
      window.alert(
        err instanceof Error ? `No se pudo quitar: ${err.message}` : "Error"
      );
    } finally {
      setGroupBusy(null);
    }
  }

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

      <Card className="border-amber-500/40 bg-amber-500/5">
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="text-base">
              Migrar apuestas antiguas al grupo FIM
            </CardTitle>
            <CardDescription>
              Asigna el groupId &quot;FIM&quot; a todas las apuestas creadas
              ANTES de implementar grupos. Idempotente. Necesario una sola
              vez.
            </CardDescription>
          </div>
          <Button onClick={handleMigrateBets} disabled={migrating}>
            {migrating ? "Migrando…" : "Migrar apuestas a FIM"}
          </Button>
        </CardHeader>
        {migrateMsg && (
          <CardContent>
            <p className="text-sm">{migrateMsg}</p>
          </CardContent>
        )}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <UsersIcon className="h-4 w-4 text-primary" />
            Grupos
          </CardTitle>
          <CardDescription>
            Crea grupos nuevos. Para asignar miembros usa la columna
            &quot;Grupos&quot; en la tabla de usuarios.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Crear grupo */}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="new-group-name">Nombre del grupo</Label>
              <Input
                id="new-group-name"
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                placeholder="Ej: FIM, Trotamundos, Amigos del Cole…"
                maxLength={40}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void handleCreateGroup();
                }}
              />
              {newGroupName.trim() && (
                <p className="text-[10px] text-muted-foreground">
                  ID generado: <code>{deriveGroupId(newGroupName)}</code>
                </p>
              )}
            </div>
            <Button
              onClick={handleCreateGroup}
              disabled={creatingGroup || newGroupName.trim().length < 2}
            >
              {creatingGroup ? "Creando…" : "Crear grupo"}
            </Button>
          </div>
          {createMsg && <p className="text-sm">{createMsg}</p>}

          {/* Grupos existentes */}
          <div className="border-t pt-3">
            <p className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">
              Grupos existentes ({allGroups.length})
            </p>
            {allGroups.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Aún no hay grupos. Crea uno arriba para empezar.
              </p>
            ) : (
              <ul className="flex flex-wrap gap-1.5">
                {allGroups.map((g) => {
                  const memberCount =
                    users?.filter((u) => (u.groups ?? []).includes(g.id))
                      .length ?? 0;
                  return (
                    <li
                      key={g.id}
                      className="inline-flex items-center gap-1.5 rounded-full border bg-card px-2.5 py-0.5 text-xs"
                    >
                      <span className="font-medium">{g.name}</span>
                      <span className="font-mono text-muted-foreground">
                        · {memberCount}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </CardContent>
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
                  <th className="px-4 py-2">Grupos</th>
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
                      <td className="px-4 py-2">
                        <UserGroupsCell
                          user={u}
                          allGroups={allGroups}
                          groupBusy={groupBusy}
                          onAdd={(gid) => handleAddGroup(u, gid)}
                          onRemove={(gid) => handleRemoveGroup(u, gid)}
                        />
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
                    <td colSpan={8} className="px-4 py-6 text-center text-muted-foreground">
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

function UserGroupsCell({
  user,
  allGroups,
  groupBusy,
  onAdd,
  onRemove,
}: {
  user: AppUser;
  allGroups: { id: string; name: string }[];
  groupBusy: string | null;
  onAdd: (groupId: string) => void;
  onRemove: (groupId: string) => void;
}) {
  const userGroupIds = new Set(user.groups ?? []);
  const available = allGroups.filter((g) => !userGroupIds.has(g.id));
  return (
    <div className="flex flex-wrap items-center gap-1">
      {(user.groups ?? []).length === 0 && (
        <span className="text-xs text-muted-foreground">—</span>
      )}
      {(user.groups ?? []).map((gid) => {
        const g = allGroups.find((x) => x.id === gid);
        const label = g?.name ?? gid;
        const busy = groupBusy === `${user.uid}:${gid}`;
        return (
          <span
            key={gid}
            className="inline-flex items-center gap-0.5 rounded-full border bg-card px-1.5 py-0.5 text-[11px]"
          >
            <span className="font-medium">{label}</span>
            <button
              type="button"
              onClick={() => onRemove(gid)}
              disabled={busy}
              className="rounded-full p-0.5 text-muted-foreground transition-colors hover:bg-destructive/15 hover:text-destructive disabled:opacity-50"
              aria-label={`Quitar de ${label}`}
              title={`Quitar de ${label}`}
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        );
      })}
      {available.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="icon"
              variant="ghost"
              className="h-6 w-6"
              title="Añadir a grupo"
              aria-label="Añadir a grupo"
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuLabel>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Añadir a grupo
              </p>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {available.map((g) => (
              <DropdownMenuItem key={g.id} onSelect={() => onAdd(g.id)}>
                {g.name}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}
