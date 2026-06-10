"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DAY_MS,
  pickChartColor,
  todayStartMs,
} from "@/components/ranking/chart-palette";
import { ROUTES } from "@/lib/constants";
import type { AppUser, Bet } from "@/types/domain";

interface Props {
  users: AppUser[];
  bets: Bet[];
}

const TOTAL = "total";

function startOfDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function formatDayLong(ms: number): string {
  return new Date(ms).toLocaleDateString("es-ES", {
    weekday: "short",
    day: "2-digit",
    month: "short",
  });
}

/** Tick values enteros para el eje Y. */
function integerYTicks(max: number): number[] {
  const top = Math.max(1, max);
  const step = top <= 4 ? 1 : top <= 10 ? 2 : top <= 25 ? 5 : 10;
  const out: number[] = [];
  for (let v = 0; v <= top; v += step) out.push(v);
  if (out[out.length - 1] !== top) out.push(top);
  return out;
}

export function BetsBarChart({ users, bets }: Props) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(500);
  const [selected, setSelected] = useState<string>(TOTAL);
  const [hover, setHover] = useState<
    | { uid: string; count: number; x: number; y: number }
    | null
  >(null);

  function navigateToFeedFor(uid: string) {
    router.push(`${ROUTES.feed}?user=${encodeURIComponent(uid)}`);
  }

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    // Mínimo 280 (antes 320) para que no se desborde en móviles estrechos.
    const update = () => setWidth(Math.max(280, Math.floor(el.clientWidth)));
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

  // Días con actividad + hoy. Más reciente primero.
  const dayOptions = useMemo(() => {
    const set = new Set<number>();
    set.add(todayStartMs());
    for (const b of bets) set.add(startOfDay(b.createdAt.toMillis()));
    return [...set].sort((a, b) => b - a);
  }, [bets]);

  // Reset selección si el día seleccionado ya no existe
  useEffect(() => {
    if (selected === TOTAL) return;
    const t = Number(selected);
    if (!dayOptions.includes(t)) setSelected(TOTAL);
  }, [dayOptions, selected]);

  const data = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const u of users) counts[u.uid] = 0;

    if (selected === TOTAL) {
      for (const b of bets) {
        if (counts[b.userId] !== undefined) counts[b.userId] += 1;
      }
    } else {
      const dayStart = Number(selected);
      const dayEnd = dayStart + DAY_MS;
      for (const b of bets) {
        const t = b.createdAt.toMillis();
        if (t >= dayStart && t < dayEnd && counts[b.userId] !== undefined) {
          counts[b.userId] += 1;
        }
      }
    }

    // Una barra por jugador, ordenadas de más a menos apuestas
    return users
      .map((u, i) => ({
        uid: u.uid,
        username: u.username,
        color: pickChartColor(i),
        count: counts[u.uid] ?? 0,
      }))
      .sort((a, b) => b.count - a.count);
  }, [users, bets, selected]);

  const totalForLabel =
    selected === TOTAL
      ? "Total"
      : formatDayLong(Number(selected));

  const yMax = Math.max(4, ...data.map((d) => d.count));
  const yTicks = useMemo(() => integerYTicks(yMax), [yMax]);
  const yTop = yTicks[yTicks.length - 1] ?? yMax;

  const W = width;
  const H = 360;
  const PAD_LEFT = 44;
  const PAD_RIGHT = 18;
  const PAD_TOP = 20;
  const PAD_BOT = 38;
  const PLOT_W = W - PAD_LEFT - PAD_RIGHT;
  const PLOT_H = H - PAD_TOP - PAD_BOT;

  const cellW = data.length > 0 ? PLOT_W / data.length : PLOT_W;
  const barW = Math.max(10, Math.min(50, cellW * 0.62));

  const yFor = (v: number) =>
    PAD_TOP + PLOT_H - (v / Math.max(1, yTop)) * PLOT_H;

  if (users.length === 0) {
    return (
      <div className="px-6 py-8 text-center text-sm text-muted-foreground">
        No hay usuarios.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Selector de día */}
      <div className="flex items-center gap-2 text-sm">
        <span className="text-muted-foreground">Mostrar:</span>
        <Select value={selected} onValueChange={setSelected}>
          <SelectTrigger className="h-8 w-[200px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TOTAL}>Total (todas las apuestas)</SelectItem>
            {dayOptions.map((t) => (
              <SelectItem key={t} value={String(t)}>
                {formatDayLong(t)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

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

          {/* Barras por jugador */}
          {data.map((d, idx) => {
            const cx = PAD_LEFT + (idx + 0.5) * cellW;
            const bx = cx - barW / 2;
            const h = (d.count / Math.max(1, yTop)) * PLOT_H;
            const by = PAD_TOP + PLOT_H - h;
            return (
              <g key={`bar-${d.uid}`}>
                {d.count > 0 && (
                  <rect
                    x={bx}
                    y={by}
                    width={barW}
                    height={Math.max(2, h)}
                    fill={d.color}
                    rx={4}
                    style={{ cursor: "pointer" }}
                    onMouseEnter={() =>
                      setHover({
                        uid: d.uid,
                        count: d.count,
                        x: cx,
                        y: by + h / 2,
                      })
                    }
                    onMouseLeave={() => setHover(null)}
                    onClick={() => navigateToFeedFor(d.uid)}
                  >
                    <title>{`Ver apuestas de ${d.username} en el feed`}</title>
                  </rect>
                )}
                {d.count === 0 && (
                  <rect
                    x={bx}
                    y={PAD_TOP + PLOT_H - 3}
                    width={barW}
                    height={3}
                    fill={d.color}
                    fillOpacity={0.25}
                    rx={1.5}
                    style={{ cursor: "pointer" }}
                    onClick={() => navigateToFeedFor(d.uid)}
                  >
                    <title>{`Ver apuestas de ${d.username} en el feed`}</title>
                  </rect>
                )}
                {d.count > 0 && (
                  <text
                    x={cx}
                    y={by - 6}
                    textAnchor="middle"
                    fontSize={11}
                    fontWeight={600}
                    className="fill-foreground"
                  >
                    {d.count}
                  </text>
                )}
              </g>
            );
          })}

          {/* Tooltip */}
          {hover &&
            (() => {
              const d = data.find((x) => x.uid === hover.uid);
              if (!d) return null;
              const tooltipW = 190;
              const tooltipH = 48;
              let tx = hover.x - tooltipW / 2;
              let ty = hover.y - tooltipH - 12;
              tx = Math.max(4, Math.min(W - tooltipW - 4, tx));
              if (ty < 4) ty = hover.y + 14;
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
                  <circle cx={tx + 12} cy={ty + 18} r={4} fill={d.color} />
                  <text
                    x={tx + 22}
                    y={ty + 22}
                    fontSize={12}
                    fontWeight={600}
                    className="fill-popover-foreground"
                  >
                    {d.username}
                  </text>
                  <text
                    x={tx + 12}
                    y={ty + 38}
                    fontSize={11}
                    className="fill-muted-foreground"
                  >
                    {d.count} apuesta{d.count === 1 ? "" : "s"} · {totalForLabel}
                  </text>
                </g>
              );
            })()}
        </svg>
      </div>

      {/* Leyenda — mismos chips que en la gráfica de líneas */}
      <div className="flex flex-wrap gap-2">
        {data.map((d) => (
          <button
            key={d.uid}
            type="button"
            onClick={() => navigateToFeedFor(d.uid)}
            className="flex items-center gap-2 rounded-full border bg-card px-2.5 py-1 text-xs transition-colors hover:bg-accent/40"
            style={{ borderColor: `${d.color}55` }}
            title={`Ver apuestas de ${d.username} en el feed`}
          >
            <span
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: d.color }}
            />
            <span className="font-medium">{d.username}</span>
            <span className="font-mono text-muted-foreground">
              {d.count}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
