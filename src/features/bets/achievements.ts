import type { Bet, UserStats } from "@/types/domain";
import { betMatchIds } from "@/features/bets/bets.utils";

/**
 * Logro/insignia de un jugador. `earned` indica si ya lo tiene desbloqueado.
 * Se calcula solo con datos que ya están en memoria (las apuestas del jugador
 * en el grupo + sus stats), sin lecturas extra a Firestore.
 */
export interface Achievement {
  id: string;
  title: string;
  description: string;
  emoji: string;
  earned: boolean;
}

const HIGH_ODDS = 5; // cuota que cuenta como "cuotón"
const HIGH_STAKE = 50; // stake (dinero real) que cuenta como "high roller"
const HIT_RATE_MIN_DECIDED = 10; // mínimo de decididas para el logro de acierto

/**
 * Lista de logros del jugador con su estado (desbloqueado o no). El orden es el
 * de presentación. Las condiciones usan `status === "won"` para "aciertos de
 * verdad" (un cashout no cuenta como acierto), igual que el resto de la app.
 */
export function computeAchievements(
  bets: Bet[],
  stats: UserStats
): Achievement[] {
  const total = bets.length;
  const decided = stats.betsWon + stats.betsLost;
  const hours = bets.map((b) => (b.addedAt ?? b.createdAt).toDate().getHours());
  const distinctMatches = new Set<string>();
  for (const b of bets) for (const id of betMatchIds(b)) distinctMatches.add(id);
  const has = (pred: (b: Bet) => boolean) => bets.some(pred);

  return [
    {
      id: "debut",
      emoji: "🎫",
      title: "Estreno",
      description: "Registra tu primera apuesta.",
      earned: total >= 1,
    },
    {
      id: "first-win",
      emoji: "✅",
      title: "Primer acierto",
      description: "Gana tu primera apuesta.",
      earned: stats.betsWon >= 1,
    },
    {
      id: "green",
      emoji: "💚",
      title: "En verde",
      description: "Ten el beneficio total en positivo.",
      earned: stats.totalProfit > 0,
    },
    {
      id: "big-odds",
      emoji: "🎯",
      title: "Cuotón clavado",
      description: `Acierta una cuota de ${HIGH_ODDS.toFixed(2)} o más.`,
      earned: has((b) => b.status === "won" && b.odds >= HIGH_ODDS),
    },
    {
      id: "combo",
      emoji: "🧩",
      title: "Combinada maestra",
      description: "Gana una combinada.",
      earned: has((b) => !!b.isCombo && b.status === "won"),
    },
    {
      id: "streak3",
      emoji: "🔥",
      title: "En racha",
      description: "Encadena 3 victorias seguidas.",
      earned: stats.bestStreak >= 3,
    },
    {
      id: "streak5",
      emoji: "🌋",
      title: "Imparable",
      description: "Encadena 5 victorias seguidas.",
      earned: stats.bestStreak >= 5,
    },
    {
      id: "sniper",
      emoji: "🎖️",
      title: "Francotirador",
      description: `Acierta ≥ 60% (mín. ${HIT_RATE_MIN_DECIDED} decididas).`,
      earned: decided >= HIT_RATE_MIN_DECIDED && stats.hitRate >= 60,
    },
    {
      id: "veteran",
      emoji: "🏅",
      title: "Veterano",
      description: "Registra 50 apuestas.",
      earned: total >= 50,
    },
    {
      id: "century",
      emoji: "💯",
      title: "Centenario",
      description: "Registra 100 apuestas.",
      earned: total >= 100,
    },
    {
      id: "early",
      emoji: "🌅",
      title: "Madrugador",
      description: "Apuesta entre las 08:00 y las 13:00.",
      earned: hours.some((h) => h >= 8 && h < 13),
    },
    {
      id: "owl",
      emoji: "🦉",
      title: "Búho nocturno",
      description: "Apuesta entre las 22:00 y las 06:00.",
      earned: hours.some((h) => h >= 22 || h < 6),
    },
    {
      id: "freebet",
      emoji: "🎁",
      title: "Gratis total",
      description: "Gana una freebet.",
      earned: has((b) => !!b.isFreebet && b.status === "won"),
    },
    {
      id: "highroller",
      emoji: "💰",
      title: "High roller",
      description: `Juega ${HIGH_STAKE}€ o más en una sola apuesta.`,
      earned: has((b) => !b.isFreebet && b.stake >= HIGH_STAKE),
    },
    {
      id: "worldwide",
      emoji: "🌍",
      title: "Trotamundos",
      description: "Apuesta a 10 partidos distintos.",
      earned: distinctMatches.size >= 10,
    },
  ];
}
