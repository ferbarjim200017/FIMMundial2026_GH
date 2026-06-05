"use client";

import { useMemo, useState } from "react";
import { cn, formatCurrency } from "@/lib/utils";
import type { AppUser, Bet } from "@/types/domain";

interface Props {
  users: AppUser[];
  bets: Bet[];
}

interface Series {
  uid: string;
  username: string;
  color: string;
  points: { t: number; balance: number }[];
}

/** Paleta para asignar un color estable a cada usuario. */
const PALETTE = [
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

function pickColor(index: number): string {
  return PALETTE[index % PALETTE.length];
}

/**
 * Construye la serie temporal de saldo de un usuario a partir de sus
 * apuestas liquidadas. Punto 0 = saldo inicial; cada apuesta liquidada
 * (won/lost/cashout, no void) acumula su profit en orden cronológico.
 */
function buildSeries(user: AppUser, bets: Bet[]): Series["points"] {
  const settled = bets
    .filter((b) => b.userId === user.uid)
    .filter(
      (b) =>
        b.status === "won" ||
        b.status === "lost" ||
        b.status === "cashout"
    )
    .map((b) => ({
      ms: (b.settledAt ?? b.createdAt).toMillis(),
      profit: b.profit ?? 0,
    }))
    .sort((a, b) => a.ms - b.ms);

  const initial = user.initialBalance ?? 0;
  if (settled.length === 0) {
    // Sin apuestas liquidadas → línea plana en el saldo inicial
    return [
      { t: 0, balance: initial },
      { t: 1, balance: initial },
    ];
  }

  const points: Series["points"] = [
    { t: settled[0].ms - 1, balance: initial },
  ];
  let acc = initial;
  for (const s of settled) {
    acc += s.profit;
    points.push({ t: s.ms, balance: acc });
  }
  return points;
}

export function RankingChart({ users, bets }: Props) {
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  const series: Series[] = useMemo(() => {
    return users.map((u, i) => ({
      uid: u.uid,
      username: u.username,
      color: pickColor(i),
      points: buildSeries(u, bets),
    }));
  }, [users, bets]);

  const visibleSeries = series.filter((s) => !hidden.has(s.uid));

  // Bounds
  const bounds = useMemo(() => {
    let minT = Infinity;
    let maxT = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const s of series) {
      for (const p of s.points) {
        if (p.t < minT) minT = p.t;
        if (p.t > maxT) maxT = p.t;
        if (p.balance < minY) minY = p.balance;
        if (p.balance > maxY) maxY = p.balance;
      }
    }
    if (!Number.isFinite(minT)) {
      minT = 0;
      maxT = 1;
    }
    if (!Number.isFinite(minY)) {
      minY = 0;
      maxY = 1;
    }
    // Padding vertical para que las líneas no peguen al borde
    const ySpan = Math.max(1, maxY - minY);
    const pad = ySpan * 0.1;
    return { minT, maxT, minY: minY - pad, maxY: maxY + pad };
  }, [series]);

  // Dimensiones del viewBox
  const W = 800;
  const H = 320;
  const PAD_LEFT = 56;
  const PAD_RIGHT = 96; // espacio para los labels de username al final de la línea
  const PAD_TOP = 16;
  const PAD_BOT = 28;
  const PLOT_W = W - PAD_LEFT - PAD_RIGHT;
  const PLOT_H = H - PAD_TOP - PAD_BOT;

  function xFor(t: number): number {
    if (bounds.maxT === bounds.minT) return PAD_LEFT + PLOT_W / 2;
    return PAD_LEFT + ((t - bounds.minT) / (bounds.maxT - bounds.minT)) * PLOT_W;
  }
  function yFor(v: number): number {
    if (bounds.maxY === bounds.minY) return PAD_TOP + PLOT_H / 2;
    return (
      PAD_TOP + PLOT_H - ((v - bounds.minY) / (bounds.maxY - bounds.minY)) * PLOT_H
    );
  }

  // Líneas de grid Y: 5 marcas equidistantes
  const yTicks = useMemo(() => {
    const ticks: { y: number; label: string }[] = [];
    for (let i = 0; i <= 4; i++) {
      const v = bounds.minY + ((bounds.maxY - bounds.minY) * i) / 4;
      ticks.push({ y: yFor(v), label: formatCurrency(v) });
    }
    return ticks;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bounds]);

  // Etiquetas X: principio y final
  const xLabels = useMemo(() => {
    const fmt = (ms: number) =>
      new Date(ms).toLocaleDateString("es-ES", {
        day: "2-digit",
        month: "short",
      });
    return [
      { x: xFor(bounds.minT), label: fmt(bounds.minT) },
      { x: xFor(bounds.maxT), label: fmt(bounds.maxT) },
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bounds]);

  function toggle(uid: string) {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });
  }

  if (users.length === 0) {
    return (
      <div className="px-6 py-8 text-center text-sm text-muted-foreground">
        No hay usuarios para graficar.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="w-full overflow-x-auto">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="h-[320px] w-full min-w-[600px]"
          preserveAspectRatio="none"
        >
          {/* Grid horizontal + labels Y */}
          {yTicks.map((t, i) => (
            <g key={i}>
              <line
                x1={PAD_LEFT}
                x2={W - PAD_RIGHT}
                y1={t.y}
                y2={t.y}
                stroke="hsl(var(--border))"
                strokeDasharray="3 3"
                strokeWidth={1}
              />
              <text
                x={PAD_LEFT - 8}
                y={t.y + 3}
                textAnchor="end"
                fontSize={10}
                fill="hsl(var(--muted-foreground))"
                fontFamily="ui-monospace,monospace"
              >
                {t.label}
              </text>
            </g>
          ))}

          {/* Labels X */}
          {xLabels.map((l, i) => (
            <text
              key={i}
              x={l.x}
              y={H - 8}
              textAnchor={i === 0 ? "start" : "end"}
              fontSize={10}
              fill="hsl(var(--muted-foreground))"
            >
              {l.label}
            </text>
          ))}

          {/* Líneas de cada usuario */}
          {visibleSeries.map((s) => {
            if (s.points.length === 0) return null;
            const d = s.points
              .map((p, i) => `${i === 0 ? "M" : "L"}${xFor(p.t)},${yFor(p.balance)}`)
              .join(" ");
            const last = s.points[s.points.length - 1];
            return (
              <g key={s.uid}>
                <path
                  d={d}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={2}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
                {s.points.map((p, i) => (
                  <circle
                    key={i}
                    cx={xFor(p.t)}
                    cy={yFor(p.balance)}
                    r={2.5}
                    fill={s.color}
                  />
                ))}
                {/* Username al final de la línea */}
                <text
                  x={xFor(last.t) + 6}
                  y={yFor(last.balance) + 3}
                  fontSize={11}
                  fill={s.color}
                  fontWeight={600}
                >
                  {s.username}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Leyenda interactiva: click para ocultar/mostrar */}
      <div className="flex flex-wrap gap-2">
        {series.map((s) => {
          const isHidden = hidden.has(s.uid);
          return (
            <button
              key={s.uid}
              type="button"
              onClick={() => toggle(s.uid)}
              className={cn(
                "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-opacity",
                isHidden ? "opacity-40 grayscale" : "opacity-100"
              )}
            >
              <span
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: s.color }}
              />
              <span className="font-medium">{s.username}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
