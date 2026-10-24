export class ConfigurationRequired extends Error {
  readonly code = 'configuration_required';
  constructor(readonly field: string) {
    super('configuration_required');
    this.name = 'ConfigurationRequired';
  }
}

export const DEV_API_BASE = 'http://127.0.0.1:18000';
export const DEV_WEB_BASE = 'http://127.0.0.1:13000';

export type ServiceRole = 'api' | 'web' | 'auth';
type Env = Record<string, string | undefined>;

export function resolveServiceUrl(raw: string | undefined | null, role: ServiceRole, env: Env = process.env): string {
  const value = (raw || '').trim().replace(/\/$/, '');
  if (!value) throw new ConfigurationRequired(role);
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ConfigurationRequired(role);
  }
  if (url.username || url.password || url.search || url.hash) throw new ConfigurationRequired(role);
  if (url.pathname !== '/' && url.pathname !== '') throw new ConfigurationRequired(role);
  const origin = `${url.protocol}//${url.host}`;
  if (url.protocol === 'https:') return origin;
  const allowed = role === 'web' ? DEV_WEB_BASE : DEV_API_BASE;
  const devLoopback = env.AGHUB_DEV_LOOPBACK === '1' || env.NEXT_PUBLIC_AGHUB_DEV_LOOPBACK === '1';
  if (devLoopback && origin === allowed) return origin;
  throw new ConfigurationRequired(role);
}

export function readConfiguredBase(env: Env, name: string, role: ServiceRole): string {
  return resolveServiceUrl(env[name], role, env);
}

export function tokenForService(
  stored: { apiBase?: string | null; token?: string | null } | null | undefined,
  apiBase: string,
): string | null {
  if (!stored?.token || !stored.apiBase) return null;
  if (stored.apiBase.replace(/\/$/, '') !== apiBase.replace(/\/$/, '')) return null;
  return stored.token;
}

export function apiBaseFromEnv(env: Env = process.env): string {
  try {
    return readConfiguredBase(env, 'NEXT_PUBLIC_API_URL', 'api');
  } catch {
    return '';
  }
}

export function authBaseFromEnv(env: Env = process.env): string {
  try {
    return readConfiguredBase(env, 'NEXT_PUBLIC_AUTH_BASE', 'auth');
  } catch {
    return '';
  }
}

export function webBaseFromEnv(env: Env = process.env): string {
  try {
    return readConfiguredBase(env, 'NEXT_PUBLIC_WEB_BASE', 'web');
  } catch {
    return '';
  }
}
