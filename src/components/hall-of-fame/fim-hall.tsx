"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion, type Variants } from "framer-motion";
import { Coins, Crown, Receipt, Skull, Sparkles, Trophy } from "lucide-react";
import { subscribeToAllBets } from "@/features/bets/bets.service";
import { subscribeToMatches } from "@/features/matches/matches.service";
import { betInGroup } from "@/features/bets/bets.utils";
import { useGroup } from "@/features/groups/groups.context";
import { isFirebaseConfigured } from "@/lib/firebase/client";
import {
  computeFimHall,
  computeFimMatchTops,
  type FimComboStat,
  type FimMatchStat,
  type FimMemberStat,
} from "@/features/hall-of-fame/fim-hall.utils";
import { TeamFlag } from "@/components/matches/team-flag";
import { MatchBetsDialog } from "@/components/world-cup/match-bets-dialog";
import { cn, formatCurrency, profitClass } from "@/lib/utils";
import type { Bet, Match } from "@/types/domain";

/* ── Imagen que rota entre las fotos (ratio fijo → sin distorsión) ── */
function RotatingImage({ images, alt }: { images: string[]; alt: string }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (images.length <= 1) return;
    const id = setInterval(
      () => setI((p) => (p + 1) % images.length),
      3200 + Math.random() * 2200
    );
    return () => clearInterval(id);
  }, [images.length]);

  if (images.length === 0) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-zinc-800 text-xs text-muted-foreground">
        Sin foto
      </div>
    );
  }
  const src = images[i % images.length];
  return (
    <AnimatePresence initial={false}>
      <motion.img
        key={src}
        src={src}
        alt={alt}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 1 }}
        className="absolute inset-0 h-full w-full object-cover"
        draggable={false}
      />
    </AnimatePresence>
  );
}

function FlagBox({ home, away }: { home: string; away: string }) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-gradient-to-br from-zinc-600 via-zinc-800 to-black">
      <div className="flex items-center gap-2">
        <TeamFlag name={home} className="h-9 w-14 rounded shadow-md" />
        <span className="text-xs font-bold text-white/60">VS</span>
        <TeamFlag name={away} className="h-9 w-14 rounded shadow-md" />
      </div>
    </div>
  );
}

const container: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07 } },
};
const item: Variants = {
  hidden: { opacity: 0, y: 26 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: "easeOut" } },
};

type Badge = { text: string; tone?: string };

/* ── Card uniforme (persona, combo o partido). Hover = se amplía. ── */
function GalleryCard({
  images,
  flags,
  rank,
  eyebrow,
  title,
  badge,
  corner,
  cornerBad,
  accent,
  onClick,
  mtClass,
}: {
  images?: string[];
  flags?: [string, string];
  rank?: number;
  eyebrow?: string;
  title: string;
  badge?: Badge;
  corner?: string;
  cornerBad?: boolean;
  accent?: string;
  onClick?: () => void;
  mtClass?: string;
}) {
  const inner = (
    <>
      <div className="relative aspect-[4/5] w-full overflow-hidden rounded-xl bg-zinc-800">
        {images ? (
          <RotatingImage images={images} alt={title} />
        ) : flags ? (
          <FlagBox home={flags[0]} away={flags[1]} />
        ) : null}
        {rank !== undefined && (
          <span className="absolute left-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/65 text-sm font-black text-white backdrop-blur">
            {rank}
          </span>
        )}
        {corner && (
          <span
            className={cn(
              "absolute right-2 top-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-white shadow",
              cornerBad ? "bg-loss" : "bg-profit"
            )}
          >
            {cornerBad ? (
              <Skull className="h-2.5 w-2.5" />
            ) : (
              <Trophy className="h-2.5 w-2.5" />
            )}
            {corner}
          </span>
        )}
      </div>
      <div className="px-1 pt-2.5 text-center">
        {eyebrow && (
          <p className="truncate text-[10px] font-bold uppercase tracking-widest text-primary">
            {eyebrow}
          </p>
        )}
        <h3 className="truncate text-base font-black leading-tight">{title}</h3>
        {badge && (
          <span
            className={cn(
              "mt-1.5 inline-block rounded-full border border-white/15 px-2.5 py-0.5 font-mono text-xs font-bold",
              badge.tone
            )}
          >
            {badge.text}
          </span>
        )}
      </div>
    </>
  );

  const cls = cn(
    "group relative flex flex-col rounded-2xl border bg-zinc-900/50 p-2.5 shadow-lg transition-shadow hover:z-20 hover:shadow-2xl",
    accent ?? "border-white/10",
    mtClass
  );

  const motionProps = {
    variants: item,
    whileHover: { scale: 1.06 },
    transition: { type: "spring" as const, stiffness: 300, damping: 20 },
  };

  if (onClick) {
    return (
      <motion.button type="button" onClick={onClick} {...motionProps} className={cls}>
        {inner}
      </motion.button>
    );
  }
  return (
    <motion.div {...motionProps} className={cls}>
      {inner}
    </motion.div>
  );
}

function BigTitle({
  children,
  subtitle,
  icon,
}: {
  children: React.ReactNode;
  subtitle?: string;
  icon?: React.ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 22 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.6 }}
      transition={{ duration: 0.5 }}
    >
      {icon && <div className="mb-1 text-primary">{icon}</div>}
      <h2 className="text-3xl font-black uppercase leading-[0.9] tracking-tighter md:text-5xl">
        {children}
      </h2>
      {subtitle && (
        <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
      )}
    </motion.div>
  );
}

// Escalonado tipo "muro" para las filas de 3.
const STAGGER3 = ["md:mt-0", "md:mt-12", "md:mt-5"];

function Section({
  title,
  subtitle,
  icon,
  children,
  cols = "grid-cols-1 sm:grid-cols-3",
}: {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  cols?: string;
}) {
  return (
    <section className="space-y-5">
      <BigTitle subtitle={subtitle} icon={icon}>
        {title}
      </BigTitle>
      <motion.div
        variants={container}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, amount: 0.15 }}
        className={cn("grid gap-4", cols)}
      >
        {children}
      </motion.div>
    </section>
  );
}

function HeroBackdrop({ images }: { images: string[] }) {
  if (images.length === 0) return null;
  return (
    <div className="absolute inset-0 opacity-25">
      <RotatingImage images={images} alt="" />
      <div className="absolute inset-0 bg-gradient-to-t from-background via-background/70 to-background/30 backdrop-blur-[2px]" />
    </div>
  );
}

const profitBadge = (v: number): Badge => ({
  text: `${v > 0 ? "+" : ""}${formatCurrency(v)}`,
  tone: profitClass(v),
});

export function FimHall() {
  const { memberUids, activeGroup, groupMembers } = useGroup();
  const [allBets, setAllBets] = useState<Bet[] | null>(null);
  const [matches, setMatches] = useState<Match[]>([]);
  const [selectedMatch, setSelectedMatch] = useState<Match | null>(null);

  useEffect(() => {
    if (!isFirebaseConfigured) {
      setAllBets([]);
      return;
    }
    const unsubBets = subscribeToAllBets(setAllBets);
    const unsubMatches = subscribeToMatches(setMatches, () => setMatches([]));
    return () => {
      unsubBets();
      unsubMatches();
    };
  }, []);

  const matchById = useMemo(() => {
    const m = new Map<string, Match>();
    for (const x of matches) m.set(x.id, x);
    return m;
  }, [matches]);

  const bets = useMemo(() => {
    if (allBets === null) return null;
    if (!activeGroup || memberUids.size === 0) return null;
    return allBets.filter(
      (b) => betInGroup(b, activeGroup.id) && memberUids.has(b.userId)
    );
  }, [allBets, memberUids, activeGroup]);

  const data = useMemo(
    () => (bets ? computeFimHall(bets, groupMembers) : null),
    [bets, groupMembers]
  );
  const matchTops = useMemo(
    () => (bets ? computeFimMatchTops(bets, matches) : null),
    [bets, matches]
  );

  const rankings = useMemo(() => {
    if (!data) return null;
    const ms = data.members;
    return {
      byProfit: [...ms].sort((a, b) => b.profit - a.profit).slice(0, 3),
      byWon: [...ms].sort((a, b) => b.won - a.won).slice(0, 3),
      byLoss: [...ms].sort((a, b) => a.profit - b.profit).slice(0, 3),
      byBets: [...ms].sort((a, b) => b.betsCount - a.betsCount).slice(0, 3),
    };
  }, [data]);

  const heroImages = useMemo(() => {
    if (!data) return [];
    return data.members
      .flatMap((m) => m.images)
      .sort(() => Math.random() - 0.5)
      .slice(0, 12);
  }, [data]);

  if (!data || !rankings || !matchTops) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-muted-foreground">
        Cargando el Salón de la Fama…
      </div>
    );
  }

  const openMatch = (id: string) => setSelectedMatch(matchById.get(id) ?? null);

  // Helpers de construcción de tarjetas.
  const peopleCards = (list: FimMemberStat[], badge: (m: FimMemberStat) => Badge) =>
    list.map((m, i) => (
      <GalleryCard
        key={m.key}
        images={m.images}
        rank={i + 1}
        eyebrow={m.mote}
        title={m.name}
        badge={badge(m)}
        mtClass={STAGGER3[i]}
      />
    ));

  const matchCards = (
    list: FimMatchStat[],
    badge: (m: FimMatchStat) => Badge
  ) =>
    list.map((mt, i) => (
      <GalleryCard
        key={mt.matchId}
        flags={[mt.home, mt.away]}
        rank={i + 1}
        title={`${mt.home} · ${mt.away}`}
        badge={badge(mt)}
        onClick={() => openMatch(mt.matchId)}
        mtClass={STAGGER3[i]}
      />
    ));

  const comboCards = (list: FimComboStat[]) =>
    list.map((c, i) => (
      <GalleryCard
        key={c.key}
        images={c.images}
        eyebrow={c.nickname ? `«${c.nickname}»` : undefined}
        title={c.names.join(" · ")}
        badge={profitBadge(c.profit)}
        corner={c.badge ?? undefined}
        cornerBad={c.badge?.includes("perdedor")}
        accent={
          c.badge
            ? c.badge.includes("perdedor")
              ? "border-loss/60"
              : "border-profit/60"
            : undefined
        }
        mtClass={i % 2 ? "sm:mt-8" : ""}
      />
    ));

  return (
    <div className="space-y-14 pb-10">
      {/* HERO */}
      <motion.section
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.8 }}
        className="relative -mx-4 overflow-hidden rounded-b-3xl border-b border-white/10 px-4 py-16 text-center md:-mx-6 md:px-6 md:py-24"
      >
        <HeroBackdrop images={heroImages} />
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.1, type: "spring", damping: 16 }}
          className="relative"
        >
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-xs font-bold uppercase tracking-widest text-primary">
            <Crown className="h-3.5 w-3.5" /> Edición FIM
          </div>
          <h1 className="text-5xl font-black uppercase leading-[0.85] tracking-tighter md:text-8xl">
            Salón de
            <br />
            <span className="bg-gradient-to-r from-primary via-sky-400 to-primary bg-clip-text text-transparent">
              la Fama
            </span>
          </h1>
          <p className="mx-auto mt-4 max-w-md text-sm text-muted-foreground">
            Leyendas, ludópatas y algún que otro manco — todos inmortalizados
            aquí con sus números.
          </p>
        </motion.div>
      </motion.section>

      {/* Reyes del beneficio */}
      <Section
        title="Reyes del beneficio"
        subtitle="Top 3 con más beneficio total"
        icon={<Crown className="h-6 w-6" />}
      >
        {peopleCards(rankings.byProfit, (m) => profitBadge(m.profit))}
      </Section>

      {/* Partidos con más ganancias */}
      {matchTops.gains.length > 0 && (
        <Section
          title="Partidos más rentables"
          subtitle="Datos globales del grupo · pulsa para ver las apuestas"
          icon={<Trophy className="h-6 w-6" />}
        >
          {matchCards(matchTops.gains, (m) => profitBadge(m.profit))}
        </Section>
      )}

      {/* Las más ganadoras */}
      <Section
        title="Las más ganadoras"
        subtitle="Top 3 por apuestas acertadas"
        icon={<Trophy className="h-6 w-6" />}
      >
        {peopleCards(rankings.byWon, (m) => ({
          text: `${m.won} ganadas`,
          tone: "text-profit",
        }))}
      </Section>

      {/* Dúos */}
      {data.duos.length > 0 && (
        <Section
          title="Dúos"
          subtitle="Las parejas de hecho del grupo"
          icon={<Sparkles className="h-6 w-6" />}
          cols="grid-cols-2 sm:grid-cols-3 lg:grid-cols-4"
        >
          {comboCards(data.duos)}
        </Section>
      )}

      {/* Los más mancos */}
      <Section
        title="Los más mancos"
        subtitle="Top 3 que más palos se han comido"
        icon={<Skull className="h-6 w-6" />}
      >
        {peopleCards(rankings.byLoss, (m) => profitBadge(m.profit))}
      </Section>

      {/* Partidos con más pérdidas */}
      {matchTops.losses.length > 0 && (
        <Section
          title="Partidos malditos"
          subtitle="Donde el grupo más ha palmado · pulsa para abrir"
          icon={<Skull className="h-6 w-6" />}
        >
          {matchCards(matchTops.losses, (m) => profitBadge(m.profit))}
        </Section>
      )}

      {/* Los más viciados */}
      <Section
        title="Los más viciados"
        subtitle="Top 3 que más apuestan"
        icon={<Receipt className="h-6 w-6" />}
      >
        {peopleCards(rankings.byBets, (m) => ({
          text: `${m.betsCount} ap.`,
          tone: "text-white",
        }))}
      </Section>

      {/* Tríos */}
      {data.trios.length > 0 && (
        <Section
          title="Tríos"
          subtitle="Cuando se juntan tres"
          icon={<Sparkles className="h-6 w-6" />}
          cols="grid-cols-2 sm:grid-cols-3 lg:grid-cols-4"
        >
          {comboCards(data.trios)}
        </Section>
      )}

      {/* Partidos con más apuestas */}
      {matchTops.mostBets.length > 0 && (
        <Section
          title="Partidos más calientes"
          subtitle="Los que más apuestas han movido · pulsa para abrir"
          icon={<Receipt className="h-6 w-6" />}
        >
          {matchCards(matchTops.mostBets, (m) => ({
            text: `${m.count} ap.`,
            tone: "text-white",
          }))}
        </Section>
      )}

      {/* Partidos con más dinero */}
      {matchTops.mostStaked.length > 0 && (
        <Section
          title="Partidos de billetes"
          subtitle="Donde más dinero se ha jugado · pulsa para abrir"
          icon={<Coins className="h-6 w-6" />}
        >
          {matchCards(matchTops.mostStaked, (m) => ({
            text: formatCurrency(m.staked),
            tone: "text-gold",
          }))}
        </Section>
      )}

      {/* Cuarteto */}
      {data.quads.length > 0 && (
        <Section
          title="La banda al completo"
          subtitle="Los cuartetos legendarios"
          icon={<Crown className="h-6 w-6" />}
          cols="grid-cols-2 sm:grid-cols-3 lg:grid-cols-4"
        >
          {comboCards(data.quads)}
        </Section>
      )}

      <MatchBetsDialog
        match={selectedMatch}
        open={!!selectedMatch}
        onOpenChange={(o) => !o && setSelectedMatch(null)}
      />
    </div>
  );
}
