import { diagnosticLine } from "./redact.ts"
import {
  FailClosedSecretStore,
  normalizeOrigin,
  SecureStorageUnavailableError,
  type ControllerSecret,
} from "./secure-store.ts"

export interface RecoveryEntry {
  kind: "controller_recovery"
  serverOrigin: string
  deviceId: string | null
  reason: "logout" | "server_switch" | "storage_unavailable" | "legacy_unmigrated" | "restart"
  reauthenticate: true
}

export interface OutboundRequest {
  origin: string
  path: string
  headers: Record<string, string>
  body: null
}

export interface LegacyCredentialFile {
  serverOrigin: string
  workspaceToken?: string
  refreshToken?: string
  accessToken?: string
  deviceId?: string
  workspaceId?: string
  kind?: "phone" | "desktop"
  platform?: string
}

export interface MigrationResult {
  persisted: boolean
  plaintextFallback: false
  eraseLegacy: boolean
  reason?: "storage_unavailable" | "legacy_unmigrated"
}

const STREAM_PREFIX = "oa_st_"

export function buildControllerStreamUrl(origin: string, workspaceId: string, streamTicket: string): string {
  if (!streamTicket.startsWith(STREAM_PREFIX)) throw new Error("stream_ticket_required")
  const url = new URL("/v1/events/stream", normalizeOrigin(origin))
  url.searchParams.set("network", workspaceId)
  url.searchParams.set("stream_ticket", streamTicket)
  if (url.hash) throw new Error("fragment_rejected")
  for (const key of ["token", "access_token", "refresh_token", "password"]) {
    if (url.searchParams.has(key)) throw new Error("credential_query_rejected")
  }
  return url.toString()
}

export function buildControllerRequest(input: {
  currentOrigin: string
  targetOrigin: string
  path: string
  accessToken: string | null
  refreshToken: string | null
  workspaceToken: string | null
}): { request: OutboundRequest; recovery: RecoveryEntry | null } {
  const target = normalizeOrigin(input.targetOrigin)
  const same = normalizeOrigin(input.currentOrigin) === target
  if (!same) {
    return {
      request: { origin: target, path: input.path, headers: {}, body: null },
      recovery: {
        kind: "controller_recovery",
        serverOrigin: target,
        deviceId: null,
        reason: "server_switch",
        reauthenticate: true,
      },
    }
  }
  const headers: Record<string, string> = {}
  if (input.accessToken) headers.Authorization = `Bearer ${input.accessToken}`
  return {
    request: { origin: target, path: input.path, headers, body: null },
    recovery: null,
  }
}

export function logoutLocal(store: FailClosedSecretStore, origin: string, deviceId: string | null): RecoveryEntry {
  store.delete(origin)
  return {
    kind: "controller_recovery",
    serverOrigin: normalizeOrigin(origin),
    deviceId,
    reason: "logout",
    reauthenticate: true,
  }
}

export function restoreAfterRestart(store: FailClosedSecretStore, origin: string):
  | { refreshToken: string; deviceId: string }
  | RecoveryEntry {
  try {
    const secret = store.get(origin)
    if (!secret) {
      return {
        kind: "controller_recovery",
        serverOrigin: normalizeOrigin(origin),
        deviceId: null,
        reason: "restart",
        reauthenticate: true,
      }
    }
    return { refreshToken: secret.refreshToken, deviceId: secret.deviceId }
  } catch (err) {
    if (err instanceof SecureStorageUnavailableError) {
      return {
        kind: "controller_recovery",
        serverOrigin: normalizeOrigin(origin),
        deviceId: null,
        reason: "storage_unavailable",
        reauthenticate: true,
      }
    }
    throw err
  }
}

export function migrateLegacy(file: LegacyCredentialFile, store: FailClosedSecretStore): MigrationResult {
  if (!file.refreshToken) {
    return { persisted: false, plaintextFallback: false, eraseLegacy: false, reason: "legacy_unmigrated" }
  }
  const secret: ControllerSecret = {
    serverOrigin: file.serverOrigin,
    deviceId: file.deviceId || "legacy-device",
    refreshToken: file.refreshToken,
    accessToken: file.accessToken || "",
    accessExpiresAt: "",
    workspaceId: file.workspaceId || "",
    kind: file.kind || "desktop",
    platform: file.platform || "windows",
  }
  try {
    store.put(secret)
    return { persisted: true, plaintextFallback: false, eraseLegacy: true }
  } catch (err) {
    if (err instanceof SecureStorageUnavailableError) {
      return { persisted: false, plaintextFallback: false, eraseLegacy: false, reason: "storage_unavailable" }
    }
    throw err
  }
}

export function safeDiagnostic(kind: "query" | "fragment" | "diagnostic", value: string): string {
  return diagnosticLine(kind, value)
}
