"use client";

import { usePendingCreates } from "./pending-creates";
import { usePendingSettles } from "./pending-settles";
import { usePendingEdits } from "./pending-edits";

/**
 * Número total de cambios guardados en local SIN SUBIR (borradores nuevos +
 * liquidaciones + ediciones). Como ahora las subidas son manuales (botón
 * "Subir todo"), se usa para pintar un aviso en la navegación y que no se
 * olvide subirlas.
 */
export function usePendingUploadsCount(): number {
  const creates = usePendingCreates();
  const settles = usePendingSettles();
  const edits = usePendingEdits();
  return creates.length + settles.length + edits.length;
}
