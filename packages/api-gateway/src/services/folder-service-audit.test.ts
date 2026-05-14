/**
 * Audit wiring tests for FolderService — verifies that resource mutation
 * audit entries are emitted with the right shape (Wave 1 / PR-A).
 *
 * Companion to folder-service.test.ts (which covers business logic);
 * lives in a separate file so the audit assertions don't bloat existing
 * scenarios.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  createTestDb,
  seedDefaultOrg,
  seedServerAdmin,
  FolderRepository,
  AuditLogRepository,
} from '@agentic-obs/data-layer';
import type { SqliteClient } from '@agentic-obs/data-layer';
import { AuditAction } from '@agentic-obs/common';
import { FolderService } from './folder-service.js';
import { AuditWriter } from '../auth/audit-writer.js';

let adminId = '';

async function bootstrap(db: SqliteClient): Promise<void> {
  await seedDefaultOrg(db);
  const seeded = await seedServerAdmin(db);
  adminId = seeded.user.id;
}

describe('FolderService audit wiring', () => {
  let db: SqliteClient;
  let auditRepo: AuditLogRepository;
  let writer: AuditWriter;
  let svc: FolderService;

  beforeEach(async () => {
    db = createTestDb();
    await bootstrap(db);
    auditRepo = new AuditLogRepository(db);
    writer = new AuditWriter(auditRepo);
    svc = new FolderService({
      folders: new FolderRepository(db),
      db,
      audit: writer,
    });
  });

  it('emits folder.create audit row with target metadata', async () => {
    const folder = await svc.create(
      'org_main',
      { title: 'Test Folder' },
      adminId,
    );
    // The writer fires void — wait a microtask so the row lands.
    await new Promise((r) => setImmediate(r));

    const { items, total } = await auditRepo.query();
    expect(total).toBe(1);
    const row = items[0]!;
    expect(row.action).toBe(AuditAction.FolderCreate);
    expect(row.actorType).toBe('user');
    expect(row.actorId).toBe(adminId);
    expect(row.orgId).toBe('org_main');
    expect(row.targetType).toBe('folder');
    expect(row.targetId).toBe(folder.uid);
    expect(row.targetName).toBe('Test Folder');
    expect(row.outcome).toBe('success');
  });
});
