import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export default function PredictionsPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Predicciones del Mundial</CardTitle>
        <CardDescription>Próximamente — Módulo 6</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          Predice campeón, finalista, semifinalistas, máximo goleador y jugador revelación.
        </p>
      </CardContent>
    </Card>
  );
}
