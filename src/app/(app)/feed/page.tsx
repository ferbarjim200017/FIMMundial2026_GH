import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export default function FeedPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Feed social</CardTitle>
        <CardDescription>Próximamente — Módulo 7</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          Actividad en tiempo real del grupo: nuevas apuestas, victorias, cambios de líder, logros.
        </p>
      </CardContent>
    </Card>
  );
}
