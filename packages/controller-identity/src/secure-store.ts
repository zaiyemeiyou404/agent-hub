export class SecureStorageUnavailableError extends Error {
  readonly code = "secure_storage_unavailable"
  constructor() {
    super("secure_storage_unavailable")
    this.name = "SecureStorageUnavailableError"
  }
}

export interface OsSecretBox {
  available(): boolean
  encrypt(plain: string): string
  decrypt(payload: string): string
}

export interface SecretSink {
  read(origin: string): string | null
  write(origin: string, ciphertext: string): void
  delete(origin: string): void
  snapshot(): Record<string, string>
}

export interface ControllerSecret {
  serverOrigin: string
  deviceId: string
  refreshToken: string
  accessToken: string
  accessExpiresAt: string
  workspaceId: string
  kind: "phone" | "desktop"
  platform: string
}

export function normalizeOrigin(origin: string): string {
  const url = new URL(origin)
  const port = url.port ? `:${url.port}` : ""
  return `${url.protocol}//${url.hostname.toLowerCase()}${port}`
}

export class MemorySecretSink implements SecretSink {
  private readonly data = new Map<string, string>()
  read(origin: string): string | null {
    return this.data.get(normalizeOrigin(origin)) ?? null
  }
  write(origin: string, ciphertext: string): void {
    this.data.set(normalizeOrigin(origin), ciphertext)
  }
  delete(origin: string): void {
    this.data.delete(normalizeOrigin(origin))
  }
  snapshot(): Record<string, string> {
    return Object.fromEntries(this.data)
  }
}

export interface FsLike {
  mkdirSync(path: string, options: { recursive: boolean }): void
  writeFileSync(path: string, data: string, options: { mode: number }): void
  readFileSync(path: string, encoding: "utf8"): string
  rmSync(path: string, options: { force: boolean }): void
  existsSync(path: string): boolean
}

/** Persists ciphertext only. Refuses a payload that still contains a session secret. */
export class CiphertextDirectorySink implements SecretSink {
  private readonly dir: string
  private readonly fs: FsLike
  constructor(dir: string, fs: FsLike) {
    this.dir = dir
    this.fs = fs
  }

  private fileFor(origin: string): string {
    const name = normalizeOrigin(origin).replace(/[^a-z0-9]+/gi, "_")
    return `${this.dir}/${name}.bin`
  }

  read(origin: string): string | null {
    const file = this.fileFor(origin)
    if (!this.fs.existsSync(file)) return null
    return this.fs.readFileSync(file, "utf8")
  }

  write(origin: string, ciphertext: string): void {
    if (ciphertext.includes("oa_rt_") || ciphertext.includes("oa_at_") || ciphertext.includes("refreshToken")) {
      throw new SecureStorageUnavailableError()
    }
    this.fs.mkdirSync(this.dir, { recursive: true })
    this.fs.writeFileSync(this.fileFor(origin), ciphertext, { mode: 0o600 })
  }

  delete(origin: string): void {
    this.fs.rmSync(this.fileFor(origin), { force: true })
  }

  snapshot(): Record<string, string> {
    return {}
  }
}

export class FailClosedSecretStore {
  private readonly box: OsSecretBox
  private readonly sink: SecretSink
  constructor(box: OsSecretBox, sink: SecretSink) {
    this.box = box
    this.sink = sink
  }

  put(secret: ControllerSecret): void {
    if (!this.box.available()) throw new SecureStorageUnavailableError()
    let ciphertext: string
    try {
      ciphertext = this.box.encrypt(JSON.stringify(secret))
    } catch (err) {
      if (err instanceof SecureStorageUnavailableError) throw err
      throw new SecureStorageUnavailableError()
    }
    this.sink.write(secret.serverOrigin, ciphertext)
  }

  get(origin: string): ControllerSecret | null {
    const stored = this.sink.read(origin)
    if (stored == null) return null
    if (!this.box.available()) throw new SecureStorageUnavailableError()
    const plain = this.box.decrypt(stored)
    const parsed = JSON.parse(plain) as ControllerSecret
    if ("workspaceToken" in parsed) {
      throw new SecureStorageUnavailableError()
    }
    return parsed
  }

  delete(origin: string): void {
    this.sink.delete(origin)
  }
}

export interface WindowsOsStorage {
  isEncryptionAvailable(): boolean
  encryptString(plain: string): Uint8Array
  decryptString(payload: Uint8Array): string
}

function bytesToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== "undefined") return Buffer.from(bytes).toString("base64")
  let raw = ""
  for (const byte of bytes) raw += String.fromCharCode(byte)
  return btoa(raw)
}

function base64ToBytes(payload: string): Uint8Array {
  if (typeof Buffer !== "undefined") return new Uint8Array(Buffer.from(payload, "base64"))
  const raw = atob(payload)
  const bytes = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i)
  return bytes
}

/** Windows DPAPI via Electron safeStorage. Unavailable storage does not encrypt. */
export function createWindowsSecureBox(os: WindowsOsStorage): OsSecretBox {
  return {
    available() {
      try {
        return os.isEncryptionAvailable()
      } catch {
        return false
      }
    },
    encrypt(plain: string) {
      if (!os.isEncryptionAvailable()) throw new SecureStorageUnavailableError()
      return bytesToBase64(os.encryptString(plain))
    },
    decrypt(payload: string) {
      if (!os.isEncryptionAvailable()) throw new SecureStorageUnavailableError()
      return os.decryptString(base64ToBytes(payload))
    },
  }
}

export interface AndroidKeystoreBridge {
  isKeystoreAvailable(): boolean
  encrypt(alias: string, plain: string): string
  decrypt(alias: string, payload: string): string
}

/** Android Keystore bridge. A false availability result never reaches disk. */
export function createAndroidSecureBox(bridge: AndroidKeystoreBridge, alias: string): OsSecretBox {
  return {
    available() {
      try {
        return bridge.isKeystoreAvailable()
      } catch {
        return false
      }
    },
    encrypt(plain: string) {
      if (!bridge.isKeystoreAvailable()) throw new SecureStorageUnavailableError()
      return bridge.encrypt(alias, plain)
    },
    decrypt(payload: string) {
      if (!bridge.isKeystoreAvailable()) throw new SecureStorageUnavailableError()
      return bridge.decrypt(alias, payload)
    },
  }
}
