/**
 * Las 48 selecciones clasificadas para el Mundial 2026. Los nombres tienen
 * que coincidir EXACTAMENTE con los `homeLabel`/`awayLabel` que se usan en
 * `worldcup-fixtures.ts`, porque así se hace el matching entre apuestas a
 * futuro (outright) y partidos:
 *
 *   - Un bet outright vinculado a "España" aparece en cualquier partido
 *     cuyo `homeLabel` o `awayLabel` sea "España" (vía
 *     `array-contains-any` en Firestore).
 *
 * Si se renombra un equipo en `worldcup-fixtures.ts`, hay que actualizar
 * esta lista — y viceversa.
 */
export const TEAMS_2026: readonly string[] = [
  "Alemania",
  "Arabia Saudí",
  "Argelia",
  "Argentina",
  "Australia",
  "Austria",
  "Bélgica",
  "Bosnia y Herzegovina",
  "Brasil",
  "Cabo Verde",
  "Canadá",
  "Catar",
  "Chequia",
  "Colombia",
  "Corea del Sur",
  "Costa de Marfil",
  "Croacia",
  "Curazao",
  "Ecuador",
  "Egipto",
  "Escocia",
  "España",
  "Estados Unidos",
  "Francia",
  "Ghana",
  "Haití",
  "Inglaterra",
  "Irak",
  "Irán",
  "Japón",
  "Jordania",
  "Marruecos",
  "México",
  "Noruega",
  "Nueva Zelanda",
  "Países Bajos",
  "Panamá",
  "Paraguay",
  "Portugal",
  "RD del Congo",
  "Senegal",
  "Sudáfrica",
  "Suecia",
  "Suiza",
  "Túnez",
  "Turquía",
  "Uruguay",
  "Uzbekistán",
];

/**
 * Emoji de bandera por nombre de equipo. Inglaterra y Escocia usan los
 * "subdivision flag emojis" (renderizan correctamente en macOS, iOS y
 * Windows 11; otros sistemas mostrarán un placeholder). El resto son
 * banderas ISO estándar.
 *
 * Para placeholders de eliminatorias ("Ganador M73", "1º Grupo A"…) no
 * hay entrada y `teamFlag()` devuelve "" para no romper el render.
 */
const FLAGS: Record<string, string> = {
  Alemania: "🇩🇪",
  "Arabia Saudí": "🇸🇦",
  Argelia: "🇩🇿",
  Argentina: "🇦🇷",
  Australia: "🇦🇺",
  Austria: "🇦🇹",
  Bélgica: "🇧🇪",
  "Bosnia y Herzegovina": "🇧🇦",
  Brasil: "🇧🇷",
  "Cabo Verde": "🇨🇻",
  Canadá: "🇨🇦",
  Catar: "🇶🇦",
  Chequia: "🇨🇿",
  Colombia: "🇨🇴",
  "Corea del Sur": "🇰🇷",
  "Costa de Marfil": "🇨🇮",
  Croacia: "🇭🇷",
  Curazao: "🇨🇼",
  Ecuador: "🇪🇨",
  Egipto: "🇪🇬",
  Escocia: "🏴󠁧󠁢󠁳󠁣󠁴󠁿",
  España: "🇪🇸",
  "Estados Unidos": "🇺🇸",
  Francia: "🇫🇷",
  Ghana: "🇬🇭",
  Haití: "🇭🇹",
  Inglaterra: "🏴󠁧󠁢󠁥󠁮󠁧󠁿",
  Irak: "🇮🇶",
  Irán: "🇮🇷",
  Japón: "🇯🇵",
  Jordania: "🇯🇴",
  Marruecos: "🇲🇦",
  México: "🇲🇽",
  Noruega: "🇳🇴",
  "Nueva Zelanda": "🇳🇿",
  "Países Bajos": "🇳🇱",
  Panamá: "🇵🇦",
  Paraguay: "🇵🇾",
  Portugal: "🇵🇹",
  "RD del Congo": "🇨🇩",
  Senegal: "🇸🇳",
  Sudáfrica: "🇿🇦",
  Suecia: "🇸🇪",
  Suiza: "🇨🇭",
  Túnez: "🇹🇳",
  Turquía: "🇹🇷",
  Uruguay: "🇺🇾",
  Uzbekistán: "🇺🇿",
};

/** Devuelve el emoji de bandera del equipo o "" si no hay (placeholder de
 *  eliminatorias, label libre, etc.). */
export function teamFlag(name: string): string {
  return FLAGS[name] ?? "";
}
