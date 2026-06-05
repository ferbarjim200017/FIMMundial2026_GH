"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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

/** Genera tick values "bonitos" entre min y max (250, 500, 1k…). */
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
  for (let v = start; v <= end + step / 2; v += step) {
    ticks.push(Number(v.toFixed(6)));
  }
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
    const k = v / 1000;
    return `${k % 1 === 0 ? k.toFixed(0) : k.toFixed(1)}k €`;
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
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(900);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [hover, setHover] = useState<
    | { sid: string; t: number; balance: number; x: number; y: number }
    | null
  >(null);

  // Mide el ancho real del contenedor para que el SVG se renderice en
  // píxeles 1:1 (sin estirar/distorsionar). Esto es lo que mantiene el
  // texto y las líneas perfectamente nítidos a cualquier resolución.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => setWidth(Math.max(560, Math.floor(el.clientWidth)));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const series: Series[] = useMemo(() => {
    return users.map((u, i) => ({
      uid: u.uid,
      username: u.username,
      color: pickColor(i),
      points: buildSeries(u, bets),
    }));
  }, [users, bets]);

  const visibleSeries = series.filter((s) => !hidden.has(s.uid));

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
    const ySpan = Math.max(1, maxY - minY);
    const pad = ySpan * 0.12;
    return {
      minT,
      maxT,
      minY: minY - pad,
      maxY: maxY + pad,
    };
  }, [series]);

  // Dimensiones reales del SVG en píxeles
  const W = width;
  const H = 400;
  const PAD_LEFT = 72;
  const PAD_RIGHT = 24;
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

  const yTicks = useMemo(
    () => niceTicks(bounds.minY, bounds.maxY, 6),
    [bounds]
  );
  const xTickCount = Math.max(2, Math.min(7, Math.floor(PLOT_W / 110)));
  const xTicks = useMemo(() => {
    if (bounds.maxT === bounds.minT) return [bounds.minT];
    const out: number[] = [];
    for (let i = 0; i < xTickCount; i++) {
      out.push(bounds.minT + ((bounds.maxT - bounds.minT) * i) / (xTickCount - 1));
    }
    return out;
  }, [bounds, xTickCount]);

  const zeroY = bounds.minY < 0 && bounds.maxY > 0 ? yFor(0) : null;

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
      <div ref={containerRef} className="relative w-full">
        <svg
          width={W}
          height={H}
          viewBox={`0 0 ${W} ${H}`}
          shapeRendering="geometricPrecision"
          textRendering="geometricPrecision"
          style={{ display: "block" }}
        >
          {/* ── Gridlines horizontales (tick Y) ── */}
          {yTicks.map((v) => {
            const y = yFor(v);
            return (
              <line
                key={`g-${v}`}
                x1={PAD_LEFT}
                x2={PAD_LEFT + PLOT_W}
                y1={y}
                y2={y}
                stroke="currentColor"
                className="text-border"
                strokeOpacity={0.6}
                strokeDasharray="2 4"
                strokeWidth={1}
              />
            );
          })}

          {/* ── Línea de cero ── */}
          {zeroY !== null && (
            <line
              x1={PAD_LEFT}
              x2={PAD_LEFT + PLOT_W}
              y1={zeroY}
              y2={zeroY}
              stroke="currentColor"
              className="text-muted-foreground"
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
            stroke="currentColor"
            className="text-border"
            strokeWidth={1.25}
          />
          <line
            x1={PAD_LEFT}
            x2={PAD_LEFT + PLOT_W}
            y1={PAD_TOP + PLOT_H}
            y2={PAD_TOP + PLOT_H}
            stroke="currentColor"
            className="text-border"
            strokeWidth={1.25}
          />

          {/* ── Ticks + labels Y ── */}
          {yTicks.map((v) => {
            const y = yFor(v);
            return (
              <g key={`yt-${v}`}>
                <line
                  x1={PAD_LEFT - 5}
                  x2={PAD_LEFT}
                  y1={y}
                  y2={y}
                  stroke="currentColor"
                  className="text-muted-foreground"
                  strokeOpacity={0.7}
                  strokeWidth={1}
                />
                <text
                  x={PAD_LEFT - 10}
                  y={y}
                  textAnchor="end"
                  dominantBaseline="middle"
                  fontSize={12}
                  className="fill-muted-foreground"
                  style={{
                    fontFamily:
                      "ui-monospace, SFMono-Regular, Menlo, monospace",
                  }}
                >
                  {formatTickCurrency(v)}
                </text>
              </g>
            );
          })}

          {/* ── Ticks + labels X ── */}
          {xTicks.map((t, i) => {
            const x = xFor(t);
            return (
              <g key={`xt-${i}`}>
                <line
                  x1={x}
                  x2={x}
                  y1={PAD_TOP + PLOT_H}
                  y2={PAD_TOP + PLOT_H + 5}
                  stroke="currentColor"
                  className="text-muted-foreground"
                  strokeOpacity={0.7}
                  strokeWidth={1}
                />
                <text
                  x={x}
                  y={PAD_TOP + PLOT_H + 20}
                  textAnchor="middle"
                  fontSize={12}
                  className="fill-muted-foreground"
                >
                  {formatDateShort(t)}
                </text>
              </g>
            );
          })}

          {/* ── Etiqueta de eje Y ── */}
          <text
            x={18}
            y={PAD_TOP + PLOT_H / 2}
            transform={`rotate(-90 18 ${PAD_TOP + PLOT_H / 2})`}
            textAnchor="middle"
            fontSize={11}
            className="fill-muted-foreground"
            opacity={0.8}
          >
            Saldo (€)
          </text>

          {/* ── Líneas de cada usuario ── */}
          {visibleSeries.map((s) => {
            if (s.points.length === 0) return null;
            const d = s.points
              .map((p, i) => `${i === 0 ? "M" : "L"}${xFor(p.t).toFixed(2)},${yFor(p.balance).toFixed(2)}`)
              .join(" ");
            return (
              <path
                key={`p-${s.uid}`}
                d={d}
                fill="none"
                stroke={s.color}
                strokeWidth={2.5}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            );
          })}

          {/* ── Markers (donut) ── */}
          {visibleSeries.map((s) =>
            s.points.map((p, i) => (
              <circle
                key={`m-${s.uid}-${i}`}
                cx={xFor(p.t)}
                cy={yFor(p.balance)}
                r={4.5}
                fill={s.color}
                stroke="hsl(var(--card))"
                strokeWidth={2}
                style={{ cursor: "pointer" }}
                onMouseEnter={() =>
                  setHover({
                    sid: s.uid,
                    t: p.t,
                    balance: p.balance,
                    x: xFor(p.t),
                    y: yFor(p.balance),
                  })
                }
                onMouseLeave={() => setHover(null)}
              />
            ))
          )}

          {/* ── Tooltip ── */}
          {hover &&
            (() => {
              const s = series.find((x) => x.uid === hover.sid);
              if (!s) return null;
              const tooltipW = 190;
              const tooltipH = 50;
              let tx = hover.x - tooltipW / 2;
              let ty = hover.y - tooltipH - 14;
              tx = Math.max(4, Math.min(W - tooltipW - 4, tx));
              if (ty < 4) ty = hover.y + 14;
              return (
                <g pointerEvents="none">
                  <line
                    x1={hover.x}
                    x2={hover.x}
                    y1={PAD_TOP}
                    y2={PAD_TOP + PLOT_H}
                    stroke={s.color}
                    strokeOpacity={0.35}
                    strokeDasharray="3 4"
                    strokeWidth={1}
                  />
                  <circle
                    cx={hover.x}
                    cy={hover.y}
                    r={6.5}
                    fill={s.color}
                    fillOpacity={0.2}
                  />
                  <rect
                    x={tx}
                    y={ty}
                    width={tooltipW}
                    height={tooltipH}
                    rx={8}
                    fill="hsl(var(--popover))"
                    stroke="hsl(var(--border))"
                    style={{
                      filter:
                        "drop-shadow(0 4px 6px rgb(0 0 0 / 0.08))",
                    }}
                  />
                  <circle
                    cx={tx + 12}
                    cy={ty + 18}
                    r={4}
                    fill={s.color}
                  />
                  <text
                    x={tx + 22}
                    y={ty + 22}
                    fontSize={12}
                    fontWeight={600}
                    className="fill-popover-foreground"
                  >
                    {s.username}
                  </text>
                  <text
                    x={tx + 12}
                    y={ty + 38}
                    fontSize={11}
                    className="fill-muted-foreground"
                  >
                    {formatCurrency(hover.balance)} ·{" "}
                    {formatDateShort(hover.t)}
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
                  ? { borderColor: `${s.color}55` }
                  : undefined
              }
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
