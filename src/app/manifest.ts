import type { MetadataRoute } from "next";
import { APP_NAME } from "@/lib/constants";

/**
 * Web App Manifest. Hace la web INSTALABLE en el móvil ("Añadir a pantalla de
 * inicio"): icono propio y apertura a pantalla completa (display standalone),
 * sin la barra del navegador. Next sirve esto en /manifest.webmanifest e inyecta
 * el <link rel="manifest"> automáticamente.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: APP_NAME,
    short_name: "FIM",
    description:
      "Tracker privado de apuestas y estadísticas del Mundial 2026 para competir entre amigos.",
    lang: "es",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0b1220",
    theme_color: "#1e3a8a",
    categories: ["sports"],
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "maskable",
      },
    ],
  };
}
