export interface VerifiedCore {
  directory: string
  version: string
  sourceSha: string
  entrypoints: { main: string; cli: string }
}
declare const integrity: {
  resolveVerifiedCore(manifest: unknown, root: string): VerifiedCore
  listControlledFiles(root: string): string[]
  sha256(bytes: string | Buffer): string
}
export default integrity
