"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  DAY_MS,
  pickChartColor,
  todayStartMs,
} from "@/components/ranking/chart-palette";
import { cn } from "@/lib/utils";
import type { AppUser, Bet } from "@/types/domain";

interface Props {
  users: AppUser[];
  bets: Bet[];
  /** Días que se muestran (a partir de hoy). Por defecto 7. */
  daysWindow?: number;
}

interface DayBucket {
  dayMs: number;
  byUser: Map<string, number>;
  total: number;
}

function startOfDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function formatDayShort(ms: number): string {
  return new Date(ms).toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "short",
  });
}

/** Tick values enteros para el eje Y (apuestas/día). */
function integerYTicks(max: number): number[] {
  const top = Math.max(1, max);
  const step = top <= 4 ? 1 : top <= 10 ? 2 : top <= 25 ? 5 : 10;
  const out: number[] = [];
  for (let v = 0; v <= top; v += step) out.push(v);
  if (out[out.length - 1] !== top) out.push(top);
  return out;
}

export function BetsBarChart({ users, bets, daysWindow = 7 }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(500);
  const [hover, setHover] = useState<
    | { dayMs: number; uid: string; count: number; x: number; y: number }
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

  const colorByUid = useMemo(() => {
    const map: Record<string, string> = {};
    users.forEach((u, i) => (map[u.uid] = pickChartColor(i)));
    return map;
  }, [users]);

  const usernameByUid = useMemo(() => {
    const map: Record<string, string> = {};
    for (const u of users) map[u.uid] = u.username;
    return map;
  }, [users]);

  const startMs = useMemo(() => todayStartMs(), []);

  // Determina el rango de días a mostrar: desde hoy hasta el último día
  // con apuestas, o como mínimo `daysWindow` días.
  const days: DayBucket[] = useMemo(() => {
    const latestBetMs = bets.reduce(
      (acc, b) => Math.max(acc, b.createdAt.toMillis()),
      startMs
    );
    const endDay = Math.max(startOfDay(latestBetMs), startMs + (daysWindow - 1) * DAY_MS);
    const buckets: DayBucket[] = [];
    for (let d = startMs; d <= endDay; d += DAY_MS) {
      buckets.push({ dayMs: d, byUser: new Map(), total: 0 });
    }
    for (const b of bets) {
      const t = b.createdAt.toMillis();
      if (t < startMs) continue;
      const idx = Math.floor((t - startMs) / DAY_MS);
      if (idx < 0 || idx >= buckets.length) continue;
      const bucket = buckets[idx];
      bucket.byUser.set(b.userId, (bucket.byUser.get(b.userId) ?? 0) + 1);
      bucket.total += 1;
    }
    return buckets;
  }, [bets, startMs, daysWindow]);

  const yMax = Math.max(4, ...days.map((d) => d.total));
  const yTicks = useMemo(() => integerYTicks(yMax), [yMax]);
  const yTop = yTicks[yTicks.length - 1] ?? yMax;

  const W = width;
  const H = 360;
  const PAD_LEFT = 48;
  const PAD_RIGHT = 18;
  const PAD_TOP = 20;
  const PAD_BOT = 40;
  const PLOT_W = W - PAD_LEFT - PAD_RIGHT;
  const PLOT_H = H - PAD_TOP - PAD_BOT;

  const cellW = days.length > 0 ? PLOT_W / days.length : PLOT_W;
  const barW = Math.max(8, Math.min(48, cellW * 0.62));

  const yFor = (v: number) =>
    PAD_TOP + PLOT_H - (v / Math.max(1, yTop)) * PLOT_H;

  // Solo etiquetamos un subconjunto de días en el eje X cuando hay muchos
  // (cada 1, 2 o 3 días) para que no se solapen.
  const xLabelEvery = days.length <= 7 ? 1 : days.length <= 14 ? 2 : 3;

  if (users.length === 0) {
    return (
      <div className="px-6 py-8 text-center text-sm text-muted-foreground">
        No hay usuarios.
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
          {/* Grid Y */}
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

          {/* Ejes */}
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

          {/* Labels Y */}
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
                  {v}
                </text>
              </g>
            );
          })}

          {/* Barras apiladas por día */}
          {days.map((day, idx) => {
            const cx = PAD_LEFT + (idx + 0.5) * cellW;
            const bx = cx - barW / 2;
            let yCursor = PAD_TOP + PLOT_H;
            const segments = users
              .map((u) => ({
                uid: u.uid,
                count: day.byUser.get(u.uid) ?? 0,
              }))
              .filter((s) => s.count > 0);

            return (
              <g key={`day-${day.dayMs}`}>
                {segments.map((seg) => {
                  const h = (seg.count / Math.max(1, yTop)) * PLOT_H;
                  yCursor -= h;
                  return (
                    <rect
                      key={`seg-${day.dayMs}-${seg.uid}`}
                      x={bx}
                      y={yCursor}
                      width={barW}
                      height={Math.max(2, h)}
                      fill={colorByUid[seg.uid]}
                      rx={3}
                      style={{ cursor: "pointer" }}
                      onMouseEnter={() =>
                        setHover({
                          dayMs: day.dayMs,
                          uid: seg.uid,
                          count: seg.count,
                          x: cx,
                          y: yCursor + h / 2,
                        })
                      }
                      onMouseLeave={() => setHover(null)}
                    />
                  );
                })}
                {/* Total encima de la barra */}
                {day.total > 0 && (
                  <text
                    x={cx}
                    y={yCursor - 6}
                    textAnchor="middle"
                    fontSize={10}
                    fontWeight={600}
                    className="fill-foreground"
                  >
                    {day.total}
                  </text>
                )}
              </g>
            );
          })}

          {/* Labels X (días) */}
          {days.map((day, idx) => {
            if (idx % xLabelEvery !== 0 && idx !== days.length - 1) return null;
            const cx = PAD_LEFT + (idx + 0.5) * cellW;
            return (
              <text
                key={`xl-${day.dayMs}`}
                x={cx}
                y={PAD_TOP + PLOT_H + 18}
                textAnchor="middle"
                fontSize={11}
                className="fill-muted-foreground"
              >
                {formatDayShort(day.dayMs)}
              </text>
            );
          })}

          {/* Tooltip */}
          {hover &&
            (() => {
              const tooltipW = 180;
              const tooltipH = 48;
              let tx = hover.x - tooltipW / 2;
              let ty = hover.y - tooltipH - 12;
              tx = Math.max(4, Math.min(W - tooltipW - 4, tx));
              if (ty < 4) ty = hover.y + 14;
              const color = colorByUid[hover.uid];
              const name = usernameByUid[hover.uid] ?? "—";
              return (
                <g pointerEvents="none">
                  <rect
                    x={tx}
                    y={ty}
                    width={tooltipW}
                    height={tooltipH}
                    rx={8}
                    fill="hsl(var(--popover))"
                    stroke="hsl(var(--border))"
                    style={{
                      filter: "drop-shadow(0 4px 6px rgb(0 0 0 / 0.08))",
                    }}
                  />
                  <circle cx={tx + 12} cy={ty + 18} r={4} fill={color} />
                  <text
                    x={tx + 22}
                    y={ty + 22}
                    fontSize={12}
                    fontWeight={600}
                    className="fill-popover-foreground"
                  >
                    {name}
                  </text>
                  <text
                    x={tx + 12}
                    y={ty + 38}
                    fontSize={11}
                    className="fill-muted-foreground"
                  >
                    {hover.count} apuesta{hover.count === 1 ? "" : "s"} ·{" "}
                    {formatDayShort(hover.dayMs)}
                  </text>
                </g>
              );
            })()}
        </svg>
      </div>

      <div className="flex flex-wrap gap-2">
        {users.map((u, i) => (
          <span
            key={u.uid}
            className={cn(
              "flex items-center gap-2 rounded-full border bg-card px-2.5 py-1 text-xs"
            )}
            style={{ borderColor: `${pickChartColor(i)}55` }}
          >
            <span
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: pickChartColor(i) }}
            />
            <span className="font-medium">{u.username}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
