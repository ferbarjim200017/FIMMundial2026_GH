import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

export const isFirebaseConfigured = Boolean(
  firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId
);

function getFirebaseApp(): FirebaseApp {
  return getApps().length ? getApp() : initializeApp(firebaseConfig);
}

// Crea la instancia de Firestore. En el NAVEGADOR activamos la caché
// persistente (IndexedDB): las apuestas/usuarios ya descargados se
// reutilizan entre recargas y entre pestañas, lo que reduce las lecturas
// facturadas en Firestore y hace que la app cargue al instante desde caché
// antes de refrescar con el servidor. El comportamiento visible es idéntico
// — solo cambia de dónde salen los datos la primera milésima de segundo.
// En el SERVIDOR (SSR) no existe IndexedDB, así que usamos el cliente
// estándar sin caché para no romper el render.
function createDb(app: FirebaseApp): Firestore {
  if (typeof window === "undefined") {
    return getFirestore(app);
  }
  try {
    return initializeFirestore(app, {
      localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager(),
      }),
    });
  } catch {
    // initializeFirestore lanza si Firestore ya estaba inicializado para
    // esta app (p.ej. tras un Fast Refresh en desarrollo). En ese caso
    // reutilizamos la instancia existente.
    return getFirestore(app);
  }
}

// Si Firebase no está configurado, exportamos stubs para que la app no
// crashee al renderizar — la UI mostrará un aviso pidiendo configurar .env.local
export const firebaseApp = isFirebaseConfigured ? getFirebaseApp() : null;
export const auth = isFirebaseConfigured ? getAuth(firebaseApp!) : (null as never);
export const db = isFirebaseConfigured ? createDb(firebaseApp!) : (null as never);
export const storage = isFirebaseConfigured ? getStorage(firebaseApp!) : (null as never);
export const googleProvider = (() => {
  if (!isFirebaseConfigured) return null as never;
  const p = new GoogleAuthProvider();
  p.setCustomParameters({ prompt: "select_account" });
  return p;
})();
