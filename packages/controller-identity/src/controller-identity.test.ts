import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

import { IDENTITY_CONSUMERS } from "./index.ts"
import { redactDiagnostic, redactFragment, redactQuery } from "./redact.ts"
import {
  buildControllerRequest,
  buildControllerStreamUrl,
  logoutLocal,
  migrateLegacy,
  restoreAfterRestart,
} from "./session-lifecycle.ts"
import {
  CiphertextDirectorySink,
  FailClosedSecretStore,
  MemorySecretSink,
  SecureStorageUnavailableError,
  createAndroidSecureBox,
  createWindowsSecureBox,
  type ControllerSecret,
  type FsLike,
} from "./secure-store.ts"

const REFRESH = "oa_rt_syntheticrefreshvalue"
const ACCESS = "oa_at_syntheticaccessvalue"
const WORKSPACE = "synthetic-workspace-token"
const ORIGIN = "https://controller.example"

function secret(overrides: Partial<ControllerSecret> = {}): ControllerSecret {
  return {
    serverOrigin: ORIGIN,
    deviceId: "synthetic-device",
    refreshToken: REFRESH,
    accessToken: ACCESS,
    accessExpiresAt: "2099-01-01T00:00:00Z",
    workspaceId: "synthetic-workspace",
    kind: "phone",
    platform: "android",
    ...overrides,
  }
}

function reversingBox(available = true) {
  return {
    available: () => available,
    encrypt(plain: string) {
      if (!available) throw new SecureStorageUnavailableError()
      return `v1:${[...plain].reverse().join("")}`
    },
    decrypt(payload: string) {
      if (!available) throw new SecureStorageUnavailableError()
      return [...payload.slice(3)].reverse().join("")
    },
  }
}

function memoryFs(): FsLike & { files: Map<string, string> } {
  const files = new Map<string, string>()
  return {
    files,
    mkdirSync() {},
    writeFileSync(file: string, data: string) {
      files.set(file, data)
    },
    readFileSync(file: string) {
      const found = files.get(file)
      if (found == null) throw new Error("missing")
      return found
    },
    rmSync(file: string) {
      files.delete(file)
    },
    existsSync(file: string) {
      return files.has(file)
    },
  }
}

test("query, fragment and diagnostic redaction stay independent", () => {
  const url = "https://controller.example/v1/events/stream?token=query-secret&network=ws#/room?token=fragment-secret"
  const queryOnly = redactQuery(url)
  assert.equal(queryOnly.includes("query-secret"), false)
  assert.equal(queryOnly.includes("fragment-secret"), true)
  const fragmentOnly = redactFragment(url)
  assert.equal(fragmentOnly.includes("fragment-secret"), false)
  assert.equal(fragmentOnly.includes("query-secret"), true)
  const diagnostic = redactDiagnostic(
    'POST failed bearer oa_at_syntheticsecret {"refresh_token":"oa_rt_syntheticsecret"}',
  )
  assert.equal(diagnostic.includes("oa_at_syntheticsecret"), false)
  assert.equal(diagnostic.includes("oa_rt_syntheticsecret"), false)
  assert.equal(diagnostic.includes("POST failed"), true)
})

test("unavailable secure storage does not persist long-lived credentials", () => {
  const sink = new MemorySecretSink()
  const store = new FailClosedSecretStore(reversingBox(false), sink)
  assert.throws(() => store.put(secret()), SecureStorageUnavailableError)
  assert.deepEqual(sink.snapshot(), {})
  const error = new SecureStorageUnavailableError()
  assert.equal(error.message.includes(REFRESH), false)
  assert.equal(error.message.includes(ACCESS), false)
})

test("windows and android boxes fail closed when the platform store is unavailable", () => {
  const windows = createWindowsSecureBox({
    isEncryptionAvailable: () => false,
    encryptString: () => {
      throw new Error("should not encrypt")
    },
    decryptString: () => {
      throw new Error("should not decrypt")
    },
  })
  const android = createAndroidSecureBox({
    isKeystoreAvailable: () => false,
    encrypt: () => {
      throw new Error("should not encrypt")
    },
    decrypt: () => {
      throw new Error("should not decrypt")
    },
  }, "agenthub-controller")
  for (const box of [windows, android]) {
    const sink = new MemorySecretSink()
    const store = new FailClosedSecretStore(box, sink)
    assert.throws(() => store.put(secret()), SecureStorageUnavailableError)
    assert.deepEqual(sink.snapshot(), {})
  }
})

test("windows encryption failure does not fall back to plaintext", () => {
  let writes = 0
  const windows = createWindowsSecureBox({
    isEncryptionAvailable: () => true,
    encryptString() {
      writes += 1
      throw new Error("dpapi denied")
    },
    decryptString: () => "",
  })
  const sink = new MemorySecretSink()
  const store = new FailClosedSecretStore(windows, sink)
  assert.throws(() => store.put(secret()), SecureStorageUnavailableError)
  assert.equal(writes, 1)
  assert.deepEqual(sink.snapshot(), {})
})

test("available windows storage keeps only ciphertext on the sink", () => {
  const os = {
    isEncryptionAvailable: () => true,
    encryptString(plain: string) {
      return new TextEncoder().encode([...plain].reverse().join(""))
    },
    decryptString(payload: Uint8Array) {
      return [...new TextDecoder().decode(payload)].reverse().join("")
    },
  }
  const files = memoryFs()
  const sink = new CiphertextDirectorySink("/tmp/synthetic-vault", files)
  const store = new FailClosedSecretStore(createWindowsSecureBox(os), sink)
  store.put(secret({ kind: "desktop", platform: "windows" }))
  const stored = [...files.files.values()].join("\n")
  assert.equal(stored.includes(REFRESH), false)
  assert.equal(stored.includes(ACCESS), false)
  assert.equal(stored.includes(WORKSPACE), false)
  const restored = store.get(ORIGIN)
  assert.equal(restored?.refreshToken, REFRESH)
  assert.equal("workspaceToken" in (restored ?? {}), false)
})

test("phone and desktop sessions logout and recover independently", () => {
  const phoneSink = new MemorySecretSink()
  const desktopSink = new MemorySecretSink()
  const phone = new FailClosedSecretStore(reversingBox(), phoneSink)
  const desktop = new FailClosedSecretStore(reversingBox(), desktopSink)
  phone.put(secret())
  desktop.put(secret({
    serverOrigin: ORIGIN,
    deviceId: "synthetic-desktop",
    kind: "desktop",
    platform: "windows",
    refreshToken: "oa_rt_syntheticdesktoprefresh",
  }))
  const phoneRestart = restoreAfterRestart(phone, ORIGIN)
  assert.equal("refreshToken" in phoneRestart && phoneRestart.refreshToken, REFRESH)
  const loggedOut = logoutLocal(phone, ORIGIN, "synthetic-device")
  assert.equal(loggedOut.reason, "logout")
  assert.equal(JSON.stringify(loggedOut).includes(REFRESH), false)
  assert.equal(phoneSink.snapshot()[ORIGIN], undefined)
  const desktopStill = restoreAfterRestart(desktop, ORIGIN)
  assert.equal("refreshToken" in desktopStill && desktopStill.refreshToken, "oa_rt_syntheticdesktoprefresh")
})

test("server switch drops old secrets and legacy migration does not keep the workspace token", () => {
  const switched = buildControllerRequest({
    currentOrigin: "https://old.example/workspace",
    targetOrigin: "https://new.example",
    path: "/v1/identity/controllers/refresh",
    accessToken: ACCESS,
    refreshToken: REFRESH,
    workspaceToken: WORKSPACE,
  })
  const wire = JSON.stringify(switched.request)
  assert.equal(wire.includes(REFRESH), false)
  assert.equal(wire.includes(ACCESS), false)
  assert.equal(wire.includes(WORKSPACE), false)
  assert.equal(switched.request.headers.Authorization, undefined)
  assert.equal(switched.recovery?.reason, "server_switch")
  assert.equal(JSON.stringify(switched.recovery).includes(REFRESH), false)

  const same = buildControllerRequest({
    currentOrigin: ORIGIN,
    targetOrigin: `${ORIGIN}/`,
    path: "/v1/identity/authorize",
    accessToken: ACCESS,
    refreshToken: REFRESH,
    workspaceToken: WORKSPACE,
  })
  assert.equal(same.request.headers.Authorization, `Bearer ${ACCESS}`)
  assert.equal(JSON.stringify(same.request).includes(REFRESH), false)
  assert.equal(JSON.stringify(same.request).includes(WORKSPACE), false)

  const sink = new MemorySecretSink()
  const store = new FailClosedSecretStore(reversingBox(), sink)
  const migrated = migrateLegacy({
    serverOrigin: ORIGIN,
    workspaceToken: WORKSPACE,
    refreshToken: REFRESH,
    accessToken: ACCESS,
    deviceId: "synthetic-device",
    workspaceId: "synthetic-workspace",
    kind: "desktop",
    platform: "windows",
  }, store)
  assert.equal(migrated.persisted, true)
  assert.equal(migrated.plaintextFallback, false)
  assert.equal(migrated.eraseLegacy, true)
  assert.equal(JSON.stringify(migrated).includes(WORKSPACE), false)
  assert.equal(JSON.stringify(sink.snapshot()).includes(WORKSPACE), false)
  assert.equal(JSON.stringify(sink.snapshot()).includes(REFRESH), false)
  const loaded = store.get(ORIGIN)
  assert.equal(loaded?.refreshToken, REFRESH)
  assert.equal(JSON.stringify(loaded).includes(WORKSPACE), false)

  const blocked = new MemorySecretSink()
  const denied = migrateLegacy({
    serverOrigin: ORIGIN,
    workspaceToken: WORKSPACE,
    refreshToken: REFRESH,
  }, new FailClosedSecretStore(reversingBox(false), blocked))
  assert.equal(denied.persisted, false)
  assert.equal(denied.plaintextFallback, false)
  assert.equal(denied.reason, "storage_unavailable")
  assert.deepEqual(blocked.snapshot(), {})
  assert.equal(JSON.stringify(denied).includes(REFRESH), false)
  assert.equal(JSON.stringify(denied).includes(WORKSPACE), false)
})

test("controller stream URL rejects long-lived credentials", () => {
  const url = buildControllerStreamUrl(ORIGIN, "synthetic-workspace", "oa_st_syntheticticket")
  assert.equal(url.includes("token="), false)
  assert.equal(url.includes(ACCESS), false)
  assert.equal(url.includes("#"), false)
  assert.equal(url.includes("stream_ticket=oa_st_syntheticticket"), true)
  assert.throws(() => buildControllerStreamUrl(ORIGIN, "synthetic-workspace", ACCESS))
  assert.throws(() => buildControllerStreamUrl(ORIGIN, "synthetic-workspace", REFRESH))
})

test("kotlin keystore source has no plaintext fallback", () => {
  const here = path.dirname(fileURLToPath(import.meta.url))
  const kotlin = fs.readFileSync(path.resolve(
    here,
    "../../mobile-identity/android/src/main/kotlin/org/agenthub/identity/ControllerKeystoreStore.kt",
  ), "utf8")
  assert.equal(kotlin.includes("AndroidKeyStore"), true)
  assert.equal(kotlin.includes("SharedPreferences"), false)
  assert.equal(kotlin.includes("MODE_PRIVATE"), false)
  assert.match(kotlin, /SecureStorageUnavailableException/)
})

test("client contract names WP-04 through WP-07", () => {
  for (const key of ["WP-04", "WP-05", "WP-06", "WP-07"]) {
    assert.equal(key in IDENTITY_CONSUMERS, true)
  }
})
