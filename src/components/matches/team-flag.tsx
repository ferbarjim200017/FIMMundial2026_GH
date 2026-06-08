import { teamFlagCode } from "@/features/matches/teams-2026";
import { cn } from "@/lib/utils";

interface Props {
  name: string;
  className?: string;
}

/**
 * Pequeña bandera PNG del equipo. Se sirve desde flagcdn.com (público,
 * gratuito, sin clave) y se ve idéntica en cualquier OS — a diferencia
 * de los emojis 🇪🇸 que en Windows y Android no se renderizan como
 * bandera.
 *
 * Devuelve `null` si el `name` no es uno de los 48 equipos del Mundial
 * 2026 (p.ej. placeholders de eliminatorias como "Ganador M73"), para
 * no romper el layout.
 */
export function TeamFlag({ name, className }: Props) {
  const code = teamFlagCode(name);
  if (!code) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`https://flagcdn.com/w40/${code}.png`}
      srcSet={`https://flagcdn.com/w80/${code}.png 2x`}
      alt=""
      width={20}
      height={14}
      loading="lazy"
      className={cn(
        "inline-block h-3.5 w-5 shrink-0 rounded-sm border border-border/40 object-cover align-text-bottom",
        className
      )}
    />
  );
}
