import { describe, it, expect } from 'vitest';
import { escapeLdapFilterValue } from './filter-escape.js';

describe('escapeLdapFilterValue', () => {
  it('passes through values without meta-characters', () => {
    expect(escapeLdapFilterValue('alice')).toBe('alice');
    expect(escapeLdapFilterValue('alice.smith+42@example.com')).toBe(
      'alice.smith+42@example.com',
    );
  });

  it('escapes backslash as \\5c', () => {
    expect(escapeLdapFilterValue('DOMAIN\\user')).toBe('DOMAIN\\5cuser');
  });

  it('escapes asterisk as \\2a', () => {
    expect(escapeLdapFilterValue('a*b')).toBe('a\\2ab');
  });

  it('escapes open paren as \\28', () => {
    expect(escapeLdapFilterValue('a(b')).toBe('a\\28b');
  });

  it('escapes close paren as \\29', () => {
    expect(escapeLdapFilterValue('a)b')).toBe('a\\29b');
  });

  it('escapes NUL as \\00', () => {
    expect(escapeLdapFilterValue('a\u0000b')).toBe('a\\00b');
  });

  it('processes backslash first so later replacements do not double-escape', () => {
    // Input has literal `\` and `*`. If we escaped `*` → `\2a` BEFORE `\`,
    // the inserted `\` would be re-escaped, yielding `\5c2a` instead of `\2a`.
    expect(escapeLdapFilterValue('\\*')).toBe('\\5c\\2a');
  });

  it('neutralises a classic filter-injection payload', () => {
    // `admin)(|(uid=*` — intent: break out of `(cn=%s)` into
    // `(cn=admin)(|(uid=*))` and match any user.
    const payload = 'admin)(|(uid=*';
    const escaped = escapeLdapFilterValue(payload);
    expect(escaped).toBe('admin\\29\\28|\\28uid=\\2a');
    // After substitution into `(cn=%s)` the meta-chars are inert.
    const filter = `(cn=${escaped})`;
    expect(filter).toBe('(cn=admin\\29\\28|\\28uid=\\2a)');
    // Critical: no raw unescaped parens or stars remain in the user value.
    expect(escaped).not.toMatch(/[()*\\](?![0-9a-f]{2})/i);
  });

  it('escapes all meta-chars when mixed together', () => {
    expect(escapeLdapFilterValue('a\\b*c(d)e\u0000f')).toBe(
      'a\\5cb\\2ac\\28d\\29e\\00f',
    );
  });
});
