"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FirebaseError } from "firebase/app";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { registerWithEmail, signInWithGoogle } from "@/features/auth/auth.service";
import { ROUTES } from "@/lib/constants";

export default function RegisterPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accepted, setAccepted] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!accepted) {
      setError("Debes confirmar que eres mayor de 18 años");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await registerWithEmail(email, password, username);
      router.replace(ROUTES.dashboard);
    } catch (err) {
      setError(err instanceof FirebaseError ? err.message : "Error al registrar");
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogle() {
    if (!accepted) {
      setError("Debes confirmar que eres mayor de 18 años");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await signInWithGoogle();
      router.replace(ROUTES.dashboard);
    } catch (err) {
      setError(err instanceof FirebaseError ? err.message : "Error al registrar");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Crear cuenta</CardTitle>
        <CardDescription>Únete al grupo para registrar tus apuestas</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="username">Nombre de usuario</Label>
            <Input
              id="username"
              required
              minLength={3}
              maxLength={20}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Contraseña</Label>
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <label className="flex items-start gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={accepted}
              onChange={(e) => setAccepted(e.target.checked)}
            />
            <span>
              Confirmo que soy mayor de 18 años y entiendo que esta aplicación
              <strong> no procesa apuestas reales ni dinero</strong>; solo registra
              apuestas realizadas en casas externas con fines recreativos entre amigos.
            </span>
          </label>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Creando cuenta…" : "Crear cuenta"}
          </Button>
        </form>

        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <div className="h-px flex-1 bg-border" /> o <div className="h-px flex-1 bg-border" />
        </div>

        <Button variant="outline" className="w-full" onClick={handleGoogle} disabled={loading}>
          Continuar con Google
        </Button>
      </CardContent>
      <CardFooter className="justify-center text-sm text-muted-foreground">
        ¿Ya tienes cuenta?&nbsp;
        <Link href={ROUTES.login} className="font-medium text-primary hover:underline">
          Inicia sesión
        </Link>
      </CardFooter>
    </Card>
  );
}
