"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Copy } from "lucide-react";
import { useAuth } from "@/features/auth/auth.context";
import { BetForm } from "@/components/bets/bet-form";
import { Button } from "@/components/ui/button";
import { getBet } from "@/features/bets/bets.service";
import { getUser } from "@/features/users/users.service";
import { ROUTES } from "@/lib/constants";
import type { AppUser, Bet } from "@/types/domain";

export default function NewBetPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Cargando…</p>}>
      <NewBetContent />
    </Suspense>
  );
}

function NewBetContent() {
  const router = useRouter();
  const { appUser } = useAuth();
  const search = useSearchParams();
  const fromBetId = search.get("from");

  const [prefill, setPrefill] = useState<Bet | null>(null);
  const [originalAuthor, setOriginalAuthor] = useState<AppUser | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!!fromBetId);

  useEffect(() => {
    if (!fromBetId) return;
    setLoading(true);
    getBet(fromBetId)
      .then(async (bet) => {
        if (!bet) {
          setLoadError("No se encontró la apuesta que querías copiar.");
          return;
        }
        setPrefill(bet);
        const author = await getUser(bet.userId);
        setOriginalAuthor(author);
      })
      .catch(() => setLoadError("Error cargando la apuesta original."))
      .finally(() => setLoading(false));
  }, [fromBetId]);

  if (!appUser) return null;

  const isCopying = !!fromBetId;
  const title = isCopying ? "Copiar apuesta" : "Nueva apuesta";
  const subtitle = isCopying
    ? originalAuthor
      ? `Plantilla rellenada con la apuesta de ${originalAuthor.username}. Edita lo que quieras antes de guardarla — se creará a tu nombre.`
      : "Plantilla rellenada con otra apuesta. Edita lo que quieras antes de guardarla — se creará a tu nombre."
    : "Registra una apuesta que ya realizaste en una casa externa.";

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="icon">
          <Link href={ROUTES.bets} aria-label="Volver">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            {isCopying && <Copy className="h-5 w-5 text-primary" aria-hidden />}
            {title}
          </h1>
          <p className="text-sm text-muted-foreground">{subtitle}</p>
        </div>
      </div>

      {loadError && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {loadError}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-muted-foreground">Cargando plantilla…</p>
      ) : (
        <BetForm
          userId={appUser.uid}
          prefill={prefill ?? undefined}
          onDone={() => router.push(ROUTES.bets)}
        />
      )}
    </div>
  );
}
