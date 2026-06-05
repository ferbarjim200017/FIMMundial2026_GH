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

const MATCHES = "matches";

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
  return snap.docs.map((d) => d.data());
}

export function subscribeToMatches(
  cb: (matches: Match[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  return onSnapshot(
    query(matchesCol(), orderBy("kickoffUtc", "asc")),
    (snap) => cb(snap.docs.map((d) => d.data())),
    (err) => onError?.(err)
  );
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

export async function deleteMatch(id: string): Promise<void> {
  await deleteDoc(doc(db, MATCHES, id));
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
