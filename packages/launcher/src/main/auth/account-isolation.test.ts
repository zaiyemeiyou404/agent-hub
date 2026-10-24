import { afterEach, describe, expect, it, vi } from "vitest"

import { AccountManager } from "./account"
import type { AccountSession } from "./session-store"

vi.mock("electron", () => ({ net: {} }))

let stored: AccountSession | null = null
vi.mock("./session-store", async () => {
  const actual = await vi.importActual<typeof import("./session-store")>("./session-store")
  return {
    ...actual,
    loadSession: () => stored,
    saveSession: (session: AccountSession) => { stored = session },
    clearSession: () => { stored = null },
  }
})

const realFetch = globalThis.fetch
const DAY = 86400
const email = "a@example.com"

function session(extra: Partial<AccountSession> = {}): AccountSession {
  return {
    kind: "workspace",
    token: "old-token",
    refreshToken: "old-refresh",
    email,
    displayName: "A",
    expiresAt: Math.floor(Date.now() / 1000) + 30 * DAY,
    boundApiBase: "https://old.example.com",
    ...extra,
  }
}

function manager(endpoint: () => string, openExternal: (url: string) => void = () => {}) {
  return new AccountManager({ endpoint, openExternal, onChange: () => {} })
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  stored = null
})

describe("AccountManager credential service binding", () => {
  it("requires sign-in again for a stored session that names no service", async () => {
    stored = session({ boundApiBase: undefined, token: "legacy-token" })
    const calls: string[] = []
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      calls.push(String(url))
      return { ok: true, status: 200, json: async () => ({}) }
    }))
    const account = manager(() => "https://new.example.com")
    expect(account.getAccount()).toBeNull()
    await expect(account.bearer()).rejects.toThrow("NOT_SIGNED_IN")
    expect(calls).toEqual([])
    expect(stored).toBeNull()
  })

  it("does not send a token bound to another service, and does not rebind it", async () => {
    stored = session()
    const calls: Array<{ url: string; authorization?: string; body?: string }> = []
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      const headers = init?.headers as Record<string, string> | undefined
      calls.push({ url: String(url), authorization: headers?.Authorization, body: init?.body ? String(init.body) : undefined })
      return { ok: true, status: 200, json: async () => ({}) }
    }))
    const account = manager(() => "https://new.example.com")
    await expect(account.bearer()).rejects.toThrow("SESSION_SERVICE_CHANGED")
    expect(calls).toEqual([])
    expect(stored?.token).toBe("old-token")
    expect(stored?.boundApiBase).toBe("https://old.example.com")
    expect(account.embeddedSession()).toBeNull()
  })

  it("renews only at the captured service and drops the result if the endpoint moves", async () => {
    stored = session({ expiresAt: Math.floor(Date.now() / 1000) + 3600 })
    let endpoint = "https://old.example.com"
    let release: (value: unknown) => void = () => {}
    const calls: Array<{ url: string; authorization?: string }> = []
    vi.stubGlobal("fetch", vi.fn((url: string, init?: RequestInit) => {
      const headers = init?.headers as Record<string, string> | undefined
      calls.push({ url: String(url), authorization: headers?.Authorization })
      return new Promise((resolve) => { release = resolve })
    }))
    const account = manager(() => endpoint)
    const pending = account.bearer()
    await vi.waitFor(() => expect(calls).toHaveLength(1))
    endpoint = "https://new.example.com"
    release({
      ok: true,
      status: 200,
      json: async () => ({ data: {
        session_token: "renewed-token",
        email,
        display_name: "A",
        expires_at: new Date(Date.now() + 30 * DAY * 1000).toISOString(),
      } }),
    })
    await expect(pending).rejects.toThrow("SESSION_SERVICE_CHANGED")
    expect(calls).toEqual([{
      url: "https://old.example.com/v1/auth/session/renew",
      authorization: "Bearer old-token",
    }])
    expect(stored?.token).toBe("old-token")
    expect(stored?.boundApiBase).toBe("https://old.example.com")
  })

  it("renews a session that still belongs to the current service", async () => {
    stored = session({ boundApiBase: "https://api.example.com", expiresAt: Math.floor(Date.now() / 1000) + 3600 })
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      expect(String(url)).toBe("https://api.example.com/v1/auth/session/renew")
      return { ok: true, status: 200, json: async () => ({ data: {
        session_token: "renewed-token", email, display_name: "A",
        expires_at: new Date(Date.now() + 30 * DAY * 1000).toISOString(),
      } }) }
    }))
    const account = manager(() => "https://api.example.com")
    await expect(account.bearer()).resolves.toBe("renewed-token")
    expect(stored?.boundApiBase).toBe("https://api.example.com")
    expect(account.embeddedSession()?.apiBase).toBe("https://api.example.com")
    const calls: string[] = []
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      calls.push(String(url))
      const headers = init?.headers as Record<string, string>
      expect(headers.Authorization).toBe("Bearer renewed-token")
      return { ok: true, status: 200, json: async () => ({ data: [] }) }
    }))
    await expect(account.listWorkspaces()).resolves.toEqual([])
    expect(calls).toEqual(["https://api.example.com/v1/account/workspaces"])
  })
})

describe("AccountManager official account path", () => {
  it("does not redeem a failed workspace session at the official Firebase project", async () => {
    vi.stubEnv("OPENAGENTS_ACCOUNT_API_BASE", "https://auth.example.com")
    const calls: Array<{ url: string; body?: string }> = []
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url: String(url), body: init?.body ? String(init.body) : undefined })
      if (String(url).endsWith("/v1/auth/login")) {
        return { ok: true, status: 200, json: async () => ({ code: 200, data: { access_token: "account-token" } }) }
      }
      if (String(url).endsWith("/v1/auth/workspace-handoff")) {
        return { ok: true, status: 200, json: async () => ({ data: { custom_token: "custom-secret" } }) }
      }
      return { ok: false, status: 503, json: async () => ({ message: "session down" }) }
    }))
    const account = manager(() => "https://api.example.com")
    await expect(account.signInWithPassword(email, "pw")).rejects.toThrow(/session down|503/)
    const blob = JSON.stringify(calls)
    expect(blob).not.toMatch(/googleapis|securetoken|identitytoolkit|AIza/)
    expect(calls.map((call) => call.url)).toEqual([
      "https://auth.example.com/v1/auth/login",
      "https://auth.example.com/v1/auth/workspace-handoff",
      "https://api.example.com/v1/auth/session",
    ])
    expect(calls[2].body).toContain("custom-secret")
    expect(stored).toBeNull()
  })

  it("does not send a password when the account service is missing", async () => {
    vi.stubEnv("OPENAGENTS_ACCOUNT_API_BASE", "https://auth.example.com")
    const calls: string[] = []
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      calls.push(String(url))
      return { ok: false, status: 404, json: async () => ({ message: "Not Found" }) }
    }))
    const account = manager(() => "https://api.example.com")
    await expect(account.signInWithPassword(email, "secret-password")).rejects.toThrow("SIGN_IN_NO_ACCOUNT_SERVICE")
    expect(calls).toEqual(["https://auth.example.com/v1/auth/login"])
    expect(JSON.stringify(calls)).not.toMatch(/googleapis|AIza/)
  })

  it("does not refresh an old Firebase session at Google", async () => {
    stored = session({
      kind: "firebase",
      token: "firebase-id",
      refreshToken: "firebase-refresh",
      boundApiBase: "https://api.example.com",
      expiresAt: Math.floor(Date.now() / 1000) + 30,
    })
    const calls: Array<{ url: string; body?: string }> = []
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url: String(url), body: init?.body ? String(init.body) : undefined })
      return { ok: true, status: 200, json: async () => ({ id_token: "fresh", refresh_token: "next" }) }
    }))
    const account = manager(() => "https://api.example.com")
    await expect(account.bearer()).rejects.toThrow("NOT_SIGNED_IN")
    expect(calls).toEqual([])
    expect(stored).toBeNull()
  })
})

describe("AccountManager browser handoff origins", () => {
  function browser(customToken = "custom-secret") {
    const opened: string[] = []
    return {
      opened,
      openExternal: (url: string) => {
        opened.push(url)
        const target = new URL(url)
        void realFetch(`http://127.0.0.1:${target.searchParams.get("port")}/desktop-auth`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ state: target.searchParams.get("state"), customToken }),
        })
      },
    }
  }

  it("opens the web origin and mints the session at the API origin", async () => {
    vi.stubEnv("OPENAGENTS_WORKSPACE_WEB_BASE", "https://web.example.com")
    vi.stubEnv("OPENAGENTS_ACCOUNT_API_BASE", "https://auth.example.com")
    const calls: Array<{ url: string; body?: string }> = []
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url: String(url), body: init?.body ? String(init.body) : undefined })
      if (String(url).includes("/auth/desktop")) return { ok: true, status: 200, json: async () => ({}) }
      return { ok: true, status: 200, json: async () => ({ data: {
        session_token: "minted", email, display_name: "A",
        expires_at: new Date(Date.now() + 30 * DAY * 1000).toISOString(),
      } }) }
    }))
    const page = browser()
    const account = manager(() => "https://api.example.com", page.openExternal)
    await account.signIn()
    expect(new URL(page.opened[0]).origin).toBe("https://web.example.com")
    expect(calls.some((call) => call.url.startsWith("https://api.example.com/v1/auth/session"))).toBe(true)
    expect(calls.some((call) => call.url.includes("web.example.com/v1"))).toBe(false)
    expect(calls.find((call) => call.url.includes("/v1/auth/session"))?.body).toContain("custom-secret")
    expect(stored?.boundApiBase).toBe("https://api.example.com")
  })

  it("uses the dev web and API ports when loopback is explicitly enabled", async () => {
    vi.stubEnv("AGHUB_DEV_LOOPBACK", "1")
    vi.stubEnv("OPENAGENTS_WORKSPACE_WEB_BASE", "http://127.0.0.1:13000")
    const calls: string[] = []
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      calls.push(String(url))
      if (String(url).includes("/auth/desktop")) return { ok: true, status: 200, json: async () => ({}) }
      return { ok: true, status: 200, json: async () => ({ data: {
        session_token: "minted", email, display_name: "A",
        expires_at: new Date(Date.now() + 30 * DAY * 1000).toISOString(),
      } }) }
    }))
    const page = browser()
    const account = manager(() => "http://127.0.0.1:18000", page.openExternal)
    await account.signIn()
    expect(new URL(page.opened[0]).origin).toBe("http://127.0.0.1:13000")
    expect(calls).toContain("http://127.0.0.1:13000/auth/desktop")
    expect(calls).toContain("http://127.0.0.1:18000/v1/auth/session")
  })

  it("does not store a custom token minted after the API endpoint changed", async () => {
    vi.stubEnv("OPENAGENTS_WORKSPACE_WEB_BASE", "https://web.example.com")
    let endpoint = "https://old.example.com"
    const calls: Array<{ url: string; body?: string }> = []
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url: String(url), body: init?.body ? String(init.body) : undefined })
      if (String(url).includes("/auth/desktop")) return { ok: true, status: 200, json: async () => ({}) }
      endpoint = "https://new.example.com"
      return { ok: true, status: 200, json: async () => ({ data: {
        session_token: "late", email, display_name: "A",
        expires_at: new Date(Date.now() + 30 * DAY * 1000).toISOString(),
      } }) }
    }))
    const page = browser("late-custom")
    const account = manager(() => endpoint, page.openExternal)
    await expect(account.signIn()).rejects.toThrow("SESSION_SERVICE_CHANGED")
    expect(calls.filter((call) => call.url.includes("/v1/auth/session"))).toEqual([
      { url: "https://old.example.com/v1/auth/session", body: expect.stringContaining("late-custom") },
    ])
    expect(calls.some((call) => call.url.includes("new.example.com"))).toBe(false)
    expect(stored).toBeNull()
  })
})
