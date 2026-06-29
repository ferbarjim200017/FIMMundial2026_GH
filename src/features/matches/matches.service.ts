import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  Timestamp,
  updateDoc,
  writeBatch,
  type DocumentData,
  type FirestoreDataConverter,
  type QueryDocumentSnapshot,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import type { Match, MatchResult } from "@/types/domain";
import { WORLDCUP_2026_MATCHES } from "./worldcup-fixtures";
import { teamFlagCode } from "./teams-2026";

const MATCHES = "matches";

// ── Etiquetas REALES del sorteo oficial (calendario del código) ──────────────
// Los cruces de eliminatoria del sorteo oficial (Alemania-Paraguay,
// Francia-Suecia…) están en el seed, pero el documento en Firestore puede tener
// todavía el HUECO ("1.º Grupo A", "2.º Grupo B"…). Si el doc tiene un hueco,
// rellenamos con el equipo real del seed; si ya tiene un equipo de verdad, no se
// toca. Así la app muestra los cruces correctos sin re-sembrar la base de datos.
// Solo guardamos las etiquetas que son equipos REALES (los "Ganador MN" de
// octavos en adelante no: esos se resuelven con los resultados).
const SEED_KNOCKOUT_LABELS = new Map<
  string,
  { home?: string; away?: string }
>();
for (const sm of WORLDCUP_2026_MATCHES) {
  if (sm.stage === "group") continue;
  SEED_KNOCKOUT_LABELS.set(sm.seedId, {
    home: teamFlagCode(sm.homeLabel) ? sm.homeLabel : undefined,
    away: teamFlagCode(sm.awayLabel) ? sm.awayLabel : undefined,
  });
}

/** Rellena los huecos de eliminatoria de cada partido con el equipo real del
 *  seed (solo si el doc no trae ya un equipo de verdad). */
function applySeedLabels(matches: Match[]): Match[] {
  return matches.map((m) => {
    const seed = SEED_KNOCKOUT_LABELS.get(m.id);
    if (!seed) return m;
    const home =
      seed.home && !teamFlagCode(m.homeLabel) ? seed.home : m.homeLabel;
    const away =
      seed.away && !teamFlagCode(m.awayLabel) ? seed.away : m.awayLabel;
    if (home === m.homeLabel && away === m.awayLabel) return m;
    return { ...m, homeLabel: home, awayLabel: away };
  });
}

const matchConverter: FirestoreDataConverter<Match> = {
  toFirestore(m: Match): DocumentData {
    const { id: _id, ...rest } = m;
    return rest;
  },
  fromFirestore(snap: QueryDocumentSnapshot): Match {
    return { id: snap.id, ...(snap.data() as Omit<Match, "id">) };
  },
};

export function matchesCol() {
  return collection(db, MATCHES).withConverter(matchConverter);
}

export function matchDoc(id: string) {
  return doc(db, MATCHES, id).withConverter(matchConverter);
}

export async function listMatches(): Promise<Match[]> {
  const snap = await getDocs(query(matchesCol(), orderBy("kickoffUtc", "asc")));
  return applySeedLabels(snap.docs.map((d) => d.data()));
}

// Suscripción COMPARTIDA a los partidos: muchas pantallas la usan a la vez
// (Mundial, apuestas, feed, ranking, salón de la fama…). Con un único listener
// con conteo de referencias evitamos releer la colección por cada una.
type MatchesCb = (matches: Match[]) => void;
let matchesUnsub: Unsubscribe | null = null;
let matchesLatest: Match[] | null = null;
const matchesSubscribers = new Set<{
  cb: MatchesCb;
  onError?: (err: Error) => void;
}>();

export function subscribeToMatches(
  cb: MatchesCb,
  onError?: (err: Error) => void
): Unsubscribe {
  const entry = { cb, onError };
  matchesSubscribers.add(entry);
  if (matchesLatest) cb(matchesLatest);

  if (!matchesUnsub) {
    matchesUnsub = onSnapshot(
      query(matchesCol(), orderBy("kickoffUtc", "asc")),
      (snap) => {
        matchesLatest = applySeedLabels(snap.docs.map((d) => d.data()));
        for (const s of matchesSubscribers) s.cb(matchesLatest);
      },
      (err) => {
        for (const s of matchesSubscribers) s.onError?.(err);
      }
    );
  }

  return () => {
    matchesSubscribers.delete(entry);
    if (matchesSubscribers.size === 0 && matchesUnsub) {
      matchesUnsub();
      matchesUnsub = null;
      matchesLatest = null;
    }
  };
}

export async function getMatch(id: string): Promise<Match | null> {
  const snap = await getDoc(matchDoc(id));
  return snap.exists() ? snap.data() : null;
}

export interface CreateMatchInput {
  stage: Match["stage"];
  groupId?: Match["groupId"];
  matchday?: Match["matchday"];
  kickoffLocal: string; // ISO datetime-local
  venue?: string;
  city?: string;
  homeLabel: string;
  awayLabel: string;
  homeTeamId?: string | null;
  awayTeamId?: string | null;
}

export async function createMatch(input: CreateMatchInput): Promise<string> {
  const payload = {
    stage: input.stage,
    groupId: input.groupId ?? null,
    matchday: input.matchday ?? null,
    kickoffUtc: Timestamp.fromDate(new Date(input.kickoffLocal)),
    venue: input.venue?.trim() || null,
    city: input.city?.trim() || null,
    homeTeamId: input.homeTeamId ?? null,
    awayTeamId: input.awayTeamId ?? null,
    homeLabel: input.homeLabel.trim(),
    awayLabel: input.awayLabel.trim(),
    status: "scheduled" as Match["status"],
    result: null,
  };
  const ref = await addDoc(collection(db, MATCHES), payload);
  return ref.id;
}

export async function updateMatch(
  id: string,
  data: Partial<CreateMatchInput>
): Promise<void> {
  const patch: Record<string, unknown> = {};
  if (data.stage) patch.stage = data.stage;
  if (data.groupId !== undefined) patch.groupId = data.groupId ?? null;
  if (data.matchday !== undefined) patch.matchday = data.matchday ?? null;
  if (data.kickoffLocal)
    patch.kickoffUtc = Timestamp.fromDate(new Date(data.kickoffLocal));
  if (data.venue !== undefined) patch.venue = data.venue?.trim() || null;
  if (data.city !== undefined) patch.city = data.city?.trim() || null;
  if (data.homeLabel) patch.homeLabel = data.homeLabel.trim();
  if (data.awayLabel) patch.awayLabel = data.awayLabel.trim();
  if (data.homeTeamId !== undefined) patch.homeTeamId = data.homeTeamId ?? null;
  if (data.awayTeamId !== undefined) patch.awayTeamId = data.awayTeamId ?? null;
  await updateDoc(doc(db, MATCHES, id), patch);
}

export async function setMatchResult(
  id: string,
  result: MatchResult | null,
  adminUid: string
): Promise<void> {
  await updateDoc(doc(db, MATCHES, id), {
    result,
    status: result ? "finished" : "scheduled",
    enteredBy: adminUid,
  });
}

/** Marca o desmarca un partido como emitido por TVE La 1. */
export async function setMatchTve(id: string, tve: boolean): Promise<void> {
  await updateDoc(doc(db, MATCHES, id), { tve });
}

export async function deleteMatch(id: string): Promise<void> {
  await deleteDoc(doc(db, MATCHES, id));
}

/**
 * Aplica un conjunto de cambios al bracket en un solo batch write.
 * Devuelve el nº de documentos actualizados.
 */
export async function applyBracketChanges(
  changes: { matchId: string; field: "homeLabel" | "awayLabel"; newLabel: string }[]
): Promise<{ updated: number }> {
  if (changes.length === 0) return { updated: 0 };
  const grouped = new Map<string, Record<string, string>>();
  for (const c of changes) {
    const cur = grouped.get(c.matchId) ?? {};
    cur[c.field] = c.newLabel;
    grouped.set(c.matchId, cur);
  }
  const batch = writeBatch(db);
  for (const [matchId, patch] of grouped) {
    batch.update(doc(db, MATCHES, matchId), patch);
  }
  await batch.commit();
  return { updated: grouped.size };
}

// ---------- Helpers ----------

export function matchLabel(m: Match): string {
  return `${m.homeLabel} vs ${m.awayLabel}`;
}

export const STAGE_LABELS: Record<Match["stage"], string> = {
  group: "Fase de grupos",
  r32: "1/16 Final",
  r16: "Octavos",
  qf: "Cuartos",
  sf: "Semifinales",
  third: "3.er puesto",
  final: "Final",
};

export const GROUP_IDS = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"] as const;

// ---------- Seed Mundial 2026 ----------

export interface SeedResult {
  created: number;
  skipped: number;
  total: number;
}

/**
 * Carga los 104 partidos oficiales del Mundial 2026 a Firestore.
 * Idempotente: usa IDs estables (`wc26-mN`), si un partido ya existe lo
 * sobrescribe respetando el estado y el resultado existentes (no pisa
 * resultados ya introducidos por el admin).
 */
export async function seedWorldCupMatches(): Promise<SeedResult> {
  const batchSize = 200;
  let created = 0;
  let skipped = 0;

  // Firestore batches limitan a 500 operaciones; partimos por seguridad.
  for (let i = 0; i < WORLDCUP_2026_MATCHES.length; i += batchSize) {
    const slice = WORLDCUP_2026_MATCHES.slice(i, i + batchSize);
    const batch = writeBatch(db);

    for (const m of slice) {
      const ref = doc(db, "matches", m.seedId);
      const existing = await getDoc(ref);
      const payload: Record<string, unknown> = {
        stage: m.stage,
        groupId: m.groupId ?? null,
        matchday: m.matchday ?? null,
        kickoffUtc: Timestamp.fromDate(new Date(m.kickoffIso)),
        venue: m.venue ?? null,
        city: m.city ?? null,
        homeTeamId: m.homeTeamId ?? null,
        awayTeamId: m.awayTeamId ?? null,
        homeLabel: m.homeLabel,
        awayLabel: m.awayLabel,
      };
      if (existing.exists()) {
        // Preserva status y result existentes; actualiza solo metadatos
        batch.update(ref, payload);
        skipped += 1;
      } else {
        payload.status = "scheduled";
        payload.result = null;
        batch.set(ref, payload);
        created += 1;
      }
    }
    await batch.commit();
  }

  return { created, skipped, total: WORLDCUP_2026_MATCHES.length };
}
