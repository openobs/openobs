import { describe, it, expect } from 'vitest';
import { sql } from 'drizzle-orm';
import { createTestDb } from '../test-support/test-db.js';
import { seedDefaultOrg } from '../test-support/fixtures.js';
import { seedRbacForOrg } from './rbac-seed.js';
import { RoleRepository } from '../repository/auth/role-repository.js';
import { PermissionRepository } from '../repository/auth/permission-repository.js';
import {
  BASIC_ROLE_DEFINITIONS,
  FIXED_ROLE_DEFINITIONS,
  ALL_ACTIONS,
} from '@agentic-obs/common';

describe('seedRbacForOrg', () => {
  it('rejects empty orgId', async () => {
    const db = createTestDb();
    await expect(seedRbacForOrg(db, '')).rejects.toThrow(/non-empty/);
  });

  it('inserts every fixed role globally', async () => {
    const db = createTestDb();
    await seedDefaultOrg(db);
    await seedRbacForOrg(db, 'org_main');
    const roleRepo = new RoleRepository(db);
    const page = await roleRepo.list({ orgId: '', limit: 500 });
    const globalNames = new Set(page.items.map((r) => r.name));
    for (const def of FIXED_ROLE_DEFINITIONS) {
      expect(globalNames.has(def.name), `missing fixed role ${def.name}`).toBe(true);
    }
  });

  it('inserts basic:viewer/editor/admin scoped to the target org', async () => {
    const db = createTestDb();
    await seedDefaultOrg(db);
    await seedRbacForOrg(db, 'org_main');
    const roleRepo = new RoleRepository(db);
    for (const def of BASIC_ROLE_DEFINITIONS) {
      if (def.global) continue;
      const row = await roleRepo.findByUid('org_main', def.uid);
      expect(row, `missing ${def.uid}`).not.toBeNull();
      expect(row!.orgId).toBe('org_main');
    }
  });

  it('inserts basic:server_admin globally (org_id="")', async () => {
    const db = createTestDb();
    await seedDefaultOrg(db);
    await seedRbacForOrg(db, 'org_main');
    const roleRepo = new RoleRepository(db);
    const row = await roleRepo.findByUid('', 'basic_server_admin');
    expect(row).not.toBeNull();
    expect(row!.orgId).toBe('');
  });

  it('inserts builtin_role mappings for Viewer/Editor/Admin (org-scoped) and Server Admin (global)', async () => {
    const db = createTestDb();
    await seedDefaultOrg(db);
    await seedRbacForOrg(db, 'org_main');
    const roleRepo = new RoleRepository(db);
    const orgMappings = await roleRepo.listBuiltinRoles('org_main');
    const globalMappings = await roleRepo.listBuiltinRoles('');
    expect(orgMappings.map((m) => m.role).sort()).toEqual([
      'Admin',
      'Editor',
      'Viewer',
    ]);
    expect(globalMappings.map((m) => m.role)).toContain('Server Admin');
  });

  it('basic:server_admin has at least every catalog action', async () => {
    const db = createTestDb();
    await seedDefaultOrg(db);
    await seedRbacForOrg(db, 'org_main');
    const roleRepo = new RoleRepository(db);
    const permRepo = new PermissionRepository(db);
    const sa = await roleRepo.findByUid('', 'basic_server_admin');
    const perms = await permRepo.listByRole(sa!.id);
    const actions = new Set(perms.map((p) => p.action));
    for (const a of ALL_ACTIONS) {
      expect(actions.has(a), `server_admin missing ${a}`).toBe(true);
    }
  });

  it('is idempotent — running twice does not duplicate rows', async () => {
    const db = createTestDb();
    await seedDefaultOrg(db);
    const r1 = await seedRbacForOrg(db, 'org_main');
    const r2 = await seedRbacForOrg(db, 'org_main');
    expect(r1.rolesInserted).toBeGreaterThan(0);
    expect(r2.rolesInserted).toBe(0);
    expect(r2.permissionsInserted).toBe(0);
    expect(r2.builtinMappingsInserted).toBe(0);

    // Spot-check row counts stay stable.
    const roleCount = db.all<{ n: number }>(sql`SELECT COUNT(*) AS n FROM role`)[0]?.n ?? 0;
    const permCount = db.all<{ n: number }>(sql`SELECT COUNT(*) AS n FROM permission`)[0]?.n ?? 0;
    await seedRbacForOrg(db, 'org_main');
    const roleCount2 = db.all<{ n: number }>(sql`SELECT COUNT(*) AS n FROM role`)[0]?.n ?? 0;
    const permCount2 = db.all<{ n: number }>(sql`SELECT COUNT(*) AS n FROM permission`)[0]?.n ?? 0;
    expect(roleCount2).toBe(roleCount);
    expect(permCount2).toBe(permCount);
  });

  it('handles multiple orgs — per-org basics are duplicated, global roles shared', async () => {
    const db = createTestDb();
    await seedDefaultOrg(db);
    // Insert a second org row (seedDefaultOrg only creates org_main).
    db.run(sql`
      INSERT INTO org (id, name, created, updated)
      VALUES ('org_two', 'Org Two', ${new Date().toISOString()}, ${new Date().toISOString()})
    `);
    await seedRbacForOrg(db, 'org_main');
    await seedRbacForOrg(db, 'org_two');
    const roleRepo = new RoleRepository(db);
    const orgOnePage = await roleRepo.list({ orgId: 'org_main', limit: 500 });
    const orgTwoPage = await roleRepo.list({ orgId: 'org_two', limit: 500 });
    // Each org has basic:viewer/editor/admin (3 roles).
    expect(orgOnePage.total).toBe(3);
    expect(orgTwoPage.total).toBe(3);
    // Fixed roles still counted once globally.
    const global = await roleRepo.list({ orgId: '', limit: 500 });
    // 1 server_admin + every fixed role.
    expect(global.total).toBe(1 + FIXED_ROLE_DEFINITIONS.length);
  });
});
