import path from "node:path"
import type { VerifiedCore } from "./core-manifest"

export function assertDaemonCoreIdentity(status: unknown, expected: Pick<VerifiedCore, "directory" | "version" | "sourceSha">): void {
  const core = (status as { core?: Partial<VerifiedCore> } | null)?.core
  if (!core || core.version !== expected.version || core.sourceSha !== expected.sourceSha ||
      typeof core.directory !== "string" || path.resolve(core.directory) !== path.resolve(expected.directory)) {
    throw new Error("Incompatible daemon core identity. Stop the old daemon explicitly before starting this AgentHub candidate; no new work was dispatched.")
  }
}
