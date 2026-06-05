"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ReactNode } from "react";
import { AuthProvider } from "@/features/auth/auth.context";
import { isFirebaseConfigured } from "@/lib/firebase/client";
import { FirebaseNotConfiguredScreen } from "@/components/layout/firebase-not-configured";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem
      disableTransitionOnChange
    >
      {isFirebaseConfigured ? (
        <AuthProvider>{children}</AuthProvider>
      ) : (
        <FirebaseNotConfiguredScreen />
      )}
    </NextThemesProvider>
  );
}
