"use client";

import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
  type User as FirebaseUser,
} from "firebase/auth";
import { auth, googleProvider } from "@/lib/firebase/client";
import { ensureUserDoc } from "@/features/users/users.service";

export async function signInWithGoogle() {
  const cred = await signInWithPopup(auth, googleProvider);
  const user = cred.user;
  await ensureUserDoc({
    uid: user.uid,
    email: user.email ?? "",
    username: user.displayName ?? user.email?.split("@")[0] ?? "Usuario",
    avatarUrl: user.photoURL ?? null,
  });
  return user;
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

export type { FirebaseUser };
