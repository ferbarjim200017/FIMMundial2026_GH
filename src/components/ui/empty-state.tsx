import { type ReactNode } from "react";
import { type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Estado vacío reutilizable: icono en círculo + título + subtítulo + acción
 * opcional. Para sustituir los "no hay datos" en texto pelado por algo más
 * cuidado y consistente en toda la app.
 */
export function EmptyState({
  icon: Icon,
  title,
  subtitle,
  action,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  subtitle?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-3 rounded-xl border border-dashed px-6 py-12 text-center",
        className
      )}
    >
      {Icon && (
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-muted/60 text-muted-foreground">
          <Icon className="h-6 w-6" />
        </span>
      )}
      <div className="space-y-1">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        {subtitle && (
          <p className="mx-auto max-w-sm text-xs text-muted-foreground">
            {subtitle}
          </p>
        )}
      </div>
      {action}
    </div>
  );
}
