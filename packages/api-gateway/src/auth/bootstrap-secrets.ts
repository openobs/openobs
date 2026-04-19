/**
 * Zero-config secret bootstrap.
 *
 * Two secrets the server hard-requires at startup:
 *   JWT_SECRET  — websocket-gateway session signing (≥32 chars)
 *   SECRET_KEY  — AES-GCM envelope for OAuth tokens + anything encrypted at rest (≥32 chars)
 *
 * Production (NODE_ENV=production) never auto-generates — ops must set
 * them explicitly via env, Helm values, or a secret manager. A fresh
 * random value each boot in prod would invalidate every session and
 * decrypt-break every stored OAuth token.
 *
 * Development / local first-run: we generate 32-byte random hex strings,
 * persist them to `<DATA_DIR>/secrets.json` with owner-only permissions,
 * and hydrate process.env so downstream modules find them set. Subsequent
 * boots read the same file — sessions and encrypted rows survive restarts.
 *
 * This makes `npm start` on a fresh clone work with zero environment
 * configuration. The setup wizard handles admin + LLM + datasource config;
 * crypto secrets are infrastructure and stay out of the UI.
 */

import { randomBytes } from 'node:crypto';
import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  chmodSync,
} from 'node:fs';
import { join } from 'node:path';

const MIN_SECRET_LEN = 32;
const SECRETS_FILE_NAME = 'secrets.json';

interface SecretBundle {
  /** Websocket JWT signing key. */
  jwt: string;
  /** AES-GCM envelope for OAuth tokens + other encrypted columns. */
  secret: string;
  /** ISO timestamp of first generation. */
  createdAt: string;
  /** For future key rotations — not used yet. */
  version: number;
}

function hasValidEnv(name: string): boolean {
  return (process.env[name] ?? '').length >= MIN_SECRET_LEN;
}

function generateBundle(): SecretBundle {
  return {
    jwt: randomBytes(32).toString('hex'),
    secret: randomBytes(32).toString('hex'),
    createdAt: new Date().toISOString(),
    version: 1,
  };
}

function readBundle(path: string): SecretBundle | null {
  if (!existsSync(path)) return null;
  try {
    const raw = readFileSync(path, 'utf8');
    const parsed = JSON.parse(raw) as Partial<SecretBundle>;
    if (
      typeof parsed.jwt === 'string' &&
      typeof parsed.secret === 'string' &&
      parsed.jwt.length >= MIN_SECRET_LEN &&
      parsed.secret.length >= MIN_SECRET_LEN
    ) {
      return {
        jwt: parsed.jwt,
        secret: parsed.secret,
        createdAt: parsed.createdAt ?? new Date().toISOString(),
        version: parsed.version ?? 1,
      };
    }
  } catch {
    // Corrupt file → regenerate below.
  }
  return null;
}

function writeBundle(path: string, bundle: SecretBundle): void {
  writeFileSync(path, JSON.stringify(bundle, null, 2), 'utf8');
  try {
    chmodSync(path, 0o600);
  } catch {
    // Windows NTFS ignores chmod; behavior is acceptable for dev use.
  }
}

export interface BootstrapResult {
  /** Which env vars the call populated from disk / generation. */
  injected: Array<'JWT_SECRET' | 'SECRET_KEY'>;
  /** Whether a fresh bundle was generated and written this run. */
  generated: boolean;
  /** Path the bundle lives at (or where it was created). */
  path: string;
}

/**
 * Ensure JWT_SECRET and SECRET_KEY are present and ≥32 chars. Generates +
 * persists a pair on first run; returns what was done so the caller can
 * log it.
 *
 * @param dataDir absolute path to the data directory (server's DATA_DIR)
 */
export function bootstrapSecretsIfNeeded(dataDir: string): BootstrapResult {
  const path = join(dataDir, SECRETS_FILE_NAME);

  if (process.env['NODE_ENV'] === 'production') {
    // In production, refuse to auto-generate. The callers (websocket
    // gateway, secret-box) will raise clear errors if the env is unset —
    // ops must configure via Helm values / secret manager / docker env.
    return { injected: [], generated: false, path };
  }

  if (hasValidEnv('JWT_SECRET') && hasValidEnv('SECRET_KEY')) {
    return { injected: [], generated: false, path };
  }

  let bundle = readBundle(path);
  let generated = false;

  if (!bundle) {
    mkdirSync(dataDir, { recursive: true });
    bundle = generateBundle();
    writeBundle(path, bundle);
    generated = true;
  }

  const injected: BootstrapResult['injected'] = [];
  if (!hasValidEnv('JWT_SECRET')) {
    process.env['JWT_SECRET'] = bundle.jwt;
    injected.push('JWT_SECRET');
  }
  if (!hasValidEnv('SECRET_KEY')) {
    process.env['SECRET_KEY'] = bundle.secret;
    injected.push('SECRET_KEY');
  }

  return { injected, generated, path };
}
