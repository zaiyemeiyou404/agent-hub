export {
  CiphertextDirectorySink,
  FailClosedSecretStore,
  MemorySecretSink,
  SecureStorageUnavailableError,
  createAndroidSecureBox,
  createWindowsSecureBox,
  normalizeOrigin,
} from "./secure-store.ts"
export type {
  AndroidKeystoreBridge,
  ControllerSecret,
  FsLike,
  OsSecretBox,
  SecretSink,
  WindowsOsStorage,
} from "./secure-store.ts"
export { diagnosticLine, redactDiagnostic, redactFragment, redactQuery } from "./redact.ts"
export {
  buildControllerRequest,
  buildControllerStreamUrl,
  logoutLocal,
  migrateLegacy,
  restoreAfterRestart,
  safeDiagnostic,
} from "./session-lifecycle.ts"
export type { LegacyCredentialFile, MigrationResult, OutboundRequest, RecoveryEntry } from "./session-lifecycle.ts"

export const IDENTITY_CONTRACT_VERSION = "wp03.v1"

/** WP-04 calls the server port. This client only carries the version it speaks. */
export const IDENTITY_CONSUMERS = {
  "WP-04": "authorize and consume stream tickets; do not parse credentials",
  "WP-05": "desktop enroll/refresh/logout through the Windows fail-closed vault",
  "WP-06": "mobile enroll through the Android keystore vault; pairing stays on /v1/nodes/redeem",
  "WP-07": "messages, files, approvals and device management call authorize with an action",
} as const
