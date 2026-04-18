import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb, UserAuthTokenRepository, UserRepository } from '@agentic-obs/data-layer';
import {
  SessionService,
  generateSessionToken,
  hashSessionToken,
  buildSessionCookie,
  buildClearedSessionCookie,
  sessionOptionsFromEnv,
  SESSION_TOKEN_PREFIX,
  DEFAULT_SESSION_ROTATION_INTERVAL_MS,
  DEFAULT_SESSION_ROTATION_GRACE_MS,
} from './session-service.js';

async function seedUser(db: ReturnType<typeof createTestDb>) {
  const users = new UserRepository(db);
  const user = await users.create({
    email: 'test@openobs.local',
    name: 'Test User',
    login: 'test',
    orgId: 'org_main',
  });
  return user;
}

describe('generateSessionToken / hashSessionToken', () => {
  it('generates prefixed tokens', () => {
    const t = generateSessionToken();
    expect(t.startsWith(SESSION_TOKEN_PREFIX)).toBe(true);
    // 32 bytes base64url => 43 chars without padding.
    expect(t.length).toBeGreaterThanOrEqual(SESSION_TOKEN_PREFIX.length + 40);
  });

  it('hashSessionToken is 64-char hex (SHA-256)', () => {
    const h = hashSessionToken('any');
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(hashSessionToken('any')).toBe(h);
  });
});

describe('SessionService', () => {
  let db: ReturnType<typeof createTestDb>;
  let repo: UserAuthTokenRepository;
  let userId: string;

  beforeEach(async () => {
    db = createTestDb();
    repo = new UserAuthTokenRepository(db);
    const user = await seedUser(db);
    userId = user.id;
  });

  it('create issues a plaintext token and persists the hash', async () => {
    const svc = new SessionService(repo);
    const { token, row } = await svc.create(userId, 'ua', '127.0.0.1');
    expect(token).toMatch(/^openobs_s_/);
    expect(row.authToken).toBe(hashSessionToken(token));
    expect(row.revokedAt).toBeNull();
    expect(row.prevAuthToken).toBe('');
  });

  it('lookupByToken returns the row for the issued token', async () => {
    const svc = new SessionService(repo);
    const { token } = await svc.create(userId, 'ua', 'ip');
    const row = await svc.lookupByToken(token);
    expect(row).not.toBeNull();
    expect(row?.userId).toBe(userId);
  });

  it('lookupByToken returns null for an unknown token', async () => {
    const svc = new SessionService(repo);
    expect(await svc.lookupByToken('openobs_s_nope')).toBeNull();
  });

  it('revoke makes a token invalid thereafter', async () => {
    const svc = new SessionService(repo);
    const { token, row } = await svc.create(userId, 'ua', 'ip');
    await svc.revoke(row.id);
    expect(await svc.lookupByToken(token)).toBeNull();
  });

  it('revokeAllForUser drops every session', async () => {
    const svc = new SessionService(repo);
    await svc.create(userId, 'ua', 'ip');
    await svc.create(userId, 'ua', 'ip');
    const n = await svc.revokeAllForUser(userId);
    expect(n).toBe(2);
  });

  it('rotate: previous hash continues working within the grace window', async () => {
    const clock = { t: 1_000_000 };
    const svc = new SessionService(repo, { now: () => clock.t });
    const first = await svc.create(userId, 'ua', 'ip');
    // advance past rotation interval.
    clock.t += DEFAULT_SESSION_ROTATION_INTERVAL_MS + 1;
    const rotated = await svc.rotate(first.row.id);
    expect(rotated).not.toBeNull();
    // New token works.
    expect(await svc.lookupByToken(rotated!.token)).not.toBeNull();
    // Old token still works immediately after rotation.
    expect(await svc.lookupByToken(first.token)).not.toBeNull();
  });

  it('rotate: previous hash fails after grace window', async () => {
    const clock = { t: 1_000_000 };
    const svc = new SessionService(repo, { now: () => clock.t });
    const first = await svc.create(userId, 'ua', 'ip');
    clock.t += DEFAULT_SESSION_ROTATION_INTERVAL_MS + 1;
    await svc.rotate(first.row.id);
    clock.t += DEFAULT_SESSION_ROTATION_GRACE_MS + 1_000;
    expect(await svc.lookupByToken(first.token)).toBeNull();
  });

  it('lookupByToken rejects a session past max lifetime', async () => {
    const clock = { t: 1_000_000 };
    const svc = new SessionService(repo, {
      now: () => clock.t,
      maxLifetimeMs: 1000,
      idleTimeoutMs: 10_000,
    });
    const { token } = await svc.create(userId, 'ua', 'ip');
    clock.t += 2000;
    expect(await svc.lookupByToken(token)).toBeNull();
  });

  it('lookupByToken rejects past idle timeout', async () => {
    const clock = { t: 1_000_000 };
    const svc = new SessionService(repo, {
      now: () => clock.t,
      maxLifetimeMs: 60_000,
      idleTimeoutMs: 500,
    });
    const { token } = await svc.create(userId, 'ua', 'ip');
    clock.t += 1000;
    expect(await svc.lookupByToken(token)).toBeNull();
  });

  it('shouldRotate reflects rotation interval', async () => {
    const clock = { t: 1_000_000 };
    const svc = new SessionService(repo, { now: () => clock.t });
    const { row } = await svc.create(userId, 'ua', 'ip');
    expect(svc.shouldRotate(row)).toBe(false);
    clock.t += DEFAULT_SESSION_ROTATION_INTERVAL_MS + 1;
    expect(svc.shouldRotate(row)).toBe(true);
  });

  it('markSeen stamps seen_at', async () => {
    const svc = new SessionService(repo);
    const { row } = await svc.create(userId, 'ua', 'ip');
    await svc.markSeen(row.id);
    const reloaded = await repo.findById(row.id);
    expect(reloaded?.authTokenSeen).toBe(true);
    expect(reloaded?.seenAt).toBeTruthy();
  });

  it('pruneExpired deletes rows older than max_lifetime', async () => {
    const clock = { t: 1_000_000 };
    const svc = new SessionService(repo, {
      now: () => clock.t,
      maxLifetimeMs: 1000,
    });
    await svc.create(userId, 'ua', 'ip');
    clock.t += 10_000;
    const pruned = await svc.pruneExpired();
    expect(pruned).toBeGreaterThanOrEqual(1);
  });
});

describe('buildSessionCookie / buildClearedSessionCookie', () => {
  it('includes all required attributes', () => {
    const c = buildSessionCookie('T', { maxAgeSec: 60, secure: true });
    expect(c).toContain('HttpOnly');
    expect(c).toContain('SameSite=Lax');
    expect(c).toContain('Path=/');
    expect(c).toContain('Max-Age=60');
    expect(c).toContain('Secure');
  });

  it('drops Secure when secure=false', () => {
    const c = buildSessionCookie('T', { maxAgeSec: 60, secure: false });
    expect(c).not.toContain('Secure');
  });

  it('cleared cookie has Max-Age=0', () => {
    const c = buildClearedSessionCookie({ secure: false });
    expect(c).toContain('Max-Age=0');
  });
});

describe('sessionOptionsFromEnv', () => {
  it('uses defaults when env empty', () => {
    const o = sessionOptionsFromEnv({} as NodeJS.ProcessEnv);
    expect(o.maxLifetimeMs).toBe(30 * 24 * 60 * 60 * 1000);
    expect(o.rotationIntervalMs).toBe(10 * 60 * 1000);
  });

  it('parses numeric env vars', () => {
    const o = sessionOptionsFromEnv({
      SESSION_MAX_LIFETIME_MS: '111',
      SESSION_ROTATION_INTERVAL_MS: '222',
    } as NodeJS.ProcessEnv);
    expect(o.maxLifetimeMs).toBe(111);
    expect(o.rotationIntervalMs).toBe(222);
  });

  it('ignores non-numeric env vars', () => {
    const o = sessionOptionsFromEnv({
      SESSION_MAX_LIFETIME_MS: 'notanumber',
    } as NodeJS.ProcessEnv);
    expect(o.maxLifetimeMs).toBe(30 * 24 * 60 * 60 * 1000);
  });
});
