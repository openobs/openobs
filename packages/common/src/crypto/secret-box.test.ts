import { describe, it, expect } from 'vitest';
import {
  encrypt,
  decrypt,
  resolveSecretKey,
  DEV_INSECURE_SECRET,
  AES_IV_LEN,
  AES_TAG_LEN,
} from './secret-box.js';

describe('secret-box.encrypt/decrypt', () => {
  const SECRET = 'my-test-secret-key-' + 'x'.repeat(40);

  it('roundtrips UTF-8 strings', () => {
    const pt = 'hello world — with utf8 é chars';
    const ct = encrypt(pt, SECRET);
    expect(decrypt(ct, SECRET)).toBe(pt);
  });

  it('produces the iv:ct:tag wire format', () => {
    const ct = encrypt('x', SECRET);
    const parts = ct.split(':');
    expect(parts).toHaveLength(3);
    expect(Buffer.from(parts[0]!, 'hex')).toHaveLength(AES_IV_LEN);
    expect(Buffer.from(parts[2]!, 'hex')).toHaveLength(AES_TAG_LEN);
  });

  it('produces different ciphertexts for identical plaintexts (IV randomness)', () => {
    const a = encrypt('same', SECRET);
    const b = encrypt('same', SECRET);
    expect(a).not.toBe(b);
    expect(decrypt(a, SECRET)).toBe('same');
    expect(decrypt(b, SECRET)).toBe('same');
  });

  it('rejects the wrong secret', () => {
    const ct = encrypt('data', SECRET);
    expect(() => decrypt(ct, 'wrong-secret')).toThrow();
  });

  it('rejects a tampered ciphertext', () => {
    const ct = encrypt('data', SECRET);
    const parts = ct.split(':');
    // flip one hex char in the ciphertext component
    const flipped = parts[1]!.startsWith('0') ? '1' + parts[1]!.slice(1) : '0' + parts[1]!.slice(1);
    const tampered = `${parts[0]}:${flipped}:${parts[2]}`;
    expect(() => decrypt(tampered, SECRET)).toThrow();
  });

  it('rejects a tampered auth tag', () => {
    const ct = encrypt('data', SECRET);
    const parts = ct.split(':');
    const flipped = parts[2]!.startsWith('0') ? '1' + parts[2]!.slice(1) : '0' + parts[2]!.slice(1);
    const tampered = `${parts[0]}:${parts[1]}:${flipped}`;
    expect(() => decrypt(tampered, SECRET)).toThrow();
  });

  it('rejects a malformed encoded string', () => {
    expect(() => decrypt('not-a-valid-encoding', SECRET)).toThrow();
    expect(() => decrypt('one:two', SECRET)).toThrow();
  });

  it('rejects empty secret', () => {
    expect(() => encrypt('x', '')).toThrow();
  });

  it('rejects non-string plaintext', () => {
    // @ts-expect-error intentional type violation
    expect(() => encrypt(123, SECRET)).toThrow();
  });

  it('handles the empty string as plaintext', () => {
    const ct = encrypt('', SECRET);
    expect(decrypt(ct, SECRET)).toBe('');
  });
});

describe('resolveSecretKey', () => {
  it('returns SECRET_KEY from env when set', () => {
    const key = resolveSecretKey({
      SECRET_KEY: 'prod-like-secret',
      NODE_ENV: 'production',
    } as NodeJS.ProcessEnv);
    expect(key).toBe('prod-like-secret');
  });

  it('throws in production when SECRET_KEY missing', () => {
    expect(() =>
      resolveSecretKey({ NODE_ENV: 'production' } as NodeJS.ProcessEnv),
    ).toThrow(/SECRET_KEY/);
  });

  it('falls back to a dev placeholder outside production', () => {
    const key = resolveSecretKey({ NODE_ENV: 'development' } as NodeJS.ProcessEnv);
    expect(key).toBe(DEV_INSECURE_SECRET);
  });
});
