import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const KEY = 'oa_workspace_session';
const API_A = 'https://api-a.example.test';
const API_B = 'https://api-b.example.test';
const storage = new Map<string, string>();
const valid = () => ({
  apiBase: API_A, token: 'synthetic-a-token', email: 'fixture@example.test',
  displayName: null, expiresAt: Math.floor(Date.now() / 1000) + 3600,
});

async function client(api: string) {
  vi.resetModules();
  vi.stubEnv('NEXT_PUBLIC_API_URL', api);
  return import('./workspace-session');
}

beforeEach(() => {
  storage.clear();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  });
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe('persisted workspace session service identity', () => {
  it('restores a bound session and sends it only to the same service', async () => {
    const session = await client(API_A);
    session.saveWorkspaceSession(valid());
    const restored = session.loadWorkspaceSession();
    expect(restored?.apiBase).toBe(API_A);
    const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: [] }) });
    vi.stubGlobal('fetch', fetch);
    const { listAccountWorkspaces } = await import('./account-api');
    await listAccountWorkspaces(restored!.token);
    expect(fetch).toHaveBeenCalledWith(`${API_A}/v1/account/workspaces`, expect.objectContaining({
      headers: expect.objectContaining({ Authorization: 'Bearer synthetic-a-token' }),
    }));
  });

  it('does not restore or send service A credentials after the API changes to B', async () => {
    const a = await client(API_A);
    a.saveWorkspaceSession(valid());
    const b = await client(API_B);
    const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: [] }) });
    vi.stubGlobal('fetch', fetch);
    const restored = b.loadWorkspaceSession();
    const { listAccountWorkspaces } = await import('./account-api');
    // This is the AuthProvider restore -> membership request chain.
    if (restored) await listAccountWorkspaces(restored.token);
    expect(restored).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
    expect(storage.has(KEY)).toBe(false);
  });

  it('requires login for a legacy session without a recorded source', async () => {
    const { apiBase: _source, ...legacy } = valid();
    storage.set(KEY, JSON.stringify(legacy));
    const session = await client(API_A);
    expect(session.loadWorkspaceSession()).toBeNull();
    expect(storage.has(KEY)).toBe(false);
  });

  it('refuses an incoming session bound to another service', async () => {
    const session = await client(API_B);
    session.saveWorkspaceSession(valid());
    expect(session.loadWorkspaceSession()).toBeNull();
    expect(storage.has(KEY)).toBe(false);
  });

  it('binds the session received from the handoff exchange before persisting it', async () => {
    const session = await client(API_A);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: {
      session_token: 'minted-token', email: 'fixture@example.test',
      expires_at: new Date(Date.now() + 3600_000).toISOString(),
    } }) }));
    const minted = await session.exchangeHandoffToken('synthetic-custom-token');
    expect(minted.apiBase).toBe(API_A);
    expect(session.loadWorkspaceSession()?.apiBase).toBe(API_A);
  });

  it('makes no handoff request when the API is unconfigured', async () => {
    const session = await client('');
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    await expect(session.exchangeHandoffToken('synthetic-custom-token')).rejects.toThrow('configuration_required');
    expect(fetch).not.toHaveBeenCalled();
  });
});
