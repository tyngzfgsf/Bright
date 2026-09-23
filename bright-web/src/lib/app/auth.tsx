"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut as firebaseSignOut,
  type User,
} from "firebase/auth";
import { FirebaseError } from "firebase/app";
import { auth } from "./firebase";

/**
 * The account layer: Google sign-in through Firebase Auth (free on the Spark plan).
 *
 * The sidebar account row, the sign-in sheet and the Account section of Settings only read
 * `user` and call these functions. Signing in is what lets a trainee use Bright's hosted AI
 * without a key of their own: `getIdToken()` is sent to bright-proxy, which verifies it and
 * meters the trainee's daily turns.
 */

export type BrightUser = {
  uid: string;
  name: string;
  email: string;
  photoURL: string | null;
};

export type AuthError = "failed" | null;

type AuthValue = {
  user: BrightUser | null;
  /** True until Firebase has reported the persisted session, and while a popup is open. */
  busy: boolean;
  error: AuthError;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  clearError: () => void;
  /** A fresh Firebase ID token for the proxy, or null when signed out. Refreshed as needed. */
  getIdToken: () => Promise<string | null>;
};

const AuthContext = createContext<AuthValue | null>(null);

/** Closing or superseding the popup is the trainee changing their mind, not an error. */
const DISMISSED = new Set(["auth/popup-closed-by-user", "auth/cancelled-popup-request"]);

function toBrightUser(u: User): BrightUser {
  return {
    uid: u.uid,
    name: u.displayName ?? u.email ?? "Bright user",
    email: u.email ?? "",
    photoURL: u.photoURL,
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<BrightUser | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<AuthError>(null);

  // Firebase restores the session from the browser on its own; this is how we hear about it.
  useEffect(
    () =>
      onAuthStateChanged(auth, (u) => {
        setUser(u ? toBrightUser(u) : null);
        setBusy(false);
      }),
    [],
  );

  const signInWithGoogle = useCallback(async () => {
    setError(null);
    setBusy(true);
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
    } catch (e) {
      if (!(e instanceof FirebaseError && DISMISSED.has(e.code))) setError("failed");
    } finally {
      setBusy(false);
    }
  }, []);

  const signOut = useCallback(async () => {
    setError(null);
    await firebaseSignOut(auth);
  }, []);

  const clearError = useCallback(() => setError(null), []);

  const getIdToken = useCallback(async () => (auth.currentUser ? auth.currentUser.getIdToken() : null), []);

  const value = useMemo<AuthValue>(
    () => ({ user, busy, error, signInWithGoogle, signOut, clearError, getIdToken }),
    [user, busy, error, signInWithGoogle, signOut, clearError, getIdToken],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside <AuthProvider>");
  return value;
}
