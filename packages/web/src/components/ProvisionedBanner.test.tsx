import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import React from 'react';
import ProvisionedBanner from './ProvisionedBanner.js';

describe('ProvisionedBanner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing when source is not provisioned', () => {
    const html = renderToStaticMarkup(
      React.createElement(ProvisionedBanner, {
        resourceKind: 'dashboard',
        resourceId: 'd1',
        source: 'manual',
        provenance: null,
        onForked: () => undefined,
      }),
    );
    expect(html).toBe('');
  });

  it('renders nothing when source is undefined (back-compat with pre-Wave-1 rows)', () => {
    const html = renderToStaticMarkup(
      React.createElement(ProvisionedBanner, {
        resourceKind: 'dashboard',
        resourceId: 'd1',
        source: undefined,
        provenance: null,
        onForked: () => undefined,
      }),
    );
    expect(html).toBe('');
  });

  it('renders the banner with repo + path when source=provisioned_git', () => {
    const html = renderToStaticMarkup(
      React.createElement(ProvisionedBanner, {
        resourceKind: 'dashboard',
        resourceId: 'd1',
        source: 'provisioned_git',
        provenance: {
          repo: 'acme/observability',
          path: 'dashboards/p99.json',
          commit: '1234567890abcdef',
        },
        onForked: () => undefined,
      }),
    );
    expect(html).toContain('This dashboard is managed by git');
    expect(html).toContain('acme/observability/dashboards/p99.json');
    expect(html).toContain('(1234567)'); // short commit
    expect(html).toContain('Fork to my workspace');
    expect(html).toContain('View source');
    // Source URL built from provenance
    expect(html).toContain(
      'https://github.com/acme/observability/blob/1234567890abcdef/dashboards/p99.json',
    );
  });

  it('omits View source link when provenance lacks repo or path', () => {
    const html = renderToStaticMarkup(
      React.createElement(ProvisionedBanner, {
        resourceKind: 'alert_rule',
        resourceId: 'r1',
        source: 'provisioned_file',
        provenance: { path: 'alerts/foo.yaml' },
        onForked: () => undefined,
      }),
    );
    expect(html).toContain('This alert rule is managed by git');
    expect(html).toContain('alerts/foo.yaml');
    expect(html).toContain('Fork to my workspace');
    expect(html).not.toContain('View source');
  });

  it('renders generic "managed externally" when provenance is missing', () => {
    const html = renderToStaticMarkup(
      React.createElement(ProvisionedBanner, {
        resourceKind: 'dashboard',
        resourceId: 'd1',
        source: 'provisioned_file',
        provenance: null,
        onForked: () => undefined,
      }),
    );
    expect(html).toContain('managed externally');
  });
});
