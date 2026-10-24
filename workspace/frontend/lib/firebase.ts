import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithCustomToken,
  signOut,
  onAuthStateChanged,
  onIdTokenChanged,
  type User,
} from 'firebase/auth';

import { ConfigurationRequired } from './service-endpoints';

function configuredFirebase() {
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  const authDomain = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN;
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const appId = process.env.NEXT_PUBLIC_FIREBASE_APP_ID;
  if (!apiKey || !authDomain || !projectId || !appId) return null;
  if (authDomain.includes('openagents') || projectId === 'openagentsweb') return null;
  return {
    apiKey,
    authDomain,
    projectId,
    appId,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  };
}

function requireAuth() {
  const firebaseConfig = configuredFirebase();
  if (!firebaseConfig) throw new ConfigurationRequired('firebase');
  const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
  return getAuth(app);
}

const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export async function signInWithGoogle() {
  const result = await signInWithPopup(requireAuth(), googleProvider);
  return result.user;
}

/**
 * Sign in with a Firebase custom token minted by the openagents.org backend
 * (POST /v1/auth/workspace-handoff). Establishes a native, self-refreshing
 * Firebase session on this origin — the workspace app can't inherit the
 * openagents.org session because Firebase persists auth per-origin.
 */
export async function signInWithCustomTokenValue(customToken: string) {
  const result = await signInWithCustomToken(requireAuth(), customToken);
  return result.user;
}

export async function signOutUser() {
  await signOut(requireAuth());
}

export function onAuthChange(callback: (user: User | null) => void) {
  try {
    return onAuthStateChanged(requireAuth(), callback);
  } catch (err) {
    if (err instanceof ConfigurationRequired) {
      callback(null);
      return () => {};
    }
    throw err;
  }
}

/**
 * Like onAuthChange, but also fires whenever the SDK refreshes the ID token
 * (hourly while the page is open). Use this for anything that sends the token:
 * a token captured once at sign-in expires after an hour, and since Workspace
 * v1.1 the backend rejects writes that carry an expired identity rather than
 * falling back to the workspace token.
 */
export function onIdTokenChange(callback: (user: User | null) => void) {
  try {
    return onIdTokenChanged(requireAuth(), callback);
  } catch (err) {
    if (err instanceof ConfigurationRequired) {
      callback(null);
      return () => {};
    }
    throw err;
  }
}

/** The current ID token, refreshed by the SDK if it has expired. `force`
 *  mints a new one regardless (used after the server rejected the old one). */
export async function getFreshIdToken(force = false): Promise<string | null> {
  const user = (() => { try { return requireAuth().currentUser; } catch { return null; } })();
  if (!user) return null;
  return user.getIdToken(force);
}

export async function getIdToken(): Promise<string | null> {
  const user = (() => { try { return requireAuth().currentUser; } catch { return null; } })();
  if (!user) return null;
  return user.getIdToken(true);
}

/**
 * Resolve the user's email. Real Firebase accounts (Google/GitHub) expose it as
 * `user.email`; users signed in via a custom token (the email/password handoff)
 * carry it only as an `email` custom claim on the ID token, so fall back to that.
 */
export async function getResolvedEmail(): Promise<string> {
  const user = auth.currentUser;
  if (!user) return '';
  if (user.email) return user.email;
  try {
    const res = await user.getIdTokenResult();
    return (res.claims.email as string) || '';
  } catch {
    return '';
  }
}

export { auth };
