import { describe, expect, it } from 'vitest';
import { parseScope, scopeCovers, buildScope, normalizeScope } from './scope.js';

describe('parseScope', () => {
  it('parses kind:attribute:identifier', () => {
    expect(parseScope('dashboards:uid:abc')).toEqual({
      kind: 'dashboards',
      attribute: 'uid',
      identifier: 'abc',
    });
  });

  it('defaults missing segments to wildcard', () => {
    expect(parseScope('dashboards:*')).toEqual({
      kind: 'dashboards',
      attribute: '*',
      identifier: '*',
    });
  });

  it('empty string parses as all wildcards', () => {
    expect(parseScope('')).toEqual({ kind: '*', attribute: '*', identifier: '*' });
  });

  it('identifier can contain colons', () => {
    expect(parseScope('alert.rules:uid:group:abc')).toEqual({
      kind: 'alert.rules',
      attribute: 'uid',
      identifier: 'group:abc',
    });
  });
});

describe('scopeCovers', () => {
  it('empty parent covers anything', () => {
    expect(scopeCovers('', 'dashboards:uid:abc')).toBe(true);
    expect(scopeCovers('', '')).toBe(true);
  });

  it('exact match covers', () => {
    expect(scopeCovers('dashboards:uid:abc', 'dashboards:uid:abc')).toBe(true);
  });

  it('wildcard kind covers any child', () => {
    expect(scopeCovers('*', 'dashboards:uid:abc')).toBe(true);
  });

  it('kind:* covers any attribute/identifier in that kind', () => {
    expect(scopeCovers('dashboards:*', 'dashboards:uid:abc')).toBe(true);
    expect(scopeCovers('dashboards:*', 'dashboards:uid:def')).toBe(true);
  });

  it('kind:attribute:* covers all identifiers of that attribute', () => {
    expect(scopeCovers('dashboards:uid:*', 'dashboards:uid:abc')).toBe(true);
    // But not a different attribute.
    expect(scopeCovers('dashboards:uid:*', 'dashboards:id:42')).toBe(false);
  });

  it('different kind never covers', () => {
    expect(scopeCovers('folders:uid:*', 'dashboards:uid:abc')).toBe(false);
  });

  it('narrower parent does not cover broader child', () => {
    expect(scopeCovers('dashboards:uid:abc', 'dashboards:uid:def')).toBe(false);
    expect(scopeCovers('dashboards:uid:abc', 'dashboards:*')).toBe(false);
  });

  it('buildScope produces the conventional three-segment form', () => {
    expect(buildScope('dashboards')).toBe('dashboards:*:*');
    expect(buildScope('dashboards', 'uid', 'abc')).toBe('dashboards:uid:abc');
  });

  it('normalizeScope converts null/undefined to empty string', () => {
    expect(normalizeScope(null)).toBe('');
    expect(normalizeScope(undefined)).toBe('');
    expect(normalizeScope('dashboards:*')).toBe('dashboards:*');
  });
});
