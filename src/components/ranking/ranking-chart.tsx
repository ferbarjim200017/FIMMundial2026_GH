"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { cn, formatCurrency } from "@/lib/utils";
import {
  DAY_MS,
  pickChartColor,
  todayStartMs,
} from "@/components/ranking/chart-palette";
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

/**
 * Serie temporal de saldo de un usuario partiendo de hoy.
 *
 * - Punto inicial: (hoy 00:00, currentBalance) — el saldo del usuario a
 *   día de hoy es el ancla de todas las líneas.
 * - Puntos siguientes: cada apuesta liquidada (won/lost/cashout) desde
 *   hoy en adelante, acumulando profit.
 * - Si no hay apuestas desde hoy, añadimos un punto en "ahora" para que
 *   la línea sea visible (plana).
 */
function buildSeries(user: AppUser, bets: Bet[], startMs: number, nowMs: number): Series["points"] {
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
    .filter((b) => b.ms >= startMs)
    .sort((a, b) => a.ms - b.ms);

  const initial = user.currentBalance ?? user.initialBalance ?? 0;
  const points: Series["points"] = [{ t: startMs, balance: initial }];
  let acc = initial;
  for (const s of settled) {
    acc += s.profit;
    points.push({ t: s.ms, balance: acc });
  }
  if (points.length === 1) {
    points.push({ t: Math.max(nowMs, startMs + DAY_MS), balance: acc });
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
  const [width, setWidth] = useState(500);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [hover, setHover] = useState<
    | { sid: string; t: number; balance: number; x: number; y: number }
    | null
  >(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => setWidth(Math.max(320, Math.floor(el.clientWidth)));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const startMs = useMemo(() => todayStartMs(), []);
  const nowMs = Date.now();

  const series: Series[] = useMemo(() => {
    return users.map((u, i) => ({
      uid: u.uid,
      username: u.username,
      color: pickChartColor(i),
      points: buildSeries(u, bets, startMs, nowMs),
    }));
  }, [users, bets, startMs, nowMs]);

  const visibleSeries = series.filter((s) => !hidden.has(s.uid));

  const bounds = useMemo(() => {
    let minY = Infinity;
    let maxY = -Infinity;
    let maxT = startMs + DAY_MS;
    for (const s of series) {
      for (const p of s.points) {
        if (p.balance < minY) minY = p.balance;
        if (p.balance > maxY) maxY = p.balance;
        if (p.t > maxT) maxT = p.t;
      }
    }
    if (!Number.isFinite(minY)) {
      minY = 0;
      maxY = 100;
    }
    if (minY === maxY) {
      minY -= 50;
      maxY += 50;
    }
    const ySpan = Math.max(1, maxY - minY);
    const pad = ySpan * 0.12;
    return {
      minT: startMs,
      maxT: Math.max(maxT, startMs + DAY_MS),
      minY: minY - pad,
      maxY: maxY + pad,
    };
  }, [series, startMs]);

  const W = width;
  const H = 360;
  const PAD_LEFT = 64;
  const PAD_RIGHT = 18;
  const PAD_TOP = 20;
  const PAD_BOT = 40;
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
    () => niceTicks(bounds.minY, bounds.maxY, 5),
    [bounds]
  );
  const xTickCount = Math.max(2, Math.min(5, Math.floor(PLOT_W / 90)));
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
    <div className="space-y-3">
      <div ref={containerRef} className="relative w-full">
        <svg
          width={W}
          height={H}
          viewBox={`0 0 ${W} ${H}`}
          shapeRendering="geometricPrecision"
          textRendering="geometricPrecision"
          style={{ display: "block" }}
        >
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
                strokeOpacity={0.55}
                strokeDasharray="2 4"
                strokeWidth={1}
              />
            );
          })}

          {zeroY !== null && (
            <line
              x1={PAD_LEFT}
              x2={PAD_LEFT + PLOT_W}
              y1={zeroY}
              y2={zeroY}
              stroke="currentColor"
              className="text-muted-foreground"
              strokeOpacity={0.6}
              strokeWidth={1}
            />
          )}

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

          {yTicks.map((v) => {
            const y = yFor(v);
            return (
              <g key={`yt-${v}`}>
                <line
                  x1={PAD_LEFT - 4}
                  x2={PAD_LEFT}
                  y1={y}
                  y2={y}
                  stroke="currentColor"
                  className="text-muted-foreground"
                  strokeOpacity={0.7}
                  strokeWidth={1}
                />
                <text
                  x={PAD_LEFT - 8}
                  y={y}
                  textAnchor="end"
                  dominantBaseline="middle"
                  fontSize={11}
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

          {xTicks.map((t, i) => {
            const x = xFor(t);
            return (
              <g key={`xt-${i}`}>
                <line
                  x1={x}
                  x2={x}
                  y1={PAD_TOP + PLOT_H}
                  y2={PAD_TOP + PLOT_H + 4}
                  stroke="currentColor"
                  className="text-muted-foreground"
                  strokeOpacity={0.7}
                  strokeWidth={1}
                />
                <text
                  x={x}
                  y={PAD_TOP + PLOT_H + 18}
                  textAnchor="middle"
                  fontSize={11}
                  className="fill-muted-foreground"
                >
                  {formatDateShort(t)}
                </text>
              </g>
            );
          })}

          {visibleSeries.map((s) => {
            if (s.points.length === 0) return null;
            const d = s.points
              .map(
                (p, i) =>
                  `${i === 0 ? "M" : "L"}${xFor(p.t).toFixed(2)},${yFor(p.balance).toFixed(2)}`
              )
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

          {visibleSeries.map((s) =>
            s.points.map((p, i) => (
              <circle
                key={`m-${s.uid}-${i}`}
                cx={xFor(p.t)}
                cy={yFor(p.balance)}
                r={4}
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

          {hover &&
            (() => {
              const s = series.find((x) => x.uid === hover.sid);
              if (!s) return null;
              const tooltipW = 180;
              const tooltipH = 48;
              let tx = hover.x - tooltipW / 2;
              let ty = hover.y - tooltipH - 12;
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
                    strokeOpacity={0.3}
                    strokeDasharray="3 4"
                    strokeWidth={1}
                  />
                  <rect
                    x={tx}
                    y={ty}
                    width={tooltipW}
                    height={tooltipH}
                    rx={8}
                    fill="hsl(var(--popover))"
                    stroke="hsl(var(--border))"
                    style={{ filter: "drop-shadow(0 4px 6px rgb(0 0 0 / 0.08))" }}
                  />
                  <circle cx={tx + 12} cy={ty + 18} r={4} fill={s.color} />
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

      <div className="flex flex-wrap gap-2">
        {series.map((s) => {
          const isHidden = hidden.has(s.uid);
          return (
            <button
              key={s.uid}
              type="button"
              onClick={() => toggle(s.uid)}
              className={cn(
                "flex items-center gap-2 rounded-full border bg-card px-2.5 py-1 text-xs transition-all hover:shadow-sm",
                isHidden && "opacity-40 grayscale"
              )}
              style={!isHidden ? { borderColor: `${s.color}55` } : undefined}
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
