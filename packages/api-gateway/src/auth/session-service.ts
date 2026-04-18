/**
 * SessionService — persisted cookie sessions backed by `user_auth_token`.
 *
 * Replaces the in-memory session-store. Mirrors
 * `pkg/services/auth/authimpl/user_auth_token.go` (Grafana v11.3.0) for
 * create / lookup / rotate / revoke semantics. Tokens are never stored
 * plaintext — we keep SHA-256(token) and give the raw bytes to the client
 * exactly once at issue.
 *
 * See docs/auth-perm-design/02-authentication.md §session-tokens.
 */

import { createHash, randomBytes } from 'node:crypto';
import type {
  IUserAuthTokenRepository,
  UserAuthToken,
} from '@agentic-obs/common';

// Grafana defaults (pkg/services/auth/authimpl/user_auth_token.go).
// All four are overridable via env vars of the same name.
export const DEFAULT_SESSION_MAX_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;
export const DEFAULT_SESSION_IDLE_TIMEOUT_MS = 7 * 24 * 60 * 60 * 1000;
export const DEFAULT_SESSION_ROTATION_INTERVAL_MS = 10 * 60 * 1000;
export const DEFAULT_SESSION_ROTATION_GRACE_MS = 30 * 1000;

export const SESSION_COOKIE_NAME = 'openobs_session';
export const SESSION_TOKEN_PREFIX = 'openobs_s_';

export interface SessionServiceOptions {
  maxLifetimeMs?: number;
  idleTimeoutMs?: number;
  rotationIntervalMs?: number;
  rotationGraceMs?: number;
  /** Injectable clock for tests — returns epoch ms. */
  now?: () => number;
}

export interface IssuedSession {
  /** Plaintext token — return to client once, never store unhashed. */
  token: string;
  row: UserAuthToken;
}

/**
 * Parse the configured values from the environment and fall back to the
 * Grafana-matching defaults. Caller retains control of repository + clock.
 */
export function sessionOptionsFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): Required<Omit<SessionServiceOptions, 'now'>> {
  const num = (name: string, fallback: number): number => {
    const v = env[name];
    if (!v) return fallback;
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : fallback;
  };
  return {
    maxLifetimeMs: num('SESSION_MAX_LIFETIME_MS', DEFAULT_SESSION_MAX_LIFETIME_MS),
    idleTimeoutMs: num('SESSION_IDLE_TIMEOUT_MS', DEFAULT_SESSION_IDLE_TIMEOUT_MS),
    rotationIntervalMs: num(
      'SESSION_ROTATION_INTERVAL_MS',
      DEFAULT_SESSION_ROTATION_INTERVAL_MS,
    ),
    rotationGraceMs: num('SESSION_ROTATION_GRACE_MS', DEFAULT_SESSION_ROTATION_GRACE_MS),
  };
}

/**
 * Generate 32 random bytes, base64url-encode them, prefix with `openobs_s_`.
 * Prefix lets operators grep leaked tokens in logs.
 */
export function generateSessionToken(): string {
  return SESSION_TOKEN_PREFIX + randomBytes(32).toString('base64url');
}

/** SHA-256 hex of the plaintext token — what we store in auth_token. */
export function hashSessionToken(plaintext: string): string {
  return createHash('sha256').update(plaintext, 'utf8').digest('hex');
}

function isoNow(now: () => number): string {
  return new Date(now()).toISOString();
}

export class SessionService {
  private readonly maxLifetimeMs: number;
  private readonly idleTimeoutMs: number;
  private readonly rotationIntervalMs: number;
  private readonly rotationGraceMs: number;
  private readonly now: () => number;

  constructor(
    private readonly repo: IUserAuthTokenRepository,
    opts: SessionServiceOptions = {},
  ) {
    this.maxLifetimeMs = opts.maxLifetimeMs ?? DEFAULT_SESSION_MAX_LIFETIME_MS;
    this.idleTimeoutMs = opts.idleTimeoutMs ?? DEFAULT_SESSION_IDLE_TIMEOUT_MS;
    this.rotationIntervalMs =
      opts.rotationIntervalMs ?? DEFAULT_SESSION_ROTATION_INTERVAL_MS;
    this.rotationGraceMs = opts.rotationGraceMs ?? DEFAULT_SESSION_ROTATION_GRACE_MS;
    this.now = opts.now ?? (() => Date.now());
  }

  /** Create a fresh session — client receives plaintext token exactly once. */
  async create(
    userId: string,
    userAgent: string,
    clientIp: string,
  ): Promise<IssuedSession> {
    const token = generateSessionToken();
    const hashed = hashSessionToken(token);
    const at = isoNow(this.now);
    const row = await this.repo.create({
      userId,
      authToken: hashed,
      prevAuthToken: '',
      userAgent,
      clientIp,
      authTokenSeen: false,
      rotatedAt: at,
      createdAt: at,
      updatedAt: at,
    });
    return { token, row };
  }

  /**
   * Validate a plaintext token. Returns the row on success, null otherwise.
   * Matches Grafana's check order: row exists, not revoked, within max
   * lifetime, within idle timeout, not beyond the rotation grace window when
   * the client is presenting the previous hash.
   */
  async lookupByToken(rawToken: string): Promise<UserAuthToken | null> {
    if (!rawToken) return null;
    const hashed = hashSessionToken(rawToken);
    const row = await this.repo.findByHashedToken(hashed);
    if (!row) return null;
    if (row.revokedAt !== null) return null;

    const nowMs = this.now();
    const createdMs = Date.parse(row.createdAt);
    const updatedMs = Date.parse(row.updatedAt);
    const rotatedMs = Date.parse(row.rotatedAt);

    // Max lifetime from creation.
    if (Number.isFinite(createdMs) && nowMs - createdMs > this.maxLifetimeMs) {
      return null;
    }
    // Idle timeout since last update (seen or rotated).
    const lastTouched = Math.max(
      Number.isFinite(updatedMs) ? updatedMs : 0,
      Number.isFinite(rotatedMs) ? rotatedMs : 0,
      Number.isFinite(createdMs) ? createdMs : 0,
    );
    if (lastTouched > 0 && nowMs - lastTouched > this.idleTimeoutMs) {
      return null;
    }

    // If client is on prev_auth_token (post-rotation in-flight request),
    // only accept within the grace window. When prev is empty (no rotation
    // has happened yet) the repo lookup wouldn't have matched it anyway.
    if (row.prevAuthToken && row.prevAuthToken === hashed) {
      if (
        Number.isFinite(rotatedMs) &&
        nowMs - rotatedMs > this.rotationGraceMs
      ) {
        return null;
      }
    }
    return row;
  }

  /**
   * Returns true if the session's `rotated_at` is older than the configured
   * rotation interval. Useful for middleware to decide whether to rotate
   * transparently on the next request.
   */
  shouldRotate(row: UserAuthToken): boolean {
    const rotatedMs = Date.parse(row.rotatedAt);
    if (!Number.isFinite(rotatedMs)) return true;
    return this.now() - rotatedMs >= this.rotationIntervalMs;
  }

  /**
   * Rotate: move current `auth_token` to `prev_auth_token`, store new hashed
   * token, update `rotated_at`. Returns the new plaintext token + updated row.
   */
  async rotate(id: string): Promise<IssuedSession | null> {
    const newToken = generateSessionToken();
    const newHash = hashSessionToken(newToken);
    const at = isoNow(this.now);
    const row = await this.repo.rotate(id, newHash, at);
    if (!row) return null;
    return { token: newToken, row };
  }

  async markSeen(id: string, at?: number): Promise<void> {
    const seenAt = new Date(at ?? this.now()).toISOString();
    await this.repo.markSeen(id, seenAt);
  }

  async revoke(id: string): Promise<void> {
    await this.repo.revoke(id, isoNow(this.now));
  }

  async revokeAllForUser(userId: string): Promise<number> {
    return this.repo.revokeAllForUser(userId, isoNow(this.now));
  }

  /**
   * Delete rows older than `max_lifetime` — a daily janitor keeps the table
   * small. Active rows are never touched by this call (they rotate via
   * `rotate`, which doesn't change `created_at`).
   */
  async pruneExpired(): Promise<number> {
    const cutoff = new Date(this.now() - this.maxLifetimeMs).toISOString();
    return this.repo.deleteExpired(cutoff);
  }

  // Exposed for inspection (user tokens endpoint).
  listForUser(userId: string, includeRevoked = false): Promise<UserAuthToken[]> {
    return this.repo.listByUser(userId, includeRevoked);
  }
}

/**
 * Returns the HTTP Set-Cookie value for a session token. In dev (not
 * production), the `Secure` attribute is dropped so browsers accept it over
 * http://localhost.
 */
export function buildSessionCookie(
  token: string,
  opts: { maxAgeSec: number; secure?: boolean; name?: string } = {
    maxAgeSec: Math.floor(DEFAULT_SESSION_IDLE_TIMEOUT_MS / 1000),
  },
): string {
  const { maxAgeSec } = opts;
  const parts = [
    `${opts.name ?? SESSION_COOKIE_NAME}=${token}`,
    'HttpOnly',
    'SameSite=Lax',
    'Path=/',
    `Max-Age=${maxAgeSec}`,
  ];
  if (opts.secure !== false) parts.push('Secure');
  return parts.join('; ');
}

/** Clear the session cookie (for logout). */
export function buildClearedSessionCookie(
  opts: { secure?: boolean; name?: string } = {},
): string {
  const parts = [
    `${opts.name ?? SESSION_COOKIE_NAME}=`,
    'HttpOnly',
    'SameSite=Lax',
    'Path=/',
    'Max-Age=0',
  ];
  if (opts.secure !== false) parts.push('Secure');
  return parts.join('; ');
}

export function shouldDropSecure(env: NodeJS.ProcessEnv = process.env): boolean {
  return env['NODE_ENV'] !== 'production';
}

/**
 * Start a naive daily cron that calls `pruneExpired`. Returns a stop fn so
 * tests and graceful shutdown can cancel it. The real scheduler is an open
 * question for the future — we run it in-process so there's no external
 * dependency on cron / systemd timers.
 */
export function startSessionPruneCron(
  service: SessionService,
  intervalMs = 24 * 60 * 60 * 1000,
): () => void {
  const timer = setInterval(() => {
    void service.pruneExpired();
  }, intervalMs);
  // Don't keep the event loop alive just for the cron.
  if (typeof timer.unref === 'function') timer.unref();
  return () => clearInterval(timer);
}
