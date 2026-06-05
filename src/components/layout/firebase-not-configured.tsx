"use client";

import { AlertTriangle } from "lucide-react";
import { APP_NAME } from "@/lib/constants";

export function FirebaseNotConfiguredScreen() {
  return (
    <div className="grid min-h-screen place-items-center bg-background p-4">
      <div className="w-full max-w-2xl rounded-xl border border-amber-500/40 bg-card p-8 shadow-lg">
        <div className="mb-4 flex items-center gap-3">
          <div className="rounded-lg bg-amber-500/10 p-2">
            <AlertTriangle className="h-6 w-6 text-amber-500" />
          </div>
          <div>
            <h1 className="text-xl font-bold">⚽ {APP_NAME}</h1>
            <p className="text-sm text-muted-foreground">
              Firebase no está configurado todavía
            </p>
          </div>
        </div>

        <div className="space-y-4 text-sm">
          <p>
            El servidor está corriendo correctamente, pero faltan las credenciales
            de Firebase en{" "}
            <code className="rounded bg-muted px-1.5 py-0.5 text-xs">.env.local</code>.
          </p>

          <div className="rounded-md border bg-muted/30 p-4">
            <p className="mb-2 font-semibold">Pasos rápidos:</p>
            <ol className="ml-5 list-decimal space-y-1.5 text-muted-foreground">
              <li>
                Crea el proyecto en{" "}
                <a
                  href="https://console.firebase.google.com"
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary underline"
                >
                  Firebase Console
                </a>
                .
              </li>
              <li>
                Activa <strong>Authentication</strong> (Email + Google),{" "}
                <strong>Firestore</strong> y <strong>Storage</strong>.
              </li>
              <li>
                En <em>Project Settings → General → Your apps → Web</em>, copia el{" "}
                <code className="rounded bg-background px-1 text-xs">firebaseConfig</code>.
              </li>
              <li>
                Pega los valores en{" "}
                <code className="rounded bg-background px-1 text-xs">
                  c:\WEBMundial\fim-mundial-2026\.env.local
                </code>{" "}
                (variables{" "}
                <code className="rounded bg-background px-1 text-xs">
                  NEXT_PUBLIC_FIREBASE_*
                </code>
                ).
              </li>
              <li>
                Reinicia el servidor con{" "}
                <code className="rounded bg-background px-1 text-xs">npm run dev</code>.
              </li>
            </ol>
          </div>

          <p className="text-xs text-muted-foreground">
            Instrucciones completas en el{" "}
            <code className="rounded bg-muted px-1 text-xs">README.md</code> del
            proyecto.
          </p>
        </div>
      </div>
    </div>
  );
}
