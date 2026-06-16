"use client";

import { useMemo } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { Skull, X } from "lucide-react";
import { useHallOfFame } from "@/features/hall-of-fame/hall-of-fame.context";
import { ROUTES } from "@/lib/constants";
import { cn } from "@/lib/utils";

const HEADERS = [
  "🚨 ALERTA DE PRINGAO 🚨",
  "📢 NOTICIA DE ÚLTIMA HORA",
  "💀 NUEVO FICHAJE PARA LA RUINA",
  "🔔 EL SALÓN DE LA FAMA HA HABLADO",
  "🤡 TENEMOS PAYASO NUEVO",
  "📺 INTERRUMPIMOS LA PROGRAMACIÓN",
  "⚠️ ESTO HAY QUE CONTARLO",
];

/**
 * Popup a pantalla completa que salta en el dashboard cuando alguien entra
 * nuevo en un ranking del Salón de la Fama. Sustituye al banner: ocupa toda la
 * pantalla, suelta las frases insultantes y se cierra a mano (no vuelve hasta
 * que entre otra persona). Aplica a TODOS los grupos.
 */
export function HallOfFamePopup() {
  const { unseen, dismiss } = useHallOfFame();
  const open = unseen.length > 0;

  // Cabecera aleatoria, estable mientras el popup está abierto.
  const headerSeed = unseen[0]?.id ?? "";
  const header = useMemo(
    () => HEADERS[Math.floor(Math.random() * HEADERS.length)],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [headerSeed]
  );

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="hof-popup"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={dismiss}
          className="fixed inset-0 z-[100] overflow-y-auto overscroll-contain bg-black/90"
        >
          <div className="flex min-h-full items-center justify-center p-4">
            <motion.div
              onClick={(e) => e.stopPropagation()}
              initial={{ scale: 0.92, y: 16, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ duration: 0.22, ease: "easeOut" }}
              className="relative my-4 w-full max-w-lg rounded-2xl border-2 border-loss/70 bg-gradient-to-b from-zinc-900 to-black p-6 shadow-2xl"
            >
              <button
                type="button"
                onClick={dismiss}
                aria-label="Cerrar"
                className="absolute right-2 top-2 z-10 rounded-lg bg-black/40 p-2 text-white/80 transition-colors hover:bg-white/10 hover:text-white"
              >
                <X className="h-6 w-6" />
              </button>

            <div className="flex items-center justify-center gap-2 text-center">
              <Skull className="h-6 w-6 text-loss" />
              <h2 className="text-xl font-black uppercase tracking-tight text-loss md:text-2xl">
                {header}
              </h2>
            </div>

            <ul className="mt-5 space-y-3">
              {unseen.map((e) => (
                <li
                  key={e.id}
                  className={cn(
                    "rounded-xl border-l-4 bg-white/5 p-3 text-center text-base font-semibold leading-snug text-white",
                    e.tone === "bad" ? "border-l-loss" : "border-l-profit"
                  )}
                >
                  {e.phrase}
                </li>
              ))}
            </ul>

            <div className="mt-6 flex flex-col items-center gap-3">
              <button
                type="button"
                onClick={dismiss}
                className="w-full rounded-xl bg-loss py-3 text-sm font-black uppercase tracking-wider text-white transition-transform hover:scale-[1.02] active:scale-95"
              >
                Vale, lo asumo 💀
              </button>
              <Link
                href={ROUTES.hallOfFame}
                onClick={dismiss}
                className="text-xs font-medium text-white/60 hover:text-white hover:underline"
              >
                Ver el Salón de la Fama →
              </Link>
            </div>
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
