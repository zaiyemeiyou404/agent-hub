import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  ConfigurationRequired,
  DEV_API_BASE,
  DEV_WEB_BASE,
  resolveServiceUrl,
  tokenForService,
} from './service-endpoints';

describe('independent frontend endpoints', () => {
  it('rejects missing and illegal URLs', () => {
    expect(() => resolveServiceUrl(undefined, 'api', {})).toThrow(ConfigurationRequired);
    expect(() => resolveServiceUrl('http://example.com', 'web', {})).toThrow(ConfigurationRequired);
    expect(() => resolveServiceUrl(DEV_WEB_BASE, 'web', {})).toThrow(ConfigurationRequired);
  });

  it('accepts the explicit dev loopback contract', () => {
    const env = { AGHUB_DEV_LOOPBACK: '1' };
    expect(resolveServiceUrl(DEV_API_BASE, 'api', env)).toBe(DEV_API_BASE);
    expect(resolveServiceUrl(DEV_API_BASE, 'auth', env)).toBe(DEV_API_BASE);
    expect(resolveServiceUrl(DEV_WEB_BASE, 'web', env)).toBe(DEV_WEB_BASE);
    expect(() => resolveServiceUrl('http://localhost:3001', 'web', env)).toThrow(ConfigurationRequired);
  });

  it('does not reuse a token after the service changes', () => {
    const stored = { apiBase: 'https://old.example.com', token: 'old-token' };
    expect(tokenForService(stored, 'https://new.example.com')).toBeNull();
    expect(tokenForService(stored, 'https://old.example.com')).toBe('old-token');
  });

  it('does not keep an official fallback in the shared clients', () => {
    const files = ['api.ts', 'account-api.ts', 'workspace-session.ts', 'invite-api.ts', 'share-origin.ts', 'auth-redirects.ts'];
    for (const file of files) {
      const source = readFileSync(new URL(`./${file}`, import.meta.url), 'utf8');
      expect(source, file).not.toContain('https://workspace-endpoint.openagents.org');
      expect(source, file).not.toContain('https://endpoint.openagents.org');
      expect(source, file).not.toContain('https://openagents.org');
      expect(source, file).not.toContain('https://workspace.openagents.org');
    }
  });
});
