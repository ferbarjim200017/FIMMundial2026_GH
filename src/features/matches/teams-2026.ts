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
 * Códigos de bandera por nombre de equipo. Se usan para construir URLs en
 * https://flagcdn.com/ (CDN público, gratuito) — render idéntico en
 * Windows, Android, macOS, iOS y Linux. Inglaterra y Escocia usan los
 * códigos de subdivisión de Reino Unido (`gb-eng`, `gb-sct`).
 *
 * Para placeholders de eliminatorias ("Ganador M73", "1º Grupo A"…) no
 * hay entrada y `teamFlagCode()` devuelve `null` para no renderizar nada.
 */
const FLAG_CODES: Record<string, string> = {
  Alemania: "de",
  "Arabia Saudí": "sa",
  Argelia: "dz",
  Argentina: "ar",
  Australia: "au",
  Austria: "at",
  Bélgica: "be",
  "Bosnia y Herzegovina": "ba",
  Brasil: "br",
  "Cabo Verde": "cv",
  Canadá: "ca",
  Catar: "qa",
  Chequia: "cz",
  Colombia: "co",
  "Corea del Sur": "kr",
  "Costa de Marfil": "ci",
  Croacia: "hr",
  Curazao: "cw",
  Ecuador: "ec",
  Egipto: "eg",
  Escocia: "gb-sct",
  España: "es",
  "Estados Unidos": "us",
  Francia: "fr",
  Ghana: "gh",
  Haití: "ht",
  Inglaterra: "gb-eng",
  Irak: "iq",
  Irán: "ir",
  Japón: "jp",
  Jordania: "jo",
  Marruecos: "ma",
  México: "mx",
  Noruega: "no",
  "Nueva Zelanda": "nz",
  "Países Bajos": "nl",
  Panamá: "pa",
  Paraguay: "py",
  Portugal: "pt",
  "RD del Congo": "cd",
  Senegal: "sn",
  Sudáfrica: "za",
  Suecia: "se",
  Suiza: "ch",
  Túnez: "tn",
  Turquía: "tr",
  Uruguay: "uy",
  Uzbekistán: "uz",
};

/** Devuelve el código de bandera (flagcdn) del equipo o `null` si no hay. */
export function teamFlagCode(name: string): string | null {
  return FLAG_CODES[name] ?? null;
}
