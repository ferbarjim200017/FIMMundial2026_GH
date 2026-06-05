"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { onAuthStateChanged, type User as FirebaseUser } from "firebase/auth";
import { onSnapshot } from "firebase/firestore";
import { auth, isFirebaseConfigured } from "@/lib/firebase/client";
import { completeGoogleRedirect } from "@/features/auth/auth.service";
import { userDoc } from "@/features/users/users.service";
import type { AppUser } from "@/types/domain";

interface AuthContextValue {
  firebaseUser: FirebaseUser | null;
  appUser: AppUser | null;
  loading: boolean;
  isAdmin: boolean;
}

const AuthContext = createContext<AuthContextValue>({
  firebaseUser: null,
  appUser: null,
  loading: true,
  isAdmin: false,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [appUser, setAppUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isFirebaseConfigured) {
      setLoading(false);
      return;
    }
    completeGoogleRedirect().catch((err) => {
      console.error("[auth redirect]", err);
    });
    const unsub = onAuthStateChanged(auth, (user) => {
      setFirebaseUser(user);
      if (!user) {
        setAppUser(null);
        setLoading(false);
      }
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (!firebaseUser || !isFirebaseConfigured) return;
    const unsub = onSnapshot(
      userDoc(firebaseUser.uid),
      (snap) => {
        setAppUser(snap.exists() ? snap.data() : null);
        setLoading(false);
      },
      () => setLoading(false)
    );
    return unsub;
  }, [firebaseUser]);

  return (
    <AuthContext.Provider
      value={{
        firebaseUser,
        appUser,
        loading,
        isAdmin: appUser?.role === "admin",
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
