import { describe, expect, it } from 'vitest';
import { InMemoryAiSuggestionRepository } from './ai-suggestion.js';

describe('InMemoryAiSuggestionRepository', () => {
  function makeRepo() {
    return new InMemoryAiSuggestionRepository();
  }

  it('create() upserts by (userId, dedupKey) — running twice returns one row', async () => {
    const repo = makeRepo();
    const a = await repo.create({
      orgId: 'org1',
      userId: 'u1',
      kind: 'missing_dashboard',
      title: 't',
      body: 'b',
      dedupKey: 'k1',
    });
    const b = await repo.create({
      orgId: 'org1',
      userId: 'u1',
      kind: 'missing_dashboard',
      title: 't2', // different content shouldn't matter
      body: 'b2',
      dedupKey: 'k1',
    });
    expect(b.id).toBe(a.id);
    // First-row wins; later create is a no-op
    expect(b.title).toBe('t');
    const list = await repo.findOpenForUser('u1', 'org1');
    expect(list).toHaveLength(1);
  });

  it('findOpenForUser() includes resurfaced snoozed rows', async () => {
    const repo = makeRepo();
    const past = '2000-01-01T00:00:00.000Z';
    const future = '9999-12-31T00:00:00.000Z';

    const open = await repo.create({
      orgId: 'org1', userId: 'u1', kind: 'stale_draft',
      title: 'open', body: '', dedupKey: 'a',
    });
    const snoozedPast = await repo.create({
      orgId: 'org1', userId: 'u1', kind: 'stale_draft',
      title: 'past', body: '', dedupKey: 'b',
    });
    const snoozedFuture = await repo.create({
      orgId: 'org1', userId: 'u1', kind: 'stale_draft',
      title: 'future', body: '', dedupKey: 'c',
    });
    await repo.updateState(snoozedPast.id, 'snoozed', past);
    await repo.updateState(snoozedFuture.id, 'snoozed', future);

    const list = await repo.findOpenForUser('u1', 'org1');
    const ids = list.map((r) => r.id).sort();
    expect(ids).toEqual([open.id, snoozedPast.id].sort());
  });

  it('updateState() transitions open → dismissed (terminal)', async () => {
    const repo = makeRepo();
    const s = await repo.create({
      orgId: 'o', userId: 'u', kind: 'duplicate_dashboard',
      title: '', body: '', dedupKey: 'k',
    });
    const dismissed = await repo.updateState(s.id, 'dismissed');
    expect(dismissed?.state).toBe('dismissed');
    expect(dismissed?.snoozedUntil).toBeNull();
    const visible = await repo.findOpenForUser('u', 'o');
    expect(visible).toHaveLength(0);
  });

  it('updateState() transitions open → snoozed (sets snoozedUntil) → open after elapse', async () => {
    const repo = makeRepo();
    const s = await repo.create({
      orgId: 'o', userId: 'u', kind: 'missing_dashboard',
      title: '', body: '', dedupKey: 'k',
    });
    const until = '3000-01-01T00:00:00.000Z';
    const snoozed = await repo.updateState(s.id, 'snoozed', until);
    expect(snoozed?.state).toBe('snoozed');
    expect(snoozed?.snoozedUntil).toBe(until);

    // Snoozed to the future → not visible
    let list = await repo.findOpenForUser('u', 'o', '2025-01-01T00:00:00.000Z');
    expect(list).toHaveLength(0);

    // After snoozedUntil passes → visible again (the inbox query resurfaces it)
    list = await repo.findOpenForUser('u', 'o', '3001-01-01T00:00:00.000Z');
    expect(list).toHaveLength(1);
    expect(list[0]?.state).toBe('snoozed');
  });

  it('snoozeAllForUser() snoozes all open rows but not already-snoozed/dismissed ones', async () => {
    const repo = makeRepo();
    const a = await repo.create({
      orgId: 'o', userId: 'u', kind: 'missing_dashboard',
      title: '', body: '', dedupKey: 'a',
    });
    const b = await repo.create({
      orgId: 'o', userId: 'u', kind: 'stale_draft',
      title: '', body: '', dedupKey: 'b',
    });
    const c = await repo.create({
      orgId: 'o', userId: 'u', kind: 'duplicate_dashboard',
      title: '', body: '', dedupKey: 'c',
    });
    await repo.updateState(c.id, 'dismissed');

    const count = await repo.snoozeAllForUser('u', 'o', '3000-01-01T00:00:00.000Z');
    expect(count).toBe(2);

    const aRow = await repo.findById(a.id);
    const bRow = await repo.findById(b.id);
    const cRow = await repo.findById(c.id);
    expect(aRow?.state).toBe('snoozed');
    expect(bRow?.state).toBe('snoozed');
    expect(cRow?.state).toBe('dismissed');
  });

  it('scopes by userId + orgId', async () => {
    const repo = makeRepo();
    await repo.create({
      orgId: 'o1', userId: 'u1', kind: 'missing_dashboard',
      title: '', body: '', dedupKey: 'a',
    });
    await repo.create({
      orgId: 'o2', userId: 'u1', kind: 'missing_dashboard',
      title: '', body: '', dedupKey: 'a',
    });
    await repo.create({
      orgId: 'o1', userId: 'u2', kind: 'missing_dashboard',
      title: '', body: '', dedupKey: 'a',
    });
    const list = await repo.findOpenForUser('u1', 'o1');
    expect(list).toHaveLength(1);
  });
});
