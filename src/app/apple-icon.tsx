import { ImageResponse } from "next/og";

// Icono para iOS ("Añadir a pantalla de inicio"). Safari ignora los SVG como
// apple-touch-icon, así que lo generamos como PNG en tiempo de build/petición
// con next/og (sin necesidad de subir un binario). Next inyecta el
// <link rel="apple-touch-icon"> automáticamente.
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #3b82f6, #1e3a8a)",
          color: "#ffffff",
          fontSize: 84,
          fontWeight: 800,
          letterSpacing: -4,
        }}
      >
        FIM
      </div>
    ),
    { ...size }
  );
}
