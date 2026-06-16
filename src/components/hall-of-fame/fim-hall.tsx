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

const container: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07 } },
};
const item: Variants = {
  hidden: { opacity: 0, y: 26 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: "easeOut" } },
};

// La métrica es la protagonista: un valor grande + una etiqueta pequeña.
type Metric = { value: string; label?: string; tone?: string };

/* ── Card de persona/combo. El dato (métrica) manda; el puesto da igual. ── */
function GalleryCard({
  images,
  eyebrow,
  title,
  metric,
  corner,
  cornerBad,
  accent,
  mtClass,
}: {
  images: string[];
  eyebrow?: string;
  title: string;
  metric: Metric;
  corner?: string;
  cornerBad?: boolean;
  accent?: string;
  mtClass?: string;
}) {
  return (
    <motion.div
      variants={item}
      whileHover={{ scale: 1.06 }}
      transition={{ type: "spring", stiffness: 300, damping: 20 }}
      className={cn(
        "group relative flex flex-col rounded-2xl border bg-zinc-900/50 p-2.5 shadow-lg transition-shadow hover:z-20 hover:shadow-2xl",
        accent ?? "border-white/10",
        mtClass
      )}
    >
      <div className="relative aspect-[4/5] w-full overflow-hidden rounded-xl bg-zinc-800">
        <RotatingImage images={images} alt={title} />
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
      <div className="px-1 pt-2 text-center">
        {eyebrow && (
          <p className="truncate text-[10px] font-bold uppercase tracking-widest text-primary">
            {eyebrow}
          </p>
        )}
        <h3 className="truncate text-sm font-black leading-tight">{title}</h3>
        <p
          className={cn(
            "mt-1 text-2xl font-black leading-none md:text-3xl",
            metric.tone ?? "text-white"
          )}
        >
          {metric.value}
        </p>
        {metric.label && (
          <p className="text-[9px] font-semibold uppercase tracking-widest text-white/45">
            {metric.label}
          </p>
        )}
      </div>
    </motion.div>
  );
}

/* ── Card compacta de partido (abajo del todo, con banderas) ── */
function MatchCard({
  mt,
  metric,
  onClick,
}: {
  mt: FimMatchStat;
  metric: Metric;
  onClick: () => void;
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      variants={item}
      whileHover={{ scale: 1.02 }}
      transition={{ type: "spring", stiffness: 300, damping: 22 }}
      className="flex items-center gap-3 rounded-xl border border-white/10 bg-zinc-900/50 p-3 text-left transition-colors hover:bg-zinc-800/60"
    >
      <div className="flex shrink-0 items-center gap-1">
        <TeamFlag name={mt.home} className="h-6 w-9 rounded" />
        <TeamFlag name={mt.away} className="h-6 w-9 rounded" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold">
          {mt.home} · {mt.away}
        </p>
        {metric.label && (
          <p className="text-[11px] text-muted-foreground">{metric.label}</p>
        )}
      </div>
      <span className={cn("shrink-0 font-mono text-lg font-black", metric.tone)}>
        {metric.value}
      </span>
    </motion.button>
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

const profitMetric = (v: number, label = "beneficio"): Metric => ({
  value: `${v > 0 ? "+" : ""}${formatCurrency(v)}`,
  label,
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

  const peopleCards = (list: FimMemberStat[], metric: (m: FimMemberStat) => Metric) =>
    list.map((m, i) => (
      <GalleryCard
        key={m.key}
        images={m.images}
        eyebrow={m.mote}
        title={m.name}
        metric={metric(m)}
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
        metric={profitMetric(c.profit, "combinado")}
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

  const matchBlock = (
    title: string,
    list: FimMatchStat[],
    metric: (m: FimMatchStat) => Metric
  ) =>
    list.length > 0 ? (
      <div className="space-y-3">
        <h3 className="text-lg font-black uppercase tracking-tight text-muted-foreground">
          {title}
        </h3>
        <motion.div
          variants={container}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.2 }}
          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
        >
          {list.map((mt) => (
            <MatchCard
              key={mt.matchId}
              mt={mt}
              metric={metric(mt)}
              onClick={() => openMatch(mt.matchId)}
            />
          ))}
        </motion.div>
      </div>
    ) : null;

  const hasMatchTops =
    matchTops.gains.length +
      matchTops.losses.length +
      matchTops.mostBets.length +
      matchTops.mostStaked.length >
    0;

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
        subtitle="Quién más dinero le ha sacado"
        icon={<Crown className="h-6 w-6" />}
      >
        {peopleCards(rankings.byProfit, (m) => profitMetric(m.profit))}
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

      {/* Las más ganadoras */}
      <Section
        title="Las más ganadoras"
        subtitle="Quién más apuestas acierta"
        icon={<Trophy className="h-6 w-6" />}
      >
        {peopleCards(rankings.byWon, (m) => ({
          value: String(m.won),
          label: "ganadas",
          tone: "text-profit",
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

      {/* Los más mancos */}
      <Section
        title="Los más mancos"
        subtitle="Quién más palos se ha comido"
        icon={<Skull className="h-6 w-6" />}
      >
        {peopleCards(rankings.byLoss, (m) => profitMetric(m.profit))}
      </Section>

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

      {/* Los más viciados */}
      <Section
        title="Los más viciados"
        subtitle="Quién más apuestas hace"
        icon={<Receipt className="h-6 w-6" />}
      >
        {peopleCards(rankings.byBets, (m) => ({
          value: String(m.betsCount),
          label: "apuestas",
          tone: "text-white",
        }))}
      </Section>

      {/* ─── PARTIDOS: abajo del todo, en tarjetas compactas ─── */}
      {hasMatchTops && (
        <section className="space-y-6">
          <BigTitle
            subtitle="Datos globales del grupo · pulsa cualquiera para ver sus apuestas"
            icon={<Coins className="h-6 w-6" />}
          >
            Los partidos
          </BigTitle>
          {matchBlock("Más rentables", matchTops.gains, (m) =>
            profitMetric(m.profit)
          )}
          {matchBlock("Más malditos", matchTops.losses, (m) =>
            profitMetric(m.profit)
          )}
          {matchBlock("Más calientes", matchTops.mostBets, (m) => ({
            value: String(m.count),
            label: "apuestas",
            tone: "text-white",
          }))}
          {matchBlock("Más dinero jugado", matchTops.mostStaked, (m) => ({
            value: formatCurrency(m.staked),
            label: "jugado",
            tone: "text-gold",
          }))}
        </section>
      )}

      <MatchBetsDialog
        match={selectedMatch}
        open={!!selectedMatch}
        onOpenChange={(o) => !o && setSelectedMatch(null)}
      />
    </div>
  );
}
