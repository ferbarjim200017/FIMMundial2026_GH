import { betOutcome } from "@/features/bets/bets.utils";
import type { Bet } from "@/types/domain";

export type HofTone = "good" | "bad";

export interface PodiumDef {
  key: string;
  label: string;
  tone: HofTone;
}

/**
 * Catálogo de podios del Salón de la Fama que cuentan PERSONAS (los de partidos
 * no entran aquí). El orden y los criterios deben coincidir con los de la
 * página `/hall-of-fame`, porque de aquí sale la "pertenencia" que se compara
 * para detectar quién entra nuevo.
 */
export const HOF_PODIUMS: PodiumDef[] = [
  { key: "topGains", label: "Top 3 ganancias", tone: "good" },
  { key: "machadas", label: "Top 3 machadas", tone: "good" },
  { key: "valientes", label: "Top 3 valientes", tone: "good" },
  { key: "kings", label: "Reyes del beneficio", tone: "good" },
  { key: "ganadoras", label: "Más ganadoras", tone: "good" },
  { key: "topLosses", label: "Top 3 pérdidas", tone: "bad" },
  { key: "sufridores", label: "Los más sufridores", tone: "bad" },
];

/** podiumKey -> uids que están actualmente en ese podio (top 3). */
export type HofMembership = Record<string, string[]>;

/** uids únicos (preservando orden) que aparecen como autores de una lista de apuestas. */
function authorsOf(list: Bet[]): string[] {
  const out: string[] = [];
  for (const b of list) if (!out.includes(b.userId)) out.push(b.userId);
  return out;
}

/**
 * Calcula, para cada podio "de personas", el conjunto de uids que lo ocupan.
 * Espejo de la lógica de la página del Salón de la Fama.
 */
export function computeHofMembership(bets: Bet[]): HofMembership {
  const settled = bets.filter((b) => b.status !== "pending");

  const topGains = authorsOf(
    [...settled]
      .filter((b) => (b.profit ?? 0) > 0)
      .sort((a, b) => b.profit - a.profit)
      .slice(0, 3)
  );
  const topLosses = authorsOf(
    [...settled]
      .filter((b) => (b.profit ?? 0) < 0)
      .sort((a, b) => a.profit - b.profit)
      .slice(0, 3)
  );
  const machadas = authorsOf(
    [...settled]
      .filter((b) => b.status === "won")
      .sort((a, b) => b.odds - a.odds)
      .slice(0, 3)
  );
  const valientes = authorsOf(
    [...bets]
      .filter((b) => !b.isFreebet)
      .sort((a, b) => b.stake - a.stake)
      .slice(0, 3)
  );

  const agg = new Map<string, { profit: number; won: number }>();
  for (const b of bets) {
    if (b.status === "pending") continue;
    const cur = agg.get(b.userId) ?? { profit: 0, won: 0 };
    cur.profit += b.profit ?? 0;
    if (betOutcome(b) === "won") cur.won += 1;
    agg.set(b.userId, cur);
  }
  const aggArr = [...agg.entries()].map(([uid, v]) => ({ uid, ...v }));
  const kings = aggArr
    .filter((u) => u.profit > 0)
    .sort((a, b) => b.profit - a.profit)
    .slice(0, 3)
    .map((u) => u.uid);
  const sufridores = aggArr
    .filter((u) => u.profit < 0)
    .sort((a, b) => a.profit - b.profit)
    .slice(0, 3)
    .map((u) => u.uid);
  const ganadoras = aggArr
    .filter((u) => u.won > 0)
    .sort((a, b) => b.won - a.won)
    .slice(0, 3)
    .map((u) => u.uid);

  return { topGains, topLosses, machadas, valientes, kings, sufridores, ganadoras };
}

/**
 * Frases del banner según el podio. Los positivos felicitan; los negativos se
 * meten con cariño con el recién llegado. `{name}` se sustituye por el nombre.
 */
const PHRASES: Record<string, string[]> = {
  topGains: [
    "🤑 {name} se ha colado en el Top 3 de ganancias. ¡Máquina absoluta!",
    "💸 {name} se está forrando: entra directo al Top 3 de ganancias.",
    "🔥 Aplausos para {name}, nuevo miembro del Top 3 de ganancias.",
  ],
  machadas: [
    "🎯 {name} ha clavado una machada y entra en el Top 3 de cuotazas.",
    "🪄 Pura magia de {name}: se mete en el Top 3 de mayores cuotas acertadas.",
    "🧠 {name} la vio venir. Bienvenido al Top 3 de machadas.",
  ],
  valientes: [
    "🦁 {name} no tiene sangre en las venas: entra en el Top 3 de valientes.",
    "💪 Menudos huevos, {name}. Top 3 de las apuestas más bestias.",
    "🎰 {name} apuesta sin miedo y se cuela entre los más valientes.",
  ],
  kings: [
    "👑 {name} reina en el grupo: entra en los Reyes del beneficio.",
    "🏆 {name} se sienta en el trono del beneficio. ¡Crack!",
    "💰 Inclinaos: {name} es nuevo Rey del beneficio.",
  ],
  ganadoras: [
    "✅ {name} no falla una: entra en el Top 3 de más apuestas ganadas.",
    "📈 {name} gana y gana. Nuevo en el podio de las ganadoras.",
    "🎯 {name} acierta hasta dormido. Top 3 de ganadoras.",
  ],
  topLosses: [
    "💀 {name} acaba de entrar en el Top 3 de PALOS. Manco de nivel mundial. 🤡",
    "📉 Atención: {name} se estrella y entra en el Top 3 de pérdidas. Un fenómeno… para perder.",
    "🪦 {name} va regalando el dinero: bienvenido al Top 3 de batacazos.",
  ],
  sufridores: [
    "🤡 {name} entra en Los más sufridores. ¿Pero tú apuestas con los pies?",
    "🥶 {name} no da ni una: nuevo socio del club de los más sufridores. Da penita.",
    "📉 {name} sangra dinero y se cuela entre los más sufridores. Patético (con cariño).",
  ],
};

export function buildEntryPhrase(podiumKey: string, name: string): string {
  const list = PHRASES[podiumKey] ?? ["{name} entra en el Salón de la Fama."];
  const tpl = list[Math.floor(Math.random() * list.length)];
  return tpl.replace("{name}", name);
}

/** Firma estable (independiente del orden) de una pertenencia, para comparar. */
export function membershipSig(m: HofMembership): string {
  return Object.keys(m)
    .sort()
    .map((k) => `${k}:${[...(m[k] ?? [])].sort().join(",")}`)
    .join("|");
}
