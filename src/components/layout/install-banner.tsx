"use client";

import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp, Download, Plus, Share, MoreVertical } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Evento propietario de Chrome/Edge para el aviso de instalación de PWA. */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const COLLAPSE_KEY = "fim:install-collapsed";

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches === true ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function detectPlatform(): "ios" | "android" | "other" {
  if (typeof navigator === "undefined") return "other";
  const ua = navigator.userAgent;
  if (/iphone|ipad|ipod/i.test(ua)) return "ios";
  if (/android/i.test(ua)) return "android";
  return "other";
}

/**
 * Banner de instalación, SOLO en móvil (`sm:hidden`). Aparece arriba de cada
 * página; se puede plegar (queda una barrita fina) y volver a desplegar, y
 * recuerda tu elección en localStorage.
 *  - Android/Chrome: si hay aviso nativo disponible, botón "Instalar app".
 *  - Si no hay aviso (iOS siempre, o Android sin él): instrucciones de 2 pasos
 *    según el sistema. Así se puede instalar siempre, aunque Chrome no lo ofrezca.
 *  - Si ya está instalada (pantalla completa), no se muestra.
 */
export function InstallBanner() {
  const [mounted, setMounted] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [platform, setPlatform] = useState<"ios" | "android" | "other">("other");

  useEffect(() => {
    setMounted(true);
    setPlatform(detectPlatform());
    if (isStandalone()) {
      setInstalled(true);
      return;
    }
    try {
      setCollapsed(localStorage.getItem(COLLAPSE_KEY) === "1");
    } catch {
      /* localStorage no disponible: lo dejamos desplegado */
    }
    const onPrompt = (e: Event) => {
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

  function persistCollapsed(v: boolean) {
    setCollapsed(v);
    try {
      localStorage.setItem(COLLAPSE_KEY, v ? "1" : "0");
    } catch {
      /* sin persistencia: no pasa nada */
    }
  }

  async function handleInstall() {
    if (!deferred) return;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    if (outcome === "accepted") setInstalled(true);
    setDeferred(null);
  }

  if (!mounted || installed) return null;

  // Plegado: una barrita fina que se puede volver a desplegar.
  if (collapsed) {
    return (
      <button
        type="button"
        onClick={() => persistCollapsed(false)}
        className="mb-4 flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-primary/40 bg-primary/5 px-3 py-1.5 text-xs font-medium text-primary sm:hidden"
      >
        <Download className="h-3.5 w-3.5" />
        Instalar la app
        <ChevronDown className="h-3.5 w-3.5" />
      </button>
    );
  }

  return (
    <div className="mb-4 rounded-xl border border-primary/30 bg-gradient-to-br from-primary/10 to-transparent p-3 sm:hidden">
      <div className="flex items-start gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/icon-192.png"
          alt=""
          width={40}
          height={40}
          className="h-10 w-10 shrink-0 rounded-lg"
        />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Instala la app en tu móvil</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Ábrela a pantalla completa, con su icono, como una app de verdad.
          </p>
        </div>
        <button
          type="button"
          onClick={() => persistCollapsed(true)}
          aria-label="Ocultar"
          title="Ocultar"
          className="-mr-1 -mt-1 shrink-0 rounded-md p-1 text-muted-foreground hover:text-foreground"
        >
          <ChevronUp className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-3">
        {deferred ? (
          <Button size="sm" onClick={handleInstall} className="w-full gap-1.5">
            <Download className="h-4 w-4" />
            Instalar app
          </Button>
        ) : platform === "ios" ? (
          <ol className="space-y-1.5 text-xs text-muted-foreground">
            <li className="flex items-center gap-1.5">
              <Share className="h-3.5 w-3.5 shrink-0 text-primary" />
              Pulsa <strong className="text-foreground">Compartir</strong> en la
              barra de Safari.
            </li>
            <li className="flex items-center gap-1.5">
              <Plus className="h-3.5 w-3.5 shrink-0 text-primary" />
              Elige{" "}
              <strong className="text-foreground">
                Añadir a pantalla de inicio
              </strong>
              .
            </li>
          </ol>
        ) : (
          <ol className="space-y-1.5 text-xs text-muted-foreground">
            <li className="flex items-center gap-1.5">
              <MoreVertical className="h-3.5 w-3.5 shrink-0 text-primary" />
              Abre el menú del navegador (arriba a la derecha).
            </li>
            <li className="flex items-center gap-1.5">
              <Download className="h-3.5 w-3.5 shrink-0 text-primary" />
              Pulsa{" "}
              <strong className="text-foreground">Instalar app</strong> o{" "}
              <strong className="text-foreground">
                Añadir a pantalla de inicio
              </strong>
              .
            </li>
          </ol>
        )}
      </div>
    </div>
  );
}
