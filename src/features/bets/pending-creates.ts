"use client";

import { useEffect, useState } from "react";
import { Timestamp } from "firebase/firestore";
import {
  createManyBets,
  type CreateBetInput,
} from "@/features/bets/bets.service";
import { round2 } from "@/features/bets/bets.utils";
import type { Bet } from "@/types/domain";

/**
 * Cola LOCAL de apuestas en BORRADOR pendientes de subir (gemela de
 * `pending-settles` / `pending-edits`).
 *
 * En vez de subir cada apuesta al crearla (una llamada por apuesta), se guardan
 * en `localStorage` y se muestran al instante en la lista con el distintivo
 * "sin subir". Cuando el usuario pulsa "Subir", TODAS se crean en una sola
 * escritura (`createManyBets` → `writeBatch`). También se reintenta solo al
 * abrir la app y cada pocos minutos.
 *
 * Es por dispositivo/navegador (no toca Firestore hasta subir). Si se borra el
 * almacenamiento del navegador antes de subir, los borradores se pierden.
 */
const KEY = "fim_pending_creates_v1";

export interface PendingCreate {
  /** Id local único (el doc real de Firestore se crea al subir). */
  localId: string;
  /** Datos del formulario validados + autor. */
  input: CreateBetInput;
  /** Texto para mostrar en el aviso "sin subir". */
  label: string;
  queuedAt: number;
}

type Listener = () => void;
const listeners = new Set<Listener>();

function read(): PendingCreate[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as PendingCreate[]) : [];
  } catch {
    return [];
  }
}

function write(arr: PendingCreate[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(arr));
  } catch {
    /* almacenamiento lleno o no disponible: ignoramos */
  }
  listeners.forEach((l) => l());
}

export function getPendingCreates(): PendingCreate[] {
  return read();
}

/** Genera un id local único para un borrador. */
export function newLocalId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/** Encola un borrador de apuesta para subirlo más tarde. */
export function queueCreate(p: PendingCreate): void {
  const arr = read();
  arr.push(p);
  write(arr);
}

export function removePendingCreate(localId: string): void {
  write(read().filter((x) => x.localId !== localId));
}

export function clearPendingCreates(): void {
  write([]);
}

export function subscribePendingCreates(l: Listener): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

let flushing = false;

/**
 * Sube TODOS los borradores en una sola llamada (`createManyBets`). Si va bien,
 * los quita de la cola (solo los que se enviaron, por si se añadió alguno entre
 * medias). Si falla (sin cuota), se quedan para el próximo intento.
 */
export async function flushPendingCreates(): Promise<{
  flushed: number;
  remaining: number;
}> {
  if (flushing) return { flushed: 0, remaining: read().length };
  flushing = true;
  try {
    const pending = read();
    if (pending.length === 0) return { flushed: 0, remaining: 0 };
    try {
      await createManyBets(pending.map((p) => p.input));
      const sent = new Set(pending.map((p) => p.localId));
      write(read().filter((p) => !sent.has(p.localId)));
      return { flushed: pending.length, remaining: read().length };
    } catch {
      return { flushed: 0, remaining: read().length };
    }
  } finally {
    flushing = false;
  }
}

/** Sintetiza un `Bet` "de mentira" a partir de un borrador para mostrarlo en la
 *  lista igual que una apuesta real (estado pending, profit 0). Su id empieza
 *  por "local:" para distinguirlo. */
function synthBet(p: PendingCreate): Bet {
  const input = p.input;
  const stake = round2(input.stake);
  const odds = round2(input.odds);
  const matchIds = input.matchIds ?? [];
  const groupIds = (input.groupIds ?? []).filter((g) => g.length > 0);
  return {
    id: `local:${p.localId}`,
    userId: input.userId,
    groupId: groupIds[0] ?? "",
    groupIds,
    createdAt: Timestamp.fromDate(new Date(input.placedAt)),
    addedAt: Timestamp.fromMillis(p.queuedAt),
    settledAt: null,
    bookmaker: input.bookmaker,
    bookmakerLabel:
      input.bookmaker === "other" ? input.bookmakerLabel?.trim() : undefined,
    matchId: matchIds[0] ?? null,
    matchIds,
    matchLabel: input.matchLabel.trim(),
    market: input.market,
    marketDetail: input.marketDetail?.trim() ?? "",
    selection: input.selection.trim(),
    odds,
    stake,
    potentialReturn: round2(stake * odds),
    status: "pending",
    profit: 0,
    isCombo: input.market === "combo" || matchIds.length > 1,
    isFreebet: !!input.isFreebet,
    notes: input.notes?.trim() ?? "",
    teams: input.market === "outright" ? input.teams ?? [] : undefined,
    history: [],
  };
}

/**
 * Antepone los borradores locales (sin subir) a la lista de apuestas, como
 * `Bet` sintéticos. Añade sus ids ("local:…") a `pendingIds` para que la tabla
 * los marque "sin subir".
 */
export function applyPendingCreatesToBets(
  bets: Bet[],
  pending: PendingCreate[],
  basePendingIds: Set<string> = new Set()
): { bets: Bet[]; pendingIds: Set<string> } {
  if (pending.length === 0) return { bets, pendingIds: basePendingIds };
  const pendingIds = new Set(basePendingIds);
  const synth = pending.map((p) => {
    const b = synthBet(p);
    pendingIds.add(b.id);
    return b;
  });
  return { bets: [...synth, ...bets], pendingIds };
}

/** Hook reactivo con la cola local de borradores de creación. */
export function usePendingCreates(): PendingCreate[] {
  const [pending, setPending] = useState<PendingCreate[]>(() =>
    getPendingCreates()
  );
  useEffect(
    () => subscribePendingCreates(() => setPending(getPendingCreates())),
    []
  );
  return pending;
}
