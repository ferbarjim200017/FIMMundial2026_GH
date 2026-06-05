# ⚽ FIM Mundial 2026

Tracker privado de apuestas + estadísticas del Mundial 2026 para competir entre amigos.

> ⚠️ Esta aplicación **no procesa apuestas reales ni dinero**. Solo registra apuestas ya realizadas en casas externas (Bet365, Winamax) y muestra estadísticas/rankings. Uso recreativo entre amigos mayores de 18 años.

---

## 📦 Stack

- **Frontend:** Next.js 15 (App Router) · React 19 · TypeScript · TailwindCSS · shadcn-style
- **Auth/DB/Storage:** Firebase (Auth + Firestore + Storage)
- **Hosting:** Vercel (frontend) · Firebase (servicios)

---

## 🚦 Estado del proyecto — Módulo 1 completado

| Módulo | Estado |
|---|---|
| 1. Setup + Auth + Usuarios | ✅ Hecho |
| 2. Gestión de Apuestas | ⏳ Siguiente |
| 3. Centro Mundial (equipos, partidos, grupos) | ⏳ |
| 4. Dashboard + Ranking + Carrusel real-time | ⏳ |
| 5. Perfil avanzado + estadísticas | ⏳ |
| 6. Predicciones + Logros | ⏳ |
| 7. Feed social | ⏳ |
| 8. Panel admin completo | ⏳ |

---

## 🔧 Puesta en marcha (paso a paso)

### 1) Instalar dependencias

```powershell
cd c:\WEBMundial\fim-mundial-2026
npm install
```

### 2) Crear el proyecto Firebase

1. Entra en https://console.firebase.google.com → **Add project** → nombre: `fim-mundial-2026`.
2. **Authentication** → Get started → habilita los providers:
   - **Email/Password**
   - **Google** (selecciona tu email de soporte)
3. **Firestore Database** → Create database → modo **production** → región más cercana (`europe-west1`).
4. **Storage** → Get started → modo **production** → misma región.
5. **Project settings (⚙️) → General → Your apps → Web `</>`**:
   - Registra una app web con nombre `FIM Mundial 2026 Web`.
   - Copia el objeto `firebaseConfig` que te muestra.
6. **Project settings → Service accounts → Generate new private key** → descarga el JSON (NO lo subas a git).

### 3) Configurar variables de entorno

Copia `.env.example` a `.env.local`:

```powershell
Copy-Item .env.example .env.local
```

Y rellena con tus valores:

- **NEXT_PUBLIC_FIREBASE_*** → del objeto `firebaseConfig` del paso 5.
- **FIREBASE_ADMIN_*** → del JSON del paso 6 (`project_id`, `client_email`, `private_key`).
  - Importante: pega `private_key` entre comillas dobles y respeta los `\n`.
- **NEXT_PUBLIC_ADMIN_EMAILS** → ya pre-rellenado con `ferbarjim2000@gmail.com`. Cualquier email aquí se vuelve admin al registrarse por primera vez.

### 4) Desplegar reglas de seguridad

Instala Firebase CLI si no la tienes:

```powershell
npm install -g firebase-tools
firebase login
firebase use --add        # selecciona tu proyecto
firebase deploy --only firestore:rules,firestore:indexes,storage
```

### 5) Arrancar en local

```powershell
npm run dev
```

Abre http://localhost:3000 → te redirige a `/login`. Regístrate o entra con Google. Como tu email está en `NEXT_PUBLIC_ADMIN_EMAILS`, te asigna rol `admin` automáticamente al primer login → verás el enlace **Admin** en la sidebar.

### 6) Deploy a Vercel

```powershell
npm install -g vercel
vercel
```

En el dashboard de Vercel: **Settings → Environment Variables** → añade TODAS las variables de `.env.local` (también las `FIREBASE_ADMIN_*`). Redeploy.

---

## 🗂️ Estructura del proyecto

```
src/
├── app/
│   ├── (auth)/           # login + register (layout centrado, sin sidebar)
│   ├── (app)/            # rutas autenticadas (layout con sidebar + topbar)
│   │   ├── dashboard/    # ✅ Módulo 1
│   │   ├── profile/      # ✅ Módulo 1
│   │   ├── admin/        # ✅ Módulo 1 (solo admin)
│   │   ├── bets/         # ⏳ Módulo 2
│   │   ├── world-cup/    # ⏳ Módulo 3
│   │   ├── ranking/      # ⏳ Módulo 4
│   │   └── ...
│   ├── layout.tsx
│   ├── page.tsx          # redirige a /dashboard
│   └── providers.tsx     # next-themes + AuthContext
├── components/
│   ├── ui/               # primitives estilo shadcn (Button, Card, Input...)
│   └── layout/           # TopBar, Sidebar, RankingCarousel, ThemeToggle, AuthGuard
├── features/
│   ├── auth/             # auth.service + auth.context
│   └── users/            # users.service (CRUD)
├── lib/
│   ├── firebase/         # client.ts, admin.ts, converters.ts
│   ├── constants.ts
│   └── utils.ts          # cn, formatCurrency, formatPercent, profitClass
├── styles/
│   └── globals.css       # tokens HSL para tema claro/oscuro
└── types/
    └── domain.ts         # AppUser, Bet, etc.
```

---

## 🧪 Comandos útiles

```powershell
npm run dev          # desarrollo (http://localhost:3000)
npm run build        # build producción
npm run start        # servidor producción
npm run lint         # ESLint
npm run typecheck    # tsc --noEmit
```

---

## 🔐 Seguridad

- Las **Firestore rules** ya impiden que un usuario se auto-asigne `role: admin`, cambie su propio `stats` o `currentBalance` desde el cliente.
- Los **colecciones críticas** (`matches`, `playerStats`, `rankings`, `groups`) son de solo lectura para usuarios — se escribirán desde Cloud Functions o admin.
- Las **avatars** tienen límite de tamaño (2 MB) y validación de content-type.

---

## ➡️ Siguiente paso

Cuando confirmes que el Módulo 1 funciona en local y has hecho login al menos una vez, avísame y arrancamos el **Módulo 2: Gestión de Apuestas** (formulario de registro, listado, edición, cierre con cálculo de beneficio).
