"use client";

import { useEffect, useRef, useState } from "react";

/** Anima un número de 0 (o del valor previo) hasta `target` con easeOutCubic.
 *  Respeta prefers-reduced-motion (salta directo al valor final). */
export function useCountUp(target: number, durationMs = 700): number {
  const [value, setValue] = useState(0);
  const valueRef = useRef(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce || durationMs <= 0) {
      valueRef.current = target;
      setValue(target);
      return;
    }
    const from = valueRef.current;
    const startedAt = performance.now();
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    const tick = (now: number) => {
      const t = Math.min(1, (now - startedAt) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      const current = from + (target - from) * eased;
      valueRef.current = current;
      setValue(current);
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [target, durationMs]);

  return value;
}

/** Muestra un número animado (count-up) formateado con `format`. */
export function CountUp({
  end,
  format,
  durationMs,
}: {
  end: number;
  format: (n: number) => string;
  durationMs?: number;
}) {
  const v = useCountUp(end, durationMs);
  return <>{format(v)}</>;
}
