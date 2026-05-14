import { describe, expect, it } from 'vitest';
import { dispatchSuggestionAction } from './suggestion-action-handlers.js';

describe('suggestion action handlers', () => {
  it('create_dashboard returns a navigate URL with prefill query', async () => {
    const r = await dispatchSuggestionAction(
      'create_dashboard',
      { prefill: { title: 'ingress-gateway overview', prompt: 'p' } },
      {},
    );
    expect(r.kind).toBe('navigate');
    if (r.kind === 'navigate') {
      expect(r.url.startsWith('/dashboards/new?')).toBe(true);
      expect(r.url).toContain('title=');
      expect(r.url).toContain('prompt=');
    }
  });

  it('archive_resources is STUBBED — navigates to list view with preselected IDs', async () => {
    const r = await dispatchSuggestionAction(
      'archive_resources',
      { resourceIds: ['d1', 'd2'] },
      {},
    );
    expect(r.kind).toBe('navigate');
    if (r.kind === 'navigate') {
      expect(r.url).toBe('/dashboards?preselect=d1%2Cd2');
    }
  });

  it('merge_dashboards navigates to compare view', async () => {
    const r = await dispatchSuggestionAction(
      'merge_dashboards',
      { dashboardIds: ['a', 'b'] },
      {},
    );
    expect(r.kind).toBe('navigate');
    if (r.kind === 'navigate') {
      expect(r.url).toBe('/dashboards/compare?a=a&b=b');
    }
  });

  it('merge_dashboards with <2 ids returns a message', async () => {
    const r = await dispatchSuggestionAction(
      'merge_dashboards',
      { dashboardIds: ['only-one'] },
      {},
    );
    expect(r.kind).toBe('message');
  });
});
