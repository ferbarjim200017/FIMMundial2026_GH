"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogOut, User as UserIcon, Settings, Shield } from "lucide-react";
import { useAuth } from "@/features/auth/auth.context";
import { signOutUser } from "@/features/auth/auth.service";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { InstallAppButton } from "@/components/layout/install-app-button";
import { GroupSwitcher } from "@/components/layout/group-switcher";
import { initials } from "@/lib/utils";
import { APP_NAME, ROUTES } from "@/lib/constants";

export function TopBar() {
  const { appUser, firebaseUser, isAdmin } = useAuth();
  const router = useRouter();

  async function handleLogout() {
    await signOutUser();
    router.replace(ROUTES.login);
  }

  return (
    <header className="flex h-14 items-center justify-between border-b border-border bg-background/80 px-3 backdrop-blur sm:px-4">
      <div className="flex items-center gap-3">
        <Link href={ROUTES.dashboard} className="flex items-center gap-2">
          {/* En móvil mostramos solo el icono + año para ahorrar espacio. */}
          <span className="font-display text-base font-bold tracking-tight sm:hidden">
            ⚽ <span className="text-brand">Mundial 26</span>
          </span>
          <span className="hidden font-display text-base font-bold tracking-tight sm:inline">
            ⚽ <span className="text-brand">{APP_NAME}</span>
          </span>
        </Link>
      </div>

      <div className="flex items-center gap-2">
        {/* En móvil la instalación se ofrece con el InstallBanner; aquí solo en
            escritorio para no duplicar. */}
        <span className="hidden sm:block">
          <InstallAppButton />
        </span>
        <GroupSwitcher />
        <ThemeToggle />

        {firebaseUser && appUser ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="rounded-full">
                <Avatar className="h-9 w-9">
                  {appUser.avatarUrl && (
                    <AvatarImage src={appUser.avatarUrl} alt={appUser.username} />
                  )}
                  <AvatarFallback>{initials(appUser.username)}</AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>
                <div className="flex flex-col">
                  <span className="text-sm font-semibold">{appUser.username}</span>
                  <span className="text-xs text-muted-foreground">{appUser.email}</span>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href={ROUTES.profile(appUser.uid)}>
                  <UserIcon className="h-4 w-4" /> Mi perfil
                </Link>
              </DropdownMenuItem>
              {isAdmin && (
                <DropdownMenuItem asChild>
                  <Link href={ROUTES.admin}>
                    <Shield className="h-4 w-4" /> Administración
                  </Link>
                </DropdownMenuItem>
              )}
              <DropdownMenuItem asChild>
                <Link href="/settings">
                  <Settings className="h-4 w-4" /> Ajustes
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleLogout}>
                <LogOut className="h-4 w-4" /> Cerrar sesión
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <Button asChild size="sm">
            <Link href={ROUTES.login}>Iniciar sesión</Link>
          </Button>
        )}
      </div>
    </header>
  );
}
