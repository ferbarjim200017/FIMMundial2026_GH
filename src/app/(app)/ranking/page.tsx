import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export default function RankingPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Ranking</CardTitle>
        <CardDescription>Próximamente — Módulo 4</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          Aquí verás el ranking entre amigos con medallas, beneficio total, ROI, yield y más.
        </p>
      </CardContent>
    </Card>
  );
}
