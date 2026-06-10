import type { ReactNode } from "react";
import { AuthGuard } from "@/components/layout/auth-guard";
import { TopBar } from "@/components/layout/top-bar";
import { Sidebar } from "@/components/layout/sidebar";
import { BottomNav } from "@/components/layout/bottom-nav";
import { RankingCarousel } from "@/components/layout/ranking-carousel";
import { OnboardingGate } from "@/components/layout/onboarding-gate";
import { BetDetailProvider } from "@/components/bets/bet-detail-dialog";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <AuthGuard>
      <OnboardingGate />
      <BetDetailProvider>
      <div className="flex min-h-screen flex-col">
        {/* Wrapper sticky para que el carrusel y la barra superior se queden
         *  fijos al hacer scroll. z-30 los pone por encima del contenido y
         *  del sidebar (que vive a z por defecto y empieza justo debajo). */}
        <div className="sticky top-0 z-30 bg-background">
          <RankingCarousel />
          <TopBar />
        </div>
        <div className="flex flex-1">
          <Sidebar />
          {/* En móvil dejamos espacio inferior para la BottomNav (h-14 + safe-area). */}
          <main className="flex-1 overflow-x-hidden p-4 pb-24 md:p-6 md:pb-6">
            {children}
          </main>
        </div>
        <BottomNav />
      </div>
      </BetDetailProvider>
    </AuthGuard>
  );
}
