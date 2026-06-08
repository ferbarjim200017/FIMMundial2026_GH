"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ReactNode } from "react";
import { AuthProvider } from "@/features/auth/auth.context";
import { GroupProvider } from "@/features/groups/groups.context";
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
        <AuthProvider>
          <GroupProvider>{children}</GroupProvider>
        </AuthProvider>
      ) : (
        <FirebaseNotConfiguredScreen />
      )}
    </NextThemesProvider>
  );
}
