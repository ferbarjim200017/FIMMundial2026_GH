"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Link2,
  CheckCircle2,
  XCircle,
  Loader2,
  RefreshCw,
  Plus,
  Check,
} from "lucide-react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/features/auth/auth.context";
import { useGroup } from "@/features/groups/groups.context";
import {
  createBet,
  subscribeToBets,
  type CreateBetInput,
} from "@/features/bets/bets.service";

// El "ayudante" local que corre en el PC del usuario (extensión + servidor).
const AYUDANTE = "http://localhost:8799";

// ---------- Tipos de lo que devuelve el ayudante ----------
interface WmxSeleccion {
  mercado?: string;
  seleccion: string;
}
interface WmxBet {
  id: string;
  ref?: string | null;
  fecha?: string | null;
  evento?: string | null;
  tipo?: string | null;
  estado?: string | null;
  cuota?: number | null;
  importe?: number | null;
  descripcion?: string;
  selecciones?: WmxSeleccion[];
}
interface WmxPayload {
  actualizado: string;
  resumen: {
    activas: number;
    enJuego: number;
    potencial: number;
    gananciaPotencial: number;
  };
  apuestas: WmxBet[];
}

type Estado = "checking" | "ok" | "offline";

const MESES: Record<string, number> = {
  enero: 0, febrero: 1, marzo: 2, abril: 3, mayo: 4, junio: 5,
  julio: 6, agosto: 7, septiembre: 8, setiembre: 8, octubre: 9,
  noviembre: 10, diciembre: 11,
};

/** "11:51 - 15 julio 2026" -> ISO. Si no se puede, usa la fecha de hoy. */
function parseFecha(fecha?: string | null): string {
  if (fecha) {
    const m = fecha.match(/(\d{1,2}):(\d{2})\s*-\s*(\d{1,2})\s+(\w+)\s+(\d{4})/);
    if (m) {
      const month = MESES[m[4].toLowerCase()];
      if (month !== undefined) {
        const d = new Date(+m[5], month, +m[3], +m[1], +m[2]);
        if (!isNaN(d.getTime())) return d.toISOString();
      }
    }
  }
  return new Date().toISOString();
}

const eur = (n?: number | null) =>
  n == null ? "—" : n.toFixed(2).replace(".", ",") + " €";

function toInput(bet: WmxBet, userId: string, groupId: string): CreateBetInput {
  const esCombi = /combinada/i.test(bet.tipo ?? "");
  const primerMercado = bet.selecciones?.find((s) => s.mercado)?.mercado ?? "";
  return {
    userId,
    bookmaker: "winamax",
    matchIds: [],
    matchLabel: (bet.evento || bet.descripcion || "Winamax").slice(0, 250),
    market: esCombi ? "combo" : "custom",
    marketDetail: (primerMercado || bet.tipo || "").slice(0, 150),
    selection: (bet.descripcion || bet.evento || "Apuesta Winamax").slice(0, 300),
    odds: bet.cuota as number,
    stake: bet.importe as number,
    placedAt: parseFecha(bet.fecha),
    isFreebet: false,
    notes: `Importada de Winamax #wmx:${bet.ref ?? bet.id}`,
    teams: [],
    groupIds: [groupId],
  };
}

export default function ConexionPage() {
  const { appUser } = useAuth();
  const { activeGroup } = useGroup();

  const [estado, setEstado] = useState<Estado>("checking");
  const [payload, setPayload] = useState<WmxPayload | null>(null);
  const [importedRefs, setImportedRefs] = useState<Set<string>>(new Set());
  const [importing, setImporting] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  // Prueba de conexión con el ayudante local.
  const comprobar = useCallback(async () => {
    setEstado("checking");
    try {
      const res = await fetch(`${AYUDANTE}/datos`, { cache: "no-store" });
      if (!res.ok) throw new Error("no ok");
      setPayload((await res.json()) as WmxPayload);
      setEstado("ok");
    } catch {
      setPayload(null);
      setEstado("offline");
    }
  }, []);

  useEffect(() => {
    comprobar();
  }, [comprobar]);

  // Apuestas de Winamax ya importadas por este usuario (para no duplicar).
  useEffect(() => {
    if (!appUser) return;
    const unsub = subscribeToBets(
      { userId: appUser.uid },
      (bets) => {
        const refs = new Set<string>();
        for (const b of bets) {
          if (b.bookmaker !== "winamax") continue;
          const m = (b.notes ?? "").match(/#wmx:(\S+)/);
          if (m) refs.add(m[1]);
        }
        setImportedRefs(refs);
      },
      (err) => console.error("[conexion] bets", err)
    );
    return unsub;
  }, [appUser?.uid]);

  async function importar(bet: WmxBet) {
    if (!appUser || !activeGroup) return;
    const ref = bet.ref ?? bet.id;
    setImporting(ref);
    setFeedback(null);
    try {
      await createBet(toInput(bet, appUser.uid, activeGroup.id));
      setImportedRefs((prev) => new Set(prev).add(ref));
      setFeedback(`Añadida a tus apuestas: ${bet.evento ?? "apuesta"}`);
    } catch (e) {
      setFeedback(`No se pudo añadir: ${(e as Error).message}`);
    } finally {
      setImporting(null);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="font-display flex items-center gap-2 text-2xl font-bold">
          <Link2 className="h-6 w-6 text-primary" /> Conexión Winamax
        </h1>
        <p className="text-sm text-muted-foreground">
          Conecta tu Winamax y pasa tus apuestas al feed sin escribirlas a mano.
        </p>
      </div>

      {/* Estado de conexión */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <CardTitle className="flex items-center gap-2 text-base">
              {estado === "checking" && (
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              )}
              {estado === "ok" && <CheckCircle2 className="h-5 w-5 text-profit" />}
              {estado === "offline" && <XCircle className="h-5 w-5 text-loss" />}
              {estado === "checking" && "Comprobando conexión…"}
              {estado === "ok" && "Conectado a tu Winamax"}
              {estado === "offline" && "Ayudante no detectado"}
            </CardTitle>
            <Button variant="outline" size="sm" onClick={comprobar}>
              <RefreshCw className="h-4 w-4" /> Probar conexión
            </Button>
          </div>
        </CardHeader>
        {estado === "offline" && (
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>Para conectar tu Winamax necesitas, una sola vez:</p>
            <ol className="ml-4 list-decimal space-y-1">
              <li>Instalar la extensión <strong>Vigilante Apuestas Winamax</strong> en tu Chrome.</li>
              <li>Abrir el <strong>ayudante</strong> (icono &quot;Vigilante Winamax&quot;) y dejarlo corriendo.</li>
              <li>Entrar en Winamax y abrir tu &quot;Mis apuestas&quot; una vez.</li>
            </ol>
            <p>Luego pulsa <strong>Probar conexión</strong>.</p>
          </CardContent>
        )}
        {estado === "ok" && payload && (
          <CardContent>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Resumen k="Activas" v={String(payload.resumen.activas)} />
              <Resumen k="En juego" v={eur(payload.resumen.enJuego)} />
              <Resumen k="A cobrar" v={eur(payload.resumen.potencial)} />
              <Resumen
                k="Actualizado"
                v={payload.actualizado.split(",").pop()?.trim() ?? ""}
              />
            </div>
          </CardContent>
        )}
      </Card>

      {/* Aviso de grupo */}
      {estado === "ok" && !activeGroup && (
        <p className="text-sm text-loss">
          Únete a un grupo para poder añadir apuestas a tu feed.
        </p>
      )}
      {feedback && <p className="text-sm text-primary">{feedback}</p>}

      {/* Lista de apuestas de Winamax */}
      {estado === "ok" && payload && (
        <div className="space-y-3">
          {payload.apuestas.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No hay apuestas en curso en tu Winamax.
            </p>
          )}
          {payload.apuestas.map((bet) => {
            const ref = bet.ref ?? bet.id;
            const yaEsta = importedRefs.has(ref);
            const sinCuota = bet.cuota == null;
            return (
              <Card key={ref}>
                <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{bet.evento || "Apuesta"}</span>
                      <Badge variant="muted">{bet.tipo}</Badge>
                    </div>
                    <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                      {bet.descripcion}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Cuota {bet.cuota != null ? String(bet.cuota).replace(".", ",") : "—"} ·
                      Importe {eur(bet.importe)} · A cobrar{" "}
                      {eur(
                        bet.importe != null && bet.cuota != null
                          ? bet.importe * bet.cuota
                          : null
                      )}
                    </p>
                  </div>
                  <div className="shrink-0">
                    {yaEsta ? (
                      <Badge variant="secondary" className="gap-1">
                        <Check className="h-3.5 w-3.5" /> En tus apuestas
                      </Badge>
                    ) : (
                      <Button
                        size="sm"
                        disabled={
                          !activeGroup || sinCuota || importing === ref
                        }
                        onClick={() => importar(bet)}
                        title={sinCuota ? "Sin cuota detectada" : undefined}
                      >
                        {importing === ref ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Plus className="h-4 w-4" />
                        )}
                        {sinCuota ? "Sin cuota" : "Añadir a mis apuestas"}
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Resumen({ k, v }: { k: string; v: string }) {
  return (
    <div className="rounded-lg border bg-card/50 p-3">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{k}</div>
      <div className="mt-0.5 text-lg font-bold">{v}</div>
    </div>
  );
}
