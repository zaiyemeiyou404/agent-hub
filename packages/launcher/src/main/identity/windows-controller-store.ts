import { safeStorage } from "electron"

import { createWindowsSecureBox, FailClosedSecretStore } from "../../../../controller-identity/src/index"
import type { SecretSink } from "../../../../controller-identity/src/index"

/** Desktop controller vault. Uses DPAPI through safeStorage and never writes plaintext. */
export function windowsControllerVault(sink: SecretSink): FailClosedSecretStore {
  return new FailClosedSecretStore(createWindowsSecureBox(safeStorage), sink)
}
