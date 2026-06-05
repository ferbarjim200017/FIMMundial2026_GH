"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/features/auth/auth.context";
import {
  createMatch,
  deleteMatch,
  GROUP_IDS,
  seedWorldCupMatches,
  STAGE_LABELS,
  subscribeToMatches,
} from "@/features/matches/matches.service";
import { MatchResultDialog } from "@/components/matches/match-result-dialog";
import { formatDateTime } from "@/lib/utils";
import { ROUTES } from "@/lib/constants";
import type { Match } from "@/types/domain";

const STAGE_VALUES: Match["stage"][] = [
  "group",
  "r32",
  "r16",
  "qf",
  "sf",
  "third",
  "final",
];

function toLocalDatetimeValue(d: Date): string {
  const tz = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tz).toISOString().slice(0, 16);
}

export default function AdminMatchesPage() {
  const router = useRouter();
  const { isAdmin, loading } = useAuth();
  const [matches, setMatches] = useState<Match[]>([]);
  const [fetching, setFetching] = useState(true);

  // Form state
  const [stage, setStage] = useState<Match["stage"]>("group");
  const [groupId, setGroupId] = useState<string>("A");
  const [matchday, setMatchday] = useState<string>("1");
  const [homeLabel, setHomeLabel] = useState("");
  const [awayLabel, setAwayLabel] = useState("");
  const [kickoff, setKickoff] = useState<string>(toLocalDatetimeValue(new Date()));
  const [city, setCity] = useState("");
  const [venue, setVenue] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [seeding, setSeeding] = useState(false);
  const [seedMsg, setSeedMsg] = useState<string | null>(null);
  const [resultFor, setResultFor] = useState<Match | null>(null);

  useEffect(() => {
    if (!loading && !isAdmin) router.replace(ROUTES.dashboard);
  }, [loading, isAdmin, router]);

  useEffect(() => {
    if (!isAdmin) return;
    const unsub = subscribeToMatches(
      (list) => {
        setMatches(list);
        setFetching(false);
      },
      () => setFetching(false)
    );
    return unsub;
  }, [isAdmin]);

  if (loading || !isAdmin) return null;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!homeLabel.trim() || !awayLabel.trim()) {
      setError("Indica nombre del equipo local y visitante");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await createMatch({
        stage,
        groupId: stage === "group" ? (groupId as Match["groupId"]) : null,
        matchday:
          stage === "group" ? (Number(matchday) as 1 | 2 | 3) : null,
        kickoffLocal: kickoff,
        city,
        venue,
        homeLabel,
        awayLabel,
      });
      setHomeLabel("");
      setAwayLabel("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(m: Match) {
    if (!confirm(`¿Eliminar el partido ${m.homeLabel} vs ${m.awayLabel}?`)) return;
    try {
      await deleteMatch(m.id);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Error al eliminar");
    }
  }

  async function handleSeed() {
    if (
      !confirm(
        "Vas a cargar los 104 partidos oficiales del Mundial 2026 a Firestore. " +
          "Si algunos ya existen se actualizarán sus metadatos sin perder resultados. ¿Continuar?"
      )
    )
      return;
    setSeeding(true);
    setSeedMsg(null);
    try {
      const res = await seedWorldCupMatches();
      setSeedMsg(
        `✅ Listo. Creados: ${res.created} · Actualizados: ${res.skipped} · Total: ${res.total}`
      );
    } catch (err) {
      setSeedMsg(
        `❌ ${err instanceof Error ? err.message : "Error al cargar partidos"}`
      );
    } finally {
      setSeeding(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="icon">
          <Link href={ROUTES.admin} aria-label="Volver">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Partidos del Mundial</h1>
          <p className="text-sm text-muted-foreground">
            Añade los partidos manualmente. Los usuarios podrán seleccionarlos al
            registrar apuestas.
          </p>
        </div>
      </div>

      <Card className="border-primary/40 bg-primary/5">
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>Calendario oficial del Mundial 2026</CardTitle>
            <CardDescription>
              Carga los 104 partidos (fase de grupos + eliminatorias) con un click.
              Idempotente: si ya existen, actualiza solo metadatos sin perder
              resultados.
            </CardDescription>
          </div>
          <Button onClick={handleSeed} disabled={seeding}>
            {seeding ? "Cargando…" : "Cargar partidos oficiales"}
          </Button>
        </CardHeader>
        {seedMsg && (
          <CardContent>
            <p className="text-sm">{seedMsg}</p>
          </CardContent>
        )}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Nuevo partido</CardTitle>
          <CardDescription>
            Para fase de grupos incluye grupo y jornada. Para eliminatorias usa
            los <em>labels</em> (p. ej. &quot;1.º Grupo A&quot; vs &quot;2.º Grupo B&quot;).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label>Fase</Label>
              <Select value={stage} onValueChange={(v) => setStage(v as Match["stage"])}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STAGE_VALUES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {STAGE_LABELS[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {stage === "group" && (
              <>
                <div className="space-y-1.5">
                  <Label>Grupo</Label>
                  <Select value={groupId} onValueChange={setGroupId}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {GROUP_IDS.map((g) => (
                        <SelectItem key={g} value={g}>
                          Grupo {g}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Jornada</Label>
                  <Select value={matchday} onValueChange={setMatchday}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">Jornada 1</SelectItem>
                      <SelectItem value="2">Jornada 2</SelectItem>
                      <SelectItem value="3">Jornada 3</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}

            <div className="space-y-1.5 sm:col-span-3">
              <Label>Fecha y hora local</Label>
              <Input
                type="datetime-local"
                value={kickoff}
                onChange={(e) => setKickoff(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Local</Label>
              <Input
                value={homeLabel}
                onChange={(e) => setHomeLabel(e.target.value)}
                placeholder="México"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Visitante</Label>
              <Input
                value={awayLabel}
                onChange={(e) => setAwayLabel(e.target.value)}
                placeholder="Sudáfrica"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Ciudad (opcional)</Label>
              <Input
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="Ciudad de México"
              />
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label>Estadio (opcional)</Label>
              <Input
                value={venue}
                onChange={(e) => setVenue(e.target.value)}
                placeholder="Estadio Azteca"
              />
            </div>

            <div className="flex items-end">
              <Button type="submit" disabled={saving} className="w-full">
                <Plus className="h-4 w-4" />
                {saving ? "Guardando…" : "Añadir partido"}
              </Button>
            </div>

            {error && (
              <p className="text-sm text-destructive sm:col-span-3">{error}</p>
            )}
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Listado</CardTitle>
          <CardDescription>
            {fetching ? "Cargando…" : `${matches.length} partido(s)`}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/30 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-2">Fecha</th>
                  <th className="px-4 py-2">Fase</th>
                  <th className="px-4 py-2">Partido</th>
                  <th className="px-4 py-2 text-center">Resultado</th>
                  <th className="px-4 py-2">Ciudad</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {matches.map((m) => (
                  <tr key={m.id} className="border-b last:border-0 hover:bg-accent/30">
                    <td className="px-4 py-2 whitespace-nowrap text-xs text-muted-foreground">
                      {formatDateTime(m.kickoffUtc.toDate())}
                    </td>
                    <td className="px-4 py-2">
                      <Badge variant="muted">
                        {STAGE_LABELS[m.stage]}
                        {m.groupId && ` · ${m.groupId}`}
                        {m.matchday && ` · J${m.matchday}`}
                      </Badge>
                    </td>
                    <td className="px-4 py-2 font-medium">
                      {m.homeLabel} <span className="text-muted-foreground">vs</span> {m.awayLabel}
                    </td>
                    <td className="px-4 py-2 text-center">
                      {m.result ? (
                        <button
                          type="button"
                          onClick={() => setResultFor(m)}
                          className="inline-flex items-center gap-2 rounded-md border bg-card px-2 py-0.5 font-mono text-sm hover:border-primary/60"
                          title="Editar resultado"
                        >
                          <span className="font-bold">{m.result.homeGoals}</span>
                          <span className="text-muted-foreground">-</span>
                          <span className="font-bold">{m.result.awayGoals}</span>
                          {(m.result.homeYellow + m.result.awayYellow) > 0 && (
                            <span className="text-[10px] text-muted-foreground">
                              🟨{m.result.homeYellow + m.result.awayYellow}
                            </span>
                          )}
                          {(m.result.homeRed + m.result.awayRed) > 0 && (
                            <span className="text-[10px] text-muted-foreground">
                              🟥{m.result.homeRed + m.result.awayRed}
                            </span>
                          )}
                        </button>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setResultFor(m)}
                          className="h-7 text-xs"
                        >
                          Poner resultado
                        </Button>
                      )}
                    </td>
                    <td className="px-4 py-2 text-xs text-muted-foreground">
                      {m.city ?? "—"}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(m)}
                        aria-label="Eliminar"
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </td>
                  </tr>
                ))}
                {!fetching && matches.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">
                      Aún no hay partidos. Añade el primero arriba.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {resultFor && (
        <MatchResultDialog
          match={resultFor}
          open={!!resultFor}
          onOpenChange={(o) => !o && setResultFor(null)}
        />
      )}
    </div>
  );
}
