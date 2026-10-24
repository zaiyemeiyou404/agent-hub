// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ConfigurationRequired, apiBaseFromEnv, authBaseFromEnv, webBaseFromEnv } from './service-endpoints';
import { saveServiceConfiguration } from './service-configuration';

const signOutUser = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock('./firebase', () => ({ signOutUser }));
const config = { apiBase: 'https://api.example.test', webBase: 'https://web.example.test', authBase: 'https://auth.example.test', devLoopback: false };
beforeEach(() => { localStorage.clear(); signOutUser.mockReset(); signOutUser.mockResolvedValue(undefined); });
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

it('saves all origins and restores them on the same web origin without sending any requests', async () => {
  const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
  await saveServiceConfiguration(config);
  expect(apiBaseFromEnv()).toBe(config.apiBase);
  expect(webBaseFromEnv()).toBe(config.webBase);
  expect(authBaseFromEnv()).toBe(config.authBase);
  expect(fetch).not.toHaveBeenCalled();
});
it('clears the old login before saving a different service', async () => {
  localStorage.setItem('oa_workspace_session', JSON.stringify({ token: 'synthetic-old-token' }));
  await saveServiceConfiguration(config);
  expect(localStorage.getItem('oa_workspace_session')).toBeNull();
});
it('rejects remote HTTP and malformed origins without losing the old settings', async () => {
  await saveServiceConfiguration(config);
  await expect(saveServiceConfiguration({ ...config, apiBase: 'http://remote.example.test', devLoopback: true })).rejects.toThrow();
  expect(apiBaseFromEnv()).toBe(config.apiBase);
  await expect(saveServiceConfiguration({ ...config, authBase: 'https://u:p@auth.example.test' })).rejects.toThrow();
});
it('allows only the explicit local development ports', async () => {
  const local = { apiBase: 'http://127.0.0.1:18000', webBase: 'http://127.0.0.1:13000', authBase: 'http://127.0.0.1:18000', devLoopback: true };
  await saveServiceConfiguration(local);
  expect(apiBaseFromEnv()).toBe(local.apiBase);
  await expect(saveServiceConfiguration({ ...local, devLoopback: false })).rejects.toThrow();
});

it('ends the optional browser identity before changing the API service', async () => {
  signOutUser.mockImplementation(async () => expect(apiBaseFromEnv()).not.toBe(config.apiBase));
  await saveServiceConfiguration(config);
  expect(signOutUser).toHaveBeenCalledOnce();
});
it('keeps the old origins if browser sign-out fails', async () => {
  await saveServiceConfiguration(config);
  signOutUser.mockRejectedValue(new Error('storage unavailable'));
  await expect(saveServiceConfiguration({ ...config, apiBase: 'https://new.example.test' })).rejects.toThrow();
  expect(apiBaseFromEnv()).toBe(config.apiBase);
});
it('can save independent browser settings without an optional Firebase project', async () => {
  signOutUser.mockRejectedValue(new ConfigurationRequired('firebase'));
  await saveServiceConfiguration(config);
  expect(apiBaseFromEnv()).toBe(config.apiBase);
});
