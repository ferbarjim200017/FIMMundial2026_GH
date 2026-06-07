/**
 * Auto-importador de resultados del Mundial 2026.
 *
 *  Fuente   : https://raw.githubusercontent.com/openfootball/worldcup.json
 *  Destino  : colección `matches` de Firestore (doc id == seedId, p.ej. "wc26-m1")
 *  Estrategia:
 *    - Sólo escribe goles (homeGoals, awayGoals) y penaltyWinner.
 *    - Tarjetas (yellow/red) se inicializan a 0 — el admin las completa.
 *    - Marca `status: "finished"` y `autoImported: true`.
 *    - NO toca partidos donde `enteredBy` es un uid de admin (no nulo).
 *    - Idempotente: si los goles ya están y son iguales, no escribe.
 *
 *  Variables de entorno:
 *    FIREBASE_SERVICE_ACCOUNT  JSON entero del service account (NO base64).
 *    OPENFOOTBALL_URL          (opcional) override de la fuente.
 *
 *  Flags CLI:
 *    --dry-run     no escribe en Firestore, solo loggea lo que haría.
 *    --verbose     traza por partido.
 *
 *  Ejecutar local:
 *    npx tsx scripts/import-results.ts --dry-run --verbose
 */

import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { WORLDCUP_2026_MATCHES } from "../src/features/matches/worldcup-fixtures";
import { TEAM_EN_TO_ES, normalizeTeamName } from "./teams-i18n";

const DEFAULT_SOURCE_URL =
  "https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026/worldcup.json";

interface OpenfootballGoal {
  name: string;
  minute: number;
  penalty?: boolean;
  offset?: number;
  owngoal?: boolean;
}

interface OpenfootballMatch {
  round: string;
  date: string;       // "YYYY-MM-DD"
  time?: string;
  team1: string;
  team2: string;
  group?: string;
  ground?: string;
  score?: {
    ft?: [number, number];
    ht?: [number, number];
    et?: [number, number];
    p?: [number, number];
  };
  goals1?: OpenfootballGoal[];
  goals2?: OpenfootballGoal[];
}

interface OpenfootballFile {
  name: string;
  matches: OpenfootballMatch[];
}

interface SeedKey {
  seedId: string;
  homeES: string;
  awayES: string;
  /** true si openfootball viene con el orden invertido (team1 = nuestro away) */
  swap: boolean;
}

interface ExistingResult {
  homeGoals: number;
  awayGoals: number;
  homeYellow: number;
  awayYellow: number;
  homeRed: number;
  awayRed: number;
  penaltyWinner?: "home" | "away" | null;
}

interface ExistingMatch {
  result?: ExistingResult | null;
  enteredBy?: string | null;
  autoImported?: boolean;
  status?: string;
}

interface Summary {
  fetched: number;
  played: number;
  written: number;
  skippedAdmin: number;
  skippedUnchanged: number;
  unmapped: number;
  unmappedDetail: string[];
}

function parseArgs(argv: string[]) {
  return {
    dryRun: argv.includes("--dry-run"),
    verbose: argv.includes("--verbose") || argv.includes("-v"),
  };
}

function log(verbose: boolean, ...args: unknown[]) {
  if (verbose) console.log(...args);
}

function neighbourDates(iso: string): string[] {
  // Devuelve las fechas (UTC) D-1, D, D+1 en formato YYYY-MM-DD.
  // openfootball usa la fecha local del estadio (puede ir -1/+1 vs UTC),
  // así que aceptamos cualquiera de los tres días para el matching.
  const base = new Date(iso);
  const out: string[] = [];
  for (const delta of [-1, 0, 1]) {
    const d = new Date(base.getTime() + delta * 24 * 60 * 60 * 1000);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

function buildSeedIndex(): Map<string, SeedKey> {
  // key: "YYYY-MM-DD|normHome|normAway"  (3 fechas × 2 orientaciones por seed)
  const idx = new Map<string, SeedKey>();
  for (const sm of WORLDCUP_2026_MATCHES) {
    const h = normalizeTeamName(sm.homeLabel);
    const a = normalizeTeamName(sm.awayLabel);
    for (const date of neighbourDates(sm.kickoffIso)) {
      idx.set(`${date}|${h}|${a}`, {
        seedId: sm.seedId,
        homeES: sm.homeLabel,
        awayES: sm.awayLabel,
        swap: false,
      });
      idx.set(`${date}|${a}|${h}`, {
        seedId: sm.seedId,
        homeES: sm.homeLabel,
        awayES: sm.awayLabel,
        swap: true,
      });
    }
  }
  return idx;
}

function derivePenaltyWinner(
  pHome: number,
  pAway: number
): "home" | "away" | null {
  if (pHome > pAway) return "home";
  if (pAway > pHome) return "away";
  return null;
}

function resultsEqual(a: ExistingResult, b: ExistingResult): boolean {
  return (
    a.homeGoals === b.homeGoals &&
    a.awayGoals === b.awayGoals &&
    a.homeYellow === b.homeYellow &&
    a.awayYellow === b.awayYellow &&
    a.homeRed === b.homeRed &&
    a.awayRed === b.awayRed &&
    (a.penaltyWinner ?? null) === (b.penaltyWinner ?? null)
  );
}

function initFirebase() {
  if (getApps().length > 0) return;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) {
    throw new Error(
      "Falta la variable de entorno FIREBASE_SERVICE_ACCOUNT (JSON del service account)."
    );
  }
  let credentials;
  try {
    credentials = JSON.parse(raw);
  } catch (e) {
    throw new Error(
      "FIREBASE_SERVICE_ACCOUNT no es JSON válido. Asegúrate de pegar el archivo entero (sin base64)."
    );
  }
  initializeApp({ credential: cert(credentials) });
}

async function fetchSource(url: string): Promise<OpenfootballFile> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`No se pudo descargar ${url}: HTTP ${res.status}`);
  }
  return (await res.json()) as OpenfootballFile;
}

async function importResults(opts: {
  dryRun: boolean;
  verbose: boolean;
  sourceUrl: string;
}): Promise<Summary> {
  const { dryRun, verbose, sourceUrl } = opts;
  const summary: Summary = {
    fetched: 0,
    played: 0,
    written: 0,
    skippedAdmin: 0,
    skippedUnchanged: 0,
    unmapped: 0,
    unmappedDetail: [],
  };

  log(verbose, `Descargando ${sourceUrl}…`);
  const data = await fetchSource(sourceUrl);
  summary.fetched = data.matches.length;
  log(verbose, `  → ${data.matches.length} partidos en la fuente.`);

  const played = data.matches.filter(
    (m): m is OpenfootballMatch & { score: { ft: [number, number] } } =>
      !!m.score && Array.isArray(m.score.ft) && m.score.ft.length === 2
  );
  summary.played = played.length;
  log(verbose, `  → ${played.length} ya jugados.`);

  if (played.length === 0) {
    return summary;
  }

  const seedIndex = buildSeedIndex();
  if (!dryRun) initFirebase();
  const db = dryRun ? null : getFirestore();

  for (const om of played) {
    const team1ES = TEAM_EN_TO_ES[om.team1];
    const team2ES = TEAM_EN_TO_ES[om.team2];
    if (!team1ES || !team2ES) {
      summary.unmapped++;
      summary.unmappedDetail.push(
        `${om.date} ${om.team1} vs ${om.team2}  →  sin traducción ES (${
          team1ES ? "" : om.team1 + " "
        }${team2ES ? "" : om.team2})`
      );
      continue;
    }
    const key = `${om.date}|${normalizeTeamName(team1ES)}|${normalizeTeamName(
      team2ES
    )}`;
    const seed = seedIndex.get(key);
    if (!seed) {
      summary.unmapped++;
      summary.unmappedDetail.push(
        `${om.date} ${team1ES} vs ${team2ES}  →  no hay seed con esa combinación`
      );
      continue;
    }

    // En knockouts con prórroga, openfootball deja los goles a los 90' en
    // `score.ft` y los totales (incluyendo prórroga) en `score.et`. Para
    // nuestro modelo el resultado oficial son los totales del partido.
    const totalScore = om.score.et ?? om.score.ft;
    const [fHome, fAway] = seed.swap
      ? [totalScore[1], totalScore[0]]
      : [totalScore[0], totalScore[1]];

    let penaltyWinner: "home" | "away" | null = null;
    if (om.score.p) {
      const [pHome, pAway] = seed.swap
        ? [om.score.p[1], om.score.p[0]]
        : [om.score.p[0], om.score.p[1]];
      penaltyWinner = derivePenaltyWinner(pHome, pAway);
    }

    // Leer estado actual
    let existing: ExistingMatch = {};
    if (db) {
      const snap = await db.collection("matches").doc(seed.seedId).get();
      existing = (snap.data() as ExistingMatch) ?? {};
    }

    if (existing.enteredBy) {
      summary.skippedAdmin++;
      log(
        verbose,
        `  ⏭️  ${seed.seedId} ${seed.homeES} vs ${seed.awayES} — admin ya editó`
      );
      continue;
    }

    const newResult: ExistingResult = {
      homeGoals: fHome,
      awayGoals: fAway,
      // Preservamos tarjetas previas si las hubiera (siempre 0 hasta que admin las añada)
      homeYellow: existing.result?.homeYellow ?? 0,
      awayYellow: existing.result?.awayYellow ?? 0,
      homeRed: existing.result?.homeRed ?? 0,
      awayRed: existing.result?.awayRed ?? 0,
      penaltyWinner,
    };

    if (
      existing.autoImported &&
      existing.result &&
      resultsEqual(existing.result, newResult)
    ) {
      summary.skippedUnchanged++;
      log(verbose, `  =  ${seed.seedId} ${seed.homeES} vs ${seed.awayES} — sin cambios`);
      continue;
    }

    if (dryRun) {
      console.log(
        `  📝 [dry-run] ${seed.seedId}  ${seed.homeES} ${fHome}-${fAway} ${seed.awayES}` +
          (penaltyWinner ? `  (pen ${penaltyWinner})` : "")
      );
    } else {
      await db!.collection("matches").doc(seed.seedId).update({
        result: newResult,
        status: "finished",
        autoImported: true,
      });
      console.log(
        `  ✅ ${seed.seedId}  ${seed.homeES} ${fHome}-${fAway} ${seed.awayES}` +
          (penaltyWinner ? `  (pen ${penaltyWinner})` : "")
      );
    }
    summary.written++;
  }

  return summary;
}

async function main() {
  const { dryRun, verbose } = parseArgs(process.argv.slice(2));
  const sourceUrl = process.env.OPENFOOTBALL_URL ?? DEFAULT_SOURCE_URL;

  console.log(
    `\n🌐 Auto-importador de resultados ${
      dryRun ? "(DRY RUN — no escribe nada)" : ""
    }\n`
  );

  const summary = await importResults({ dryRun, verbose, sourceUrl });

  console.log("\n────────── Resumen ──────────");
  console.log(`  Partidos en fuente : ${summary.fetched}`);
  console.log(`  Ya jugados         : ${summary.played}`);
  console.log(`  Escritos           : ${summary.written}`);
  console.log(`  Saltados (admin)   : ${summary.skippedAdmin}`);
  console.log(`  Saltados (igual)   : ${summary.skippedUnchanged}`);
  console.log(`  Sin mapear         : ${summary.unmapped}`);
  if (summary.unmapped > 0) {
    console.log("\n  Detalle no mapeados:");
    for (const line of summary.unmappedDetail) console.log(`    - ${line}`);
  }
  console.log("─────────────────────────────\n");
}

main().catch((err) => {
  console.error("\n❌ Error fatal:", err);
  process.exit(1);
});
