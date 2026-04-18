/**
 * AES-256-GCM encryption helper for at-rest secrets (OAuth tokens, SAML
 * private keys read from DB, etc.).
 *
 * Wire format: `<iv_hex>:<ciphertext_hex>:<tag_hex>` — all three components
 * are hex-encoded and delimited by colons. The IV is 12 bytes (GCM standard);
 * the auth tag is 16 bytes.
 *
 * Key derivation: the caller-supplied `secret` is hashed with SHA-256 to
 * produce a fixed 32-byte key. Callers should pass a long, random
 * `SECRET_KEY` env var; rotation is out of scope for this helper.
 *
 * See docs/auth-perm-design/01-database-schema.md §user_auth (tokens are
 * encrypted via this helper).
 */

import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

const IV_BYTES = 12;
const TAG_BYTES = 16;
const KEY_BYTES = 32;

export const DEV_INSECURE_SECRET = 'dev-insecure-key-do-not-use';

function deriveKey(secret: string): Buffer {
  return createHash('sha256').update(secret, 'utf8').digest();
}

export function encrypt(plaintext: string, secret: string): string {
  if (typeof plaintext !== 'string') {
    throw new TypeError('encrypt: plaintext must be a string');
  }
  if (!secret || typeof secret !== 'string') {
    throw new TypeError('encrypt: secret must be a non-empty string');
  }
  const key = deriveKey(secret);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${ct.toString('hex')}:${tag.toString('hex')}`;
}

export function decrypt(encoded: string, secret: string): string {
  if (typeof encoded !== 'string') {
    throw new TypeError('decrypt: encoded must be a string');
  }
  const parts = encoded.split(':');
  if (parts.length !== 3) {
    throw new Error('decrypt: malformed ciphertext (expected iv:ct:tag)');
  }
  const iv = Buffer.from(parts[0]!, 'hex');
  const ct = Buffer.from(parts[1]!, 'hex');
  const tag = Buffer.from(parts[2]!, 'hex');
  if (iv.length !== IV_BYTES) {
    throw new Error(`decrypt: invalid iv length (${iv.length})`);
  }
  if (tag.length !== TAG_BYTES) {
    throw new Error(`decrypt: invalid auth tag length (${tag.length})`);
  }
  const key = deriveKey(secret);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString(
    'utf8',
  );
}

let devSecretWarned = false;

/**
 * Returns SECRET_KEY from env, or a dev-only placeholder (with a console.warn
 * printed once per process) if running outside production. In production, an
 * absent SECRET_KEY is a fatal config error — callers must throw.
 */
export function resolveSecretKey(env: NodeJS.ProcessEnv = process.env): string {
  const fromEnv = env['SECRET_KEY'];
  if (fromEnv && fromEnv.length > 0) return fromEnv;
  const isProd = env['NODE_ENV'] === 'production';
  if (isProd) {
    throw new Error(
      'SECRET_KEY env var is required in production (used for encrypting OAuth tokens at rest)',
    );
  }
  if (!devSecretWarned) {
    // eslint-disable-next-line no-console
    console.warn(
      '[secret-box] SECRET_KEY not set; using insecure dev fallback. DO NOT run in production without SECRET_KEY.',
    );
    devSecretWarned = true;
  }
  return DEV_INSECURE_SECRET;
}

/** Key length the AES-256-GCM primitive requires. Exposed for tests. */
export const AES_KEY_LEN = KEY_BYTES;
export const AES_IV_LEN = IV_BYTES;
export const AES_TAG_LEN = TAG_BYTES;
