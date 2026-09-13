"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";

/**
 * The account layer, stubbed.
 *
 * Nothing here talks to a server yet — the sidebar, the sign-in sheet and the
 * Account section of Settings are all built against this interface so that
 * turning on Firebase is a change to this one file and nothing else.
 *
 * To wire it up:
 *   1. `npm i firebase`
 *   2. Add a `src/lib/firebase.ts` holding the `firebaseConfig` object from the
 *      console — the object *only*, no `initializeApp` import boilerplate
 *      (that snippet is written for a bundler and breaks the site's setup;
 *      see gotcha 4 in the repo's CLAUDE.md).
 *   3. Flip AUTH_CONFIGURED to true and replace the two bodies below with
 *      `signInWithPopup(auth, new GoogleAuthProvider())` and `signOut(auth)`,
 *      then subscribe to `onAuthStateChanged` in a `useEffect` to fill `user`.
 *
 * The rest of the app already handles a signed-in user: it only ever reads
 * `user.name` / `user.photoURL` and calls these two functions.
 */

export const AUTH_CONFIGURED = false;

export type BrightUser = {
  uid: string;
  name: string;
  email: string;
  photoURL: string | null;
};

export type AuthError = "not-configured" | "failed" | null;

type AuthValue = {
  user: BrightUser | null;
  /** False while an auth check or a popup is in flight. */
  busy: boolean;
  error: AuthError;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  clearError: () => void;
};

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<BrightUser | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<AuthError>(null);

  const signInWithGoogle = useCallback(async () => {
    setError(null);
    if (!AUTH_CONFIGURED) {
      setError("not-configured");
      return;
    }
    setBusy(true);
    try {
      // TODO(firebase): signInWithPopup(auth, new GoogleAuthProvider())
      setUser(null);
    } catch {
      setError("failed");
    } finally {
      setBusy(false);
    }
  }, []);

  const signOut = useCallback(async () => {
    // TODO(firebase): await firebaseSignOut(auth)
    setUser(null);
    setError(null);
  }, []);

  const clearError = useCallback(() => setError(null), []);

  const value = useMemo<AuthValue>(
    () => ({ user, busy, error, signInWithGoogle, signOut, clearError }),
    [user, busy, error, signInWithGoogle, signOut, clearError],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside <AuthProvider>");
  return value;
}
