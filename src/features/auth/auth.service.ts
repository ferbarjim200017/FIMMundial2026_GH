"use client";

import {
  createUserWithEmailAndPassword,
  getRedirectResult,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  updateProfile,
  type User as FirebaseUser,
} from "firebase/auth";
import { FirebaseError } from "firebase/app";
import { auth, googleProvider } from "@/lib/firebase/client";
import { ensureUserDoc } from "@/features/users/users.service";

async function ensureGoogleUserDoc(user: FirebaseUser) {
  await ensureUserDoc({
    uid: user.uid,
    email: user.email ?? "",
    username: user.displayName ?? user.email?.split("@")[0] ?? "Usuario",
    avatarUrl: user.photoURL ?? null,
  });
}

export async function signInWithGoogle() {
  try {
    const cred = await signInWithPopup(auth, googleProvider);
    await ensureGoogleUserDoc(cred.user);
    return cred.user;
  } catch (err) {
    if (
      err instanceof FirebaseError &&
      (err.code === "auth/popup-blocked" ||
        err.code === "auth/popup-closed-by-user" ||
        err.code === "auth/cancelled-popup-request")
    ) {
      await signInWithRedirect(auth, googleProvider);
      return null;
    }
    throw err;
  }
}

export async function completeGoogleRedirect() {
  const result = await getRedirectResult(auth);
  if (result?.user) {
    await ensureGoogleUserDoc(result.user);
  }
  return result?.user ?? null;
}

export async function signInWithEmail(email: string, password: string) {
  const cred = await signInWithEmailAndPassword(auth, email, password);
  return cred.user;
}

export async function registerWithEmail(
  email: string,
  password: string,
  username: string
) {
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  await updateProfile(cred.user, { displayName: username });
  await ensureUserDoc({
    uid: cred.user.uid,
    email: cred.user.email ?? email,
    username,
    avatarUrl: null,
  });
  return cred.user;
}

export async function signOutUser() {
  await signOut(auth);
}

/**
 * Envía a `email` el correo de restablecimiento de contraseña de Firebase.
 * El correo contiene un enlace seguro (con un código de un solo uso) que abre
 * la página de Firebase donde el usuario escribe su nueva contraseña. No
 * almacenamos ni verificamos códigos por nuestra cuenta.
 */
export async function sendPasswordReset(email: string) {
  await sendPasswordResetEmail(auth, email);
}

export type { FirebaseUser };
