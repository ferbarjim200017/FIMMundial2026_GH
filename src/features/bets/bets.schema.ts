import { z } from "zod";

export const BOOKMAKERS = ["bet365", "winamax", "betfair", "other"] as const;

export const MARKET_OPTIONS = [
  { value: "winner", label: "Ganador del partido" },
  { value: "double_chance", label: "Doble oportunidad" },
  { value: "over_under", label: "Over/Under goles" },
  { value: "btts", label: "Ambos marcan" },
  { value: "correct_score", label: "Resultado exacto" },
  { value: "scorer", label: "Goleador" },
  { value: "cards", label: "Tarjetas" },
  { value: "corners", label: "Corners" },
  { value: "shots", label: "Tiros" },
  { value: "shots_on_target", label: "Tiros a puerta" },
  { value: "fouls", label: "Faltas" },
  { value: "superaumento", label: "Superaumento" },
  { value: "asegurada", label: "Asegurada" },
  { value: "outright", label: "Apuesta a futuro / outright" },
  { value: "combo", label: "Combinada" },
  { value: "custom", label: "Mercado personalizado" },
] as const;

export const STATUS_OPTIONS = [
  { value: "pending", label: "Pendiente", color: "bg-muted text-foreground" },
  { value: "won", label: "Ganada", color: "bg-profit/15 text-profit" },
  { value: "lost", label: "Perdida", color: "bg-loss/15 text-loss" },
  { value: "void", label: "Nula", color: "bg-muted text-muted-foreground" },
  { value: "cashout", label: "Cashout", color: "bg-primary/15 text-primary" },
] as const;

export const BOOKMAKER_OPTIONS = [
  { value: "bet365", label: "Bet365" },
  { value: "winamax", label: "Winamax" },
  { value: "betfair", label: "Betfair" },
  { value: "other", label: "Otra" },
] as const;

// ---------- Schemas ----------

export const betFormSchema = z
  .object({
    bookmaker: z.enum(BOOKMAKERS),
    bookmakerLabel: z.string().max(60).optional(),
    matchIds: z.array(z.string()).optional().default([]),
    matchLabel: z
      .string()
      .min(2, "Indica el partido (selecciónalo o escríbelo)")
      .max(250),
    market: z.enum([
      "winner",
      "double_chance",
      "over_under",
      "btts",
      "correct_score",
      "scorer",
      "cards",
      "corners",
      "shots",
      "shots_on_target",
      "fouls",
      "superaumento",
      "asegurada",
      "outright",
      "combo",
      "custom",
    ]),
    marketDetail: z.string().max(150).optional().default(""),
    selection: z.string().min(1, "Indica tu selección").max(300),
    odds: z.coerce
      .number()
      .min(1.01, "La cuota debe ser >= 1.01")
      .max(99999, "Cuota demasiado alta (máx. 5 dígitos)"),
    stake: z.coerce
      .number()
      .min(0.01, "El stake debe ser > 0")
      .max(100000, "Stake demasiado alto"),
    placedAt: z.string().min(1, "Selecciona fecha"),
    isFreebet: z.boolean().optional().default(false),
    notes: z.string().max(1000).optional().default(""),
    /** Solo se usa cuando market === "outright". Vincula la apuesta a uno
     *  o varios equipos para que aparezca en el popup de sus partidos. */
    teams: z.array(z.string()).optional().default([]),
    /** Grupos a los que se asigna la apuesta. Mínimo uno. La UI por
     *  defecto lo rellena con el grupo activo del autor. */
    groupIds: z
      .array(z.string())
      .min(1, "Indica al menos un grupo")
      .default([]),
  })
  .refine(
    (data) => data.bookmaker !== "other" || (data.bookmakerLabel ?? "").length >= 2,
    {
      message: "Indica el nombre de la casa de apuestas",
      path: ["bookmakerLabel"],
    }
  );

export type BetFormValues = z.infer<typeof betFormSchema>;

export const settleSchema = z.object({
  status: z.enum(["won", "lost", "void", "cashout"]),
  cashoutProfit: z.coerce.number().optional(),
});
export type SettleValues = z.infer<typeof settleSchema>;
