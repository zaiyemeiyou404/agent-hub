// Workspace-issued login session — the Google-free path into the workspace.
//
// The normal login handoff turns openagents.org's Firebase custom token into a
// Firebase session in the browser (signInWithCustomToken) and keeps refreshing
// Firebase ID tokens. Both need Google's auth endpoints, which are blocked in
// mainland China, so those users could register but never get in. Instead the
// callback can hand the custom token to our own backend (POST /v1/auth/session),
// which performs the exchange server-side and returns a workspace session JWT.
// The rest of the app treats that JWT exactly like a Firebase ID token: it is
// the `Authorization: Bearer` value, and the backend accepts it as an identity.

import { apiBaseFromEnv, ConfigurationRequired, tokenForService } from './service-endpoints';

const API_URL = apiBaseFromEnv();
const STORAGE_KEY = 'oa_workspace_session';

export interface WorkspaceSession {
  /** The API origin that minted this credential. Never inferred on restore. */
  apiBase: string;
  token: string;
  email: string;
  displayName: string | null;
  /** Unix seconds. */
  expiresAt: number;
}

/** Exchange a login-handoff custom token for a workspace session (server-side). */
export async function exchangeHandoffToken(customToken: string): Promise<WorkspaceSession> {
  if (!API_URL) throw new ConfigurationRequired('api');
  const res = await fetch(`${API_URL}/v1/auth/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ custom_token: customToken }),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.data?.session_token) {
    throw new Error(json?.message || `Sign-in failed (${res.status})`);
  }
  const session: WorkspaceSession = {
    apiBase: API_URL,
    token: json.data.session_token,
    email: json.data.email,
    displayName: json.data.display_name ?? null,
    expiresAt: Math.floor(new Date(json.data.expires_at).getTime() / 1000),
  };
  saveWorkspaceSession(session);
  return session;
}

export function saveWorkspaceSession(session: WorkspaceSession): void {
  if (!isCurrentWorkspaceSession(session)) {
    clearWorkspaceSession();
    return;
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch {
    /* storage unavailable (private mode quota) — session lives for this page only */
  }
}

/** Used for both persisted credentials and live updates from the desktop host. */
export function isCurrentWorkspaceSession(value: unknown): value is WorkspaceSession {
  if (!value || typeof value !== 'object') return false;
  const session = value as Partial<WorkspaceSession>;
  return Boolean(API_URL && typeof session.email === 'string' && session.email
    && typeof session.token === 'string' && session.token
    && typeof session.apiBase === 'string'
    && typeof session.expiresAt === 'number' && Number.isFinite(session.expiresAt)
    && tokenForService(session, API_URL));
}

/** The stored session, or null if absent, malformed, or within a minute of expiry. */
export function loadWorkspaceSession(): WorkspaceSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const s: unknown = JSON.parse(raw);
    if (!isCurrentWorkspaceSession(s)) {
      clearWorkspaceSession();
      return null;
    }
    if (s.expiresAt - 60 < Date.now() / 1000) {
      clearWorkspaceSession();
      return null;
    }
    return s;
  } catch {
    return null;
  }
}

export function clearWorkspaceSession(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
