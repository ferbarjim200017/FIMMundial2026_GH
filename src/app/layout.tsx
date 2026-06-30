import type { Metadata, Viewport } from "next";
import { Inter, Sora } from "next/font/google";
import "@/styles/globals.css";
import { Providers } from "@/app/providers";
import { APP_NAME } from "@/lib/constants";

// Texto general (limpio y legible) y titulares (con más carácter).
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});
const sora = Sora({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
  weight: ["500", "600", "700"],
});

export const metadata: Metadata = {
  applicationName: APP_NAME,
  title: { default: APP_NAME, template: `%s | ${APP_NAME}` },
  description:
    "Tracker privado de apuestas y estadísticas del Mundial 2026 — para competir entre amigos. Solo registra apuestas externas, no procesa pagos.",
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
  },
  // Permite "Añadir a pantalla de inicio" en iOS abriendo a pantalla completa.
  appleWebApp: {
    capable: true,
    title: APP_NAME,
    statusBarStyle: "black-translucent",
  },
  formatDetection: { telephone: false },
  openGraph: {
    type: "website",
    locale: "es_ES",
    siteName: APP_NAME,
    title: APP_NAME,
    description:
      "Tracker privado de apuestas y estadísticas del Mundial 2026 para competir entre amigos.",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#3b82f6" },
    { media: "(prefers-color-scheme: dark)", color: "#1e3a8a" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="es"
      className={`${inter.variable} ${sora.variable}`}
      suppressHydrationWarning
    >
      <body className="min-h-screen font-sans antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
