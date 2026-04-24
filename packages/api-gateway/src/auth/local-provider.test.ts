import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb, UserRepository } from '@agentic-obs/data-layer';
import {
  LocalProvider,
  LoginRateLimiter,
  hashPassword,
  verifyPassword,
  passwordMinLength,
  DEFAULT_PASSWORD_MIN_LENGTH,
} from './local-provider.js';
import { AuthError } from '@agentic-obs/common';

describe('hashPassword / verifyPassword', () => {
  it('roundtrips a valid password', async () => {
    const h = await hashPassword('correcthorsebatterystaple');
    expect(await verifyPassword('correcthorsebatterystaple', h)).toBe(true);
  });

  it('rejects the wrong password', async () => {
    const h = await hashPassword('correcthorse');
    expect(await verifyPassword('wrong', h)).toBe(false);
  });

  it('returns format salt:hash', async () => {
    const h = await hashPassword('x'.repeat(20));
    expect(h.split(':')).toHaveLength(2);
    expect(h.split(':')[0]).toMatch(/^[0-9a-f]+$/);
  });

  it('does not crash on malformed stored hash', async () => {
    expect(await verifyPassword('x', 'not-a-hash')).toBe(false);
    expect(await verifyPassword('x', '')).toBe(false);
    expect(await verifyPassword('x', 'onlysalt:')).toBe(false);
  });
});

describe('passwordMinLength', () => {
  it('returns default when unset', () => {
    expect(passwordMinLength({} as NodeJS.ProcessEnv)).toBe(
      DEFAULT_PASSWORD_MIN_LENGTH,
    );
  });
  it('parses env override', () => {
    expect(
      passwordMinLength({
        OPENOBS_PASSWORD_MIN_LENGTH: '20',
      } as NodeJS.ProcessEnv),
    ).toBe(20);
  });
});

describe('LoginRateLimiter', () => {
  it('blocks after max failures', () => {
    const now = { t: 0 };
    const rl = new LoginRateLimiter(3, 60_000, () => now.t);
    for (let i = 0; i < 3; i++) rl.recordFailure('1.2.3.4', 'alice');
    expect(rl.isBlocked('1.2.3.4', 'alice')).toBe(true);
  });

  it('window slides', () => {
    const now = { t: 0 };
    const rl = new LoginRateLimiter(3, 1000, () => now.t);
    rl.recordFailure('ip', 'u');
    rl.recordFailure('ip', 'u');
    rl.recordFailure('ip', 'u');
    now.t += 2000;
    expect(rl.isBlocked('ip', 'u')).toBe(false);
  });

  it('reset clears the window', () => {
    const rl = new LoginRateLimiter(2, 60_000);
    rl.recordFailure('ip', 'u');
    rl.recordFailure('ip', 'u');
    expect(rl.isBlocked('ip', 'u')).toBe(true);
    rl.reset('ip', 'u');
    expect(rl.isBlocked('ip', 'u')).toBe(false);
  });

  it('different (ip, user) pairs are independent', () => {
    const rl = new LoginRateLimiter(2, 60_000);
    rl.recordFailure('a', 'u1');
    rl.recordFailure('a', 'u1');
    expect(rl.isBlocked('a', 'u1')).toBe(true);
    expect(rl.isBlocked('a', 'u2')).toBe(false);
    expect(rl.isBlocked('b', 'u1')).toBe(false);
  });
});

describe('LocalProvider', () => {
  let db: ReturnType<typeof createTestDb>;
  let users: UserRepository;

  beforeEach(() => {
    db = createTestDb();
    users = new UserRepository(db);
  });

  it('logs in with correct password by login', async () => {
    const hash = await hashPassword('correcthorsebatterystaple');
    await users.create({
      email: 'alice@x.com',
      login: 'alice',
      name: 'Alice',
      password: hash,
      orgId: 'org_main',
    });
    const p = new LocalProvider(users);
    const res = await p.login({
      user: 'alice',
      password: 'correcthorsebatterystaple',
      ip: '1.2.3.4',
      userAgent: 'ua',
    });
    expect(res.user.login).toBe('alice');
  });

  it('logs in by email', async () => {
    const hash = await hashPassword('correcthorsebatterystaple');
    await users.create({
      email: 'alice@x.com',
      login: 'alice',
      name: 'Alice',
      password: hash,
      orgId: 'org_main',
    });
    const p = new LocalProvider(users);
    const res = await p.login({
      user: 'alice@x.com',
      password: 'correcthorsebatterystaple',
      ip: 'ip',
      userAgent: 'ua',
    });
    expect(res.user.login).toBe('alice');
  });

  it('rejects wrong password with invalidCredentials', async () => {
    const hash = await hashPassword('correcthorsebatterystaple');
    await users.create({
      email: 'a@x.com',
      login: 'alice',
      name: 'A',
      password: hash,
      orgId: 'org_main',
    });
    const p = new LocalProvider(users);
    await expect(
      p.login({
        user: 'alice',
        password: 'bad',
        ip: 'ip',
        userAgent: 'ua',
      }),
    ).rejects.toMatchObject({ kind: 'invalid_credentials', statusCode: 401 });
  });

  it('rejects unknown user with invalidCredentials (same message)', async () => {
    const p = new LocalProvider(users);
    const a = await p
      .login({ user: 'nobody', password: 'x', ip: 'ip', userAgent: 'ua' })
      .catch((e: AuthError) => e);
    expect(a).toBeInstanceOf(AuthError);
    expect((a as AuthError).message).toBe('invalid username or password');
  });

  it('rejects disabled user without disclosing', async () => {
    const hash = await hashPassword('correcthorsebatterystaple');
    const user = await users.create({
      email: 'a@x.com',
      login: 'alice',
      name: 'A',
      password: hash,
      orgId: 'org_main',
      isDisabled: true,
    });
    expect(user.isDisabled).toBe(true);
    const p = new LocalProvider(users);
    await expect(
      p.login({
        user: 'alice',
        password: 'correcthorsebatterystaple',
        ip: 'ip',
        userAgent: 'ua',
      }),
    ).rejects.toMatchObject({ kind: 'invalid_credentials' });
  });

  it('rejects service accounts', async () => {
    const hash = await hashPassword('correcthorsebatterystaple');
    await users.create({
      email: 'sa@x.com',
      login: 'sa-bot',
      name: 'SA',
      password: hash,
      orgId: 'org_main',
      isServiceAccount: true,
    });
    const p = new LocalProvider(users);
    await expect(
      p.login({
        user: 'sa-bot',
        password: 'correcthorsebatterystaple',
        ip: 'ip',
        userAgent: 'ua',
      }),
    ).rejects.toMatchObject({ kind: 'invalid_credentials' });
  });

  it('raises rateLimited on 6th failure', async () => {
    const p = new LocalProvider(users, new LoginRateLimiter(5, 60_000));
    for (let i = 0; i < 5; i++) {
      await p
        .login({
          user: 'x',
          password: 'wrong',
          ip: 'ip',
          userAgent: 'ua',
        })
        .catch(() => null);
    }
    const err = await p
      .login({
        user: 'x',
        password: 'wrong',
        ip: 'ip',
        userAgent: 'ua',
      })
      .catch((e: AuthError) => e);
    expect(err).toBeInstanceOf(AuthError);
    expect((err as AuthError).kind).toBe('rate_limited');
  });

  it('resets rate-limit counter on success', async () => {
    const hash = await hashPassword('correcthorsebatterystaple');
    await users.create({
      email: 'a@x.com',
      login: 'alice',
      name: 'A',
      password: hash,
      orgId: 'org_main',
    });
    const rl = new LoginRateLimiter(3, 60_000);
    const p = new LocalProvider(users, rl);
    await p
      .login({ user: 'alice', password: 'bad', ip: 'ip', userAgent: 'ua' })
      .catch(() => null);
    await p
      .login({ user: 'alice', password: 'bad', ip: 'ip', userAgent: 'ua' })
      .catch(() => null);
    await p.login({
      user: 'alice',
      password: 'correcthorsebatterystaple',
      ip: 'ip',
      userAgent: 'ua',
    });
    expect(rl.isBlocked('ip', 'alice')).toBe(false);
  });
});
