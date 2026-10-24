interface CoreIdentity { directory:string; version:string; sourceSha:string | null }
declare const identity: {
  verifyManagedCore(): CoreIdentity & { managed:boolean }
  assertCompatibleDaemon(configDir:string, expected?:CoreIdentity, options?:{ignoreSelf?:boolean}): number | null
}
export default identity
