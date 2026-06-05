"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAuth } from "@/features/auth/auth.context";
import { listUsers } from "@/features/users/users.service";
import { formatCurrency, formatDate, initials, profitClass } from "@/lib/utils";
import { ROUTES } from "@/lib/constants";
import type { AppUser } from "@/types/domain";
import { useRouter } from "next/navigation";

export default function AdminPage() {
  const { isAdmin, loading } = useAuth();
  const router = useRouter();
  const [users, setUsers] = useState<AppUser[]>([]);
  const [fetching, setFetching] = useState(true);

  useEffect(() => {
    if (!loading && !isAdmin) router.replace(ROUTES.dashboard);
  }, [loading, isAdmin, router]);

  useEffect(() => {
    if (!isAdmin) return;
    listUsers().then((list) => {
      setUsers(list);
      setFetching(false);
    });
  }, [isAdmin]);

  if (loading || !isAdmin) return null;

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

      <Card id="users">
        <CardHeader>
          <CardTitle>Usuarios del grupo</CardTitle>
          <CardDescription>
            {fetching ? "Cargando…" : `${users.length} usuario(s) registrado(s)`}
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
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
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
                          u.role === "admin"
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
                  </tr>
                ))}
                {!fetching && users.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">
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
