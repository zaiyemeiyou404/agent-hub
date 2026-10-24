/**
 * apiBase, webBase and authBase are three explicit origins.
 * A missing or illegal value is configuration_required. Nothing here invents
 * an official host. Old env names still map onto those fields.
 */

import { resolveServiceUrl, type ServiceRole } from "./service-endpoints"

function fromEnv(explicit: string | undefined, envName: string, role: ServiceRole): string {
  return resolveServiceUrl(explicit || process.env[envName], role)
}

/** The workspace API origin. This is never reused as the web or auth origin. */
export function apiBase(configured?: string): string {
  return resolveServiceUrl(configured, "api")
}

/** The web origin. An explicit argument is a web URL, not the API endpoint. */
export function webBase(explicitWeb?: string): string {
  return fromEnv(explicitWeb, "OPENAGENTS_WORKSPACE_WEB_BASE", "web")
}

export function accountApiBase(explicitAuth?: string): string {
  return fromEnv(explicitAuth, "OPENAGENTS_ACCOUNT_API_BASE", "auth")
}

export function loginBase(explicitAuth?: string): string {
  return fromEnv(explicitAuth || process.env.OPENAGENTS_ACCOUNT_API_BASE, "OPENAGENTS_LOGIN_BASE", "auth")
}
