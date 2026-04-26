import { describe, expect, it } from 'vitest';
import type { CorsOptions } from 'cors';
import { createCorsOptions } from './cors.js';

function evaluateOrigin(
  originOption: Exclude<CorsOptions['origin'], undefined>,
  origin: string | undefined,
): Promise<boolean> {
  if (typeof originOption === 'boolean') {
    return Promise.resolve(originOption);
  }
  if (typeof originOption === 'string') {
    return Promise.resolve(originOption === origin);
  }
  if (Array.isArray(originOption)) {
    return Promise.resolve(origin ? originOption.includes(origin) : false);
  }
  if (originOption instanceof RegExp) {
    return Promise.resolve(origin ? originOption.test(origin) : false);
  }
  return new Promise((resolve, reject) => {
    originOption(origin, (err: Error | null, allowed?: unknown) => {
      if (err) reject(err);
      else resolve(Boolean(allowed));
    });
  });
}

describe('createCorsOptions', () => {
  it('limits credentialed non-production defaults to local browser origins', async () => {
    const opts = createCorsOptions({ NODE_ENV: 'development' });
    expect(opts.credentials).toBe(true);

    expect(await evaluateOrigin(opts.origin!, 'http://localhost:5173')).toBe(true);
    expect(await evaluateOrigin(opts.origin!, 'http://127.0.0.1:5173')).toBe(true);
    expect(await evaluateOrigin(opts.origin!, undefined)).toBe(true);
    expect(await evaluateOrigin(opts.origin!, 'https://evil.example')).toBe(false);
  });

  it('rejects empty or wildcard production CORS_ORIGINS', () => {
    expect(() => createCorsOptions({ NODE_ENV: 'production' })).toThrow(/CORS_ORIGINS/);
    expect(() =>
      createCorsOptions({ NODE_ENV: 'production', CORS_ORIGINS: '*' }),
    ).toThrow(/CORS_ORIGINS/);
  });
});
