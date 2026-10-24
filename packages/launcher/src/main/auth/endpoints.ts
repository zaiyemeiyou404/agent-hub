/**
 * apiBase, webBase and authBase are three explicit origins.
 * A missing or illegal value is configuration_required. Nothing here invents
 * an official host. Old env names still map onto those fields.
 */

import { resolveServiceUrl, type ServiceRole } from "./service-endpoints"

function fromEnv(configured: string | undefined, envName: string, role: ServiceRole): string {
  return resolveServiceUrl(configured || process.env[envName], role)
}

export function apiBase(configured?: string): string {
  return resolveServiceUrl(configured, "api")
}

export function webBase(configured?: string): string {
  return fromEnv(configured, "OPENAGENTS_WORKSPACE_WEB_BASE", "web")
}

export function accountApiBase(configured?: string): string {
  return fromEnv(configured, "OPENAGENTS_ACCOUNT_API_BASE", "auth")
}

export function loginBase(configured?: string): string {
  return fromEnv(configured || process.env.OPENAGENTS_ACCOUNT_API_BASE, "OPENAGENTS_LOGIN_BASE", "auth")
}
