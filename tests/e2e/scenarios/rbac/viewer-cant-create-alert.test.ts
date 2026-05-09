/**
 * A Viewer-role user lacks `alert.rules:create` and must get 403 from
 * structured POST /api/alert-rules.
 */
import { afterAll, describe, expect, it } from 'vitest';
import { createUser, deleteUser, loginAs, apiAs } from '../helpers/users.js';

describe('rbac/viewer-cant-create-alert', () => {
  const cleanup: Array<() => Promise<void>> = [];

  afterAll(async () => {
    for (const fn of cleanup) {
      try { await fn(); } catch { /* noop */ }
    }
  }, 60_000);

  it('viewer is forbidden from POST /api/alert-rules', async () => {
    const viewer = await createUser('Viewer');
    cleanup.push(() => deleteUser(viewer.id));
    const cookie = await loginAs(viewer);
    const result = await apiAs(cookie, 'POST', '/api/alert-rules', {
      name: 'viewer-test',
      condition: { query: 'up', operator: '<', threshold: 1, forDurationSec: 30 },
      evaluationIntervalSec: 60,
      severity: 'low',
    });
    expect(result.status).toBe(403);
  }, 60_000);
});
