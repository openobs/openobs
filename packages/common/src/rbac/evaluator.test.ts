import { describe, expect, it } from 'vitest';
import { ac } from './evaluator.js';
import type { ResolvedPermission } from '../auth/identity.js';

const perm = (action: string, scope = ''): ResolvedPermission => ({ action, scope });

describe('evaluator — ac.eval', () => {
  it('returns true when action+scope matches exactly', () => {
    const e = ac.eval('dashboards:read', 'dashboards:uid:abc');
    expect(e.evaluate([perm('dashboards:read', 'dashboards:uid:abc')])).toBe(true);
  });

  it('returns true when scope is wildcard-covered', () => {
    const e = ac.eval('dashboards:read', 'dashboards:uid:abc');
    expect(e.evaluate([perm('dashboards:read', 'dashboards:*')])).toBe(true);
    expect(e.evaluate([perm('dashboards:read', '')])).toBe(true);
  });

  it('returns false when action mismatches', () => {
    const e = ac.eval('dashboards:write', 'dashboards:uid:abc');
    expect(e.evaluate([perm('dashboards:read', 'dashboards:*')])).toBe(false);
  });

  it('returns false when scope is outside coverage', () => {
    const e = ac.eval('dashboards:read', 'dashboards:uid:abc');
    expect(e.evaluate([perm('dashboards:read', 'dashboards:uid:def')])).toBe(false);
  });

  it('action-only (no scope) is satisfied by any matching permission', () => {
    const e = ac.eval('dashboards:create');
    expect(e.evaluate([perm('dashboards:create', 'folders:*')])).toBe(true);
  });

  it('multi-scope: requires all required scopes to be covered', () => {
    const e = ac.eval('dashboards:read', [
      'dashboards:uid:a',
      'dashboards:uid:b',
    ]);
    // Only one covered.
    expect(e.evaluate([perm('dashboards:read', 'dashboards:uid:a')])).toBe(false);
    // Both covered via wildcard.
    expect(e.evaluate([perm('dashboards:read', 'dashboards:*')])).toBe(true);
  });

  it('string() returns action + scopes', () => {
    expect(ac.eval('dashboards:read').string()).toBe('dashboards:read');
    expect(ac.eval('dashboards:read', 'dashboards:uid:abc').string()).toBe(
      'dashboards:read on dashboards:uid:abc',
    );
  });
});

describe('evaluator — ac.all', () => {
  it('returns true only when all children return true', () => {
    const e = ac.all(
      ac.eval('dashboards:read', 'dashboards:uid:abc'),
      ac.eval('folders:read', 'folders:uid:f1'),
    );
    const perms = [
      perm('dashboards:read', 'dashboards:*'),
      perm('folders:read', 'folders:*'),
    ];
    expect(e.evaluate(perms)).toBe(true);
    expect(e.evaluate([perms[0]!])).toBe(false);
  });

  it('empty all() passes (vacuous truth)', () => {
    expect(ac.all().evaluate([])).toBe(true);
  });
});

describe('evaluator — ac.any', () => {
  it('returns true when at least one child passes', () => {
    const e = ac.any(
      ac.eval('dashboards:read', 'dashboards:uid:abc'),
      ac.eval('dashboards:write', 'dashboards:uid:abc'),
    );
    expect(e.evaluate([perm('dashboards:write', 'dashboards:*')])).toBe(true);
    expect(e.evaluate([perm('dashboards:read', 'dashboards:*')])).toBe(true);
  });

  it('returns false when no child passes', () => {
    const e = ac.any(
      ac.eval('dashboards:read', 'dashboards:uid:abc'),
      ac.eval('folders:read', 'folders:uid:f1'),
    );
    expect(e.evaluate([perm('teams:read', 'teams:*')])).toBe(false);
  });

  it('empty any() fails', () => {
    expect(ac.any().evaluate([])).toBe(false);
  });
});

describe('evaluator — mutate / scope resolvers', () => {
  it('mutate expands scope via resolver and passes when any expanded variant is covered', () => {
    // Request targets a dashboard; permission is on the folder.
    const e = ac
      .eval('dashboards:read', 'dashboards:uid:abc')
      .mutate((s) => {
        if (s === 'dashboards:uid:abc') {
          return [
            'dashboards:uid:abc',
            'folders:uid:f_parent',
            'folders:*',
            'dashboards:*',
          ];
        }
        return [s];
      });

    expect(e.evaluate([perm('dashboards:read', 'folders:uid:f_parent')])).toBe(true);
    expect(e.evaluate([perm('dashboards:read', 'folders:*')])).toBe(true);
  });

  it('mutate on action-only evaluator is a no-op', () => {
    const e0 = ac.eval('dashboards:create');
    const e1 = e0.mutate(() => ['never:matters']);
    expect(e1.evaluate([perm('dashboards:create', '')])).toBe(true);
  });

  it('mutate on composite evaluators recurses', () => {
    const e = ac
      .all(
        ac.eval('dashboards:read', 'dashboards:uid:abc'),
        ac.eval('folders:read', 'folders:uid:f1'),
      )
      .mutate((s) => (s === 'dashboards:uid:abc' ? [s, 'folders:uid:f1'] : [s]));
    expect(
      e.evaluate([
        perm('dashboards:read', 'folders:uid:f1'),
        perm('folders:read', 'folders:*'),
      ]),
    ).toBe(true);
  });
});
