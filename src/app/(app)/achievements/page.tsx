import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export default function AchievementsPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Logros</CardTitle>
        <CardDescription>Próximamente — Módulo 6</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          Desbloquea logros como primera apuesta ganada, racha de 5, cuota +5/+10, beneficio acumulado, etc.
        </p>
      </CardContent>
    </Card>
  );
}
