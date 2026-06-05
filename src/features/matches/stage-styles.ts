import type { MatchStage } from "@/types/domain";

/**
 * Paleta visual por fase del Mundial. Cada fase tiene un color de marca
 * que se usa en el match-card, el bracket y los tabs.
 *
 * Devolvemos clases Tailwind para mantener consistencia con el resto del
 * diseño (no inline styles).
 */
export interface StageStyle {
  label: string;
  shortLabel: string;
  ring: string;       // border-l-* destacado
  bg: string;         // bg-* sutil para chips/headers
  chip: string;       // bg + text completo para badge
  text: string;       // color de texto
  gradient: string;   // gradient para tarjetas grandes
  emoji: string;
}

export const STAGE_STYLES: Record<MatchStage, StageStyle> = {
  group: {
    label: "Fase de grupos",
    shortLabel: "Grupos",
    ring: "border-l-sky-500",
    bg: "bg-sky-500/10",
    chip: "bg-sky-500/15 text-sky-600 dark:text-sky-400",
    text: "text-sky-600 dark:text-sky-400",
    gradient: "from-sky-500/20 via-sky-500/5 to-transparent",
    emoji: "🟦",
  },
  r32: {
    label: "1/16 Final",
    shortLabel: "1/16",
    ring: "border-l-cyan-500",
    bg: "bg-cyan-500/10",
    chip: "bg-cyan-500/15 text-cyan-600 dark:text-cyan-400",
    text: "text-cyan-600 dark:text-cyan-400",
    gradient: "from-cyan-500/20 via-cyan-500/5 to-transparent",
    emoji: "🎯",
  },
  r16: {
    label: "Octavos",
    shortLabel: "8vos",
    ring: "border-l-indigo-500",
    bg: "bg-indigo-500/10",
    chip: "bg-indigo-500/15 text-indigo-600 dark:text-indigo-400",
    text: "text-indigo-600 dark:text-indigo-400",
    gradient: "from-indigo-500/20 via-indigo-500/5 to-transparent",
    emoji: "⚔️",
  },
  qf: {
    label: "Cuartos",
    shortLabel: "4tos",
    ring: "border-l-violet-500",
    bg: "bg-violet-500/10",
    chip: "bg-violet-500/15 text-violet-600 dark:text-violet-400",
    text: "text-violet-600 dark:text-violet-400",
    gradient: "from-violet-500/20 via-violet-500/5 to-transparent",
    emoji: "🔥",
  },
  sf: {
    label: "Semifinales",
    shortLabel: "Semis",
    ring: "border-l-pink-500",
    bg: "bg-pink-500/10",
    chip: "bg-pink-500/15 text-pink-600 dark:text-pink-400",
    text: "text-pink-600 dark:text-pink-400",
    gradient: "from-pink-500/20 via-pink-500/5 to-transparent",
    emoji: "⭐",
  },
  third: {
    label: "3.er puesto",
    shortLabel: "3.º",
    ring: "border-l-amber-500",
    bg: "bg-amber-500/10",
    chip: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
    text: "text-amber-600 dark:text-amber-400",
    gradient: "from-amber-500/20 via-amber-500/5 to-transparent",
    emoji: "🥉",
  },
  final: {
    label: "Final",
    shortLabel: "Final",
    ring: "border-l-yellow-500",
    bg: "bg-yellow-500/10",
    chip: "bg-yellow-500/20 text-yellow-700 dark:text-yellow-400",
    text: "text-yellow-700 dark:text-yellow-400",
    gradient: "from-yellow-500/30 via-yellow-500/10 to-transparent",
    emoji: "🏆",
  },
};

/**
 * Asigna un color de marca a cada grupo (A-L) para que cada grupo tenga
 * su acento propio en la fase de grupos.
 */
export const GROUP_COLORS: Record<string, { chip: string; ring: string; emoji: string }> = {
  A: { chip: "bg-red-500/15 text-red-600 dark:text-red-400", ring: "border-l-red-500", emoji: "🔴" },
  B: { chip: "bg-orange-500/15 text-orange-600 dark:text-orange-400", ring: "border-l-orange-500", emoji: "🟠" },
  C: { chip: "bg-amber-500/15 text-amber-600 dark:text-amber-400", ring: "border-l-amber-500", emoji: "🟡" },
  D: { chip: "bg-lime-500/15 text-lime-600 dark:text-lime-400", ring: "border-l-lime-500", emoji: "🟢" },
  E: { chip: "bg-green-500/15 text-green-600 dark:text-green-400", ring: "border-l-green-500", emoji: "🌿" },
  F: { chip: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400", ring: "border-l-emerald-500", emoji: "🟢" },
  G: { chip: "bg-teal-500/15 text-teal-600 dark:text-teal-400", ring: "border-l-teal-500", emoji: "💧" },
  H: { chip: "bg-cyan-500/15 text-cyan-600 dark:text-cyan-400", ring: "border-l-cyan-500", emoji: "🟦" },
  I: { chip: "bg-blue-500/15 text-blue-600 dark:text-blue-400", ring: "border-l-blue-500", emoji: "🔵" },
  J: { chip: "bg-indigo-500/15 text-indigo-600 dark:text-indigo-400", ring: "border-l-indigo-500", emoji: "🟣" },
  K: { chip: "bg-violet-500/15 text-violet-600 dark:text-violet-400", ring: "border-l-violet-500", emoji: "🟪" },
  L: { chip: "bg-pink-500/15 text-pink-600 dark:text-pink-400", ring: "border-l-pink-500", emoji: "🌸" },
};
