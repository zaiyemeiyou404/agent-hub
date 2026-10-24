// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ServiceConfigurationGate } from './service-configuration-gate';
import { apiBaseFromEnv, SERVICE_CONFIGURATION_KEY } from '@/lib/service-endpoints';
vi.mock('@/lib/firebase', () => ({ signOutUser: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/i18n', () => ({ useI18n: () => ({ locale: 'zh-CN' }) }));
let root: Root; let host: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('React', React);
  vi.stubEnv('NEXT_PUBLIC_API_URL', ''); vi.stubEnv('NEXT_PUBLIC_WEB_BASE', ''); vi.stubEnv('NEXT_PUBLIC_AUTH_BASE', '');
  localStorage.clear(); host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); delete (window as any).__oaHost__; vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
function input(name: string, value: string) {
  const field = host.querySelector<HTMLInputElement>(`input[name="${name}"]`)!;
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(field, value);
  field.dispatchEvent(new Event('input', { bubbles: true }));
}
it('offers a working settings form on first install and saves before reload', async () => {
  const reload = vi.fn();
  await act(async () => root.render(React.createElement(ServiceConfigurationGate, { onConfigured: reload }, 'APP')));
  expect(host.textContent).not.toContain('APP');
  expect(host.querySelectorAll('input[type="url"]')).toHaveLength(3);
  await act(async () => { input('apiBase', 'https://api.example.test'); input('webBase', 'https://web.example.test'); input('authBase', 'https://auth.example.test'); });
  await act(async () => host.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
  expect(apiBaseFromEnv()).toBe('https://api.example.test');
  expect(reload).toHaveBeenCalledOnce();
});
it('keeps the form visible with an actionable error for remote HTTP', async () => {
  const reload = vi.fn();
  await act(async () => root.render(React.createElement(ServiceConfigurationGate, { onConfigured: reload }, 'APP')));
  await act(async () => { input('apiBase', 'http://remote.example.test'); input('webBase', 'https://web.example.test'); input('authBase', 'https://auth.example.test'); });
  await act(async () => host.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
  expect(host.querySelector('[role="alert"]')?.textContent).toBeTruthy();
  expect(reload).not.toHaveBeenCalled();
});
it('keeps settings reachable after configuration and can cancel without losing the app', async () => {
  localStorage.setItem(SERVICE_CONFIGURATION_KEY, JSON.stringify({ apiBase: 'https://api.example.test', webBase: 'https://web.example.test', authBase: 'https://auth.example.test', devLoopback: false }));
  await act(async () => root.render(React.createElement(ServiceConfigurationGate, {}, 'APP')));
  expect(host.textContent).toContain('APP');
  await act(async () => host.querySelector('button')!.click());
  expect(host.querySelector<HTMLInputElement>('input[name="apiBase"]')?.value).toBe('https://api.example.test');
  await act(async () => host.querySelector<HTMLButtonElement>('button[type="button"]')!.click());
  expect(host.textContent).toContain('APP');
});
it('saves desktop configuration through the trusted host without browser persistence', async () => {
  const configureServices = vi.fn().mockResolvedValue(undefined);
  (window as any).__oaHost__ = { configureServices };
  await act(async () => root.render(React.createElement(ServiceConfigurationGate)));
  await act(async () => { input('apiBase', 'https://api.example.test'); input('webBase', 'https://web.example.test'); input('authBase', 'https://auth.example.test'); });
  await act(async () => host.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
  expect(configureServices).toHaveBeenCalledWith({ apiBase: 'https://api.example.test', webBase: 'https://web.example.test', authBase: 'https://auth.example.test', devLoopback: false });
  expect(localStorage.getItem(SERVICE_CONFIGURATION_KEY)).toBeNull();
});
