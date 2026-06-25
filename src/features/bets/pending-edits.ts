"use client";

import { useEffect, useState } from "react";
import {
  getCachedAllBets,
  updateBet,
  updateBetsBatch,
  type UpdateBetInput,
} from "@/features/bets/bets.service";
import { calcProfit } from "@/features/bets/bets.utils";
import { Timestamp } from "firebase/firestore";
import type { Bet } from "@/types/domain";

/**
 * Cola LOCAL de EDICIONES pendientes de subir (gemela de `pending-settles`).
 *
 * Cuando Firebase rechaza una edición (p. ej. "quota exceeded" del plan
 * gratuito) o tarda demasiado, el usuario igualmente puede editar la apuesta:
 * el cambio se guarda en `localStorage`, se muestra al instante con el
 * distintivo "sin subir" y un proceso reintenta subirlo cada pocos minutos (y
 * al abrir la app). En cuanto vuelve la cuota se sincroniza solo.
 *
 * Es por dispositivo/navegador (no toca Firestore hasta que se pueda subir).
 * El reintento es idempotente: `updateBet` recalcula el profit desde la
 * stake/odds actuales, así que reaplicarlo no duplica nada en el saldo.
 */
const KEY = "fim_pending_edits_v1";

export interface PendingEdit {
  betId: string;
  /** Datos del formulario validados que se intentaron guardar. */
  input: UpdateBetInput;
  /** Texto para mostrar en el aviso "sin subir". */
  label: string;
  queuedAt: number;
}

type Listener = () => void;
const listeners = new Set<Listener>();

const round2 = (n: number) => Math.round(n * 100) / 100;

function read(): PendingEdit[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as PendingEdit[]) : [];
  } catch {
    return [];
  }
}

function write(arr: PendingEdit[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(arr));
  } catch {
    /* almacenamiento lleno o no disponible: ignoramos */
  }
  listeners.forEach((l) => l());
}

export function getPendingEdits(): PendingEdit[] {
  return read();
}

/** Encola (o reemplaza) la edición de una apuesta para subirla más tarde. */
export function queueEdit(p: PendingEdit): void {
  const arr = read().filter((x) => x.betId !== p.betId);
  arr.push(p);
  write(arr);
}

export function removePendingEdit(betId: string): void {
  write(read().filter((x) => x.betId !== betId));
}

export function subscribePendingEdits(l: Listener): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

let flushing = false;

/**
 * Sube todas las ediciones pendientes en UNA sola escritura (`writeBatch`) + un
 * recálculo por usuario, usando la apuesta cacheada del listener global. Las que
 * no estén en caché caen a subida individual. Las que suben bien se quitan de la
 * cola; las que fallan se quedan. Idempotente.
 */
export async function flushPendingEdits(): Promise<{
  flushed: number;
  remaining: number;
}> {
  if (flushing) return { flushed: 0, remaining: read().length };
  flushing = true;
  let flushed = 0;
  try {
    const pending = read();
    if (pending.length === 0) return { flushed: 0, remaining: 0 };

    const byId = new Map((getCachedAllBets() ?? []).map((b) => [b.id, b]));
    const batchItems: { input: UpdateBetInput; bet: Bet; betId: string }[] = [];
    const fallback: PendingEdit[] = [];
    for (const p of pending) {
      const bet = byId.get(p.betId);
      if (bet) batchItems.push({ input: p.input, bet, betId: p.betId });
      else fallback.push(p);
    }

    if (batchItems.length > 0) {
      try {
        await updateBetsBatch(batchItems);
        for (const it of batchItems) removePendingEdit(it.betId);
        flushed += batchItems.length;
      } catch {
        // Sigue sin poder subir: las dejamos en la cola.
      }
    }

    for (const p of fallback) {
      try {
        await updateBet(p.input);
        removePendingEdit(p.betId);
        flushed += 1;
      } catch {
        // Lo dejamos en la cola para el próximo intento.
      }
    }
  } finally {
    flushing = false;
  }
  return { flushed, remaining: read().length };
}

/** Aplica los datos editados sobre una apuesta para mostrarla YA (optimista). */
function patchBet(bet: Bet, input: UpdateBetInput): Bet {
  const stake = round2(input.stake);
  const odds = round2(input.odds);
  const matchIds = input.matchIds ?? [];
  const groupIds = (input.groupIds ?? []).filter((g) => g.length > 0);
  const isFreebet = input.isFreebet !== undefined ? !!input.isFreebet : !!bet.isFreebet;
  // Mismo criterio que updateBet: pending → 0; cashout → se mantiene; resto se recalcula.
  const profit =
    bet.status === "pending"
      ? 0
      : bet.status === "cashout"
        ? bet.profit
        : calcProfit(stake, odds, bet.status, undefined, isFreebet);

  return {
    ...bet,
    bookmaker: input.bookmaker,
    bookmakerLabel: input.bookmaker === "other" ? input.bookmakerLabel?.trim() ?? "" : "",
    matchId: matchIds[0] ?? null,
    matchIds,
    groupId: groupIds[0] ?? bet.groupId,
    groupIds: groupIds.length > 0 ? groupIds : bet.groupIds,
    matchLabel: input.matchLabel.trim(),
    market: input.market,
    marketDetail: input.marketDetail?.trim() ?? "",
    selection: input.selection.trim(),
    odds,
    stake,
    potentialReturn: round2(stake * odds),
    createdAt: Timestamp.fromDate(new Date(input.placedAt)),
    notes: input.notes?.trim() ?? "",
    isCombo: input.market === "combo" || matchIds.length > 1,
    isFreebet,
    teams: input.market === "outright" ? input.teams ?? [] : [],
    profit: round2(profit),
  };
}

/**
 * Superpone las ediciones locales (sin subir) sobre la lista de apuestas. Añade
 * los ids afectados a `basePendingIds` para que la tabla los marque "sin subir".
 */
export function applyPendingEditsToBets(
  bets: Bet[],
  pending: PendingEdit[],
  basePendingIds: Set<string> = new Set(),
): { bets: Bet[]; pendingIds: Set<string> } {
  if (pending.length === 0) return { bets, pendingIds: basePendingIds };
  const map = new Map(pending.map((p) => [p.betId, p]));
  const pendingIds = new Set(basePendingIds);
  const out = bets.map((b) => {
    const p = map.get(b.id);
    if (!p) return b;
    pendingIds.add(b.id);
    return patchBet(b, p.input);
  });
  return { bets: out, pendingIds };
}

/** Hook reactivo con la cola local de ediciones pendientes. */
export function usePendingEdits(): PendingEdit[] {
  const [pending, setPending] = useState<PendingEdit[]>(() => getPendingEdits());
  useEffect(() => subscribePendingEdits(() => setPending(getPendingEdits())), []);
  return pending;
}
