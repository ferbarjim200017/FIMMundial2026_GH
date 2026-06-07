/**
 * Mapeo bidireccional entre los nombres de equipo que usa la app
 * (en español, ver `src/features/matches/worldcup-fixtures.ts`) y los
 * nombres que usa la fuente `openfootball/worldcup.json` (en inglés).
 *
 * Sólo los 48 clasificados del Mundial 2026.
 */

export const TEAM_ES_TO_EN: Record<string, string> = {
  Alemania: "Germany",
  "Arabia Saudí": "Saudi Arabia",
  Argelia: "Algeria",
  Argentina: "Argentina",
  Australia: "Australia",
  Austria: "Austria",
  Bélgica: "Belgium",
  "Bosnia y Herzegovina": "Bosnia & Herzegovina",
  Brasil: "Brazil",
  "Cabo Verde": "Cape Verde",
  Canadá: "Canada",
  Catar: "Qatar",
  Chequia: "Czech Republic",
  Colombia: "Colombia",
  "Corea del Sur": "South Korea",
  "Costa de Marfil": "Ivory Coast",
  Croacia: "Croatia",
  Curazao: "Curaçao",
  Ecuador: "Ecuador",
  Egipto: "Egypt",
  Escocia: "Scotland",
  España: "Spain",
  "Estados Unidos": "USA",
  Francia: "France",
  Ghana: "Ghana",
  Haití: "Haiti",
  Inglaterra: "England",
  Irak: "Iraq",
  Irán: "Iran",
  Japón: "Japan",
  Jordania: "Jordan",
  Marruecos: "Morocco",
  México: "Mexico",
  Noruega: "Norway",
  "Nueva Zelanda": "New Zealand",
  "Países Bajos": "Netherlands",
  Panamá: "Panama",
  Paraguay: "Paraguay",
  Portugal: "Portugal",
  "RD del Congo": "DR Congo",
  Senegal: "Senegal",
  Sudáfrica: "South Africa",
  Suecia: "Sweden",
  Suiza: "Switzerland",
  Túnez: "Tunisia",
  Turquía: "Turkey",
  Uruguay: "Uruguay",
  Uzbekistán: "Uzbekistan",
};

export const TEAM_EN_TO_ES: Record<string, string> = Object.fromEntries(
  Object.entries(TEAM_ES_TO_EN).map(([es, en]) => [en, es])
);

/**
 * Normaliza para comparación tolerante: minúsculas, sin acentos, sin
 * caracteres especiales. NO se usa como clave canónica, sólo para
 * matching defensivo si alguna fuente cambia su capitalización.
 */
export function normalizeTeamName(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}
