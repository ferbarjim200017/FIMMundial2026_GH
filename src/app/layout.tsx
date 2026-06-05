import type { Metadata, Viewport } from "next";
import "@/styles/globals.css";
import { Providers } from "@/app/providers";
import { APP_NAME } from "@/lib/constants";

export const metadata: Metadata = {
  title: { default: APP_NAME, template: `%s | ${APP_NAME}` },
  description:
    "Tracker privado de apuestas y estadísticas del Mundial 2026 — para competir entre amigos. Solo registra apuestas externas, no procesa pagos.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#3b82f6" },
    { media: "(prefers-color-scheme: dark)", color: "#1e3a8a" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body className="min-h-screen antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
