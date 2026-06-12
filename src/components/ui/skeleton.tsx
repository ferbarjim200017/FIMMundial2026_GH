import * as React from "react";
import { cn } from "@/lib/utils";

/** Bloque de carga con pulso, para usar como placeholder mientras llegan
 *  los datos (en vez de un texto "Cargando…"). */
export function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-muted", className)}
      {...props}
    />
  );
}
