import { describe, it, expect } from 'vitest';
import {
  createTestDb,
  OrgRepository,
  OrgUserRepository,
  UserRepository,
} from '@agentic-obs/data-layer';
import { seedAdminIfNeeded } from './seed-admin.js';
import { verifyPassword } from './local-provider.js';

function repos(db: ReturnType<typeof createTestDb>) {
  return {
    users: new UserRepository(db),
    orgs: new OrgRepository(db),
    orgUsers: new OrgUserRepository(db),
  };
}

describe('seedAdminIfNeeded', () => {
  it('creates admin when no user exists and env vars are set', async () => {
    const db = createTestDb();
    const deps = repos(db);
    const id = await seedAdminIfNeeded(
      deps,
      {},
      {
        SEED_ADMIN_EMAIL: 'admin@openobs.local',
        SEED_ADMIN_PASSWORD: 'correcthorsebatterystaple',
      } as NodeJS.ProcessEnv,
    );
    expect(id).not.toBeNull();
    const user = await deps.users.findByLogin('admin');
    expect(user?.isAdmin).toBe(true);
    expect(user?.emailVerified).toBe(true);
    expect(user?.password).toBeTruthy();
    expect(await verifyPassword('correcthorsebatterystaple', user!.password!)).toBe(true);
    const membership = await deps.orgUsers.findMembership('org_main', user!.id);
    expect(membership?.role).toBe('Admin');
  });

  it('is a no-op when any user exists', async () => {
    const db = createTestDb();
    const deps = repos(db);
    await deps.users.create({
      email: 'existing@x.com',
      login: 'existing',
      name: 'X',
      orgId: 'org_main',
    });
    const id = await seedAdminIfNeeded(
      deps,
      {},
      {
        SEED_ADMIN_EMAIL: 'admin@openobs.local',
        SEED_ADMIN_PASSWORD: 'correcthorsebatterystaple',
      } as NodeJS.ProcessEnv,
    );
    expect(id).toBeNull();
    expect(await deps.users.findByLogin('admin')).toBeNull();
  });

  it('is a no-op when env vars missing', async () => {
    const db = createTestDb();
    const deps = repos(db);
    const id = await seedAdminIfNeeded(deps, {}, {} as NodeJS.ProcessEnv);
    expect(id).toBeNull();
  });

  it('rejects passwords shorter than min length', async () => {
    const db = createTestDb();
    const deps = repos(db);
    const id = await seedAdminIfNeeded(
      deps,
      {},
      {
        SEED_ADMIN_EMAIL: 'a@x.com',
        SEED_ADMIN_PASSWORD: 'short',
      } as NodeJS.ProcessEnv,
    );
    expect(id).toBeNull();
    expect(await deps.users.findByLogin('admin')).toBeNull();
  });

  it('uses explicit opts over env', async () => {
    const db = createTestDb();
    const deps = repos(db);
    const id = await seedAdminIfNeeded(deps, {
      email: 'opts@x.com',
      password: 'correcthorsebatterystaple',
      login: 'optsadmin',
    });
    expect(id).not.toBeNull();
    expect(await deps.users.findByLogin('optsadmin')).not.toBeNull();
  });
});
