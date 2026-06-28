"use client";

import { type ReactNode } from "react";
import { ArrowDownLeft, ArrowDownUp, ArrowUpRight } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { round2 } from "@/features/bets/bets.utils";
import { cn, formatCurrency } from "@/lib/utils";

/**
 * Tarjeta "Ingresos − Retiradas": muestra el dinero ingresado, el retirado y
 * el NETO (ingresos − retiradas). Un neto positivo = se ha ingresado más;
 * negativo = se ha retirado más. `subject` adapta el texto ("Has…" para el
 * dashboard personal, "El grupo ha…" para ranking/salón de la fama).
 */
export function CashNetCard({
  deposits,
  withdrawals,
  subject = "Has",
  title = "Ingresos − Retiradas",
}: {
  deposits: number;
  withdrawals: number;
  subject?: string;
  title?: string;
}) {
  const net = round2(deposits - withdrawals);
  const verdict =
    net > 0
      ? `${subject} ingresado más`
      : net < 0
        ? `${subject} retirado más`
        : "Igualado";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ArrowDownUp className="h-4 w-4 text-primary" />
          {title}
        </CardTitle>
        <CardDescription>
          Diferencia entre el dinero ingresado y el retirado de las casas.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 gap-3">
          <CashStat
            label="Ingresos"
            value={formatCurrency(deposits)}
            icon={<ArrowDownLeft className="h-3.5 w-3.5" />}
          />
          <CashStat
            label="Retiradas"
            value={formatCurrency(withdrawals)}
            icon={<ArrowUpRight className="h-3.5 w-3.5" />}
          />
          <div className="rounded-md border bg-muted/20 p-3">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Neto
            </p>
            <p
              className={cn(
                "mt-0.5 font-mono text-lg font-bold tabular-nums",
                net > 0 && "text-profit",
                net < 0 && "text-loss"
              )}
            >
              {net > 0 ? "+" : ""}
              {formatCurrency(net)}
            </p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">{verdict}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function CashStat({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: ReactNode;
}) {
  return (
    <div className="rounded-md border bg-muted/20 p-3">
      <div className="flex items-center justify-between">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
        <span className="text-muted-foreground/60">{icon}</span>
      </div>
      <p className="mt-0.5 font-mono text-lg font-bold tabular-nums">{value}</p>
    </div>
  );
}
