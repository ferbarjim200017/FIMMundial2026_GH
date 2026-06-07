# Auto-importador de resultados (cron)

Script y workflow que rellena automáticamente los goles de los partidos del
Mundial 2026 cada 6 horas, leyendo
[openfootball/worldcup.json](https://github.com/openfootball/worldcup.json).

## Qué hace

- Cada 6h GitHub Actions ejecuta `scripts/import-results.ts`.
- Para cada partido **ya jugado** en la fuente:
  - Lo mapea a nuestro `Match` por fecha + nombres traducidos (ES↔EN).
  - Si `enteredBy` es un UID (admin ya tocó) → **no toca nada**.
  - Si no, escribe `result.homeGoals`, `result.awayGoals`, `penaltyWinner`
    (en eliminatorias), pone `status: "finished"` y marca `autoImported: true`.
  - Las tarjetas se dejan en 0 — el admin las completa luego.
- En el panel admin de partidos aparece un badge `🤖 Auto` para identificar
  cuáles necesitan revisión de tarjetas.

## Setup (una vez)

### 1. Descargar el service account de Firebase

1. Firebase Console → tu proyecto → **Configuración del proyecto** → pestaña
   **Cuentas de servicio**.
2. Botón **"Generar nueva clave privada"** → te descarga un `*.json`.
3. **No commitear el archivo.** Sólo necesitamos su contenido como string.

### 2. Añadirlo como secret en GitHub

1. Ve a https://github.com/<tu-usuario>/FIMMundial2026_GH/settings/secrets/actions
2. Botón **"New repository secret"**.
3. **Name**: `FIREBASE_SERVICE_ACCOUNT`
4. **Value**: pega el **contenido completo** del JSON (no base64, JSON tal cual).
5. Guardar.

### 3. Listo

A las próximas :00, :06, :12, :18 horas UTC el cron arrancará solo. También
puedes lanzarlo a mano desde la pestaña **Actions** → "Auto-import match
results" → **Run workflow**.

## Probar local

```bash
# 1) Pega el JSON del service account en una variable de entorno
export FIREBASE_SERVICE_ACCOUNT="$(cat /ruta/al/archivo.json)"

# 2) Dry-run (no escribe en Firestore)
npm run import-results:dry

# 3) Ejecutar de verdad (cuidado)
npm run import-results
```

Para probar el flujo end-to-end antes del Mundial puedes apuntar a los datos
del Mundial 2022 (ya jugado):

```bash
OPENFOOTBALL_URL="https://raw.githubusercontent.com/openfootball/worldcup.json/master/2022/worldcup.json" \
  npm run import-results:dry
```

(Los `seedId` de 2022 no existen en Firestore, así que verás los "no mapeados",
pero confirma que el parseo de la fuente funciona.)

## Comportamiento idempotente

- Si re-ejecutas el cron sin cambios en la fuente, el script salta los partidos
  con resultado ya escrito e idéntico (`skippedUnchanged`).
- Si openfootball corrige un marcador (typo o gol anulado), el script lo
  re-escribe al siguiente ciclo — **salvo** que el admin ya haya pisado
  manualmente, en cuyo caso se respeta lo del admin.

## Posibles fallos y cómo se ven

| Síntoma                              | Causa                                  | Acción                                  |
| ------------------------------------ | -------------------------------------- | --------------------------------------- |
| `Sin mapear: X`                      | Equipo nuevo o nombre cambiado en EN   | Añadir entrada a `scripts/teams-i18n.ts`|
| `FIREBASE_SERVICE_ACCOUNT no válido` | El secret no se pegó como JSON         | Repegarlo desde el .json original       |
| Workflow falla en `npm ci`           | `package-lock.json` desfasado          | `npm install` local y commit            |
