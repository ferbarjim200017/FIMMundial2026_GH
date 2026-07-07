import { bookmakerLabel } from "@/features/bets/bets.utils";
import { cn } from "@/lib/utils";
import type { Bookmaker } from "@/types/domain";

interface Props {
  bookmaker: Bookmaker;
  /** Sólo se usa cuando `bookmaker === "other"`. */
  customLabel?: string;
  /** Variante visual. `xs` es el tamaño compacto para listas densas
   *  (feed, popup, etc.); `sm` el de detalle/tabla. */
  size?: "xs" | "sm";
  className?: string;
}

/**
 * Etiqueta con borde de color por casa de apuestas. Mismo código en
 * cualquier punto de la web — verde para Bet365, rojo para Winamax,
 * azul para William Hill, celeste para "Otra".
 */
export function BookmakerPill({
  bookmaker,
  customLabel,
  size = "sm",
  className,
}: Props) {
  const color =
    bookmaker === "bet365"
      ? "border-emerald-500/70 text-emerald-600 dark:text-emerald-400"
      : bookmaker === "winamax"
      ? "border-red-500/70 text-red-600 dark:text-red-400"
      : bookmaker === "betfair"
      ? "border-yellow-500/80 text-yellow-600 dark:text-yellow-400"
      : bookmaker === "luckia"
      ? "border-orange-500/80 text-orange-600 dark:text-orange-400"
      : bookmaker === "williamhill"
      ? "border-blue-600/80 text-blue-700 dark:text-blue-400"
      : "border-sky-500/70 text-sky-600 dark:text-sky-400";

  return (
    <span
      className={cn(
        "inline-block rounded-md border font-medium",
        size === "xs" ? "px-1.5 py-0 text-[10px]" : "px-2 py-0.5 text-xs",
        color,
        className
      )}
    >
      {bookmakerLabel(bookmaker, customLabel)}
    </span>
  );
}
