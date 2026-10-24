export class ConfigurationRequiredError extends Error {
  readonly code = "configuration_required"

  constructor(readonly field: string) {
    super("configuration_required")
    this.name = "ConfigurationRequiredError"
  }
}

export const DEV_API_BASE = "http://127.0.0.1:18000"
export const DEV_WEB_BASE = "http://127.0.0.1:13000"

export type ServiceRole = "api" | "web" | "auth"

type Env = Record<string, string | undefined>

export function devLoopbackEnabled(env: Env = process.env): boolean {
  return env.AGHUB_DEV_LOOPBACK === "1"
}

/** Configured origins only. Missing, malformed, and non-dev HTTP are configuration_required. */
export function resolveServiceUrl(raw: string | undefined | null, role: ServiceRole, env: Env = process.env): string {
  const value = (raw || "").trim().replace(/\/$/, "")
  if (!value) throw new ConfigurationRequiredError(role)
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new ConfigurationRequiredError(role)
  }
  if (url.username || url.password || url.search || url.hash) throw new ConfigurationRequiredError(role)
  if (url.pathname !== "/" && url.pathname !== "") throw new ConfigurationRequiredError(role)
  const origin = `${url.protocol}//${url.host}`
  if (url.protocol === "https:") return origin
  const allowed = role === "web" ? DEV_WEB_BASE : DEV_API_BASE
  if (devLoopbackEnabled(env) && origin === allowed) return origin
  throw new ConfigurationRequiredError(role)
}

/** A caller-supplied client target. Loopback HTTP is allowed only because the caller named it. */
export function acceptExplicitServiceUrl(raw: string | undefined | null, role: ServiceRole = "api"): string {
  const value = (raw || "").trim().replace(/\/$/, "")
  if (!value) throw new ConfigurationRequiredError(role)
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new ConfigurationRequiredError(role)
  }
  const host = url.hostname
  const loopback = host === "127.0.0.1" || host === "localhost" || host === "::1"
  if (url.protocol === "https:" || (url.protocol === "http:" && loopback)) {
    return `${url.protocol}//${url.host}`
  }
  throw new ConfigurationRequiredError(role)
}

export function tokenForService(
  stored: { apiBase?: string | null; token?: string | null } | null | undefined,
  apiBase: string,
): string | null {
  if (!stored?.token || !stored.apiBase) return null
  if (stored.apiBase.replace(/\/$/, "") !== apiBase.replace(/\/$/, "")) return null
  return stored.token
}

export function updateFeedOrNull(feed: string | undefined | null, enabled: boolean): string | null {
  if (!enabled) return null
  if (!feed || !feed.startsWith("https://") || feed.includes("openagents.org")) return null
  return feed.replace(/\/$/, "")
}
