export interface CoreManifest {
  schemaVersion: 1
  connectorVersion: string
  sourceSha: string
  hashes: Record<string, string>
  entrypoints: { main: string; cli: string }
}
export interface VerifiedCore {
  directory: string
  version: string
  sourceSha: string
  entrypoints: { main: string; cli: string }
}

// Bundled into the main process by electron-vite, never loaded from the core
// directory before verification. The standalone CLI uses the same validator.
const integrity = require("../../../../agent-connector/src/core-integrity.js") as {
  resolveVerifiedCore(manifest: unknown, packagedRoot: string): VerifiedCore
}
export function resolveVerifiedCore(manifest: unknown, packagedRoot: string): VerifiedCore {
  return integrity.resolveVerifiedCore(manifest, packagedRoot)
}
