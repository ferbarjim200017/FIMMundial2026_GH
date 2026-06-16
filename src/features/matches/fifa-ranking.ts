/**
 * Ranking FIFA de las 48 selecciones del Mundial 2026, en ORDEN (índice 0 =
 * mejor, posición 1). Fuente: ranking FIFA oficial (la foto "RANKING FIFA DE
 * LAS 48 SELECCIONES MUNDIALISTAS").
 *
 * Se usa como criterio de desempate en `standings.utils.ts`, DESPUÉS del fair
 * play (tarjetas), tanto en la clasificación de cada grupo como —sobre todo—
 * en la tabla de los mejores terceros.
 *
 * Los nombres deben coincidir EXACTAMENTE con `TEAMS_2026` /
 * `worldcup-fixtures.ts`. Para actualizar el ranking basta con reordenar este
 * array (la posición se deriva del índice).
 */
export const FIFA_RANKING: readonly string[] = [
  "Argentina",
  "España",
  "Francia",
  "Inglaterra",
  "Portugal",
  "Brasil",
  "Países Bajos",
  "Bélgica",
  "Croacia",
  "Alemania",
  "Marruecos",
  "Colombia",
  "Uruguay",
  "Estados Unidos",
  "Suiza",
  "Japón",
  "Senegal",
  "México",
  "Irán",
  "Corea del Sur",
  "Australia",
  "Austria",
  "Ecuador",
  "Noruega",
  "Egipto",
  "Panamá",
  "Costa de Marfil",
  "Argelia",
  "Escocia",
  "Suecia",
  "Canadá",
  "Paraguay",
  "Catar",
  "Túnez",
  "Turquía",
  "Chequia",
  "Nueva Zelanda",
  "RD del Congo",
  "Arabia Saudí",
  "Sudáfrica",
  "Uzbekistán",
  "Irak",
  "Jordania",
  "Bosnia y Herzegovina",
  "Ghana",
  "Cabo Verde",
  "Curazao",
  "Haití",
];

/** Posición a aplicar cuando un equipo no aparece en el ranking (lo manda al final). */
const UNRANKED = Number.MAX_SAFE_INTEGER;

const RANK_BY_TEAM: Record<string, number> = Object.fromEntries(
  FIFA_RANKING.map((name, i) => [name, i + 1])
);

/**
 * Posición en el ranking FIFA del equipo (1 = mejor). Si el nombre no está en
 * la lista (p. ej. un placeholder de eliminatoria como "1º Grupo A"), devuelve
 * un valor muy alto para que quede el último en el desempate.
 */
export function fifaRank(teamName: string): number {
  return RANK_BY_TEAM[teamName] ?? UNRANKED;
}
