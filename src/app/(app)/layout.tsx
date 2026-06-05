import type { ReactNode } from "react";
import { AuthGuard } from "@/components/layout/auth-guard";
import { TopBar } from "@/components/layout/top-bar";
import { Sidebar } from "@/components/layout/sidebar";
import { RankingCarousel } from "@/components/layout/ranking-carousel";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <AuthGuard>
      <div className="flex min-h-screen flex-col">
        <RankingCarousel />
        <TopBar />
        <div className="flex flex-1">
          <Sidebar />
          <main className="flex-1 overflow-x-hidden p-4 md:p-6">{children}</main>
        </div>
      </div>
    </AuthGuard>
  );
}
