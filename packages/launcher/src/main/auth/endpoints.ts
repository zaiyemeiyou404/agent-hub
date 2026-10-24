/**
 * apiBase, webBase and authBase are three explicit origins.
 * A missing or illegal value is configuration_required. Nothing here invents
 * an official host. Old env names still map onto those fields.
 */

import { resolveServiceUrl, validateServiceConfiguration, type ServiceRole, type ServiceConfiguration } from "./service-endpoints"

let saved: ServiceConfiguration | undefined
export function setServiceConfiguration(value?: unknown): void {
  saved = value === undefined ? undefined : validateServiceConfiguration(value)
}
export function configuredDevelopmentMode(): boolean {
  return saved ? saved.devLoopback : process.env.AGHUB_DEV_LOOPBACK === "1"
}
function resolve(value: string | undefined, role: ServiceRole): string {
  return resolveServiceUrl(value, role, { AGHUB_DEV_LOOPBACK: configuredDevelopmentMode() ? "1" : "" })
}

function fromEnv(explicit: string | undefined, envName: string, role: ServiceRole): string {
  return resolve(explicit || saved?.[`${role}Base`] || process.env[envName], role)
}

/** The workspace API origin. This is never reused as the web or auth origin. */
export function apiBase(configured?: string): string {
  return resolve(configured || saved?.apiBase, "api")
}

/** The web origin. An explicit argument is a web URL, not the API endpoint. */
export function webBase(explicitWeb?: string): string {
  return fromEnv(explicitWeb, "OPENAGENTS_WORKSPACE_WEB_BASE", "web")
}

export function accountApiBase(explicitAuth?: string): string {
  return fromEnv(explicitAuth, "OPENAGENTS_ACCOUNT_API_BASE", "auth")
}

export function loginBase(explicitAuth?: string): string {
  return resolve(explicitAuth || saved?.authBase || process.env.OPENAGENTS_ACCOUNT_API_BASE || process.env.OPENAGENTS_LOGIN_BASE, "auth")
}
