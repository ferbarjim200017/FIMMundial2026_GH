"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { BetForm } from "@/components/bets/bet-form";
import { BetStatusBadge } from "@/components/bets/bet-status-badge";
import { SettleBetDialog } from "@/components/bets/settle-bet-dialog";
import { useAuth } from "@/features/auth/auth.context";
import { getBet } from "@/features/bets/bets.service";
import { ROUTES } from "@/lib/constants";
import type { Bet } from "@/types/domain";

export default function EditBetPage() {
  const params = useParams<{ betId: string }>();
  const router = useRouter();
  const { appUser, isAdmin } = useAuth();
  const [bet, setBet] = useState<Bet | null>(null);
  const [loading, setLoading] = useState(true);
  const [settleOpen, setSettleOpen] = useState(false);

  useEffect(() => {
    if (!params.betId) return;
    getBet(params.betId).then((b) => {
      setBet(b);
      setLoading(false);
    });
  }, [params.betId]);

  if (loading) return <p className="text-sm text-muted-foreground">Cargando…</p>;
  if (!bet || !appUser) {
    return (
      <div className="rounded-lg border border-dashed p-12 text-center text-sm text-muted-foreground">
        Apuesta no encontrada.
      </div>
    );
  }

  const isOwner = bet.userId === appUser.uid;
  if (!isOwner && !isAdmin) {
    return (
      <div className="rounded-lg border border-dashed p-12 text-center text-sm text-muted-foreground">
        No tienes permiso para editar esta apuesta.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="icon">
          <Link href={ROUTES.bets} aria-label="Volver">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">Editar apuesta</h1>
            <BetStatusBadge status={bet.status} />
          </div>
          <p className="text-sm text-muted-foreground">
            {bet.status === "pending"
              ? "Puedes editar todos los campos."
              : "Esta apuesta ya está liquidada. Los cambios solo afectan al registro, no recalculan el balance."}
          </p>
        </div>
        {bet.status === "pending" && (
          <Button onClick={() => setSettleOpen(true)}>Liquidar</Button>
        )}
      </div>

      {bet.notes && (
        <Card>
          <CardContent className="p-4 text-sm">
            <p className="mb-1 text-xs uppercase text-muted-foreground">Notas previas</p>
            <p className="whitespace-pre-wrap">{bet.notes}</p>
          </CardContent>
        </Card>
      )}

      <BetForm
        userId={appUser.uid}
        initial={bet}
        onDone={() => router.push(ROUTES.bets)}
      />

      <SettleBetDialog
        bet={bet}
        open={settleOpen}
        onOpenChange={setSettleOpen}
        onSettled={() => router.push(ROUTES.bets)}
      />
    </div>
  );
}
