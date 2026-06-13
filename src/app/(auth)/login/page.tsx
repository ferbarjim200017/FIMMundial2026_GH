"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FirebaseError } from "firebase/app";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  sendPasswordReset,
  signInWithEmail,
  signInWithGoogle,
} from "@/features/auth/auth.service";
import { ROUTES } from "@/lib/constants";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetOpen, setResetOpen] = useState(false);

  async function handleEmailLogin(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await signInWithEmail(email, password);
      router.replace(ROUTES.dashboard);
    } catch (err) {
      console.error("[login email]", err);
      setError(formatAuthError(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogle() {
    setError(null);
    setLoading(true);
    try {
      await signInWithGoogle();
      router.replace(ROUTES.dashboard);
    } catch (err) {
      console.error("[login google]", err);
      setError(formatAuthError(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Iniciar sesión</CardTitle>
        <CardDescription>Accede a tu cuenta para registrar apuestas y ver el ranking</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button variant="outline" className="w-full" onClick={handleGoogle} disabled={loading}>
          Continuar con Google
        </Button>

        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <div className="h-px flex-1 bg-border" /> o con email <div className="h-px flex-1 bg-border" />
        </div>

        <form onSubmit={handleEmailLogin} className="space-y-3">
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
              autoComplete="current-password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setResetOpen(true)}
                className="text-xs font-medium text-primary hover:underline"
              >
                ¿Has olvidado tu contraseña?
              </button>
            </div>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Entrando…" : "Entrar"}
          </Button>
        </form>

        <ForgotPasswordDialog
          open={resetOpen}
          onOpenChange={setResetOpen}
          initialEmail={email}
        />
      </CardContent>
      <CardFooter className="justify-center text-sm text-muted-foreground">
        ¿No tienes cuenta?&nbsp;
        <Link href={ROUTES.register} className="font-medium text-primary hover:underline">
          Regístrate
        </Link>
      </CardFooter>
    </Card>
  );
}

/** Diálogo de "He olvidado mi contraseña": pide el email y dispara el correo
 *  de restablecimiento de Firebase (enlace seguro con código de un solo uso). */
function ForgotPasswordDialog({
  open,
  onOpenChange,
  initialEmail,
}: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  initialEmail: string;
}) {
  const [email, setEmail] = useState(initialEmail);
  const [status, setStatus] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);

  // Cada vez que se abre, precargamos el email del formulario de login y
  // reseteamos el estado.
  useEffect(() => {
    if (open) {
      setEmail(initialEmail);
      setStatus("idle");
      setError(null);
    }
  }, [open, initialEmail]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setStatus("sending");
    try {
      await sendPasswordReset(email.trim());
      setStatus("sent");
    } catch (err) {
      console.error("[reset password]", err);
      // No revelamos si la cuenta existe: user-not-found se trata como éxito.
      if (err instanceof FirebaseError && err.code === "auth/user-not-found") {
        setStatus("sent");
        return;
      }
      setStatus("idle");
      setError(formatResetError(err));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Restablecer contraseña</DialogTitle>
          <DialogDescription>
            Te enviaremos un correo con un enlace seguro para crear una
            contraseña nueva.
          </DialogDescription>
        </DialogHeader>

        {status === "sent" ? (
          <div className="space-y-3 text-sm">
            <p className="rounded-md bg-profit/10 p-3 leading-relaxed">
              Si existe una cuenta con <strong>{email}</strong>, recibirás un
              correo con un enlace para restablecer tu contraseña. Revisa
              también la carpeta de spam.
            </p>
            <Button className="w-full" onClick={() => onOpenChange(false)}>
              Entendido
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="reset-email">Email</Label>
              <Input
                id="reset-email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tu@email.com"
                autoFocus
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button
              type="submit"
              className="w-full"
              disabled={status === "sending"}
            >
              {status === "sending" ? "Enviando…" : "Enviar enlace"}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function formatResetError(err: unknown): string {
  if (err instanceof FirebaseError) {
    switch (err.code) {
      case "auth/invalid-email":
        return "Ese email no es válido.";
      case "auth/missing-email":
        return "Introduce tu email.";
      case "auth/too-many-requests":
        return "Demasiados intentos. Prueba de nuevo más tarde.";
      case "auth/network-request-failed":
        return "Sin conexión con Firebase. Inténtalo de nuevo.";
      default:
        return `No se pudo enviar el correo (${err.code}).`;
    }
  }
  return "No se pudo enviar el correo. Inténtalo de nuevo.";
}

function translateAuthError(code: string): string {
  switch (code) {
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
      return "Email o contraseña incorrectos";
    case "auth/too-many-requests":
      return "Demasiados intentos. Prueba más tarde";
    case "auth/popup-closed-by-user":
      return "Se cerró la ventana de Google";
    case "auth/popup-blocked":
      return "El navegador bloqueó la ventana de Google. Permite popups e inténtalo de nuevo";
    case "auth/unauthorized-domain":
      return "Dominio no autorizado en Firebase. Añade 'localhost' en Auth → Settings → Authorized domains";
    case "auth/operation-not-allowed":
      return "El método de inicio de sesión no está habilitado en Firebase Console";
    case "auth/network-request-failed":
      return "Sin conexión con Firebase";
    default:
      return `Error de autenticación (${code})`;
  }
}

function formatAuthError(err: unknown): string {
  if (err instanceof FirebaseError) {
    return translateAuthError(err.code);
  }
  if (err instanceof Error) {
    // Errores de Firestore al crear/leer el documento de usuario
    if (err.message.includes("permission-denied") || err.message.includes("PERMISSION_DENIED")) {
      return "Permisos denegados en Firestore. Revisa las reglas (firestore.rules) o que Firestore esté activado en Firebase Console.";
    }
    if (err.message.includes("Firestore") || err.message.includes("firestore")) {
      return `Error Firestore: ${err.message}`;
    }
    return err.message;
  }
  return "Error desconocido al iniciar sesión";
}
