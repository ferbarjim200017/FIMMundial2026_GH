import type { ReactNode } from "react";
import { APP_NAME } from "@/lib/constants";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-screen place-items-center bg-background p-4">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold">⚽ {APP_NAME}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Tracker privado de apuestas para amigos
          </p>
        </div>
        {children}
      </div>
    </div>
  );
}
