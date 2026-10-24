import { beforeAll, describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { createContext, runInContext } from 'node:vm';
import { build } from 'vite';

let code: string;
beforeAll(async () => {
  const result = await build({
    configFile: fileURLToPath(new URL('../vite.config.ts', import.meta.url)),
    publicDir: false,
    logLevel: 'silent',
    build: {
      write: false, minify: false,
      lib: {
        entry: fileURLToPath(new URL('../lib/service-endpoints.ts', import.meta.url)),
        formats: ['iife'], name: 'DesktopServiceConfig',
      },
    },
  });
  const output = Array.isArray(result) ? result[0] : result;
  if (!('output' in output)) throw new Error('Expected an in-memory browser build');
  const chunk = output.output.find(item => item.type === 'chunk');
  if (!chunk || chunk.type !== 'chunk') throw new Error('Missing browser chunk');
  code = chunk.code;
}, 20_000);

function desktop(globals: Record<string, string> = {}) {
  // Electron's isolated page has no Node process, even when preload does.
  const context = createContext({ URL, ...globals });
  runInContext(code, context);
  return context.DesktopServiceConfig as {
    apiBaseFromEnv(): string; webBaseFromEnv(): string; authBaseFromEnv(): string;
  };
}

describe('production desktop configuration bundle', () => {
  it('loads without process and keeps missing configuration empty', () => {
    const config = desktop();
    expect(config.apiBaseFromEnv()).toBe('');
    expect(config.webBaseFromEnv()).toBe('');
    expect(config.authBaseFromEnv()).toBe('');
  });
  it('reads all three explicit origins injected by preload', () => {
    const config = desktop({
      __OA_API_URL__: 'https://api.example.test',
      __OA_WEB_URL__: 'https://web.example.test',
      __OA_AUTH_URL__: 'https://auth.example.test',
    });
    expect(config.apiBaseFromEnv()).toBe('https://api.example.test');
    expect(config.webBaseFromEnv()).toBe('https://web.example.test');
    expect(config.authBaseFromEnv()).toBe('https://auth.example.test');
  });
  it('accepts the local development ports only with the preload flag', () => {
    const globals = {
      __OA_API_URL__: 'http://127.0.0.1:18000',
      __OA_WEB_URL__: 'http://127.0.0.1:13000',
      __OA_AUTH_URL__: 'http://127.0.0.1:18000',
    };
    expect(desktop(globals).apiBaseFromEnv()).toBe('');
    const config = desktop({ ...globals, __OA_DEV_LOOPBACK__: '1' });
    expect(config.apiBaseFromEnv()).toBe(globals.__OA_API_URL__);
    expect(config.webBaseFromEnv()).toBe(globals.__OA_WEB_URL__);
    expect(config.authBaseFromEnv()).toBe(globals.__OA_AUTH_URL__);
  });
});
