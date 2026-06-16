"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { cn, formatCurrency } from "@/lib/utils";
import { Input } from "@/components/ui/input";
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
} from "@/components/ranking/chart-palette";
import type { AppUser, Bet, Match } from "@/types/domain";

type RangeKey = "all" | "30" | "7" | "custom";

/** ms → valor para un <input type="datetime-local"> en hora local. */
function toLocalInput(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

// El Mundial 2026 arranca el 11 de junio. La gráfica de "todo el historial"
// empieza ese día (no antes), aunque existan apuestas previas (p. ej. de
// pruebas). Las ventanas de 7/30 días tampoco bajan de esta fecha.
const TOURNAMENT_START_MS = new Date(2026, 5, 11, 0, 0, 0, 0).getTime();

interface Props {
  users: AppUser[];
  bets: Bet[];
  /** Partidos del torneo, para marcar con puntos los del periodo elegido. */
  matches?: Match[];
}

interface MatchMarker {
  id: string;
  t: number;
  label: string;
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
 * Serie temporal de beneficio/pérdida acumulado de un usuario dentro del
 * periodo seleccionado. NO incluye el saldo de la banca: solo el delta
 * acumulado por apuestas liquidadas en ese periodo.
 *
 * - Punto inicial: (startMs, 0) — todos arrancan en 0 al inicio del periodo.
 * - Puntos siguientes: cada apuesta liquidada (won/lost/cashout) dentro del
 *   periodo, acumulando profit.
 * - Se prolonga hasta "ahora" con el balance acumulado para reflejar el total.
 */
function buildSeries(
  user: AppUser,
  bets: Bet[],
  startMs: number,
  endMs: number
): Series["points"] {
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
    .filter((b) => b.ms >= startMs && b.ms <= endMs)
    .sort((a, b) => a.ms - b.ms);

  const points: Series["points"] = [{ t: startMs, balance: 0 }];
  let acc = 0;
  for (const s of settled) {
    acc += s.profit;
    points.push({ t: s.ms, balance: acc });
  }
  // Prolongamos la línea hasta el fin de la ventana con el balance acumulado,
  // para que refleje el total aunque la última apuesta del periodo sea antigua
  // (o no haya ninguna: línea plana en 0).
  const endT = Math.max(endMs, startMs + DAY_MS);
  const lastT = points[points.length - 1].t;
  if (lastT < endT) points.push({ t: endT, balance: acc });
  return points;
}

/**
 * Spline cúbico monótono (Fritsch–Carlson) sobre puntos ya proyectados a
 * píxeles, con x estrictamente creciente. Da curvas suaves y "vistosas" pero
 * SIN sobrepasos: la línea nunca se sale del rango de los datos, así que no
 * inventa subidas/bajadas que no ocurrieron. Sustituye a las líneas quebradas
 * con un punto en cada dato (que ensuciaban mucho la gráfica).
 */
function monotonePath(pts: { x: number; y: number }[]): string {
  const n = pts.length;
  if (n === 0) return "";
  if (n < 3) {
    return pts
      .map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(2)},${p.y.toFixed(2)}`)
      .join(" ");
  }
  const dx: number[] = [];
  const m: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    dx[i] = pts[i + 1].x - pts[i].x;
    m[i] = (pts[i + 1].y - pts[i].y) / dx[i];
  }
  const t: number[] = [];
  t[0] = m[0];
  for (let i = 1; i < n - 1; i++) {
    if (m[i - 1] * m[i] <= 0) {
      t[i] = 0;
    } else {
      const w1 = 2 * dx[i] + dx[i - 1];
      const w2 = dx[i] + 2 * dx[i - 1];
      t[i] = (w1 + w2) / (w1 / m[i - 1] + w2 / m[i]);
    }
  }
  t[n - 1] = m[n - 2];
  let d = `M${pts[0].x.toFixed(2)},${pts[0].y.toFixed(2)}`;
  for (let i = 0; i < n - 1; i++) {
    const c1x = pts[i].x + dx[i] / 3;
    const c1y = pts[i].y + (t[i] * dx[i]) / 3;
    const c2x = pts[i + 1].x - dx[i] / 3;
    const c2y = pts[i + 1].y - (t[i + 1] * dx[i]) / 3;
    d += `C${c1x.toFixed(2)},${c1y.toFixed(2)} ${c2x.toFixed(2)},${c2y.toFixed(2)} ${pts[i + 1].x.toFixed(2)},${pts[i + 1].y.toFixed(2)}`;
  }
  return d;
}

function formatTickCurrency(v: number): string {
  const sign = v > 0 ? "+" : "";
  if (Math.abs(v) >= 1000) {
    const k = v / 1000;
    return `${sign}${k % 1 === 0 ? k.toFixed(0) : k.toFixed(1)}k €`;
  }
  return `${sign}${Math.round(v)} €`;
}

function formatDateShort(ms: number): string {
  return new Date(ms).toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "short",
  });
}

function formatMarkerDateTime(ms: number): string {
  return new Date(ms).toLocaleString("es-ES", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function RankingChart({ users, bets, matches = [] }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(500);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  // Serie resaltada (hover sobre la línea o sobre su chip de leyenda). Atenúa
  // las demás y dibuja el área degradada bajo la destacada.
  const [active, setActive] = useState<string | null>(null);
  const [hover, setHover] = useState<
    | { sid: string; t: number; balance: number; x: number; y: number }
    | null
  >(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    // Mínimo 280 (antes 320) para que en móviles estrechos no se desborde
    // del contenedor; en PC el contenedor es mucho más ancho, sin efecto.
    const update = () => setWidth(Math.max(280, Math.floor(el.clientWidth)));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Periodo mostrado. Por defecto "all" = acumulado de TODO el historial.
  const [range, setRange] = useState<RangeKey>("all");

  // Rango personalizado (range === "custom"): el usuario elige fecha-hora de
  // inicio y fin con precisión de minutos.
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");

  // Fijamos "ahora" al montar el componente. Antes era `Date.now()` a nivel de
  // render, lo que invalidaba el useMemo de `series` en cada repintado y
  // recalculaba todas las series sin necesidad. Memoizarlo da una gráfica
  // estable (idéntica en pantalla) y evita ese recálculo.
  const nowMs = useMemo(() => Date.now(), []);

  // Al pasar a "personalizado" por primera vez, precargamos una ventana de las
  // últimas 24 h como punto de partida cómodo.
  useEffect(() => {
    if (range === "custom" && !customStart && !customEnd) {
      setCustomStart(toLocalInput(nowMs - DAY_MS));
      setCustomEnd(toLocalInput(nowMs));
    }
  }, [range, customStart, customEnd, nowMs]);

  // Inicio del periodo:
  //  - "all": desde la PRIMERA apuesta liquidada del torneo (>= 11 jun), para
  //    que la línea no arranque con un tramo plano largo. Suelo en el 11 de
  //    junio para ignorar apuestas previas al Mundial.
  //  - "30"/"7": ventana móvil de los últimos N días, sin bajar del 11 de junio.
  //  - "custom": exactamente la fecha-hora de inicio elegida.
  const startMs = useMemo(() => {
    if (range === "custom") {
      return customStart ? new Date(customStart).getTime() : nowMs - DAY_MS;
    }
    if (range === "7") return Math.max(nowMs - 7 * DAY_MS, TOURNAMENT_START_MS);
    if (range === "30") return Math.max(nowMs - 30 * DAY_MS, TOURNAMENT_START_MS);
    let earliest = Infinity;
    for (const b of bets) {
      if (b.status !== "won" && b.status !== "lost" && b.status !== "cashout") {
        continue;
      }
      const ms = (b.settledAt ?? b.createdAt).toMillis();
      if (ms >= TOURNAMENT_START_MS && ms < earliest) earliest = ms;
    }
    return Number.isFinite(earliest) ? earliest : TOURNAMENT_START_MS;
  }, [range, nowMs, bets, customStart]);

  // Fin del periodo: "ahora" salvo en "custom", donde es la fecha-hora elegida.
  const endMs = useMemo(() => {
    if (range === "custom" && customEnd) {
      const e = new Date(customEnd).getTime();
      return e > startMs ? e : startMs + DAY_MS;
    }
    return nowMs;
  }, [range, customEnd, nowMs, startMs]);

  const series: Series[] = useMemo(() => {
    return users.map((u, i) => ({
      uid: u.uid,
      username: u.username,
      color: pickChartColor(i),
      points: buildSeries(u, bets, startMs, endMs),
    }));
  }, [users, bets, startMs, endMs]);

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

  // Partidos a marcar con un punto en el eje temporal. Solo en ventanas
  // acotadas ("7 días" y "personalizado") para no saturar la gráfica de "todo
  // el historial". Se muestran los que caen dentro del periodo visible.
  const matchMarkers = useMemo<MatchMarker[]>(() => {
    if (range !== "custom" && range !== "7") return [];
    return matches
      .map((m) => ({
        id: m.id,
        t: m.kickoffUtc.toMillis(),
        label: `${m.homeLabel} vs ${m.awayLabel}`,
      }))
      .filter((m) => m.t >= bounds.minT && m.t <= bounds.maxT)
      .sort((a, b) => a.t - b.t);
  }, [matches, range, bounds]);

  const W = width;
  const H = 360;
  const PAD_LEFT = 64;
  // Más aire a la derecha: ahí van el punto final y la etiqueta del total.
  const PAD_RIGHT = 58;
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
  const baseY = PAD_TOP + PLOT_H;

  // Proyección a píxeles + deduplicado de puntos con la misma x (dos apuestas
  // liquidadas en el mismo instante romperían el spline monótono con dx=0).
  function pixelPoints(s: Series): { x: number; y: number }[] {
    const out: { x: number; y: number }[] = [];
    for (const p of s.points) {
      const x = xFor(p.t);
      if (out.length && Math.abs(out[out.length - 1].x - x) < 0.01) {
        out[out.length - 1] = { x, y: yFor(p.balance) };
      } else {
        out.push({ x, y: yFor(p.balance) });
      }
    }
    return out;
  }

  // Etiquetas del total al final de cada línea visible, con anticolisión
  // vertical (si dos finales quedan muy juntos, se separan un mínimo).
  const endLabels = useMemo(() => {
    const items = visibleSeries
      .map((s) => {
        const last = s.points[s.points.length - 1];
        return {
          uid: s.uid,
          color: s.color,
          value: last.balance,
          x: xFor(last.t),
          y: yFor(last.balance),
        };
      })
      .sort((a, b) => a.y - b.y);
    const GAP = 15;
    for (let i = 1; i < items.length; i++) {
      if (items[i].y - items[i - 1].y < GAP) {
        items[i].y = items[i - 1].y + GAP;
      }
    }
    const maxYpx = PAD_TOP + PLOT_H;
    for (let i = items.length - 1; i > 0; i--) {
      if (items[i].y > maxYpx) items[i].y = maxYpx;
      if (items[i].y - items[i - 1].y < GAP) items[i - 1].y = items[i].y - GAP;
    }
    return items;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleSeries, bounds, width]);

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

  const activeSeries =
    active && !hidden.has(active)
      ? visibleSeries.find((s) => s.uid === active) ?? null
      : null;

  return (
    <div className="space-y-3">
      {/* Selector de periodo */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">Periodo:</span>
          <Select value={range} onValueChange={(v) => setRange(v as RangeKey)}>
            <SelectTrigger className="h-8 w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todo el historial</SelectItem>
              <SelectItem value="30">Últimos 30 días</SelectItem>
              <SelectItem value="7">Últimos 7 días</SelectItem>
              <SelectItem value="custom">Personalizado…</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {range === "custom" && (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <label htmlFor="rc-start" className="text-muted-foreground">
              Desde
            </label>
            <Input
              id="rc-start"
              type="datetime-local"
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
              className="h-8 w-[210px]"
            />
            <label htmlFor="rc-end" className="text-muted-foreground">
              Hasta
            </label>
            <Input
              id="rc-end"
              type="datetime-local"
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
              className="h-8 w-[210px]"
            />
          </div>
        )}

        {matchMarkers.length > 0 && (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-primary" />
            {matchMarkers.length}{" "}
            {matchMarkers.length === 1 ? "partido" : "partidos"} en el periodo
            (pasa el ratón por cada punto para ver cuál)
          </p>
        )}
      </div>

      <div ref={containerRef} className="relative w-full">
        <svg
          width={W}
          height={H}
          viewBox={`0 0 ${W} ${H}`}
          shapeRendering="geometricPrecision"
          textRendering="geometricPrecision"
          className="block max-w-full"
          onClick={() => setHover(null)}
          onMouseLeave={() => {
            setHover(null);
            setActive(null);
          }}
        >
          {activeSeries && (
            <defs>
              <linearGradient id="ranking-area" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={activeSeries.color} stopOpacity={0.26} />
                <stop offset="100%" stopColor={activeSeries.color} stopOpacity={0} />
              </linearGradient>
            </defs>
          )}

          {/* Rejilla horizontal — fina y discreta */}
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

          {/* Línea del 0 € — referencia destacada */}
          {zeroY !== null && (
            <line
              x1={PAD_LEFT}
              x2={PAD_LEFT + PLOT_W}
              y1={zeroY}
              y2={zeroY}
              stroke="currentColor"
              className="text-muted-foreground"
              strokeOpacity={0.5}
              strokeWidth={1.25}
            />
          )}

          {/* Eje X discreto (sin eje Y vertical, para aligerar) */}
          <line
            x1={PAD_LEFT}
            x2={PAD_LEFT + PLOT_W}
            y1={baseY}
            y2={baseY}
            stroke="currentColor"
            className="text-border"
            strokeWidth={1}
          />

          {yTicks.map((v) => {
            const y = yFor(v);
            return (
              <text
                key={`yt-${v}`}
                x={PAD_LEFT - 10}
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
            );
          })}

          {xTicks.map((t, i) => {
            const x = xFor(t);
            return (
              <text
                key={`xt-${i}`}
                x={x}
                y={baseY + 18}
                textAnchor="middle"
                fontSize={11}
                className="fill-muted-foreground"
              >
                {formatDateShort(t)}
              </text>
            );
          })}

          {/* Puntos de los partidos del periodo (línea guía tenue + punto en el
              eje, con tooltip nativo al pasar el ratón). */}
          {matchMarkers.map((mk) => {
            const x = xFor(mk.t);
            return (
              <g key={`mk-${mk.id}`} className="text-primary">
                <line
                  x1={x}
                  x2={x}
                  y1={PAD_TOP}
                  y2={baseY}
                  stroke="currentColor"
                  strokeOpacity={0.12}
                  strokeWidth={1}
                />
                <circle
                  cx={x}
                  cy={baseY}
                  r={3.5}
                  className="fill-primary"
                  stroke="hsl(var(--card))"
                  strokeWidth={1.5}
                />
                <title>{`${mk.label} · ${formatMarkerDateTime(mk.t)}`}</title>
              </g>
            );
          })}

          {/* Área degradada bajo la serie resaltada */}
          {activeSeries &&
            (() => {
              const px = pixelPoints(activeSeries);
              if (px.length < 2) return null;
              const d =
                monotonePath(px) +
                ` L${px[px.length - 1].x.toFixed(2)},${baseY.toFixed(2)}` +
                ` L${px[0].x.toFixed(2)},${baseY.toFixed(2)} Z`;
              return <path d={d} fill="url(#ranking-area)" stroke="none" />;
            })()}

          {/* Líneas (curvas suaves, sin puntos intermedios) */}
          {visibleSeries.map((s) => {
            const px = pixelPoints(s);
            if (px.length === 0) return null;
            const dim = active !== null && active !== s.uid;
            const isActive = active === s.uid;
            return (
              <path
                key={`p-${s.uid}`}
                d={monotonePath(px)}
                fill="none"
                stroke={s.color}
                strokeWidth={isActive ? 3.25 : 2.5}
                strokeOpacity={dim ? 0.16 : 1}
                strokeLinejoin="round"
                strokeLinecap="round"
                style={{ transition: "stroke-opacity 0.15s, stroke-width 0.15s" }}
              />
            );
          })}

          {/* Punto final de cada línea visible */}
          {visibleSeries.map((s) => {
            const last = s.points[s.points.length - 1];
            const dim = active !== null && active !== s.uid;
            return (
              <circle
                key={`end-${s.uid}`}
                cx={xFor(last.t)}
                cy={yFor(last.balance)}
                r={active === s.uid ? 5 : 3.75}
                fill={s.color}
                stroke="hsl(var(--card))"
                strokeWidth={2}
                opacity={dim ? 0.2 : 1}
                style={{ transition: "opacity 0.15s, r 0.15s" }}
              />
            );
          })}

          {/* Etiqueta del total al final */}
          {endLabels.map((e) => {
            const dim = active !== null && active !== e.uid;
            return (
              <text
                key={`lab-${e.uid}`}
                x={e.x + 9}
                y={e.y}
                dominantBaseline="middle"
                fontSize={11}
                fontWeight={600}
                fill={e.color}
                opacity={dim ? 0.25 : 1}
                style={{
                  fontFamily:
                    "ui-monospace, SFMono-Regular, Menlo, monospace",
                  transition: "opacity 0.15s",
                }}
              >
                {formatTickCurrency(e.value)}
              </text>
            );
          })}

          {/* Dianas de hover invisibles (mantienen el tooltip sin ensuciar) */}
          {visibleSeries.map((s) =>
            s.points.map((p, i) => (
              <circle
                key={`hit-${s.uid}-${i}`}
                cx={xFor(p.t)}
                cy={yFor(p.balance)}
                r={12}
                fill="transparent"
                style={{ cursor: "pointer" }}
                onMouseEnter={() => {
                  setActive(s.uid);
                  setHover({
                    sid: s.uid,
                    t: p.t,
                    balance: p.balance,
                    x: xFor(p.t),
                    y: yFor(p.balance),
                  });
                }}
                onClick={(e) => {
                  // En móvil (sin hover) el toque muestra el tooltip; en PC el
                  // hover sigue funcionando igual. stopPropagation evita que el
                  // onClick del svg lo cierre al instante.
                  e.stopPropagation();
                  setActive(s.uid);
                  setHover({
                    sid: s.uid,
                    t: p.t,
                    balance: p.balance,
                    x: xFor(p.t),
                    y: yFor(p.balance),
                  });
                }}
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
                    r={4.5}
                    fill={s.color}
                    stroke="hsl(var(--card))"
                    strokeWidth={2}
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
                    {hover.balance > 0 ? "+" : ""}
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
              onMouseEnter={() => !isHidden && setActive(s.uid)}
              onMouseLeave={() => setActive(null)}
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
