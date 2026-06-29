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

/** Path de una barra con solo las esquinas SUPERIORES redondeadas, para que
 *  apoye limpia sobre la línea base sin redondear el pie. */
function roundedTopBar(
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): string {
  const rr = Math.max(0, Math.min(r, w / 2, h));
  return `M${x},${y + h} L${x},${y + rr} Q${x},${y} ${x + rr},${y} L${
    x + w - rr
  },${y} Q${x + w},${y} ${x + w},${y + rr} L${x + w},${y + h} Z`;
}

/** Tick values enteros para el eje Y, con un paso "bonito" (1/2/5 × 10ⁿ) que
 *  escala con la magnitud: así salen ~5-8 marcas tanto si el máximo es 8 como
 *  658 (antes con 658 ponía una marca cada 10 → decenas de números amontonados).
 *  El último tick es el máximo redondeado hacia arriba, que se usa para escalar. */
function integerYTicks(max: number): number[] {
  const top = Math.max(1, max);
  const rough = top / 5; // objetivo: ~5 marcas
  const mag = Math.pow(10, Math.floor(Math.log10(rough)));
  const norm = rough / mag;
  let step = norm >= 5 ? 5 * mag : norm >= 2 ? 2 * mag : mag;
  step = Math.max(1, Math.round(step)); // los conteos son enteros → paso mínimo 1
  const yTop = Math.ceil(top / step) * step;
  const out: number[] = [];
  for (let v = 0; v <= yTop + step / 2 && out.length < 14; v += step) {
    out.push(Math.round(v));
  }
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
          className="block max-w-full"
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
                strokeOpacity={0.4}
                strokeDasharray="2 5"
                strokeWidth={1}
              />
            );
          })}

          {/* Línea base — discreta, sin eje vertical pesado */}
          <line
            x1={PAD_LEFT}
            x2={PAD_LEFT + PLOT_W}
            y1={PAD_TOP + PLOT_H}
            y2={PAD_TOP + PLOT_H}
            stroke="currentColor"
            className="text-border"
            strokeWidth={1}
          />

          {/* Labels Y */}
          {yTicks.map((v) => {
            const y = yFor(v);
            return (
              <text
                key={`yt-${v}`}
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
            );
          })}

          {/* Degradado vertical por barra (mismo color, más vivo arriba) */}
          <defs>
            {data.map((d) => (
              <linearGradient
                key={`grad-${d.uid}`}
                id={`bar-grad-${d.uid}`}
                x1="0"
                y1="0"
                x2="0"
                y2="1"
              >
                <stop offset="0%" stopColor={d.color} stopOpacity={1} />
                <stop offset="100%" stopColor={d.color} stopOpacity={0.6} />
              </linearGradient>
            ))}
          </defs>

          {/* Barras por jugador */}
          {data.map((d, idx) => {
            const cx = PAD_LEFT + (idx + 0.5) * cellW;
            const bx = cx - barW / 2;
            const h = (d.count / Math.max(1, yTop)) * PLOT_H;
            const by = PAD_TOP + PLOT_H - h;
            const r = Math.min(6, barW / 2);
            return (
              <g key={`bar-${d.uid}`}>
                {d.count > 0 && (
                  <path
                    d={roundedTopBar(bx, by, barW, Math.max(2, h), r)}
                    fill={`url(#bar-grad-${d.uid})`}
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
                  </path>
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
