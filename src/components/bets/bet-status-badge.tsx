"use client";

import { cn } from "@/lib/utils";
import type { BetStatus } from "@/types/domain";
import { STATUS_OPTIONS } from "@/features/bets/bets.schema";

interface Props {
  status: BetStatus;
  className?: string;
}

export function BetStatusBadge({ status, className }: Props) {
  const opt = STATUS_OPTIONS.find((s) => s.value === status);
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold",
        opt?.color ?? "bg-muted",
        className
      )}
    >
      {opt?.label ?? status}
    </span>
  );
}
