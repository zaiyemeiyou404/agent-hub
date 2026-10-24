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

export interface ServiceConfiguration {
  apiBase: string;
  webBase: string;
  authBase: string;
  devLoopback: boolean;
}
export const SERVICE_CONFIGURATION_KEY = 'aghub_service_configuration_v1';

export function validateServiceConfiguration(value: unknown): ServiceConfiguration {
  const raw = value as Partial<ServiceConfiguration> | null;
  if (!raw || typeof raw !== 'object' || typeof raw.devLoopback !== 'boolean') throw new ConfigurationRequired('services');
  const env = { AGHUB_DEV_LOOPBACK: raw.devLoopback ? '1' : '' };
  for (const key of ['apiBase', 'webBase', 'authBase'] as const) {
    if (typeof raw[key] !== 'string') throw new ConfigurationRequired(key);
  }
  return {
    apiBase: resolveServiceUrl(raw.apiBase, 'api', env),
    webBase: resolveServiceUrl(raw.webBase, 'web', env),
    authBase: resolveServiceUrl(raw.authBase, 'auth', env),
    devLoopback: raw.devLoopback,
  };
}

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

const bundledEnv: Env = {
  AGHUB_DEV_LOOPBACK: process.env.AGHUB_DEV_LOOPBACK,
  NEXT_PUBLIC_AGHUB_DEV_LOOPBACK: process.env.NEXT_PUBLIC_AGHUB_DEV_LOOPBACK,
};

function readStatic(value: string | undefined, role: ServiceRole): string {
  // Desktop configuration belongs to main/preload. Browser settings contain
  // origins only and are applied on reload before API clients load.
  if (typeof window !== 'undefined' && !(window as unknown as { __oaHost__?: unknown }).__oaHost__) {
    const saved = window.localStorage?.getItem(SERVICE_CONFIGURATION_KEY);
    if (saved) {
      const config = validateServiceConfiguration(JSON.parse(saved));
      return config[`${role}Base`];
    }
  }
  return resolveServiceUrl(value, role, bundledEnv);
}

export function tokenForService(
  stored: { apiBase?: string | null; token?: string | null } | null | undefined,
  apiBase: string,
): string | null {
  if (!stored?.token || !stored.apiBase) return null;
  if (stored.apiBase.replace(/\/$/, '') !== apiBase.replace(/\/$/, '')) return null;
  return stored.token;
}

export function apiBaseFromEnv(): string {
  try {
    return readStatic(process.env.NEXT_PUBLIC_API_URL, 'api');
  } catch {
    return '';
  }
}

export function authBaseFromEnv(): string {
  try {
    return readStatic(process.env.NEXT_PUBLIC_AUTH_BASE, 'auth');
  } catch {
    return '';
  }
}

export function webBaseFromEnv(): string {
  try {
    return readStatic(process.env.NEXT_PUBLIC_WEB_BASE, 'web');
  } catch {
    return '';
  }
}
