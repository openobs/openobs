import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb, AuditLogRepository } from '@agentic-obs/data-layer';
import { AuditAction } from '@agentic-obs/common';
import { AuditWriter, auditRetentionDays, pruneAuditLog } from './audit-writer.js';

describe('AuditWriter', () => {
  let db: ReturnType<typeof createTestDb>;
  let repo: AuditLogRepository;
  let writer: AuditWriter;

  beforeEach(() => {
    db = createTestDb();
    repo = new AuditLogRepository(db);
    writer = new AuditWriter(repo);
  });

  it('writes a row to audit_log', async () => {
    await writer.log({
      action: AuditAction.UserLogin,
      actorType: 'user',
      actorId: 'u1',
      outcome: 'success',
    });
    const { items, total } = await repo.query();
    expect(total).toBe(1);
    expect(items[0]?.action).toBe('user.login');
    expect(items[0]?.outcome).toBe('success');
  });

  it('serialises metadata', async () => {
    await writer.log({
      action: AuditAction.UserLoginFailed,
      actorType: 'user',
      outcome: 'failure',
      metadata: { reason: 'bad password', attempt: 2 },
    });
    const { items } = await repo.query();
    expect(items[0]?.metadata).toContain('"reason"');
  });

  it('swallows repo errors', async () => {
    const brokenRepo = {
      log: () => Promise.reject(new Error('db down')),
    } as unknown as AuditLogRepository;
    const w = new AuditWriter(brokenRepo);
    // Should not throw.
    await expect(
      w.log({
        action: AuditAction.UserLogin,
        actorType: 'user',
        outcome: 'success',
      }),
    ).resolves.toBeUndefined();
  });
});

describe('auditRetentionDays', () => {
  it('defaults to 90', () => {
    expect(auditRetentionDays({} as NodeJS.ProcessEnv)).toBe(90);
  });
  it('parses env override', () => {
    expect(
      auditRetentionDays({ AUDIT_RETENTION_DAYS: '30' } as NodeJS.ProcessEnv),
    ).toBe(30);
  });
  it('rejects invalid env', () => {
    expect(
      auditRetentionDays({ AUDIT_RETENTION_DAYS: 'bad' } as NodeJS.ProcessEnv),
    ).toBe(90);
  });
});

describe('pruneAuditLog', () => {
  it('deletes rows older than N days', async () => {
    const db = createTestDb();
    const repo = new AuditLogRepository(db);
    // Insert a row with a manually old timestamp.
    await repo.log({
      action: AuditAction.UserLogin,
      actorType: 'user',
      outcome: 'success',
      timestamp: '2000-01-01T00:00:00.000Z',
    });
    await repo.log({
      action: AuditAction.UserLogin,
      actorType: 'user',
      outcome: 'success',
    });
    const n = await pruneAuditLog(repo, 30);
    expect(n).toBe(1);
    const { total } = await repo.query();
    expect(total).toBe(1);
  });
});
