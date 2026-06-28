import type { Match } from "@/types/domain";

/**
 * Partidos que emite TVE La 1 (lista facilitada por el grupo).
 * Identificamos por el seedId estable (`wc26-m{N}`) generado en
 * `worldcup-fixtures.ts`, así no nos afectan los cambios de nombres
 * o de hora.
 */
export const TVE_MATCH_IDS = new Set<string>([
  "wc26-m1",  // 11 jun · México – Sudáfrica
  "wc26-m3",  // 12 jun · Canadá – Bosnia y Herzegovina
  "wc26-m7",  // 14 jun (00:00 CET) · Brasil – Marruecos
  "wc26-m10", // 14 jun · Alemania – Curazao
  "wc26-m14", // 15 jun · España – Cabo Verde
  "wc26-m17", // 16 jun · Francia – Senegal
  "wc26-m22", // 17 jun · Inglaterra – Croacia
  "wc26-m26", // 18 jun · Suiza – Bosnia y Herzegovina
  "wc26-m32", // 19 jun · Estados Unidos – Australia
  "wc26-m35", // 20 jun · Países Bajos – Suecia
  "wc26-m38", // 21 jun · España – Arabia Saudí
  "wc26-m43", // 22 jun · Argentina – Austria
  "wc26-m45", // 23 jun · Inglaterra – Ghana
  "wc26-m49", // 25 jun · Escocia – Brasil
  "wc26-m56", // 25 jun · Ecuador – Alemania
  "wc26-m66", // 27 jun · Uruguay – España
  "wc26-m71", // 28 jun · Colombia – Portugal
  // Dieciseisavos (Round of 32)
  "wc26-m73", // 28 jun · Sudáfrica – Canadá
  "wc26-m76", // 29 jun · Brasil – Japón
  "wc26-m77", // 30 jun · Francia – Suecia
  "wc26-m84", // 2 jul · España – Austria
]);

export function isTveMatch(match: Match): boolean {
  return TVE_MATCH_IDS.has(match.id);
}

/** Normaliza eliminando acentos y minúsculas, para comparar nombres. */
function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

const SPAIN_NAMES = new Set(["espana", "spain"]);

export function isSpainTeam(label: string): boolean {
  return SPAIN_NAMES.has(normalize(label));
}

export function isSpainMatch(match: Match): boolean {
  return isSpainTeam(match.homeLabel) || isSpainTeam(match.awayLabel);
}
