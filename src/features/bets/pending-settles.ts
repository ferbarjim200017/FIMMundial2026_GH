"use client";

import { useEffect, useState } from "react";
import { settleBet } from "@/features/bets/bets.service";
import { calcProfit } from "@/features/bets/bets.utils";
import type { Bet, BetStatus } from "@/types/domain";

/**
 * Cola LOCAL de liquidaciones pendientes de subir.
 *
 * Cuando Firebase rechaza la escritura (p. ej. "quota exceeded" del plan
 * gratuito, que se resetea a medianoche en California ≈ 9:00 en España), el
 * usuario igualmente puede marcar la apuesta como ganada/perdida: el cambio se
 * guarda en `localStorage` y se muestra al instante con un distintivo "sin
 * subir". Un proceso reintenta subirlo cada pocos minutos (y al abrir la app),
 * así que en cuanto vuelve la cuota se sincroniza solo.
 *
 * Es por dispositivo/navegador (no toca Firestore hasta que se pueda subir).
 */
const KEY = "fim_pending_settles_v1";

export type SettleStatus = Exclude<BetStatus, "pending">;

export interface PendingSettle {
  betId: string;
  status: SettleStatus;
  /** Solo en cashout: beneficio introducido por el usuario. */
  cashoutProfit?: number;
  /** Texto para mostrar en el aviso "sin subir". */
  label: string;
  queuedAt: number;
}

type Listener = () => void;
const listeners = new Set<Listener>();

function read(): PendingSettle[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as PendingSettle[]) : [];
  } catch {
    return [];
  }
}

function write(arr: PendingSettle[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(arr));
  } catch {
    /* almacenamiento lleno o no disponible: ignoramos */
  }
  listeners.forEach((l) => l());
}

export function getPendingSettles(): PendingSettle[] {
  return read();
}

/** Encola (o reemplaza) la liquidación de una apuesta para subirla más tarde. */
export function queueSettle(p: PendingSettle): void {
  const arr = read().filter((x) => x.betId !== p.betId);
  arr.push(p);
  write(arr);
}

export function removePendingSettle(betId: string): void {
  write(read().filter((x) => x.betId !== betId));
}

export function subscribePendingSettles(l: Listener): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

let flushing = false;

/**
 * Intenta subir todas las liquidaciones pendientes. Las que suben bien se
 * quitan de la cola; las que fallan (sigue sin cuota) se quedan. Idempotente y
 * sin solaparse consigo misma.
 */
export async function flushPendingSettles(): Promise<{
  flushed: number;
  remaining: number;
}> {
  if (flushing) return { flushed: 0, remaining: read().length };
  flushing = true;
  let flushed = 0;
  try {
    for (const p of read()) {
      try {
        await settleBet(p.betId, p.status, p.cashoutProfit);
        removePendingSettle(p.betId);
        flushed += 1;
      } catch {
        // Sigue sin poder subir: lo dejamos en la cola para el próximo intento.
      }
    }
  } finally {
    flushing = false;
  }
  return { flushed, remaining: read().length };
}

/**
 * Aplica la cola local sobre la lista de apuestas para mostrarlas YA con su
 * estado y beneficio (optimista), aunque todavía no se haya subido. Solo afecta
 * a las que están `pending` en Firestore (no pisa datos ya liquidados).
 */
export function applyPendingToBets(
  bets: Bet[],
  pending: PendingSettle[]
): { bets: Bet[]; pendingIds: Set<string> } {
  if (pending.length === 0) return { bets, pendingIds: new Set() };
  const map = new Map(pending.map((p) => [p.betId, p]));
  const pendingIds = new Set<string>();
  const out = bets.map((b) => {
    const p = map.get(b.id);
    if (!p || b.status !== "pending") return b;
    pendingIds.add(b.id);
    return {
      ...b,
      status: p.status,
      profit: calcProfit(b.stake, b.odds, p.status, p.cashoutProfit, !!b.isFreebet),
    };
  });
  return { bets: out, pendingIds };
}

/** Hook reactivo con la cola local de liquidaciones pendientes. */
export function usePendingSettles(): PendingSettle[] {
  const [pending, setPending] = useState<PendingSettle[]>(() => getPendingSettles());
  useEffect(() => subscribePendingSettles(() => setPending(getPendingSettles())), []);
  return pending;
}
