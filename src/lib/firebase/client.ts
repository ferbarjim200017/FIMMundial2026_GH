import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
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

// Si Firebase no está configurado, exportamos stubs para que la app no
// crashee al renderizar — la UI mostrará un aviso pidiendo configurar .env.local
export const firebaseApp = isFirebaseConfigured ? getFirebaseApp() : null;
export const auth = isFirebaseConfigured ? getAuth(firebaseApp!) : (null as never);
export const db = isFirebaseConfigured ? getFirestore(firebaseApp!) : (null as never);
export const storage = isFirebaseConfigured ? getStorage(firebaseApp!) : (null as never);
export const googleProvider = (() => {
  if (!isFirebaseConfigured) return null as never;
  const p = new GoogleAuthProvider();
  p.setCustomParameters({ prompt: "select_account" });
  return p;
})();
