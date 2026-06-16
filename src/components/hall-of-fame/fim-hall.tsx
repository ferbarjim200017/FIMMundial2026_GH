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

/* ──────────────────────────────────────────────────────────────────────────
 * Imagen que va rotando entre las fotos disponibles, con fundido cinematográfico.
 * ────────────────────────────────────────────────────────────────────────── */
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

function statColor(v: number) {
  return profitClass(v);
}

/* ──────────────────────────────────────────────────────────────────────────
 * Tarjeta de un miembro individual.
 * ────────────────────────────────────────────────────────────────────────── */
function MemberCard({ m, rank }: { m: FimMemberStat; rank: number }) {
  return (
    <motion.div
      variants={item}
      whileHover={{ y: -6, scale: 1.02 }}
      transition={{ type: "spring", stiffness: 300, damping: 20 }}
      className="group relative aspect-[3/4] overflow-hidden rounded-2xl border border-white/10 bg-black shadow-lg"
    >
      <RotatingImage
        images={m.images}
        alt={m.name}
        className="transition-transform duration-700 group-hover:scale-110"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/45 to-transparent" />

      <span className="absolute left-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-sm font-black text-white backdrop-blur">
        {rank}
      </span>

      <div className="absolute inset-x-0 bottom-0 space-y-1 p-4">
        <p className="text-[11px] font-bold uppercase tracking-widest text-primary drop-shadow">
          {m.mote}
        </p>
        <h3 className="text-2xl font-black leading-none text-white drop-shadow">
          {m.name}
        </h3>
        <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-white/90">
          <Stat label="Beneficio">
            <span className={cn("font-bold", statColor(m.profit))}>
              {m.profit > 0 ? "+" : ""}
              {formatCurrency(m.profit)}
            </span>
          </Stat>
          <Stat label="ROI">
            <span className={cn("font-bold", statColor(m.roi))}>
              {formatPercent(m.roi)}
            </span>
          </Stat>
          <Stat label="Acierto">{formatPercent(m.hitRate)}</Stat>
          <Stat label="Apuestas">{m.betsCount}</Stat>
        </div>
      </div>
    </motion.div>
  );
}

function Stat({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-[10px] uppercase tracking-wider text-white/55">
        {label}
      </span>
      <span className="font-mono">{children}</span>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
 * Tarjeta de un combo (dúo / trío / cuarteto).
 * ────────────────────────────────────────────────────────────────────────── */
function ComboCard({ c }: { c: FimComboStat }) {
  const badgeBad = c.badge?.includes("perdedor");
  return (
    <motion.div
      variants={item}
      whileHover={{ y: -6, scale: 1.02 }}
      transition={{ type: "spring", stiffness: 300, damping: 20 }}
      className={cn(
        "group relative aspect-[4/3] overflow-hidden rounded-2xl border bg-black shadow-lg",
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
          {badgeBad ? (
            <Skull className="h-3 w-3" />
          ) : (
            <Trophy className="h-3 w-3" />
          )}
          {c.badge}
        </span>
      )}

      <div className="absolute inset-x-0 bottom-0 space-y-1 p-4">
        {c.nickname && (
          <p className="text-[11px] font-bold uppercase tracking-widest text-primary drop-shadow">
            «{c.nickname}»
          </p>
        )}
        <h3 className="text-lg font-black leading-tight text-white drop-shadow">
          {c.names.join(" · ")}
        </h3>
        <div className="flex items-center gap-3 text-xs text-white/90">
          <span>
            Beneficio combinado{" "}
            <span className={cn("font-bold", statColor(c.profit))}>
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

function SectionTitle({
  children,
  icon,
}: {
  children: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      whileInView={{ opacity: 1, x: 0 }}
      viewport={{ once: true, amount: 0.6 }}
      transition={{ duration: 0.5 }}
      className="flex items-center gap-3"
    >
      {icon}
      <h2 className="text-2xl font-black uppercase tracking-tight md:text-3xl">
        {children}
      </h2>
      <span className="h-px flex-1 bg-gradient-to-r from-primary/60 to-transparent" />
    </motion.div>
  );
}

function Grid({
  children,
  cols,
}: {
  children: React.ReactNode;
  cols: string;
}) {
  return (
    <motion.div
      variants={container}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, amount: 0.15 }}
      className={cn("grid gap-4", cols)}
    >
      {children}
    </motion.div>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
 * Fondo del hero: collage tenue que va cambiando.
 * ────────────────────────────────────────────────────────────────────────── */
function HeroBackdrop({ images }: { images: string[] }) {
  if (images.length === 0) return null;
  return (
    <div className="absolute inset-0 opacity-25">
      <RotatingImage images={images} alt="" className="blur-[2px]" />
      <div className="absolute inset-0 bg-gradient-to-t from-background via-background/70 to-background/30" />
    </div>
  );
}

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
    const all = data.members.flatMap((m) => m.images);
    // Baraja para que el collage no sea siempre el mismo orden.
    return all.sort(() => Math.random() - 0.5).slice(0, 12);
  }, [data]);

  if (!data) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-muted-foreground">
        Cargando el Salón de la Fama…
      </div>
    );
  }

  return (
    <div className="space-y-12 pb-8">
      {/* ─────────── HERO ─────────── */}
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
          <h1 className="text-4xl font-black uppercase leading-none tracking-tighter md:text-7xl">
            Salón de
            <br />
            <span className="bg-gradient-to-r from-primary via-sky-400 to-primary bg-clip-text text-transparent">
              la Fama
            </span>
          </h1>
          <p className="mx-auto mt-4 max-w-md text-sm text-muted-foreground">
            Los inducidos de FIM. Leyendas, ludópatas y algún que otro manco —
            todos inmortalizados aquí con sus números.
          </p>
        </motion.div>
      </motion.section>

      {/* ─────────── INDUCIDOS ─────────── */}
      <section className="space-y-5">
        <SectionTitle icon={<Crown className="h-7 w-7 text-primary" />}>
          Los inducidos
        </SectionTitle>
        <Grid cols="grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {data.members.map((m, i) => (
            <MemberCard key={m.key} m={m} rank={i + 1} />
          ))}
        </Grid>
      </section>

      {/* ─────────── DÚOS ─────────── */}
      {data.duos.length > 0 && (
        <section className="space-y-5">
          <SectionTitle icon={<Sparkles className="h-7 w-7 text-primary" />}>
            Dúos
          </SectionTitle>
          <Grid cols="grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            {data.duos.map((c) => (
              <ComboCard key={c.key} c={c} />
            ))}
          </Grid>
        </section>
      )}

      {/* ─────────── TRÍOS ─────────── */}
      {data.trios.length > 0 && (
        <section className="space-y-5">
          <SectionTitle icon={<Sparkles className="h-7 w-7 text-primary" />}>
            Tríos
          </SectionTitle>
          <Grid cols="grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            {data.trios.map((c) => (
              <ComboCard key={c.key} c={c} />
            ))}
          </Grid>
        </section>
      )}

      {/* ─────────── CUARTETOS ─────────── */}
      {data.quads.length > 0 && (
        <section className="space-y-5">
          <SectionTitle icon={<Trophy className="h-7 w-7 text-primary" />}>
            La banda al completo
          </SectionTitle>
          <Grid cols="grid-cols-1 sm:grid-cols-2">
            {data.quads.map((c) => (
              <ComboCard key={c.key} c={c} />
            ))}
          </Grid>
        </section>
      )}
    </div>
  );
}
