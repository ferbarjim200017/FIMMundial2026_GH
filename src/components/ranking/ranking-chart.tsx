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

/** Genera tick values "bonitos" entre min y max (250, 500, 1000…). */
function niceTicks(min: number, max: number, count: number): number[] {
  if (max === min) return [min];
  const span = max - min;
  const roughStep = span / Math.max(1, count - 1);
  const magnitude = Math.pow(10, Math.floor(Math.log10(roughStep)));
  const candidates = [1, 2, 2.5, 5, 10].map((c) => c * magnitude);
  const step = candidates.find((c) => c >= roughStep) ?? roughStep;
  const start = Math.floor(min / step) * step;
  const end = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = start; v <= end + step / 2; v += step) ticks.push(Number(v.toFixed(6)));
  return ticks;
}

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

function formatTickCurrency(v: number): string {
  if (Math.abs(v) >= 1000) {
    return `${(v / 1000).toFixed(v % 1000 === 0 ? 0 : 1)}k €`;
  }
  return `${Math.round(v)} €`;
}

function formatDateShort(ms: number): string {
  return new Date(ms).toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "short",
  });
}

export function RankingChart({ users, bets }: Props) {
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [hover, setHover] = useState<{ sid: string; t: number; balance: number } | null>(null);

  const series: Series[] = useMemo(() => {
    return users.map((u, i) => ({
      uid: u.uid,
      username: u.username,
      color: pickColor(i),
      points: buildSeries(u, bets),
    }));
  }, [users, bets]);

  const visibleSeries = series.filter((s) => !hidden.has(s.uid));

  // Bounds en datos
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
      maxY = 100;
    }
    // Margen vertical
    const ySpan = Math.max(1, maxY - minY);
    const pad = ySpan * 0.12;
    return {
      minT,
      maxT,
      minY: Math.floor(minY - pad),
      maxY: Math.ceil(maxY + pad),
    };
  }, [series]);

  // Dimensiones del gráfico (viewBox)
  const W = 900;
  const H = 380;
  const PAD_LEFT = 70;
  const PAD_RIGHT = 110;
  const PAD_TOP = 24;
  const PAD_BOT = 44;
  const PLOT_W = W - PAD_LEFT - PAD_RIGHT;
  const PLOT_H = H - PAD_TOP - PAD_BOT;

  const xFor = (t: number) => {
    if (bounds.maxT === bounds.minT) return PAD_LEFT + PLOT_W / 2;
    return PAD_LEFT + ((t - bounds.minT) / (bounds.maxT - bounds.minT)) * PLOT_W;
  };
  const yFor = (v: number) => {
    if (bounds.maxY === bounds.minY) return PAD_TOP + PLOT_H / 2;
    return (
      PAD_TOP + PLOT_H - ((v - bounds.minY) / (bounds.maxY - bounds.minY)) * PLOT_H
    );
  };

  // Ticks
  const yTicks = useMemo(
    () => niceTicks(bounds.minY, bounds.maxY, 6),
    [bounds]
  );
  const xTicks = useMemo(() => {
    const count = 5;
    const out: number[] = [];
    if (bounds.maxT === bounds.minT) return [bounds.minT];
    for (let i = 0; i < count; i++) {
      out.push(bounds.minT + ((bounds.maxT - bounds.minT) * i) / (count - 1));
    }
    return out;
  }, [bounds]);

  // Línea de cero (si el rango cruza 0)
  const zeroY =
    bounds.minY < 0 && bounds.maxY > 0 ? yFor(0) : null;

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
    <div className="space-y-4">
      <div className="w-full overflow-x-auto">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="h-[380px] w-full min-w-[700px]"
          preserveAspectRatio="none"
        >
          {/* ── Fondo del área de plot ── */}
          <rect
            x={PAD_LEFT}
            y={PAD_TOP}
            width={PLOT_W}
            height={PLOT_H}
            fill="hsl(var(--muted))"
            fillOpacity={0.15}
            rx={4}
          />

          {/* ── Gridlines horizontales + tick labels Y ── */}
          {yTicks.map((v) => {
            const y = yFor(v);
            return (
              <g key={`y-${v}`}>
                <line
                  x1={PAD_LEFT}
                  x2={PAD_LEFT + PLOT_W}
                  y1={y}
                  y2={y}
                  stroke="hsl(var(--border))"
                  strokeOpacity={0.5}
                  strokeDasharray="3 4"
                  strokeWidth={1}
                />
                {/* Tick mark */}
                <line
                  x1={PAD_LEFT - 4}
                  x2={PAD_LEFT}
                  y1={y}
                  y2={y}
                  stroke="hsl(var(--muted-foreground))"
                  strokeOpacity={0.6}
                  strokeWidth={1}
                />
                <text
                  x={PAD_LEFT - 8}
                  y={y + 3.5}
                  textAnchor="end"
                  fontSize={11}
                  fill="hsl(var(--muted-foreground))"
                  fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                >
                  {formatTickCurrency(v)}
                </text>
              </g>
            );
          })}

          {/* ── Línea de cero (si aplica) ── */}
          {zeroY !== null && (
            <line
              x1={PAD_LEFT}
              x2={PAD_LEFT + PLOT_W}
              y1={zeroY}
              y2={zeroY}
              stroke="hsl(var(--muted-foreground))"
              strokeOpacity={0.5}
              strokeWidth={1}
            />
          )}

          {/* ── Ejes ── */}
          <line
            x1={PAD_LEFT}
            x2={PAD_LEFT}
            y1={PAD_TOP}
            y2={PAD_TOP + PLOT_H}
            stroke="hsl(var(--muted-foreground))"
            strokeOpacity={0.7}
            strokeWidth={1}
          />
          <line
            x1={PAD_LEFT}
            x2={PAD_LEFT + PLOT_W}
            y1={PAD_TOP + PLOT_H}
            y2={PAD_TOP + PLOT_H}
            stroke="hsl(var(--muted-foreground))"
            strokeOpacity={0.7}
            strokeWidth={1}
          />

          {/* ── Tick labels X ── */}
          {xTicks.map((t, i) => {
            const x = xFor(t);
            return (
              <g key={`x-${i}`}>
                <line
                  x1={x}
                  x2={x}
                  y1={PAD_TOP + PLOT_H}
                  y2={PAD_TOP + PLOT_H + 4}
                  stroke="hsl(var(--muted-foreground))"
                  strokeOpacity={0.6}
                  strokeWidth={1}
                />
                <text
                  x={x}
                  y={PAD_TOP + PLOT_H + 18}
                  textAnchor="middle"
                  fontSize={11}
                  fill="hsl(var(--muted-foreground))"
                >
                  {formatDateShort(t)}
                </text>
              </g>
            );
          })}

          {/* ── Etiqueta de eje Y ── */}
          <text
            x={16}
            y={PAD_TOP + PLOT_H / 2}
            transform={`rotate(-90 16 ${PAD_TOP + PLOT_H / 2})`}
            textAnchor="middle"
            fontSize={11}
            fill="hsl(var(--muted-foreground))"
            opacity={0.7}
          >
            Saldo acumulado
          </text>

          {/* ── Líneas de cada usuario ── */}
          {visibleSeries.map((s) => {
            if (s.points.length === 0) return null;
            const d = s.points
              .map((p, i) => `${i === 0 ? "M" : "L"}${xFor(p.t)},${yFor(p.balance)}`)
              .join(" ");
            const last = s.points[s.points.length - 1];
            return (
              <g key={s.uid}>
                {/* línea */}
                <path
                  d={d}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={2.25}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
                {/* puntos */}
                {s.points.map((p, i) => (
                  <circle
                    key={i}
                    cx={xFor(p.t)}
                    cy={yFor(p.balance)}
                    r={4}
                    fill={s.color}
                    stroke="hsl(var(--card))"
                    strokeWidth={2}
                    onMouseEnter={() =>
                      setHover({ sid: s.uid, t: p.t, balance: p.balance })
                    }
                    onMouseLeave={() => setHover(null)}
                    style={{ cursor: "pointer" }}
                  />
                ))}
                {/* etiqueta al final de la línea */}
                <text
                  x={xFor(last.t) + 8}
                  y={yFor(last.balance) + 4}
                  fontSize={11}
                  fill={s.color}
                  fontWeight={600}
                  paintOrder="stroke"
                  stroke="hsl(var(--card))"
                  strokeWidth={3}
                  strokeLinejoin="round"
                >
                  {s.username}
                </text>
              </g>
            );
          })}

          {/* ── Tooltip flotante ── */}
          {hover &&
            (() => {
              const s = series.find((x) => x.uid === hover.sid);
              if (!s) return null;
              const x = xFor(hover.t);
              const y = yFor(hover.balance);
              const text = `${s.username} · ${formatCurrency(hover.balance)}`;
              const date = formatDateShort(hover.t);
              const tooltipW = 180;
              const tooltipH = 44;
              const tx = Math.min(W - tooltipW - 4, Math.max(4, x - tooltipW / 2));
              const ty = Math.max(4, y - tooltipH - 14);
              return (
                <g pointerEvents="none">
                  <line
                    x1={x}
                    x2={x}
                    y1={PAD_TOP}
                    y2={PAD_TOP + PLOT_H}
                    stroke={s.color}
                    strokeOpacity={0.3}
                    strokeDasharray="3 3"
                  />
                  <rect
                    x={tx}
                    y={ty}
                    width={tooltipW}
                    height={tooltipH}
                    rx={6}
                    fill="hsl(var(--popover))"
                    stroke="hsl(var(--border))"
                  />
                  <text
                    x={tx + 10}
                    y={ty + 18}
                    fontSize={11}
                    fontWeight={600}
                    fill={s.color}
                  >
                    {text}
                  </text>
                  <text
                    x={tx + 10}
                    y={ty + 34}
                    fontSize={10}
                    fill="hsl(var(--muted-foreground))"
                  >
                    {date}
                  </text>
                </g>
              );
            })()}
        </svg>
      </div>

      {/* Leyenda interactiva */}
      <div className="flex flex-wrap gap-2">
        {series.map((s) => {
          const isHidden = hidden.has(s.uid);
          return (
            <button
              key={s.uid}
              type="button"
              onClick={() => toggle(s.uid)}
              className={cn(
                "flex items-center gap-2 rounded-full border bg-card px-3 py-1 text-xs transition-all hover:shadow-sm",
                isHidden && "opacity-40 grayscale"
              )}
              style={
                !isHidden
                  ? {
                      borderColor: `${s.color}66`,
                      boxShadow: `0 0 0 0 ${s.color}`,
                    }
                  : undefined
              }
            >
              <span
                className="inline-block h-2.5 w-2.5 rounded-full ring-2 ring-card"
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
