/**
 * Editor has `alert.rules:create` (folder-scoped) so the auth gate on
 * structured POST /api/alert-rules must NOT 403 for an Editor.
 */
import { afterAll, describe, expect, it } from 'vitest';
import { createUser, deleteUser, loginAs, apiAs } from '../../helpers/users.js';

describe('rbac/editor-allowed/alert-rule-create', () => {
  const cleanup: Array<() => Promise<void>> = [];

  afterAll(async () => {
    for (const fn of cleanup) {
      try { await fn(); } catch { /* noop */ }
    }
  }, 60_000);

  it('editor POST /api/alert-rules does not return 403', async () => {
    const editor = await createUser('Editor');
    cleanup.push(() => deleteUser(editor.id));
    const cookie = await loginAs(editor);
    const result = await apiAs(cookie, 'POST', '/api/alert-rules', {
      name: 'editor-rbac-test',
      condition: { query: 'up', operator: '<', threshold: 1, forDurationSec: 30 },
      evaluationIntervalSec: 60,
      severity: 'low',
    });
    expect(result.status).not.toBe(403);
  }, 60_000);
});
