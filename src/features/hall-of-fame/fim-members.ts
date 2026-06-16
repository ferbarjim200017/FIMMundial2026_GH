import { FIM_PHOTOS, type FimPhotoEntry } from "./fim-photos.generated";

/**
 * Miembros de FIM: mapeo del `username` de la app al nombre mostrado y su mote.
 * Solo se usa cuando el grupo activo es FIM. Las claves coinciden con las del
 * manifiesto de fotos (`fim-photos.generated.ts`).
 *
 * Motes de Danib y Montero son provisionales (puestos por mí) — cámbialos a tu
 * gusto.
 */
export interface FimMember {
  key: string;
  name: string;
  mote: string;
}

// username (en minúsculas) -> miembro.
const BY_USERNAME: Record<string, FimMember> = {
  albeltico: { key: "alberto", name: "Alberto", mote: "El Cojo" },
  alexandru: { key: "alexandru", name: "Alexandru", mote: "El Correas" },
  alexis_bellako: { key: "alexis", name: "Alexis", mote: "El Nini" },
  montero: { key: "montero", name: "Montero", mote: "El Rata" },
  sergiomonty1: { key: "sergio", name: "Sergio", mote: "El Ludópata Máximo" },
  "dani blanco": { key: "danib", name: "Dani Blanco", mote: "El Farlopa" },
  "daniro el rey nini": { key: "daniro", name: "Daniro", mote: "El Rey Nini" },
  fernando: { key: "fernando", name: "Fernando", mote: "El Maricón" },
};

const BY_KEY: Record<string, FimMember> = Object.fromEntries(
  Object.values(BY_USERNAME).map((m) => [m.key, m])
);

/** Fotos indexadas por clave de combo (incluye individuos). */
export const FIM_PHOTOS_BY_KEY: Record<string, FimPhotoEntry> =
  Object.fromEntries(FIM_PHOTOS.map((p) => [p.key, p]));

export function fimMemberByUsername(username: string): FimMember | null {
  return BY_USERNAME[username.trim().toLowerCase()] ?? null;
}

export function fimMemberByKey(key: string): FimMember | null {
  return BY_KEY[key] ?? null;
}

export function fimNameByKey(key: string): string {
  return BY_KEY[key]?.name ?? key;
}
