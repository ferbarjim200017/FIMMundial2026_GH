// ============================================================
// Fixtures oficiales del Mundial FIFA 2026 (Canadá/México/EE.UU.)
// Fuente: Wikipedia + FIFA — sorteo del 5 de diciembre de 2025
// Las fechas están en UTC. Cada cliente las renderiza en su zona local.
// ============================================================
import type { Match, MatchStage, GroupId } from "@/types/domain";

type SeedMatch = Omit<Match, "id" | "kickoffUtc" | "status" | "result"> & {
  // ID estable para idempotencia (rerun seguro)
  seedId: string;
  // ISO UTC string (ej "2026-06-11T19:00:00Z")
  kickoffIso: string;
};

const G = (id: GroupId, matchday: 1 | 2 | 3): { stage: MatchStage; groupId: GroupId; matchday: 1 | 2 | 3 } => ({
  stage: "group",
  groupId: id,
  matchday,
});

// Helper para hacer la lista más legible
function gm(
  num: number,
  iso: string,
  home: string,
  away: string,
  venue: string,
  city: string,
  group: GroupId,
  matchday: 1 | 2 | 3
): SeedMatch {
  return {
    seedId: `wc26-m${num}`,
    ...G(group, matchday),
    kickoffIso: iso,
    venue,
    city,
    homeTeamId: null,
    awayTeamId: null,
    homeLabel: home,
    awayLabel: away,
    enteredBy: null,
  };
}

function km(
  num: number,
  stage: MatchStage,
  iso: string,
  home: string,
  away: string,
  venue: string,
  city: string
): SeedMatch {
  return {
    seedId: `wc26-m${num}`,
    stage,
    groupId: null,
    matchday: null,
    kickoffIso: iso,
    venue,
    city,
    homeTeamId: null,
    awayTeamId: null,
    homeLabel: home,
    awayLabel: away,
    enteredBy: null,
  };
}

// ----------- FASE DE GRUPOS (72 partidos) -----------
export const WORLDCUP_2026_MATCHES: SeedMatch[] = [
  // Grupo A
  gm(1, "2026-06-11T19:00:00Z", "México", "Sudáfrica", "Estadio Azteca", "Ciudad de México", "A", 1),
  gm(2, "2026-06-12T02:00:00Z", "Corea del Sur", "Chequia", "Estadio Akron", "Zapopan", "A", 1),
  gm(25, "2026-06-18T16:00:00Z", "Chequia", "Sudáfrica", "Mercedes-Benz Stadium", "Atlanta", "A", 2),
  gm(28, "2026-06-19T01:00:00Z", "México", "Corea del Sur", "Estadio Akron", "Zapopan", "A", 2),
  gm(53, "2026-06-25T01:00:00Z", "Chequia", "México", "Estadio Azteca", "Ciudad de México", "A", 3),
  gm(54, "2026-06-25T01:00:00Z", "Sudáfrica", "Corea del Sur", "Estadio BBVA", "Guadalupe", "A", 3),

  // Grupo B
  gm(3, "2026-06-12T19:00:00Z", "Canadá", "Bosnia y Herzegovina", "BMO Field", "Toronto", "B", 1),
  gm(8, "2026-06-13T19:00:00Z", "Catar", "Suiza", "Levi's Stadium", "Santa Clara", "B", 1),
  gm(26, "2026-06-18T19:00:00Z", "Suiza", "Bosnia y Herzegovina", "SoFi Stadium", "Inglewood", "B", 2),
  gm(27, "2026-06-18T22:00:00Z", "Canadá", "Catar", "BC Place", "Vancouver", "B", 2),
  gm(51, "2026-06-24T19:00:00Z", "Suiza", "Canadá", "BC Place", "Vancouver", "B", 3),
  gm(52, "2026-06-24T19:00:00Z", "Bosnia y Herzegovina", "Catar", "Lumen Field", "Seattle", "B", 3),

  // Grupo C
  gm(7, "2026-06-13T22:00:00Z", "Brasil", "Marruecos", "MetLife Stadium", "East Rutherford", "C", 1),
  gm(5, "2026-06-14T01:00:00Z", "Haití", "Escocia", "Gillette Stadium", "Foxborough", "C", 1),
  gm(30, "2026-06-19T22:00:00Z", "Escocia", "Marruecos", "Gillette Stadium", "Foxborough", "C", 2),
  gm(29, "2026-06-20T00:30:00Z", "Brasil", "Haití", "Lincoln Financial Field", "Filadelfia", "C", 2),
  gm(49, "2026-06-24T22:00:00Z", "Escocia", "Brasil", "Hard Rock Stadium", "Miami Gardens", "C", 3),
  gm(50, "2026-06-24T22:00:00Z", "Marruecos", "Haití", "Mercedes-Benz Stadium", "Atlanta", "C", 3),

  // Grupo D
  gm(4, "2026-06-13T01:00:00Z", "Estados Unidos", "Paraguay", "SoFi Stadium", "Inglewood", "D", 1),
  gm(6, "2026-06-14T04:00:00Z", "Australia", "Turquía", "BC Place", "Vancouver", "D", 1),
  gm(32, "2026-06-19T19:00:00Z", "Estados Unidos", "Australia", "Lumen Field", "Seattle", "D", 2),
  gm(31, "2026-06-20T03:00:00Z", "Turquía", "Paraguay", "Levi's Stadium", "Santa Clara", "D", 2),
  gm(59, "2026-06-26T02:00:00Z", "Turquía", "Estados Unidos", "SoFi Stadium", "Inglewood", "D", 3),
  gm(60, "2026-06-26T02:00:00Z", "Paraguay", "Australia", "Levi's Stadium", "Santa Clara", "D", 3),

  // Grupo E
  gm(10, "2026-06-14T17:00:00Z", "Alemania", "Curazao", "NRG Stadium", "Houston", "E", 1),
  gm(9, "2026-06-14T23:00:00Z", "Costa de Marfil", "Ecuador", "Lincoln Financial Field", "Filadelfia", "E", 1),
  gm(33, "2026-06-20T20:00:00Z", "Alemania", "Costa de Marfil", "BMO Field", "Toronto", "E", 2),
  gm(34, "2026-06-21T00:00:00Z", "Ecuador", "Curazao", "Arrowhead Stadium", "Kansas City", "E", 2),
  gm(55, "2026-06-25T20:00:00Z", "Curazao", "Costa de Marfil", "Lincoln Financial Field", "Filadelfia", "E", 3),
  gm(56, "2026-06-25T20:00:00Z", "Ecuador", "Alemania", "MetLife Stadium", "East Rutherford", "E", 3),

  // Grupo F
  gm(11, "2026-06-14T20:00:00Z", "Países Bajos", "Japón", "AT&T Stadium", "Arlington", "F", 1),
  gm(12, "2026-06-15T02:00:00Z", "Suecia", "Túnez", "Estadio BBVA", "Guadalupe", "F", 1),
  gm(35, "2026-06-20T17:00:00Z", "Países Bajos", "Suecia", "NRG Stadium", "Houston", "F", 2),
  gm(36, "2026-06-21T04:00:00Z", "Túnez", "Japón", "Estadio BBVA", "Guadalupe", "F", 2),
  gm(57, "2026-06-25T23:00:00Z", "Japón", "Suecia", "AT&T Stadium", "Arlington", "F", 3),
  gm(58, "2026-06-25T23:00:00Z", "Túnez", "Países Bajos", "Arrowhead Stadium", "Kansas City", "F", 3),

  // Grupo G
  gm(16, "2026-06-15T19:00:00Z", "Bélgica", "Egipto", "Lumen Field", "Seattle", "G", 1),
  gm(15, "2026-06-16T01:00:00Z", "Irán", "Nueva Zelanda", "SoFi Stadium", "Inglewood", "G", 1),
  gm(39, "2026-06-21T19:00:00Z", "Bélgica", "Irán", "SoFi Stadium", "Inglewood", "G", 2),
  gm(40, "2026-06-22T01:00:00Z", "Nueva Zelanda", "Egipto", "BC Place", "Vancouver", "G", 2),
  gm(63, "2026-06-27T03:00:00Z", "Egipto", "Irán", "Lumen Field", "Seattle", "G", 3),
  gm(64, "2026-06-27T03:00:00Z", "Nueva Zelanda", "Bélgica", "BC Place", "Vancouver", "G", 3),

  // Grupo H
  gm(14, "2026-06-15T16:00:00Z", "España", "Cabo Verde", "Mercedes-Benz Stadium", "Atlanta", "H", 1),
  gm(13, "2026-06-15T22:00:00Z", "Arabia Saudí", "Uruguay", "Hard Rock Stadium", "Miami Gardens", "H", 1),
  gm(38, "2026-06-21T16:00:00Z", "España", "Arabia Saudí", "Mercedes-Benz Stadium", "Atlanta", "H", 2),
  gm(37, "2026-06-21T22:00:00Z", "Uruguay", "Cabo Verde", "Hard Rock Stadium", "Miami Gardens", "H", 2),
  gm(65, "2026-06-27T00:00:00Z", "Cabo Verde", "Arabia Saudí", "NRG Stadium", "Houston", "H", 3),
  gm(66, "2026-06-27T00:00:00Z", "Uruguay", "España", "Estadio Akron", "Zapopan", "H", 3),

  // Grupo I
  gm(17, "2026-06-16T19:00:00Z", "Francia", "Senegal", "MetLife Stadium", "East Rutherford", "I", 1),
  gm(18, "2026-06-16T22:00:00Z", "Irak", "Noruega", "Gillette Stadium", "Foxborough", "I", 1),
  gm(42, "2026-06-22T21:00:00Z", "Francia", "Irak", "Lincoln Financial Field", "Filadelfia", "I", 2),
  gm(41, "2026-06-23T00:00:00Z", "Noruega", "Senegal", "MetLife Stadium", "East Rutherford", "I", 2),
  gm(61, "2026-06-26T19:00:00Z", "Noruega", "Francia", "Gillette Stadium", "Foxborough", "I", 3),
  gm(62, "2026-06-26T19:00:00Z", "Senegal", "Irak", "BMO Field", "Toronto", "I", 3),

  // Grupo J
  gm(19, "2026-06-17T01:00:00Z", "Argentina", "Argelia", "Arrowhead Stadium", "Kansas City", "J", 1),
  gm(20, "2026-06-17T04:00:00Z", "Austria", "Jordania", "Levi's Stadium", "Santa Clara", "J", 1),
  gm(43, "2026-06-22T17:00:00Z", "Argentina", "Austria", "AT&T Stadium", "Arlington", "J", 2),
  gm(44, "2026-06-23T03:00:00Z", "Jordania", "Argelia", "Levi's Stadium", "Santa Clara", "J", 2),
  gm(69, "2026-06-28T02:00:00Z", "Argelia", "Austria", "Arrowhead Stadium", "Kansas City", "J", 3),
  gm(70, "2026-06-28T02:00:00Z", "Jordania", "Argentina", "AT&T Stadium", "Arlington", "J", 3),

  // Grupo K
  gm(23, "2026-06-17T17:00:00Z", "Portugal", "RD del Congo", "NRG Stadium", "Houston", "K", 1),
  gm(24, "2026-06-18T02:00:00Z", "Uzbekistán", "Colombia", "Estadio Azteca", "Ciudad de México", "K", 1),
  gm(47, "2026-06-23T17:00:00Z", "Portugal", "Uzbekistán", "NRG Stadium", "Houston", "K", 2),
  gm(48, "2026-06-24T02:00:00Z", "Colombia", "RD del Congo", "Estadio Akron", "Zapopan", "K", 2),
  gm(71, "2026-06-27T23:30:00Z", "Colombia", "Portugal", "Hard Rock Stadium", "Miami Gardens", "K", 3),
  gm(72, "2026-06-27T23:30:00Z", "RD del Congo", "Uzbekistán", "Mercedes-Benz Stadium", "Atlanta", "K", 3),

  // Grupo L
  gm(22, "2026-06-17T20:00:00Z", "Inglaterra", "Croacia", "AT&T Stadium", "Arlington", "L", 1),
  gm(21, "2026-06-17T23:00:00Z", "Ghana", "Panamá", "BMO Field", "Toronto", "L", 1),
  gm(45, "2026-06-23T20:00:00Z", "Inglaterra", "Ghana", "Gillette Stadium", "Foxborough", "L", 2),
  gm(46, "2026-06-23T23:00:00Z", "Panamá", "Croacia", "BMO Field", "Toronto", "L", 2),
  gm(67, "2026-06-27T21:00:00Z", "Panamá", "Inglaterra", "MetLife Stadium", "East Rutherford", "L", 3),
  gm(68, "2026-06-27T21:00:00Z", "Croacia", "Ghana", "Lincoln Financial Field", "Filadelfia", "L", 3),

  // ----------- DIECISEISAVOS (Round of 32) -----------
  km(73, "r32", "2026-06-28T19:00:00Z", "2.º Grupo A", "2.º Grupo B", "SoFi Stadium", "Inglewood"),
  km(76, "r32", "2026-06-29T17:00:00Z", "1.º Grupo C", "2.º Grupo F", "NRG Stadium", "Houston"),
  km(74, "r32", "2026-06-29T20:30:00Z", "1.º Grupo E", "Mejor 3.º A/B/C/D/F", "Gillette Stadium", "Foxborough"),
  km(75, "r32", "2026-06-30T01:00:00Z", "1.º Grupo F", "2.º Grupo C", "Estadio BBVA", "Guadalupe"),
  km(78, "r32", "2026-06-30T17:00:00Z", "2.º Grupo E", "2.º Grupo I", "AT&T Stadium", "Arlington"),
  km(77, "r32", "2026-06-30T21:00:00Z", "1.º Grupo I", "Mejor 3.º C/D/F/G/H", "MetLife Stadium", "East Rutherford"),
  km(79, "r32", "2026-07-01T01:00:00Z", "1.º Grupo A", "Mejor 3.º C/E/F/H/I", "Estadio Azteca", "Ciudad de México"),
  km(80, "r32", "2026-07-01T16:00:00Z", "1.º Grupo L", "Mejor 3.º E/H/I/J/K", "Mercedes-Benz Stadium", "Atlanta"),
  km(82, "r32", "2026-07-01T20:00:00Z", "1.º Grupo G", "Mejor 3.º A/E/H/I/J", "Lumen Field", "Seattle"),
  km(81, "r32", "2026-07-02T00:00:00Z", "1.º Grupo D", "Mejor 3.º B/E/F/I/J", "Levi's Stadium", "Santa Clara"),
  km(84, "r32", "2026-07-02T19:00:00Z", "1.º Grupo H", "2.º Grupo J", "SoFi Stadium", "Inglewood"),
  km(83, "r32", "2026-07-02T23:00:00Z", "2.º Grupo K", "2.º Grupo L", "BMO Field", "Toronto"),
  km(85, "r32", "2026-07-03T03:00:00Z", "1.º Grupo B", "Mejor 3.º E/F/G/I/J", "BC Place", "Vancouver"),
  km(88, "r32", "2026-07-03T18:00:00Z", "2.º Grupo D", "2.º Grupo G", "AT&T Stadium", "Arlington"),
  km(86, "r32", "2026-07-03T22:00:00Z", "1.º Grupo J", "2.º Grupo H", "Hard Rock Stadium", "Miami Gardens"),
  km(87, "r32", "2026-07-04T01:30:00Z", "1.º Grupo K", "Mejor 3.º D/E/I/J/L", "Arrowhead Stadium", "Kansas City"),

  // ----------- OCTAVOS (Round of 16) -----------
  km(90, "r16", "2026-07-04T17:00:00Z", "Ganador M73", "Ganador M75", "NRG Stadium", "Houston"),
  km(89, "r16", "2026-07-04T21:00:00Z", "Ganador M74", "Ganador M77", "Lincoln Financial Field", "Filadelfia"),
  km(91, "r16", "2026-07-05T20:00:00Z", "Ganador M76", "Ganador M78", "MetLife Stadium", "East Rutherford"),
  km(92, "r16", "2026-07-06T00:00:00Z", "Ganador M79", "Ganador M80", "Estadio Azteca", "Ciudad de México"),
  km(93, "r16", "2026-07-06T19:00:00Z", "Ganador M83", "Ganador M84", "AT&T Stadium", "Arlington"),
  km(94, "r16", "2026-07-07T00:00:00Z", "Ganador M81", "Ganador M82", "Lumen Field", "Seattle"),
  km(95, "r16", "2026-07-07T16:00:00Z", "Ganador M86", "Ganador M88", "Mercedes-Benz Stadium", "Atlanta"),
  km(96, "r16", "2026-07-07T20:00:00Z", "Ganador M85", "Ganador M87", "BC Place", "Vancouver"),

  // ----------- CUARTOS -----------
  km(97, "qf", "2026-07-09T20:00:00Z", "Ganador M89", "Ganador M90", "Gillette Stadium", "Foxborough"),
  km(98, "qf", "2026-07-10T19:00:00Z", "Ganador M93", "Ganador M94", "SoFi Stadium", "Inglewood"),
  km(99, "qf", "2026-07-11T21:00:00Z", "Ganador M91", "Ganador M92", "Hard Rock Stadium", "Miami Gardens"),
  km(100, "qf", "2026-07-12T01:00:00Z", "Ganador M95", "Ganador M96", "Arrowhead Stadium", "Kansas City"),

  // ----------- SEMIFINALES -----------
  km(101, "sf", "2026-07-14T19:00:00Z", "Ganador M97", "Ganador M98", "AT&T Stadium", "Arlington"),
  km(102, "sf", "2026-07-15T19:00:00Z", "Ganador M99", "Ganador M100", "Mercedes-Benz Stadium", "Atlanta"),

  // ----------- TERCER PUESTO -----------
  km(103, "third", "2026-07-18T21:00:00Z", "Perdedor M101", "Perdedor M102", "Hard Rock Stadium", "Miami Gardens"),

  // ----------- FINAL -----------
  km(104, "final", "2026-07-19T19:00:00Z", "Ganador M101", "Ganador M102", "MetLife Stadium", "East Rutherford"),
];
