"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion, type Variants } from "framer-motion";
import { Crown, Skull, Sparkles, Trophy } from "lucide-react";
import { subscribeToAllBets } from "@/features/bets/bets.service";
import { betInGroup } from "@/features/bets/bets.utils";
import { useGroup } from "@/features/groups/groups.context";
import { isFirebaseConfigured } from "@/lib/firebase/client";
import {
  computeFimHall,
  type FimComboStat,
  type FimMemberStat,
} from "@/features/hall-of-fame/fim-hall.utils";
import { cn, formatCurrency, formatPercent, profitClass } from "@/lib/utils";
import type { Bet } from "@/types/domain";

/* ── Imagen que rota entre las fotos con fundido cinematográfico ── */
function RotatingImage({
  images,
  alt,
  className,
}: {
  images: string[];
  alt: string;
  className?: string;
}) {
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
        initial={{ opacity: 0, scale: 1.12 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 1.1, ease: "easeInOut" }}
        className={cn("absolute inset-0 h-full w-full object-cover", className)}
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
  hidden: { opacity: 0, y: 28 },
  show: { opacity: 1, y: 0, transition: { duration: 0.55, ease: "easeOut" } },
};

/* ── Póster de una persona (sirve para destacados y para el roster) ── */
function PosterCard({
  m,
  rank,
  metricLabel,
  metricValue,
  metricTone,
  big,
  className,
}: {
  m: FimMemberStat;
  rank?: number;
  metricLabel?: string;
  metricValue?: string;
  metricTone?: string;
  big?: boolean;
  className?: string;
}) {
  return (
    <motion.div
      variants={item}
      whileHover={{ scale: 1.015 }}
      transition={{ type: "spring", stiffness: 300, damping: 22 }}
      className={cn(
        "group relative overflow-hidden rounded-2xl border border-white/10 bg-black shadow-lg",
        className
      )}
    >
      <RotatingImage
        images={m.images}
        alt={m.name}
        className="transition-transform duration-700 group-hover:scale-110"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent" />

      {rank !== undefined && (
        <span
          className={cn(
            "absolute left-3 top-3 flex items-center justify-center rounded-full bg-black/60 font-black text-white backdrop-blur",
            big ? "h-10 w-10 text-lg" : "h-7 w-7 text-sm"
          )}
        >
          {rank}
        </span>
      )}

      <div className="absolute inset-x-0 bottom-0 space-y-0.5 p-4">
        {metricValue && (
          <p
            className={cn(
              "font-black leading-none",
              big ? "text-4xl md:text-5xl" : "text-2xl",
              metricTone ?? "text-white"
            )}
          >
            {metricValue}
          </p>
        )}
        {metricLabel && (
          <p className="text-[10px] font-semibold uppercase tracking-widest text-white/55">
            {metricLabel}
          </p>
        )}
        <p
          className={cn(
            "pt-1 font-bold uppercase tracking-widest text-primary drop-shadow",
            big ? "text-sm" : "text-[11px]"
          )}
        >
          {m.mote}
        </p>
        <h3
          className={cn(
            "font-black leading-none text-white drop-shadow",
            big ? "text-3xl md:text-4xl" : "text-lg"
          )}
        >
          {m.name}
        </h3>
      </div>
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
      <div className="flex items-center gap-2 text-primary">{icon}</div>
      <h2 className="text-3xl font-black uppercase leading-[0.9] tracking-tighter md:text-5xl">
        {children}
      </h2>
      {subtitle && (
        <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
      )}
    </motion.div>
  );
}

/* ── Bloque destacado: top 3 con el 1.º grande y los otros pequeños ── */
function FeatureBlock({
  title,
  subtitle,
  icon,
  top,
  metricLabel,
  metricValue,
  metricTone,
  flip,
}: {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  top: FimMemberStat[];
  metricLabel: string;
  metricValue: (m: FimMemberStat) => string;
  metricTone?: (m: FimMemberStat) => string;
  flip?: boolean;
}) {
  if (top.length === 0) return null;
  const [first, ...rest] = top;
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
        className="grid gap-4 md:h-[460px] md:grid-cols-2"
      >
        <PosterCard
          m={first}
          rank={1}
          big
          metricLabel={metricLabel}
          metricValue={metricValue(first)}
          metricTone={metricTone?.(first)}
          className={cn("h-72 md:h-full", flip && "md:order-2")}
        />
        <div className={cn("grid gap-4 md:grid-rows-2", flip && "md:order-1")}>
          {rest.map((m, i) => (
            <PosterCard
              key={m.key}
              m={m}
              rank={i + 2}
              metricLabel={metricLabel}
              metricValue={metricValue(m)}
              metricTone={metricTone?.(m)}
              className="h-48 md:h-full"
            />
          ))}
        </div>
      </motion.div>
    </section>
  );
}

/* ── Tarjeta de combo (dúo/trío/cuarteto) ── */
function ComboCard({ c, wide }: { c: FimComboStat; wide?: boolean }) {
  const badgeBad = c.badge?.includes("perdedor");
  return (
    <motion.div
      variants={item}
      whileHover={{ scale: 1.015 }}
      transition={{ type: "spring", stiffness: 300, damping: 22 }}
      className={cn(
        "group relative overflow-hidden rounded-2xl border bg-black shadow-lg",
        wide ? "aspect-[16/10] sm:col-span-2" : "aspect-[4/3]",
        c.badge
          ? badgeBad
            ? "border-loss/70"
            : "border-profit/70"
          : "border-white/10"
      )}
    >
      <RotatingImage
        images={c.images}
        alt={c.names.join(" y ")}
        className="transition-transform duration-700 group-hover:scale-110"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent" />

      {c.badge && (
        <span
          className={cn(
            "absolute left-3 top-3 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-white shadow",
            badgeBad ? "bg-loss" : "bg-profit"
          )}
        >
          {badgeBad ? <Skull className="h-3 w-3" /> : <Trophy className="h-3 w-3" />}
          {c.badge}
        </span>
      )}

      <div className="absolute inset-x-0 bottom-0 space-y-1 p-4">
        {c.nickname && (
          <p className="text-[11px] font-bold uppercase tracking-widest text-primary drop-shadow">
            «{c.nickname}»
          </p>
        )}
        <h3
          className={cn(
            "font-black leading-tight text-white drop-shadow",
            wide ? "text-2xl md:text-3xl" : "text-lg"
          )}
        >
          {c.names.join(" · ")}
        </h3>
        <div className="flex items-center gap-2 text-xs text-white/90">
          <span>
            Combinado{" "}
            <span className={cn("font-bold", profitClass(c.profit))}>
              {c.profit > 0 ? "+" : ""}
              {formatCurrency(c.profit)}
            </span>
          </span>
          <span className="text-white/55">· {c.betsCount} ap.</span>
        </div>
      </div>
    </motion.div>
  );
}

function ComboSection({
  title,
  subtitle,
  icon,
  combos,
}: {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  combos: FimComboStat[];
}) {
  if (combos.length === 0) return null;
  // Los que tienen badge (extremos) salen grandes; el resto, normales.
  const sorted = [...combos].sort(
    (a, b) => (b.badge ? 1 : 0) - (a.badge ? 1 : 0)
  );
  return (
    <section className="space-y-5">
      <BigTitle subtitle={subtitle} icon={icon}>
        {title}
      </BigTitle>
      <motion.div
        variants={container}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, amount: 0.12 }}
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
      >
        {sorted.map((c) => (
          <ComboCard key={c.key} c={c} wide={!!c.badge} />
        ))}
      </motion.div>
    </section>
  );
}

function HeroBackdrop({ images }: { images: string[] }) {
  if (images.length === 0) return null;
  return (
    <div className="absolute inset-0 opacity-25">
      <RotatingImage images={images} alt="" className="blur-[2px]" />
      <div className="absolute inset-0 bg-gradient-to-t from-background via-background/70 to-background/30" />
    </div>
  );
}

// Tamaños variados para el roster (bento desordenado) — 8 personas.
const ROSTER_SPANS = [
  "col-span-2 row-span-2",
  "",
  "row-span-2",
  "",
  "col-span-2",
  "",
  "row-span-2",
  "",
];

export function FimHall() {
  const { memberUids, activeGroup, groupMembers } = useGroup();
  const [allBets, setAllBets] = useState<Bet[] | null>(null);

  useEffect(() => {
    if (!isFirebaseConfigured) {
      setAllBets([]);
      return;
    }
    return subscribeToAllBets(setAllBets);
  }, []);

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

  const heroImages = useMemo(() => {
    if (!data) return [];
    return data.members
      .flatMap((m) => m.images)
      .sort(() => Math.random() - 0.5)
      .slice(0, 12);
  }, [data]);

  const rankings = useMemo(() => {
    if (!data) return null;
    const ms = data.members;
    return {
      byWon: [...ms].sort((a, b) => b.won - a.won).slice(0, 3),
      byProfit: [...ms].sort((a, b) => b.profit - a.profit).slice(0, 3),
      byLoss: [...ms].sort((a, b) => a.profit - b.profit).slice(0, 3),
    };
  }, [data]);

  if (!data || !rankings) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-muted-foreground">
        Cargando el Salón de la Fama…
      </div>
    );
  }

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

      {/* Top 3 más ganadoras (el 1.º grande) */}
      <FeatureBlock
        title="Las más ganadoras"
        subtitle="Top 3 por apuestas acertadas"
        icon={<Trophy className="h-6 w-6" />}
        top={rankings.byWon}
        metricLabel="Apuestas ganadas"
        metricValue={(m) => String(m.won)}
        metricTone={() => "text-profit"}
      />

      {/* Roster completo, bento desordenado */}
      <section className="space-y-5">
        <BigTitle subtitle="Los 8 magníficos" icon={<Crown className="h-6 w-6" />}>
          Los inducidos
        </BigTitle>
        <motion.div
          variants={container}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.1 }}
          className="grid auto-rows-[150px] grid-cols-2 gap-3 [grid-auto-flow:dense] md:auto-rows-[185px] md:grid-cols-4"
        >
          {data.members.map((m, i) => {
            const span = ROSTER_SPANS[i % ROSTER_SPANS.length];
            const big = span === "col-span-2 row-span-2";
            return (
              <PosterCard
                key={m.key}
                m={m}
                big={big}
                metricLabel="Beneficio"
                metricValue={`${m.profit > 0 ? "+" : ""}${formatCurrency(m.profit)}`}
                metricTone={profitClass(m.profit)}
                className={span}
              />
            );
          })}
        </motion.div>
      </section>

      {/* Reyes del beneficio (el 1.º grande, lado contrario) */}
      <FeatureBlock
        title="Reyes del beneficio"
        subtitle="Top 3 con más beneficio total"
        icon={<Crown className="h-6 w-6" />}
        top={rankings.byProfit}
        metricLabel="Beneficio"
        metricValue={(m) => `${m.profit > 0 ? "+" : ""}${formatCurrency(m.profit)}`}
        metricTone={(m) => profitClass(m.profit)}
        flip
      />

      {/* Dúos */}
      <ComboSection
        title="Dúos"
        subtitle="Las parejas de hecho del grupo"
        icon={<Sparkles className="h-6 w-6" />}
        combos={data.duos}
      />

      {/* Los más mancos (el 1.º grande) */}
      <FeatureBlock
        title="Los más mancos"
        subtitle="Top 3 que más palos se han comido"
        icon={<Skull className="h-6 w-6" />}
        top={rankings.byLoss}
        metricLabel="Beneficio"
        metricValue={(m) => `${m.profit > 0 ? "+" : ""}${formatCurrency(m.profit)}`}
        metricTone={(m) => profitClass(m.profit)}
      />

      {/* Tríos */}
      <ComboSection
        title="Tríos"
        subtitle="Cuando se juntan tres"
        icon={<Sparkles className="h-6 w-6" />}
        combos={data.trios}
      />

      {/* Cuarteto */}
      <ComboSection
        title="La banda al completo"
        subtitle="Los cuartetos legendarios"
        icon={<Trophy className="h-6 w-6" />}
        combos={data.quads}
      />
    </div>
  );
}
