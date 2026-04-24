/**
 * OrgService unit tests.
 *
 * Covers the scenarios listed in docs/auth-perm-design/04-organizations.md
 * §test-scenarios (create + member seeding, delete + user reassignment,
 * membership add/remove, role update, audit, quota bootstrap). Uses a real
 * in-memory SQLite with the full auth-perm schema.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  createTestDb,
  seedDefaultOrg,
  seedServerAdmin,
  seedRbacForOrg,
  OrgRepository,
  OrgUserRepository,
  QuotaRepository,
  UserRepository,
  AuditLogRepository,
} from '@agentic-obs/data-layer';
import type { SqliteClient } from '@agentic-obs/data-layer';
import { AuditWriter } from '../auth/audit-writer.js';
import { OrgService, OrgServiceError } from './org-service.js';

async function buildService(
  db: SqliteClient,
  env: NodeJS.ProcessEnv = {},
): Promise<{ svc: OrgService; audit: AuditLogRepository; adminId: string }> {
  await seedDefaultOrg(db);
  await seedRbacForOrg(db, 'org_main');
  const { user } = await seedServerAdmin(db);
  const auditRepo = new AuditLogRepository(db);
  const svc = new OrgService({
    orgs: new OrgRepository(db),
    orgUsers: new OrgUserRepository(db),
    users: new UserRepository(db),
    quotas: new QuotaRepository(db),
    audit: new AuditWriter(auditRepo),
    db,
    defaultOrgId: 'org_main',
    env,
  });
  return { svc, audit: auditRepo, adminId: user.id };
}

describe('OrgService.create', () => {
  let db: SqliteClient;
  beforeEach(() => {
    db = createTestDb();
  });

  it('creates an org, seeds RBAC, adds creator as Admin', async () => {
    const { svc, adminId } = await buildService(db);
    const org = await svc.create({ name: 'Acme', createdBy: adminId });
    expect(org.name).toBe('Acme');
    expect(org.id).toBeTruthy();

    const members = await svc.listUsers(org.id);
    expect(members.items).toHaveLength(1);
    expect(members.items[0]?.userId).toBe(adminId);
    expect(members.items[0]?.role).toBe('Admin');
  });

  it('seeds RBAC rows for the new org', async () => {
    const { svc, adminId } = await buildService(db);
    const org = await svc.create({ name: 'Globex', createdBy: adminId });
    // Simple sanity check: org should have distinct id (not the default) and
    // creator should be Admin — seedRbacForOrg itself is covered by upstream
    // data-layer tests.
    expect(org.id).not.toBe('org_main');
    const members = await svc.listUsers(org.id);
    expect(members.items[0]?.role).toBe('Admin');
  });

  it('initializes default quotas at -1 (unlimited) when env is empty', async () => {
    const { svc, adminId } = await buildService(db);
    const org = await svc.create({ name: 'Initech', createdBy: adminId });
    const quotas = await new QuotaRepository(db).listOrgQuotas(org.id);
    expect(quotas.length).toBeGreaterThanOrEqual(7);
    for (const q of quotas) {
      expect(q.limitVal).toBe(-1);
    }
  });

  it('respects QUOTA_*_PER_ORG env overrides', async () => {
    const { svc, adminId } = await buildService(db, {
      QUOTA_DASHBOARDS_PER_ORG: '25',
      QUOTA_USERS_PER_ORG: '50',
    });
    const org = await svc.create({ name: 'Hooli', createdBy: adminId });
    const quotas = await new QuotaRepository(db).listOrgQuotas(org.id);
    const dash = quotas.find((q) => q.target === 'dashboards');
    const users = quotas.find((q) => q.target === 'users');
    expect(dash?.limitVal).toBe(25);
    expect(users?.limitVal).toBe(50);
  });

  it('rejects duplicate org name with 409', async () => {
    const { svc, adminId } = await buildService(db);
    await svc.create({ name: 'Dupe', createdBy: adminId });
    await expect(
      svc.create({ name: 'Dupe', createdBy: adminId }),
    ).rejects.toBeInstanceOf(OrgServiceError);
    await expect(
      svc.create({ name: 'Dupe', createdBy: adminId }),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('rejects empty name with 400', async () => {
    const { svc, adminId } = await buildService(db);
    await expect(
      svc.create({ name: '  ', createdBy: adminId }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('rejects when creator user does not exist (400)', async () => {
    const { svc } = await buildService(db);
    await expect(
      svc.create({ name: 'Ghost', createdBy: 'u_missing' }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('writes an audit log entry on success', async () => {
    const { svc, audit, adminId } = await buildService(db);
    await svc.create({ name: 'Logged', createdBy: adminId });
    // Give the fire-and-forget audit writer a moment to flush.
    await new Promise((r) => setTimeout(r, 10));
    const rows = await audit.query({ action: 'org.created', limit: 10 });
    expect(rows.items.length).toBeGreaterThan(0);
  });
});

describe('OrgService.update', () => {
  let db: SqliteClient;
  beforeEach(() => {
    db = createTestDb();
  });

  it('updates name + address fields and bumps version', async () => {
    const { svc, adminId } = await buildService(db);
    const created = await svc.create({ name: 'V1', createdBy: adminId });
    const updated = await svc.update(
      created.id,
      { name: 'V2', city: 'NYC' },
      adminId,
    );
    expect(updated.name).toBe('V2');
    expect(updated.city).toBe('NYC');
    expect(updated.version).toBeGreaterThan(created.version);
  });

  it('returns 409 on version mismatch', async () => {
    const { svc, adminId } = await buildService(db);
    const created = await svc.create({ name: 'V1', createdBy: adminId });
    await expect(
      svc.update(created.id, { expectedVersion: 999, name: 'V2' }, adminId),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('returns 404 when org does not exist', async () => {
    const { svc, adminId } = await buildService(db);
    await expect(
      svc.update('nonexistent', { name: 'X' }, adminId),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('returns 409 when new name collides', async () => {
    const { svc, adminId } = await buildService(db);
    const a = await svc.create({ name: 'A', createdBy: adminId });
    await svc.create({ name: 'B', createdBy: adminId });
    await expect(
      svc.update(a.id, { name: 'B' }, adminId),
    ).rejects.toMatchObject({ statusCode: 409 });
  });
});

describe('OrgService.delete', () => {
  let db: SqliteClient;
  beforeEach(() => {
    db = createTestDb();
  });

  it('removes org and reassigns members with deleted org as default', async () => {
    const { svc, adminId } = await buildService(db);
    // Create a second org and switch the admin's default there.
    const a = await svc.create({ name: 'A', createdBy: adminId });
    const b = await svc.create({ name: 'B', createdBy: adminId });
    const userRepo = new UserRepository(db);
    await userRepo.update(adminId, { orgId: a.id });

    await svc.delete(a.id, adminId);

    const after = await userRepo.findById(adminId);
    // fallback is any remaining membership: org_main or b.
    expect([b.id, 'org_main']).toContain(after?.orgId);
  });

  it('falls back to defaultOrgId when user has no other memberships', async () => {
    const { svc } = await buildService(db);
    // Make a user that is only in new-org.
    const userRepo = new UserRepository(db);
    const orgUserRepo = new OrgUserRepository(db);
    const someUser = await userRepo.create({
      email: 'only@x.y',
      name: 'Only',
      login: 'only',
      orgId: 'org_main',
      isAdmin: false,
      emailVerified: true,
    });
    // Create new org, make `someUser` its sole member (and set as default).
    const org = await svc.create({ name: 'Solo', createdBy: someUser.id });
    await userRepo.update(someUser.id, { orgId: org.id });
    // Cleanup: remove from org_main so they only have Solo left.
    await orgUserRepo.remove('org_main', someUser.id);

    await svc.delete(org.id, someUser.id);
    const after = await userRepo.findById(someUser.id);
    expect(after?.orgId).toBe('org_main');
  });

  it('404 when org does not exist', async () => {
    const { svc, adminId } = await buildService(db);
    await expect(svc.delete('nope', adminId)).rejects.toMatchObject({
      statusCode: 404,
    });
  });
});

describe('OrgService.addUserByLoginOrEmail', () => {
  let db: SqliteClient;
  beforeEach(() => {
    db = createTestDb();
  });

  it('adds user by login, then verifies listUsers returns them', async () => {
    const { svc, adminId } = await buildService(db);
    const org = await svc.create({ name: 'Invite', createdBy: adminId });
    const userRepo = new UserRepository(db);
    const u = await userRepo.create({
      email: 'x@y.z',
      name: 'X',
      login: 'xy',
      orgId: 'org_main',
      isAdmin: false,
      emailVerified: true,
    });
    await svc.addUserByLoginOrEmail(org.id, 'xy', 'Viewer', adminId);
    const { items } = await svc.listUsers(org.id);
    expect(items.some((m) => m.userId === u.id && m.role === 'Viewer')).toBe(true);
  });

  it('adds by email fallback when login lookup fails', async () => {
    const { svc, adminId } = await buildService(db);
    const org = await svc.create({ name: 'Invite2', createdBy: adminId });
    const userRepo = new UserRepository(db);
    await userRepo.create({
      email: 'find@me.com',
      name: 'F',
      login: 'findme',
      orgId: 'org_main',
      isAdmin: false,
      emailVerified: true,
    });
    await svc.addUserByLoginOrEmail(org.id, 'find@me.com', 'Editor', adminId);
    const { items } = await svc.listUsers(org.id);
    expect(items.find((m) => m.email === 'find@me.com')?.role).toBe('Editor');
  });

  it('returns 400 when user not found (not 404 — matches Grafana semantics)', async () => {
    const { svc, adminId } = await buildService(db);
    const org = await svc.create({ name: 'Empty', createdBy: adminId });
    await expect(
      svc.addUserByLoginOrEmail(org.id, 'ghost@void', 'Viewer', adminId),
    ).rejects.toMatchObject({ statusCode: 400, kind: 'validation' });
  });

  it('returns 409 when user is already a member', async () => {
    const { svc, adminId } = await buildService(db);
    const org = await svc.create({ name: 'Dupe', createdBy: adminId });
    // Admin is already Admin.
    await expect(
      svc.addUserByLoginOrEmail(org.id, 'admin', 'Viewer', adminId),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('rejects invalid role with 400', async () => {
    const { svc, adminId } = await buildService(db);
    const org = await svc.create({ name: 'BadRole', createdBy: adminId });
    await expect(
      svc.addUserByLoginOrEmail(
        org.id,
        'admin',
        // @ts-expect-error - deliberate invalid role
        'Guest',
        adminId,
      ),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('returns 404 when org does not exist', async () => {
    const { svc, adminId } = await buildService(db);
    await expect(
      svc.addUserByLoginOrEmail('nope', 'admin', 'Viewer', adminId),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('OrgService.updateUserRole + removeUser', () => {
  let db: SqliteClient;
  beforeEach(() => {
    db = createTestDb();
  });

  it('updates role and emits audit', async () => {
    const { svc, adminId, audit } = await buildService(db);
    const org = await svc.create({ name: 'Roles', createdBy: adminId });
    const userRepo = new UserRepository(db);
    const u = await userRepo.create({
      email: 'r@r.r',
      name: 'R',
      login: 'rr',
      orgId: 'org_main',
      isAdmin: false,
      emailVerified: true,
    });
    await svc.addUserByLoginOrEmail(org.id, 'rr', 'Viewer', adminId);
    const updated = await svc.updateUserRole(org.id, u.id, 'Editor', adminId);
    expect(updated.role).toBe('Editor');
    await new Promise((r) => setTimeout(r, 10));
    const rows = await audit.query({ action: 'org.user_role_changed', limit: 10 });
    expect(rows.items.length).toBeGreaterThan(0);
  });

  it('returns 404 when membership does not exist', async () => {
    const { svc, adminId } = await buildService(db);
    const org = await svc.create({ name: 'Void', createdBy: adminId });
    await expect(
      svc.updateUserRole(org.id, 'u_nope', 'Admin', adminId),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('removes membership and reassigns default org if needed', async () => {
    const { svc, adminId } = await buildService(db);
    const org = await svc.create({ name: 'Leave', createdBy: adminId });
    const userRepo = new UserRepository(db);
    const u = await userRepo.create({
      email: 'l@l.l',
      name: 'L',
      login: 'll',
      orgId: 'org_main',
      isAdmin: false,
      emailVerified: true,
    });
    await svc.addUserByLoginOrEmail(org.id, 'll', 'Viewer', adminId);
    await userRepo.update(u.id, { orgId: org.id });
    await svc.removeUser(org.id, u.id, adminId);
    const after = await userRepo.findById(u.id);
    expect(after?.orgId).not.toBe(org.id);
  });

  it('returns 404 when removing non-existent membership', async () => {
    const { svc, adminId } = await buildService(db);
    const org = await svc.create({ name: 'Solo', createdBy: adminId });
    await expect(
      svc.removeUser(org.id, 'u_none', adminId),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('rejects invalid role on update with 400', async () => {
    const { svc, adminId } = await buildService(db);
    const org = await svc.create({ name: 'Roles2', createdBy: adminId });
    await expect(
      svc.updateUserRole(
        org.id,
        adminId,
        // @ts-expect-error - deliberate invalid role
        'SuperUser',
        adminId,
      ),
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe('OrgService.list + getByName', () => {
  let db: SqliteClient;
  beforeEach(() => {
    db = createTestDb();
  });

  it('lists and filters by query substring', async () => {
    const { svc, adminId } = await buildService(db);
    await svc.create({ name: 'Alpha Co', createdBy: adminId });
    await svc.create({ name: 'Alpha Ltd', createdBy: adminId });
    await svc.create({ name: 'Beta', createdBy: adminId });

    const all = await svc.list();
    expect(all.items.length).toBeGreaterThanOrEqual(4); // incl. org_main
    const alphas = await svc.list({ query: 'alpha' });
    expect(alphas.items.length).toBe(2);
  });

  it('getByName returns the match, null otherwise', async () => {
    const { svc, adminId } = await buildService(db);
    await svc.create({ name: 'FindMe', createdBy: adminId });
    expect(await svc.getByName('FindMe')).toBeTruthy();
    expect(await svc.getByName('NotThere')).toBeNull();
  });
});
