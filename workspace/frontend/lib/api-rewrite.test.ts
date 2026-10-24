import { describe, expect, it } from 'vitest';
import { apiRewriteOrigin } from './api-rewrite.mjs';

describe('api rewrite origin', () => {
  it('does not treat the dev flag as permission for an arbitrary host', () => {
    const env = { AGHUB_DEV_LOOPBACK: '1' };
    expect(apiRewriteOrigin('https://evil.example', env)).toBe('https://evil.example');
    expect(apiRewriteOrigin('http://evil.example', env)).toBe('');
    expect(apiRewriteOrigin('http://127.0.0.1:19999', env)).toBe('');
    expect(apiRewriteOrigin('https://user:pw@api.example.com', env)).toBe('');
    expect(apiRewriteOrigin('https://api.example.com/v1', env)).toBe('');
    expect(apiRewriteOrigin('https://api.example.com/?q=1', env)).toBe('');
    expect(apiRewriteOrigin('http://127.0.0.1:18000', env)).toBe('http://127.0.0.1:18000');
    expect(apiRewriteOrigin('http://127.0.0.1:18000', {})).toBe('');
  });
});
