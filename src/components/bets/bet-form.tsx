"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { CalendarPlus, Layers, Plus, Trash2, Wand2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { MatchPickerDialog } from "@/components/bets/match-picker-dialog";
import {
  betFormSchema,
  BOOKMAKER_OPTIONS,
  MARKET_OPTIONS,
  type BetFormValues,
} from "@/features/bets/bets.schema";
import { queueEdit } from "@/features/bets/pending-edits";
import { queueCreate, newLocalId } from "@/features/bets/pending-creates";
import {
  updateDefaultBookmaker,
  updateDefaultStake,
} from "@/features/users/users.service";
import {
  STAGE_LABELS,
  getMatch,
  matchLabel,
} from "@/features/matches/matches.service";
import { TEAMS_2026 } from "@/features/matches/teams-2026";
import { TeamFlag } from "@/components/matches/team-flag";
import { useGroup } from "@/features/groups/groups.context";
import { useAuth } from "@/features/auth/auth.context";
import { formatCurrency, TimeoutError, withTimeout } from "@/lib/utils";
import { ROUTES } from "@/lib/constants";
import type { Bet, Match } from "@/types/domain";

interface Props {
  userId: string;
  /** Modo edición: la apuesta cuyos datos se editan y guardan sobre la misma. */
  initial?: Bet;
  /** Modo "copiar de": pre-rellena el formulario con los datos de esta apuesta
   *  pero al guardar SIEMPRE crea una apuesta nueva del usuario actual. La
   *  fecha por defecto será "ahora" (no la fecha de la apuesta original). */
  prefill?: Bet;
  onDone?: () => void;
}

function toLocalDatetimeValue(d: Date): string {
  const tz = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tz).toISOString().slice(0, 16);
}

/** Fecha local con milisegundos y SIN zona horaria ("2026-06-21T18:00:00.003"),
 *  que `new Date()` interpreta como hora local. Se usa para desplazar unos ms el
 *  createdAt de cada peldaño de una escalera y que no empaten al ordenar. */
function toLocalMsString(d: Date): string {
  const p = (n: number, len = 2) => String(n).padStart(len, "0");
  return (
    `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}` +
    `T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${p(d.getMilliseconds(), 3)}`
  );
}

function composeLabel(matches: Match[]): string {
  if (matches.length === 0) return "";
  if (matches.length === 1) return matchLabel(matches[0]);
  return matches.map((m) => `${m.homeLabel} vs ${m.awayLabel}`).join(" + ");
}

/** Un peldaño de la escalera: una apuesta con su propia selección/cuota/stake.
 *  Los inputs son strings; se parsean al validar con el schema. */
type LadderRung = { selection: string; odds: string; stake: string };

export function BetForm({ userId, initial, prefill, onDone }: Props) {
  const router = useRouter();
  const { activeGroup, userGroups } = useGroup();
  const { appUser } = useAuth();
  // Casa por defecto al crear una apuesta nueva: la que el usuario haya
  // marcado como predeterminada (si tiene), si no Winamax. (Al editar/copiar
  // se respeta la de la apuesta original vía `seed`.)
  const defaultBookmaker: BetFormValues["bookmaker"] =
    appUser?.defaultBookmaker ?? "winamax";
  // Seed para los defaults: si estamos editando, partimos de `initial`; si no,
  // de `prefill` cuando se está copiando una apuesta ajena. Si no hay ninguno,
  // valores por defecto en blanco.
  const seed = initial ?? prefill;
  // groupIds iniciales: si editamos, preservamos los de la apuesta original
  // (o legacy single groupId). Si creamos/copiamos, por defecto solo el grupo
  // activo del autor en este momento.
  const initialGroupIds = (() => {
    if (initial) {
      if (initial.groupIds && initial.groupIds.length > 0)
        return initial.groupIds;
      if (initial.groupId) return [initial.groupId];
    }
    return activeGroup ? [activeGroup.id] : [];
  })();
  const [values, setValues] = useState<BetFormValues>(() => ({
    bookmaker: seed?.bookmaker ?? defaultBookmaker,
    bookmakerLabel: seed?.bookmakerLabel ?? "",
    matchIds: seed?.matchIds ?? (seed?.matchId ? [seed.matchId] : []),
    matchLabel: seed?.matchLabel ?? "",
    market: seed?.market ?? "winner",
    marketDetail: seed?.marketDetail ?? "",
    selection: seed?.selection ?? "",
    odds: seed?.odds ?? 1.5,
    // Al crear una apuesta nueva pre-rellenamos con el stake medio que el
    // usuario haya configurado (si lo tiene). Al editar/copiar se respeta el
    // stake original (`seed`).
    stake: seed?.stake ?? appUser?.defaultStake ?? 10,
    // En modo edición, la fecha se preserva. Al copiar, queremos "ahora" como
    // fecha de la apuesta nueva (no la del autor original).
    placedAt: initial
      ? toLocalDatetimeValue(initial.createdAt.toDate())
      : toLocalDatetimeValue(new Date()),
    isFreebet: seed?.isFreebet ?? false,
    notes: seed?.notes ?? "",
    teams: seed?.teams ?? [],
    groupIds: initialGroupIds,
  }));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);

  // ---------- Escalera (solo al CREAR) ----------
  // Una "escalera" deja meter varios peldaños (selección + cuota + stake) y, al
  // guardar, crea UNA apuesta por peldaño (mismo partido/casa/mercado/fecha).
  // Ej.: córners → Más de 5 (stake alto, cuota baja), Más de 6, Más de 7… con
  // stake bajando según sube la cuota.
  const isEditing = !!initial;
  const [ladder, setLadder] = useState(false);
  const defaultRungStake = String(seed?.stake ?? appUser?.defaultStake ?? 10);
  const [rungs, setRungs] = useState<LadderRung[]>(() => [
    { selection: "", odds: "", stake: defaultRungStake },
    { selection: "", odds: "", stake: defaultRungStake },
  ]);

  function updateRung(i: number, key: keyof LadderRung, val: string) {
    setRungs((rs) => rs.map((r, idx) => (idx === i ? { ...r, [key]: val } : r)));
    setServerError(null);
  }
  function addRung() {
    setRungs((rs) => {
      const last = rs[rs.length - 1];
      // Copiamos el último peldaño como punto de partida (cómodo para ir subiendo).
      return [...rs, last ? { ...last } : { selection: "", odds: "", stake: defaultRungStake }];
    });
  }
  function removeRung(i: number) {
    setRungs((rs) => (rs.length > 2 ? rs.filter((_, idx) => idx !== i) : rs));
  }

  // ---------- Generador de la escalera ----------
  // Rellena los peldaños a partir de una frase con "#" (donde va el número), un
  // número inicial, dirección (sube/baja), paso y nº de peldaños. Opcional: baja
  // el stake al 50% en cada peldaño. Las cuotas las pone el usuario a mano.
  const [gen, setGen] = useState({
    phrase: "Más de # córners",
    start: "5",
    dir: "up" as "up" | "down",
    step: "1",
    count: "3",
    baseStake: defaultRungStake,
    halve: false,
  });

  function generateRungs() {
    const start = Number(gen.start);
    const step = Number(gen.step) || 1;
    const count = Math.floor(Number(gen.count) || 0);
    const base = Number(gen.baseStake) || 0;
    if (!Number.isFinite(start) || count < 2 || count > 20) {
      setServerError(
        "Revisa el generador: número inicial válido y entre 2 y 20 peldaños."
      );
      return;
    }
    const r2 = (n: number) => Math.round(n * 100) / 100;
    const fmt = (n: number) =>
      Number.isInteger(n) ? String(n) : String(r2(n)).replace(".", ",");
    const sign = gen.dir === "up" ? 1 : -1;
    const next: LadderRung[] = [];
    for (let i = 0; i < count; i++) {
      const num = start + sign * step * i;
      const sel = gen.phrase.includes("#")
        ? gen.phrase.replace(/#/g, fmt(num))
        : `${gen.phrase} ${fmt(num)}`.trim();
      const stake = gen.halve ? r2(base / Math.pow(2, i)) : base;
      next.push({ selection: sel, odds: "", stake: base > 0 ? String(stake) : "" });
    }
    setRungs(next);
    setServerError(null);
  }

  const ladderTotals = useMemo(() => {
    let stake = 0;
    let ret = 0;
    let count = 0;
    for (const r of rungs) {
      const o = Number(r.odds) || 0;
      const s = Number(r.stake) || 0;
      if (o > 1 && s > 0 && r.selection.trim().length > 0) {
        stake += s;
        ret += o * s;
        count += 1;
      }
    }
    return { stake, ret, profit: ret - stake, count };
  }, [rungs]);

  // Editor del "stake medio" (stake por defecto del usuario). Es opcional y
  // solo se usa para pre-rellenar este campo en futuras apuestas.
  const [stakeMedioOpen, setStakeMedioOpen] = useState(false);
  const [stakeMedioDraft, setStakeMedioDraft] = useState<string>(
    appUser?.defaultStake != null ? String(appUser.defaultStake) : ""
  );
  const [stakeMedioSaving, setStakeMedioSaving] = useState(false);
  const [stakeMedioSaved, setStakeMedioSaved] = useState(false);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [selectedMatches, setSelectedMatches] = useState<Match[]>([]);
  const [manualLabel, setManualLabel] = useState<boolean>(
    !!seed &&
      ((seed.matchIds?.length ?? 0) === 0 && !seed.matchId)
  );

  // Las apuestas a futuro (outright) no van ligadas a un partido concreto;
  // forzamos el modo manual para que el usuario escriba el evento (p.ej.
  // "Ganador Grupo A", "Mejor equipo africano", "Top scorer del Mundial").
  const isOutright = values.market === "outright";
  useEffect(() => {
    if (isOutright && !manualLabel) {
      setManualLabel(true);
      setSelectedMatches([]);
      setValues((v) => ({ ...v, matchIds: [] }));
    }
  }, [isOutright, manualLabel]);

  // Cargar matches iniciales (modo edición) para mostrar chips
  useEffect(() => {
    if (!values.matchIds || values.matchIds.length === 0) return;
    let cancelled = false;
    Promise.all(values.matchIds.map((id) => getMatch(id)))
      .then((arr) => {
        if (cancelled) return;
        const valid = arr.filter((m): m is Match => !!m);
        setSelectedMatches(valid);
      })
      .catch((err) => console.error("[bet-form] getMatch", err));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-clear server error on edit
  useEffect(() => setServerError(null), [values]);

  // Cuando hay 2+ partidos, forzar combo
  useEffect(() => {
    if (selectedMatches.length > 1 && values.market !== "combo") {
      setValues((v) => ({ ...v, market: "combo" }));
    }
    // Recalcular label a partir de los matches seleccionados (si no es manual)
    if (selectedMatches.length > 0 && !manualLabel) {
      setValues((v) => ({
        ...v,
        matchLabel: composeLabel(selectedMatches),
        matchIds: selectedMatches.map((m) => m.id),
      }));
    } else if (selectedMatches.length === 0 && !manualLabel && values.matchIds?.length) {
      setValues((v) => ({ ...v, matchIds: [] }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMatches, manualLabel]);

  const potentialReturn = useMemo(
    () => (Number(values.odds) || 0) * (Number(values.stake) || 0),
    [values.odds, values.stake]
  );
  // stake * (odds - 1) — el beneficio potencial es igual con o sin freebet.
  // En una freebet, sin embargo, no hay "retorno total" porque el stake
  // era un token de la casa: solo se cobra el beneficio.
  const potentialProfit = potentialReturn - (Number(values.stake) || 0);

  function update<K extends keyof BetFormValues>(key: K, v: BetFormValues[K]) {
    setValues((s) => ({ ...s, [key]: v }));
    setErrors((e) => {
      const { [key as string]: _omit, ...rest } = e;
      return rest;
    });
  }

  function removeMatch(id: string) {
    setSelectedMatches((prev) => prev.filter((m) => m.id !== id));
  }

  function switchToManual() {
    setSelectedMatches([]);
    setManualLabel(true);
    setValues((v) => ({ ...v, matchIds: [], matchLabel: "" }));
  }

  function switchToPicker() {
    setManualLabel(false);
    setValues((v) => ({ ...v, matchLabel: "" }));
    setPickerOpen(true);
  }

  // Guarda el stake medio del usuario (1 escritura) y lo aplica también al
  // stake de la apuesta actual. A partir de aquí, las próximas apuestas lo
  // pre-rellenan solas.
  async function saveStakeMedio() {
    const n = Number(stakeMedioDraft);
    if (!Number.isFinite(n) || n <= 0) return;
    setStakeMedioSaving(true);
    setStakeMedioSaved(false);
    try {
      await withTimeout(updateDefaultStake(userId, n), 9000);
    } catch (err) {
      // Red lenta: la escritura se sincroniza en segundo plano; no bloqueamos.
      if (!(err instanceof TimeoutError)) console.error("[stake-medio]", err);
    } finally {
      update("stake", n as unknown as BetFormValues["stake"]);
      setStakeMedioSaving(false);
      setStakeMedioSaved(true);
    }
  }

  // Guarda la casa actualmente seleccionada como predeterminada del usuario
  // (1 escritura). A partir de aquí, las próximas apuestas nuevas la traen ya
  // seleccionada. `appUser` se actualiza solo (lo suscribe el AuthContext), así
  // que la etiqueta "Predeterminada ✓" aparece al instante.
  async function saveDefaultBookmaker() {
    try {
      await withTimeout(updateDefaultBookmaker(userId, values.bookmaker), 9000);
    } catch (err) {
      // Red lenta: la escritura se sincroniza en segundo plano; no bloqueamos.
      if (!(err instanceof TimeoutError)) console.error("[default-bookmaker]", err);
    }
  }

  /** Encola un borrador por cada peldaño válido de la escalera. */
  function handleLadderSubmit() {
    setServerError(null);
    const items: BetFormValues[] = [];
    const issues: string[] = [];
    rungs.forEach((r, i) => {
      const candidate = {
        ...values,
        selection: r.selection,
        odds: r.odds as unknown as number,
        stake: r.stake as unknown as number,
      };
      const parsed = betFormSchema.safeParse(candidate);
      if (!parsed.success) {
        issues.push(`Peldaño ${i + 1}: ${parsed.error.issues[0]?.message ?? "datos incompletos"}`);
      } else {
        items.push(parsed.data);
      }
    });

    if (issues.length > 0) {
      setServerError(issues.join(" · "));
      return;
    }
    if (items.length < 2) {
      setServerError("Una escalera necesita al menos 2 peldaños válidos.");
      return;
    }
    if ((items[0].groupIds ?? []).length === 0) {
      setServerError("Selecciona al menos un grupo al que asignar la escalera.");
      return;
    }

    // Desplazamos el createdAt de cada peldaño unos ms (mismo minuto visible) para
    // que NO empaten y la escalera salga SIEMPRE en orden (peldaño 1 arriba).
    const baseMs = new Date(values.placedAt).getTime();
    const n = items.length;
    const ordered = items.map((it, i) => ({
      ...it,
      placedAt: toLocalMsString(new Date(baseMs + (n - i))),
    }));

    // Encolamos cada peldaño como borrador local; se suben todos en una sola
    // llamada desde la lista. `queuedAt` decreciente para que el peldaño 1 quede
    // arriba también al ordenar por registro (addedAt desc).
    const now = Date.now();
    ordered.forEach((it, i) => {
      queueCreate({
        localId: newLocalId(),
        input: { ...it, userId },
        label: `${it.matchLabel} · ${it.selection}`,
        queuedAt: now + (n - i),
      });
    });
    if (onDone) onDone();
    else router.push(ROUTES.bets);
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (ladder && !isEditing) {
      handleLadderSubmit();
      return;
    }
    const parsed = betFormSchema.safeParse(values);
    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as string;
        if (!fieldErrors[key]) fieldErrors[key] = issue.message;
      }
      setErrors(fieldErrors);
      return;
    }

    if (!initial && (parsed.data.groupIds ?? []).length === 0) {
      setServerError("Selecciona al menos un grupo al que asignar la apuesta.");
      return;
    }

    setServerError(null);
    const label = `${parsed.data.matchLabel} · ${parsed.data.selection}`;
    // Ni la creación ni la edición suben al momento: se guardan en LOCAL (cola
    // "sin subir") y se suben TODAS juntas en una sola llamada desde la lista
    // de apuestas. Así se reducen las llamadas a Firestore.
    if (initial) {
      queueEdit({
        betId: initial.id,
        input: { ...parsed.data, betId: initial.id },
        label,
        queuedAt: Date.now(),
      });
    } else {
      queueCreate({
        localId: newLocalId(),
        input: { ...parsed.data, userId },
        label,
        queuedAt: Date.now(),
      });
    }
    if (onDone) onDone();
    else router.push(ROUTES.bets);
  }

  // Toggle de un grupo en la selección
  function toggleGroupId(id: string) {
    const cur = values.groupIds ?? [];
    if (cur.includes(id)) {
      // No permitimos quedarnos sin grupos: al menos uno tiene que estar
      // marcado. Si el usuario intenta desmarcar el último, ignoramos.
      if (cur.length === 1) return;
      update(
        "groupIds",
        cur.filter((g) => g !== id)
      );
    } else {
      update("groupIds", [...cur, id]);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {userGroups.length > 1 && (
        <Card className="border-primary/30">
          <CardContent className="space-y-2 p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <Label className="text-sm">Compartir con grupos</Label>
              <p className="text-[11px] text-muted-foreground">
                La apuesta aparecerá en el feed y el ranking de cada grupo
                marcado.
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {userGroups.map((g) => {
                const selected = (values.groupIds ?? []).includes(g.id);
                return (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => toggleGroupId(g.id)}
                    aria-pressed={selected}
                    className={
                      "rounded-full border px-2.5 py-0.5 text-xs transition-colors " +
                      (selected
                        ? "border-primary bg-primary text-primary-foreground"
                        : "bg-background hover:bg-accent/40")
                    }
                  >
                    {g.name}
                  </button>
                );
              })}
            </div>
            {errors.groupIds && (
              <p className="text-xs text-destructive">{errors.groupIds}</p>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="grid grid-cols-1 gap-4 p-6 sm:grid-cols-2">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <Label>Casa de apuestas</Label>
              {values.bookmaker !== "other" &&
                (appUser?.defaultBookmaker === values.bookmaker ? (
                  <span className="text-[11px] text-muted-foreground">
                    Predeterminada ✓
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={saveDefaultBookmaker}
                    className="text-[11px] text-primary hover:underline"
                  >
                    Hacer predeterminada
                  </button>
                ))}
            </div>
            <Select
              value={values.bookmaker}
              onValueChange={(v) => update("bookmaker", v as BetFormValues["bookmaker"])}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {BOOKMAKER_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {values.bookmaker === "other" && (
            <div className="space-y-1.5">
              <Label htmlFor="bookmakerLabel">Nombre casa</Label>
              <Input
                id="bookmakerLabel"
                value={values.bookmakerLabel ?? ""}
                onChange={(e) => update("bookmakerLabel", e.target.value)}
              />
              {errors.bookmakerLabel && (
                <p className="text-xs text-destructive">{errors.bookmakerLabel}</p>
              )}
            </div>
          )}

          {/* ---------- Selector de partidos ---------- */}
          <div className="space-y-2 sm:col-span-2">
            <div className="flex items-center justify-between gap-2">
              <Label>
                {isOutright ? "Evento / mercado a futuro" : "Partido(s) del Mundial"}
              </Label>
              <div className="flex items-center gap-1 text-xs">
                {isOutright ? (
                  <span className="text-muted-foreground">
                    Apuesta a futuro — escribe el evento
                  </span>
                ) : manualLabel ? (
                  <button
                    type="button"
                    onClick={switchToPicker}
                    className="text-primary hover:underline"
                  >
                    Usar selector de partidos
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={switchToManual}
                    className="text-muted-foreground hover:underline"
                  >
                    Escribir manualmente
                  </button>
                )}
              </div>
            </div>

            {manualLabel ? (
              <>
                <Input
                  placeholder={
                    isOutright
                      ? "Ej: Ganador Grupo A · Mejor equipo africano · Top scorer"
                      : "España vs Cabo Verde"
                  }
                  value={values.matchLabel}
                  onChange={(e) => update("matchLabel", e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  {isOutright
                    ? "Apuestas a futuro / outright: ganador de grupo, qué selección se clasifica, mejor equipo de cada continente, máximo goleador…"
                    : "Modo libre: úsalo solo para partidos fuera del Mundial."}
                </p>
              </>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-2 rounded-md border border-dashed bg-muted/20 p-2">
                  {selectedMatches.length === 0 ? (
                    <span className="px-2 text-xs text-muted-foreground">
                      Sin partidos seleccionados.
                    </span>
                  ) : (
                    selectedMatches.map((m) => (
                      <MatchChip key={m.id} match={m} onRemove={() => removeMatch(m.id)} />
                    ))
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setPickerOpen(true)}
                    className="ml-auto"
                  >
                    <CalendarPlus className="h-3.5 w-3.5" />
                    {selectedMatches.length === 0 ? "Seleccionar partidos" : "Modificar"}
                  </Button>
                </div>
                {selectedMatches.length > 1 && (
                  <p className="text-xs text-primary">
                    Se marcará como <strong>combinada</strong> ({selectedMatches.length} partidos).
                  </p>
                )}
              </>
            )}
            {errors.matchLabel && (
              <p className="text-xs text-destructive">{errors.matchLabel}</p>
            )}
          </div>

          {isOutright && (
            <div className="space-y-2 sm:col-span-2">
              <TeamPicker
                value={values.teams ?? []}
                onChange={(next) => update("teams", next)}
              />
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Mercado</Label>
            <Select
              value={values.market}
              onValueChange={(v) => update("market", v as BetFormValues["market"])}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MARKET_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {!isEditing && (
            <div className="sm:col-span-2">
              <label className="flex cursor-pointer items-center gap-2.5 rounded-md border bg-muted/20 px-3 py-2.5 text-sm">
                <input
                  type="checkbox"
                  checked={ladder}
                  onChange={(e) => setLadder(e.target.checked)}
                  className="h-4 w-4"
                />
                <Layers className="h-4 w-4 shrink-0 text-primary" />
                <span className="font-medium text-foreground">Escalera</span>
                <span className="text-xs text-muted-foreground">
                  — crea varias apuestas de una (distinta cuota y stake por peldaño)
                </span>
              </label>
            </div>
          )}

          {!ladder && (
          <>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="selection">Selección</Label>
            <Input
              id="selection"
              placeholder={
                isOutright
                  ? "Ej: España · Marruecos · Mbappé"
                  : selectedMatches.length > 1
                  ? "Ej: España gana + Brasil gana + Over 2.5 Alemania"
                  : "Gana España, Sí, Más de 2.5…"
              }
              value={values.selection}
              onChange={(e) => update("selection", e.target.value)}
            />
            {errors.selection && (
              <p className="text-xs text-destructive">{errors.selection}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="odds">Cuota{selectedMatches.length > 1 && " (total combinada)"}</Label>
            <Input
              id="odds"
              type="number"
              step="0.01"
              min="1.01"
              value={values.odds}
              onChange={(e) => update("odds", e.target.value as unknown as number)}
            />
            {errors.odds && <p className="text-xs text-destructive">{errors.odds}</p>}
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="stake">
                Stake (€){values.isFreebet && " · freebet"}
              </Label>
              <button
                type="button"
                onClick={() => {
                  setStakeMedioOpen((o) => !o);
                  setStakeMedioSaved(false);
                }}
                className="text-[11px] text-primary hover:underline"
              >
                Stake medio
                {appUser?.defaultStake != null
                  ? ` (${formatCurrency(appUser.defaultStake)})`
                  : ""}
              </button>
            </div>
            <Input
              id="stake"
              type="number"
              step="0.01"
              min="0.01"
              value={values.stake}
              onChange={(e) => update("stake", e.target.value as unknown as number)}
            />
            {errors.stake && <p className="text-xs text-destructive">{errors.stake}</p>}

            {stakeMedioOpen && (
              <div className="mt-1.5 space-y-1.5 rounded-md border bg-muted/20 p-2.5 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-foreground">Tu stake medio</span>
                  {appUser?.defaultStake != null && (
                    <span className="text-muted-foreground">
                      Actual: {formatCurrency(appUser.defaultStake)}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={stakeMedioDraft}
                    onChange={(e) => {
                      setStakeMedioDraft(e.target.value);
                      setStakeMedioSaved(false);
                    }}
                    placeholder="Ej: 10"
                    className="h-8"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={saveStakeMedio}
                    disabled={stakeMedioSaving || !stakeMedioDraft}
                    className="shrink-0"
                  >
                    {stakeMedioSaving ? "Guardando…" : "Guardar"}
                  </Button>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  {stakeMedioSaved
                    ? "Guardado. Se aplicará por defecto en tus próximas apuestas."
                    : "Se pre-rellenará automáticamente como stake en tus próximas apuestas."}
                </p>
              </div>
            )}

            <label className="mt-1.5 flex cursor-pointer items-center gap-2 rounded-md border bg-muted/20 px-2.5 py-2 text-xs">
              <input
                type="checkbox"
                checked={!!values.isFreebet}
                onChange={(e) => update("isFreebet", e.target.checked)}
              />
              <span className="font-medium text-foreground">Freebet</span>
            </label>
          </div>
          </>
          )}

          {ladder && (
            <div className="space-y-2 sm:col-span-2">
              <div className="flex items-center justify-between">
                <Label>Peldaños de la escalera</Label>
                <span className="text-xs text-muted-foreground">
                  Cada peldaño = una apuesta
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                Ej. córners: «Más de 5» (stake alto, cuota baja), «Más de 6», «Más de
                7»… bajando el stake según sube la cuota.
              </p>

              {/* Generador rápido */}
              <div className="space-y-2.5 rounded-md border border-primary/30 bg-primary/5 p-3">
                <div className="flex items-center gap-2">
                  <Wand2 className="h-4 w-4 text-primary" />
                  <span className="text-sm font-medium">Generador rápido</span>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Frase (pon # donde va el número)</Label>
                  <Input
                    value={gen.phrase}
                    onChange={(e) => setGen((g) => ({ ...g, phrase: e.target.value }))}
                    placeholder="Más de # córners"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <div className="space-y-1">
                    <Label className="text-xs">Nº inicial</Label>
                    <Input
                      type="number"
                      inputMode="decimal"
                      value={gen.start}
                      onChange={(e) => setGen((g) => ({ ...g, start: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Dirección</Label>
                    <Select
                      value={gen.dir}
                      onValueChange={(v) => setGen((g) => ({ ...g, dir: v as "up" | "down" }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="up">Sube ↑</SelectItem>
                        <SelectItem value="down">Baja ↓</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Paso</Label>
                    <Input
                      type="number"
                      inputMode="decimal"
                      value={gen.step}
                      onChange={(e) => setGen((g) => ({ ...g, step: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Nº peldaños</Label>
                    <Input
                      type="number"
                      inputMode="numeric"
                      value={gen.count}
                      onChange={(e) => setGen((g) => ({ ...g, count: e.target.value }))}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 items-end gap-2 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Stake base (€)</Label>
                    <Input
                      type="number"
                      inputMode="decimal"
                      value={gen.baseStake}
                      onChange={(e) => setGen((g) => ({ ...g, baseStake: e.target.value }))}
                    />
                  </div>
                  <label className="flex h-9 cursor-pointer items-center gap-2 rounded-md border bg-muted/20 px-2.5 text-xs">
                    <input
                      type="checkbox"
                      checked={gen.halve}
                      onChange={(e) => setGen((g) => ({ ...g, halve: e.target.checked }))}
                    />
                    <span className="font-medium text-foreground">
                      Bajar stake 50% por peldaño
                    </span>
                  </label>
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={generateRungs}
                  className="w-full"
                >
                  <Wand2 className="h-3.5 w-3.5" /> Generar peldaños
                </Button>
                <p className="text-[11px] text-muted-foreground">
                  Reemplaza los peldaños de abajo. Las cuotas las pones tú en cada uno.
                </p>
              </div>

              <div className="space-y-2">
                {rungs.map((r, i) => {
                  const ret = (Number(r.odds) || 0) * (Number(r.stake) || 0);
                  return (
                    <div key={i} className="rounded-md border bg-muted/10 p-2.5">
                      <div className="mb-1.5 flex items-center justify-between">
                        <span className="text-xs font-medium text-muted-foreground">
                          Peldaño {i + 1}
                        </span>
                        {rungs.length > 2 && (
                          <button
                            type="button"
                            onClick={() => removeRung(i)}
                            className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-destructive/15 hover:text-destructive"
                            aria-label={`Quitar peldaño ${i + 1}`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-[1fr_7rem_7rem]">
                        <Input
                          className="col-span-2 sm:col-span-1"
                          placeholder="Selección (ej: Más de 5 córners)"
                          value={r.selection}
                          onChange={(e) => updateRung(i, "selection", e.target.value)}
                        />
                        <Input
                          type="number"
                          step="0.01"
                          min="1.01"
                          inputMode="decimal"
                          placeholder="Cuota"
                          value={r.odds}
                          onChange={(e) => updateRung(i, "odds", e.target.value)}
                        />
                        <Input
                          type="number"
                          step="0.01"
                          min="0.01"
                          inputMode="decimal"
                          placeholder="Stake €"
                          value={r.stake}
                          onChange={(e) => updateRung(i, "stake", e.target.value)}
                        />
                      </div>
                      {ret > 0 && (
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          Retorno:{" "}
                          <span className="font-mono">{formatCurrency(ret)}</span>
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Button type="button" variant="outline" size="sm" onClick={addRung}>
                  <Plus className="h-3.5 w-3.5" /> Añadir peldaño
                </Button>
                <label className="flex cursor-pointer items-center gap-2 rounded-md border bg-muted/20 px-2.5 py-1.5 text-xs">
                  <input
                    type="checkbox"
                    checked={!!values.isFreebet}
                    onChange={(e) => update("isFreebet", e.target.checked)}
                  />
                  <span className="font-medium text-foreground">Freebet (todas)</span>
                </label>
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="placedAt">Fecha y hora</Label>
            <Input
              id="placedAt"
              type="datetime-local"
              value={values.placedAt}
              onChange={(e) => update("placedAt", e.target.value)}
            />
            {errors.placedAt && (
              <p className="text-xs text-destructive">{errors.placedAt}</p>
            )}
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="notes">Notas (opcional)</Label>
            <Textarea
              id="notes"
              rows={3}
              value={values.notes ?? ""}
              onChange={(e) => update("notes", e.target.value)}
              placeholder="Razones, contexto, value…"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm text-muted-foreground">
            {ladder ? (
              <>
                {ladderTotals.count} apuesta{ladderTotals.count !== 1 ? "s" : ""} ·
                Stake total:{" "}
                <span className="font-mono font-medium text-foreground">
                  {formatCurrency(ladderTotals.stake)}
                </span>
                <span className="mx-2 text-border">•</span>
                Retorno si entran todas:{" "}
                <span className="font-mono font-medium text-profit">
                  {formatCurrency(ladderTotals.ret)}
                </span>
              </>
            ) : values.isFreebet ? (
              <>
                Beneficio potencial (freebet):{" "}
                <span className="font-mono font-medium text-profit">
                  {formatCurrency(potentialProfit)}
                </span>
              </>
            ) : (
              <>
                Retorno potencial:{" "}
                <span className="font-mono font-medium text-foreground">
                  {formatCurrency(potentialReturn)}
                </span>
                <span className="mx-2 text-border">•</span>
                Beneficio potencial:{" "}
                <span className="font-mono font-medium text-profit">
                  {formatCurrency(potentialProfit)}
                </span>
              </>
            )}
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => (onDone ? onDone() : router.back())}
            >
              Cancelar
            </Button>
            <Button type="submit">
              {isEditing
                ? "Guardar cambios"
                : ladder
                ? `Añadir escalera (${ladderTotals.count})`
                : "Añadir a la cola"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {serverError && (
        <p className="text-sm text-destructive">{serverError}</p>
      )}

      <MatchPickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        multi
        initialSelected={selectedMatches.map((m) => m.id)}
        onConfirm={(matches) => setSelectedMatches(matches)}
      />
    </form>
  );
}

function MatchChip({ match, onRemove }: { match: Match; onRemove: () => void }) {
  const kickoff = new Date(match.kickoffUtc.toMillis());
  return (
    <span className="group inline-flex items-center gap-2 rounded-full border bg-background py-0.5 pl-2.5 pr-1 text-xs">
      <span className="font-medium">
        <TeamFlag name={match.homeLabel} className="mr-1" />
        {match.homeLabel} <span className="text-muted-foreground">vs</span>{" "}
        <TeamFlag name={match.awayLabel} className="mr-1" />
        {match.awayLabel}
      </span>
      <span className="text-muted-foreground">
        · {STAGE_LABELS[match.stage]}
        {match.groupId && ` · ${match.groupId}`}
        ·{" "}
        {kickoff.toLocaleDateString("es-ES", {
          day: "2-digit",
          month: "short",
        })}{" "}
        {kickoff.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}
      </span>
      <button
        type="button"
        onClick={onRemove}
        className="rounded-full p-0.5 text-muted-foreground transition-colors hover:bg-destructive/15 hover:text-destructive"
        aria-label="Quitar partido"
      >
        <X className="h-3 w-3" />
      </button>
    </span>
  );
}

/**
 * Multi-select de equipos del Mundial 2026 para apuestas a futuro. Permite
 * elegir cero, uno o varios equipos. Al guardar la apuesta, esos nombres
 * quedan en `bet.teams` y el popup "Apuestas sobre este partido" los
 * detecta automáticamente en todos los partidos de esos equipos.
 *
 * UI: chips de los seleccionados + botón para abrir un panel con buscador
 * y los 48 equipos como chips toggleables.
 */
function TeamPicker({
  value,
  onChange,
}: {
  value: string[];
  onChange: (next: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selected = new Set(value);

  function toggle(team: string) {
    if (selected.has(team)) {
      onChange(value.filter((t) => t !== team));
    } else {
      onChange([...value, team]);
    }
  }

  const norm = (s: string) =>
    s
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase();
  const q = norm(query.trim());
  const filtered = q
    ? TEAMS_2026.filter((t) => norm(t).includes(q))
    : TEAMS_2026;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Label>Vincular a equipos (opcional)</Label>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="text-xs text-primary hover:underline"
        >
          {open ? "Ocultar lista" : value.length > 0 ? "Editar equipos" : "Añadir equipos"}
        </button>
      </div>

      <p className="text-xs text-muted-foreground">
        Si vinculas un equipo (p.ej. España), esta apuesta aparecerá en el
        popup de cualquier partido suyo. Déjalo vacío para que solo se vea
        en tu lista de apuestas.
      </p>

      <div className="flex flex-wrap gap-1.5 rounded-md border border-dashed bg-muted/20 p-2">
        {value.length === 0 ? (
          <span className="px-1 text-xs text-muted-foreground">
            Sin equipos vinculados.
          </span>
        ) : (
          value.map((t) => (
            <span
              key={t}
              className="inline-flex items-center gap-1 rounded-full border bg-background py-0.5 pl-2.5 pr-1 text-xs"
            >
              <span className="inline-flex items-center gap-1 font-medium">
                <TeamFlag name={t} />
                {t}
              </span>
              <button
                type="button"
                onClick={() => toggle(t)}
                className="rounded-full p-0.5 text-muted-foreground hover:bg-destructive/15 hover:text-destructive"
                aria-label={`Quitar ${t}`}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))
        )}
      </div>

      {open && (
        <div className="space-y-2 rounded-md border bg-card p-2">
          <Input
            placeholder="Buscar equipo…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-8 text-sm"
          />
          <div className="flex flex-wrap gap-1.5">
            {filtered.length === 0 && (
              <span className="px-1 text-xs text-muted-foreground">
                Ningún equipo coincide.
              </span>
            )}
            {filtered.map((t) => {
              const isSel = selected.has(t);
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => toggle(t)}
                  className={
                    "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs transition-colors " +
                    (isSel
                      ? "border-primary bg-primary text-primary-foreground"
                      : "bg-background hover:bg-accent/40")
                  }
                  aria-pressed={isSel}
                >
                  <TeamFlag name={t} />
                  {t}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
