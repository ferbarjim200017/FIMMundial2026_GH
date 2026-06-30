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
    // Chrome exige PNG de 192 y 512 para considerar la app instalable y mostrar
    // el aviso/botón de instalación; el SVG queda como extra escalable.
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
    ],
  };
}
