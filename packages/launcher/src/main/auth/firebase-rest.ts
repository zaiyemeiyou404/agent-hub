/**
 * Upstream Firebase account calls are closed in independent mode.
 *
 * The workspace session endpoint is the only sign-in and renewal path. These
 * functions stay so a caller cannot quietly post a password, custom token, or
 * refresh token to the public Identity Toolkit project.
 */

export interface FirebaseTokens {
  idToken: string
  refreshToken: string
  expiresAt: number
  email: string
  displayName: string | null
}

export async function signInWithCustomToken(
  _customToken: string,
): Promise<FirebaseTokens> {
  throw new Error("configuration_required")
}

export async function signInWithPassword(
  _email: string,
  _password: string,
): Promise<FirebaseTokens> {
  throw new Error("configuration_required")
}

export async function refreshIdToken(
  _refreshToken: string,
): Promise<{ idToken: string; refreshToken: string; expiresAt: number }> {
  throw new Error("configuration_required")
}
