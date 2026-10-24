import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const fake = vi.hoisted(() => ({
  config: {} as Record<string, unknown>,
  exposed: new Map<string, unknown>(),
  listeners: new Map<string, Array<(...args: any[]) => void>>(),
}))
vi.mock("electron", () => ({
  contextBridge: { exposeInMainWorld: (name: string, value: unknown) => fake.exposed.set(name, value) },
  ipcRenderer: {
    sendSync: () => fake.config,
    on: (name: string, handler: (...args: any[]) => void) => {
      fake.listeners.set(name, [...(fake.listeners.get(name) || []), handler])
    },
    removeListener: vi.fn(), send: vi.fn(), invoke: vi.fn(),
  },
}))

const KEY = "oa_workspace_session"
const API = "https://api.example.test"
const session = { apiBase: API, token: "synthetic-token", email: "fixture@example.test", displayName: null, expiresAt: 2000000000 }
const storage = new Map<string, string>()
beforeEach(() => {
  vi.resetModules()
  fake.exposed.clear(); fake.listeners.clear(); storage.clear()
  fake.config = { apiUrl: API, webUrl: "https://web.example.test", authUrl: "https://auth.example.test", session, theme: "system", locale: "en" }
  vi.stubGlobal("window", { localStorage: {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  } })
})
afterEach(() => vi.unstubAllGlobals())

function update(value: unknown) {
  for (const handler of fake.listeners.get("workspace-view:session") || []) handler({}, value)
}

describe("workspace preload service configuration and session binding", () => {
  it("supplies the complete runtime configuration and a bound initial session", async () => {
    await import("./workspace-view")
    expect(fake.exposed.get("__OA_API_URL__")).toBe(API)
    expect(fake.exposed.get("__OA_WEB_URL__")).toBe("https://web.example.test")
    expect(fake.exposed.get("__OA_AUTH_URL__")).toBe("https://auth.example.test")
    expect(fake.exposed.get("__OA_DEV_LOOPBACK__")).toBe("")
    expect(JSON.parse(storage.get(KEY)!)).toEqual(session)
  })
  it("keeps missing service origins empty and forwards only the explicit development flag", async () => {
    fake.config = { devLoopback: true, theme: "system", locale: "en" }
    await import("./workspace-view")
    expect(fake.exposed.get("__OA_API_URL__")).toBe("")
    expect(fake.exposed.get("__OA_AUTH_URL__")).toBe("")
    expect(fake.exposed.get("__OA_WEB_URL__")).toBe("")
    expect(fake.exposed.get("__OA_DEV_LOOPBACK__")).toBe("1")
  })
  it("does not rebind a legacy session when a service is configured", async () => {
    const { apiBase: _source, ...legacy } = session
    storage.set(KEY, JSON.stringify(legacy))
    fake.config.session = legacy
    await import("./workspace-view")
    expect(storage.has(KEY)).toBe(false)
  })
  it("rejects foreign live updates before storage and page callbacks", async () => {
    await import("./workspace-view")
    const callback = vi.fn()
    const host = fake.exposed.get("__oaHost__") as { onSession: (callback: (value: unknown) => void) => void }
    host.onSession(callback)
    update({ ...session, apiBase: "https://other.example.test", token: "foreign-token" })
    expect(callback).not.toHaveBeenCalled()
    expect(JSON.parse(storage.get(KEY)!)).toEqual(session)
    const renewed = { ...session, token: "renewed-token" }
    update(renewed)
    expect(callback).toHaveBeenCalledWith(renewed)
    expect(JSON.parse(storage.get(KEY)!)).toEqual(renewed)
  })
})
