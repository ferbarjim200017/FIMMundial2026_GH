"use client";

import { useEffect, useState } from "react";
import { Download, Share, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/** Evento propietario de Chrome/Edge para el aviso de instalación de PWA. No
 *  está en los tipos estándar del DOM, así que lo declaramos aquí. */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/** True si ya se está ejecutando como app instalada (pantalla completa). */
function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches === true ||
    // iOS Safari expone esto cuando se abre desde la pantalla de inicio.
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isIos(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

/**
 * Botón "Instalar app" dentro de la web.
 *  - Android/escritorio (Chrome/Edge): usa el evento `beforeinstallprompt` para
 *    lanzar el diálogo nativo de instalación.
 *  - iOS (Safari): no permite instalar por código, así que abre un popup con los
 *    2 pasos (Compartir → Añadir a pantalla de inicio).
 *  - Si ya está instalada (o el navegador no lo soporta), no se muestra nada.
 */
export function InstallAppButton() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [iosEligible, setIosEligible] = useState(false);
  const [showIosHelp, setShowIosHelp] = useState(false);

  useEffect(() => {
    if (isStandalone()) {
      setInstalled(true);
      return;
    }
    if (isIos()) setIosEligible(true);

    const onPrompt = (e: Event) => {
      // Evita el mini-infobar por defecto y guardamos el evento para dispararlo
      // nosotros al pulsar el botón.
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferred(null);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (installed) return null;
  // Sin prompt nativo disponible y no es iOS → el navegador no ofrece instalar.
  if (!deferred && !iosEligible) return null;

  async function handleClick() {
    if (deferred) {
      await deferred.prompt();
      const { outcome } = await deferred.userChoice;
      if (outcome === "accepted") setInstalled(true);
      setDeferred(null);
      return;
    }
    setShowIosHelp(true);
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={handleClick}
        className="gap-1.5"
        title="Instalar la app en tu dispositivo"
      >
        <Download className="h-4 w-4" />
        <span className="hidden sm:inline">Instalar app</span>
      </Button>

      <Dialog open={showIosHelp} onOpenChange={setShowIosHelp}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Instalar en iPhone/iPad</DialogTitle>
            <DialogDescription>
              Safari no permite instalar con un botón. Hazlo en 2 pasos desde el
              navegador:
            </DialogDescription>
          </DialogHeader>
          <ol className="space-y-3 text-sm">
            <li className="flex items-center gap-2">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary">
                1
              </span>
              <Share className="h-4 w-4 shrink-0 text-primary" />
              Pulsa <strong>Compartir</strong> en la barra de Safari.
            </li>
            <li className="flex items-center gap-2">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary">
                2
              </span>
              <Plus className="h-4 w-4 shrink-0 text-primary" />
              Elige <strong>Añadir a pantalla de inicio</strong>.
            </li>
          </ol>
        </DialogContent>
      </Dialog>
    </>
  );
}
