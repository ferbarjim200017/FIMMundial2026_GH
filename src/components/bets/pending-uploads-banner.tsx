"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  usePendingCreates,
  flushPendingCreates,
} from "@/features/bets/pending-creates";
import {
  usePendingSettles,
  flushPendingSettles,
} from "@/features/bets/pending-settles";
import {
  usePendingEdits,
  flushPendingEdits,
} from "@/features/bets/pending-edits";
import { cn } from "@/lib/utils";

/**
 * Aviso de "sin subir": aparece cuando hay borradores/liquidaciones/ediciones
 * guardadas en local sin subir, con un botón para subirlas TODAS de golpe (un
 * lote por tipo). Se usa en la lista de apuestas y en el dashboard. Si no hay
 * nada pendiente, no pinta nada.
 */
export function PendingUploadsBanner({ className }: { className?: string }) {
  const creates = usePendingCreates();
  const settles = usePendingSettles();
  const edits = usePendingEdits();
  const [uploading, setUploading] = useState(false);

  const total = creates.length + settles.length + edits.length;
  if (total === 0) return null;

  const detail = [
    creates.length > 0
      ? `${creates.length} nueva${creates.length > 1 ? "s" : ""}`
      : null,
    settles.length > 0
      ? `${settles.length} liquidación${settles.length > 1 ? "es" : ""}`
      : null,
    edits.length > 0
      ? `${edits.length} edición${edits.length > 1 ? "es" : ""}`
      : null,
  ]
    .filter(Boolean)
    .join(" · ");

  async function handleUploadAll() {
    setUploading(true);
    try {
      await flushPendingCreates();
      await flushPendingSettles();
      await flushPendingEdits();
    } finally {
      setUploading(false);
    }
  }

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm",
        className
      )}
    >
      <span className="text-amber-700 dark:text-amber-400">
        ⏳ <strong>{total}</strong> sin subir en este dispositivo
        {detail && ` · ${detail}`}. Súbelas todas de golpe.
      </span>
      <Button
        size="sm"
        className="ml-auto h-8"
        onClick={handleUploadAll}
        disabled={uploading}
      >
        {uploading ? "Subiendo…" : `Subir todo (${total})`}
      </Button>
    </div>
  );
}
