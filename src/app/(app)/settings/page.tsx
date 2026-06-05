import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export default function SettingsPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Ajustes</CardTitle>
        <CardDescription>Próximamente</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          Preferencias de notificaciones, tema, privacidad, etc.
        </p>
      </CardContent>
    </Card>
  );
}
