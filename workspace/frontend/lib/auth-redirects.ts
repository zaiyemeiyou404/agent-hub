import { desktopHost } from './desktop-host';
import { authBaseFromEnv } from './service-endpoints';

// Auth redirects use the configured authBase. A missing base stays on this
// page instead of inventing a login host. NEXT_PUBLIC_INLINE_LOGIN=1 keeps
// the in-app sign-in path.

const INLINE_LOGIN = process.env.NEXT_PUBLIC_INLINE_LOGIN === '1';

function isLocalhost(): boolean {
  if (INLINE_LOGIN) return true;
  return typeof window !== 'undefined' && window.location.hostname === 'localhost';
}

/**
 * Send the user to the central login view. After they authenticate, it hands the
 * session back to this workspace and returns to where they started.
 * @param fallbackSignIn used only on localhost (inline Firebase Google popup).
 */
export function goToCentralLogin(fallbackSignIn?: () => void, options?: { forceCentral?: boolean }): void {
  if (typeof window === 'undefined') return;
  const host = desktopHost();
  if (host) { host.signIn(); return; }
  if (isLocalhost() && !options?.forceCentral) {
    fallbackSignIn?.();
    return;
  }
  const auth = authBaseFromEnv();
  if (!auth) return;
  const returnTo = encodeURIComponent(window.location.href);
  window.location.href = `${auth}/login?returnTo=${returnTo}`;
}

/**
 * Sign out on this origin, then end the central openagents.org session too and
 * land on the stable signed-out page (no auto re-login bounce).
 */
export async function goToCentralLogout(signOut: () => Promise<void>): Promise<void> {
  try {
    await signOut();
  } catch {
    /* already signed out */
  }
  if (typeof window === 'undefined' || isLocalhost() || desktopHost()) return;
  const auth = authBaseFromEnv();
  if (!auth) return;
  window.location.href = `${auth}/logout`;
}

/** Login route for protected pages; popup login must begin with a user click. */
export function redirectToLogin(): void {
  if (typeof window === 'undefined') return;
  if (desktopHost()) { desktopHost()?.signIn(); return; }
  if (isLocalhost() || window.location.hostname === 'workspace-preview.openagents.org') {
    const returnTo = window.location.pathname + window.location.search + window.location.hash;
    window.location.replace(`/login?returnTo=${encodeURIComponent(returnTo)}`);
  } else {
    goToCentralLogin();
  }
}
