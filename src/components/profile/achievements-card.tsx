"use client";

import { Award } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { Achievement } from "@/features/bets/achievements";

/**
 * Tarjeta de logros/insignias del jugador. Los desbloqueados se ven a todo
 * color; los pendientes salen en gris (con su pista de cómo conseguirlos).
 */
export function AchievementsCard({
  achievements,
}: {
  achievements: Achievement[];
}) {
  const earned = achievements.filter((a) => a.earned).length;
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Award className="h-4 w-4 text-primary" />
          Logros
          <span className="ml-auto text-sm font-normal text-muted-foreground">
            {earned}/{achievements.length}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {achievements.map((a) => (
            <div
              key={a.id}
              title={a.description}
              className={cn(
                "flex items-start gap-2 rounded-lg border p-2 transition-colors",
                a.earned
                  ? "border-primary/30 bg-primary/5"
                  : "opacity-50 grayscale"
              )}
            >
              <span className="text-xl leading-none">{a.emoji}</span>
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold">{a.title}</p>
                <p className="line-clamp-2 text-[10px] text-muted-foreground">
                  {a.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
