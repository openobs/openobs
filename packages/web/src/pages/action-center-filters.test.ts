/**
 * Tests for the Action Center approvals filter helpers (T3.2).
 *
 * Covers the acceptance bullets in the task brief:
 *   1. Renders rows unfiltered → all 3 visible.
 *   2. Connector filter narrows.
 *   3. Namespace filter narrows.
 *   4. Team filter narrows.
 *   5. NONE-pill matches NULL.
 *   6. AND across groups.
 *   7. URL state round-trip.
 *   8. Empty state under filter (driven by `applyFilters([...]).length`).
 */

import { describe, it, expect } from 'vitest';
import {
  applyFilters,
  distinctConnectorIds,
  distinctNamespaces,
  distinctTeamIds,
  EMPTY_FILTERS,
  isAnyFilterActive,
  NONE_SENTINEL,
  parseFiltersFromParams,
  writeFiltersToParams,
  type ApprovalScopeFields,
} from './action-center-filters.js';

const rows: ApprovalScopeFields[] = [
  { opsConnectorId: 'prod-eks',  targetNamespace: 'platform', requesterTeamId: 'platform' },
  { opsConnectorId: 'prod-eks',  targetNamespace: 'payments', requesterTeamId: 'payments' },
  { opsConnectorId: 'dev-eks',   targetNamespace: 'platform', requesterTeamId: 'platform' },
  { opsConnectorId: null,         targetNamespace: null,        requesterTeamId: null },
];

describe('applyFilters', () => {
  it('returns all rows when no filter is set (acceptance #1)', () => {
    expect(applyFilters(rows, EMPTY_FILTERS)).toHaveLength(rows.length);
  });

  it('connector filter narrows (acceptance #2)', () => {
    const out = applyFilters(rows, { ...EMPTY_FILTERS, connector: 'prod-eks' });
    expect(out).toHaveLength(2);
    expect(out.every((r) => r.opsConnectorId === 'prod-eks')).toBe(true);
  });

  it('namespace filter narrows (acceptance #3)', () => {
    const out = applyFilters(rows, { ...EMPTY_FILTERS, namespace: 'payments' });
    expect(out).toHaveLength(1);
    expect(out[0]!.targetNamespace).toBe('payments');
  });

  it('team filter narrows (acceptance #4)', () => {
    const out = applyFilters(rows, { ...EMPTY_FILTERS, team: 'platform' });
    expect(out).toHaveLength(2);
    expect(out.every((r) => r.requesterTeamId === 'platform')).toBe(true);
  });

  it('NONE sentinel matches NULL on connector (acceptance #5)', () => {
    const out = applyFilters(rows, { ...EMPTY_FILTERS, connector: NONE_SENTINEL });
    expect(out).toHaveLength(1);
    expect(out[0]!.opsConnectorId).toBeNull();
  });

  it('NONE sentinel matches NULL on namespace and team', () => {
    const ns = applyFilters(rows, { ...EMPTY_FILTERS, namespace: NONE_SENTINEL });
    expect(ns).toHaveLength(1);
    expect(ns[0]!.targetNamespace).toBeNull();
    const team = applyFilters(rows, { ...EMPTY_FILTERS, team: NONE_SENTINEL });
    expect(team).toHaveLength(1);
    expect(team[0]!.requesterTeamId).toBeNull();
  });

  it('AND across groups: connector=prod-eks + team=platform → only matching row (acceptance #6)', () => {
    const out = applyFilters(rows, { connector: 'prod-eks', namespace: null, team: 'platform' });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ opsConnectorId: 'prod-eks', requesterTeamId: 'platform' });
  });

  it('produces zero rows when filter excludes everything (acceptance #8)', () => {
    const out = applyFilters(rows, { ...EMPTY_FILTERS, connector: 'no-such-connector' });
    expect(out).toHaveLength(0);
  });
});

describe('distinct value helpers', () => {
  it('distinctConnectorIds includes NONE sentinel for NULL rows', () => {
    const ids = distinctConnectorIds(rows);
    expect(ids).toContain('prod-eks');
    expect(ids).toContain('dev-eks');
    expect(ids).toContain(NONE_SENTINEL);
    // NONE pill always sorts last.
    expect(ids[ids.length - 1]).toBe(NONE_SENTINEL);
  });

  it('distinctNamespaces is scoped by the active connector filter', () => {
    const all = distinctNamespaces(rows, null);
    expect(all).toEqual(expect.arrayContaining(['platform', 'payments', NONE_SENTINEL]));

    const prodOnly = distinctNamespaces(rows, 'prod-eks');
    expect(prodOnly).toEqual(expect.arrayContaining(['platform', 'payments']));
    expect(prodOnly).not.toContain(NONE_SENTINEL);
  });

  it('distinctTeamIds collects all teams plus NONE for NULL', () => {
    const ids = distinctTeamIds(rows);
    expect(ids).toEqual(expect.arrayContaining(['platform', 'payments', NONE_SENTINEL]));
  });
});

describe('URL state round-trip (acceptance #7)', () => {
  it('parses connector / namespace / team query params', () => {
    const p = new URLSearchParams('?connector=prod-eks&namespace=platform&team=platform');
    expect(parseFiltersFromParams(p)).toEqual({
      connector: 'prod-eks',
      namespace: 'platform',
      team: 'platform',
    });
  });

  it('missing params resolve to All (null)', () => {
    expect(parseFiltersFromParams(new URLSearchParams(''))).toEqual(EMPTY_FILTERS);
  });

  it('writeFiltersToParams sets and clears keys', () => {
    const p = new URLSearchParams('?tab=pending&connector=stale');
    writeFiltersToParams(p, { connector: 'prod-eks', namespace: null, team: 'platform' });
    expect(p.get('connector')).toBe('prod-eks');
    expect(p.get('namespace')).toBeNull();
    expect(p.get('team')).toBe('platform');
    // Pre-existing unrelated params are preserved.
    expect(p.get('tab')).toBe('pending');
  });

  it('round-trips state through write → parse', () => {
    const p = new URLSearchParams();
    const filters = { connector: 'prod-eks', namespace: NONE_SENTINEL, team: null };
    writeFiltersToParams(p, filters);
    expect(parseFiltersFromParams(p)).toEqual(filters);
  });
});

describe('isAnyFilterActive', () => {
  it('returns false for the empty filter', () => {
    expect(isAnyFilterActive(EMPTY_FILTERS)).toBe(false);
  });
  it('returns true when any slot is set', () => {
    expect(isAnyFilterActive({ ...EMPTY_FILTERS, team: 't' })).toBe(true);
  });
});
