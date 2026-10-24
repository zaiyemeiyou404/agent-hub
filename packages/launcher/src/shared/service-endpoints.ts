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

export interface ServiceConfiguration {
  apiBase: string
  webBase: string
  authBase: string
  devLoopback: boolean
}

export function validateServiceConfiguration(value: unknown): ServiceConfiguration {
  const raw = value as Partial<ServiceConfiguration> | null
  if (!raw || typeof raw !== "object" || typeof raw.devLoopback !== "boolean") throw new ConfigurationRequiredError("services")
  for (const key of ["apiBase", "webBase", "authBase"] as const) {
    if (typeof raw[key] !== "string") throw new ConfigurationRequiredError(key)
  }
  const env = { AGHUB_DEV_LOOPBACK: raw.devLoopback ? "1" : "" }
  return { apiBase: resolveServiceUrl(raw.apiBase, "api", env), webBase: resolveServiceUrl(raw.webBase, "web", env), authBase: resolveServiceUrl(raw.authBase, "auth", env), devLoopback: raw.devLoopback }
}

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

/** The same origin contract as resolveServiceUrl. Nothing is stripped or widened. */
export function acceptExplicitServiceUrl(
  raw: string | undefined | null,
  role: ServiceRole = "api",
  env: Env = process.env,
): string {
  return resolveServiceUrl(raw, role, env)
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
