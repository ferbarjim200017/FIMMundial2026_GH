"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useAuth } from "@/features/auth/auth.context";
import { BetForm } from "@/components/bets/bet-form";
import { Button } from "@/components/ui/button";
import { ROUTES } from "@/lib/constants";

export default function NewBetPage() {
  const router = useRouter();
  const { appUser } = useAuth();

  if (!appUser) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="icon">
          <Link href={ROUTES.bets} aria-label="Volver">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Nueva apuesta</h1>
          <p className="text-sm text-muted-foreground">
            Registra una apuesta que ya realizaste en una casa externa.
          </p>
        </div>
      </div>

      <BetForm userId={appUser.uid} onDone={() => router.push(ROUTES.bets)} />
    </div>
  );
}
