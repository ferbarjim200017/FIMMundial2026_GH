/** Paleta común a las gráficas del ranking. Mismo índice → mismo color
 *  entre líneas y barras, así un usuario tiene su color consistente. */
export const CHART_PALETTE = [
  "#22c55e", // green
  "#3b82f6", // blue
  "#f59e0b", // amber
  "#ec4899", // pink
  "#8b5cf6", // violet
  "#06b6d4", // cyan
  "#ef4444", // red
  "#84cc16", // lime
  "#f97316", // orange
  "#14b8a6", // teal
  "#a855f7", // purple
  "#eab308", // yellow
];

export function pickChartColor(index: number): string {
  return CHART_PALETTE[index % CHART_PALETTE.length];
}

/** Inicio del día actual en el reloj del navegador. */
export function todayStartMs(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export const DAY_MS = 86_400_000;
