import { describe, it, expect } from 'vitest';
import { AuthError } from './errors.js';

describe('AuthError', () => {
  it('invalidCredentials and userDisabled have identical messages (no enumeration)', () => {
    const a = AuthError.invalidCredentials();
    const b = AuthError.userDisabled();
    expect(a.message).toBe(b.message);
    expect(a.statusCode).toBe(401);
    expect(b.statusCode).toBe(401);
  });

  it('rateLimited returns 429', () => {
    const e = AuthError.rateLimited();
    expect(e.statusCode).toBe(429);
    expect(e.kind).toBe('rate_limited');
  });

  it('providerNotConfigured returns 501 with provider name', () => {
    const e = AuthError.providerNotConfigured('github');
    expect(e.statusCode).toBe(501);
    expect(e.message).toContain('github');
  });

  it('providerNoSignup returns 403', () => {
    expect(AuthError.providerNoSignup('google').statusCode).toBe(403);
  });

  it('stateMismatch returns 400', () => {
    expect(AuthError.stateMismatch().statusCode).toBe(400);
  });

  it('preserves details', () => {
    const e = new AuthError('internal', 'oops', 500, { foo: 'bar' });
    expect(e.details).toEqual({ foo: 'bar' });
  });

  it('is a real Error subclass', () => {
    const e = AuthError.invalidCredentials();
    expect(e).toBeInstanceOf(Error);
    expect(e.name).toBe('AuthError');
  });
});
