import { describe, it, expect, beforeEach } from 'vitest';
import {
  createTestDb,
  seedDefaultOrg,
  seedRbacForOrg,
  RoleRepository,
  PermissionRepository,
  UserRoleRepository,
  TeamRoleRepository,
  TeamRepository,
  UserRepository,
} from '@agentic-obs/data-layer';
import type { SqliteClient } from '@agentic-obs/data-layer';
import type { Team, User } from '@agentic-obs/common';
import { RoleService, RoleServiceError } from './role-service.js';

interface Harness {
  db: SqliteClient;
  service: RoleService;
  roles: RoleRepository;
  permissions: PermissionRepository;
  userRoles: UserRoleRepository;
  teamRoles: TeamRoleRepository;
  teams: TeamRepository;
  users: UserRepository;
  seedTeam: (name?: string) => Promise<Team>;
  seedUser: (login?: string) => Promise<User>;
}

async function setup(): Promise<Harness> {
  const db = createTestDb();
  await seedDefaultOrg(db);
  await seedRbacForOrg(db, 'org_main');
  const roles = new RoleRepository(db);
  const permissions = new PermissionRepository(db);
  const userRoles = new UserRoleRepository(db);
  const teamRoles = new TeamRoleRepository(db);
  const teams = new TeamRepository(db);
  const users = new UserRepository(db);
  const service = new RoleService(roles, permissions, userRoles, teamRoles);
  let tCounter = 0;
  let uCounter = 0;
  const seedTeam = async (name?: string): Promise<Team> => {
    tCounter += 1;
    return teams.create({ orgId: 'org_main', name: name ?? `team_${tCounter}` });
  };
  const seedUser = async (login?: string): Promise<User> => {
    uCounter += 1;
    const l = login ?? `user_${uCounter}`;
    return users.create({
      login: l,
      email: `${l}@test.local`,
      name: l,
      orgId: 'org_main',
    });
  };
  return {
    db,
    service,
    roles,
    permissions,
    userRoles,
    teamRoles,
    teams,
    users,
    seedTeam,
    seedUser,
  };
}

describe('RoleService — create', () => {
  let h: Harness;
  beforeEach(async () => {
    h = await setup();
  });

  it('creates a custom role with permissions', async () => {
    const res = await h.service.createRole({
      orgId: 'org_main',
      name: 'custom:my-role',
      displayName: 'My Role',
      permissions: [{ action: 'dashboards:read', scope: 'dashboards:*' }],
    });
    expect(res.role.name).toBe('custom:my-role');
    expect(res.permissions.length).toBe(1);
    expect(res.permissions[0]?.action).toBe('dashboards:read');
  });

  it('rejects reserved basic: prefix', async () => {
    await expect(
      h.service.createRole({
        orgId: 'org_main',
        name: 'basic:my-role',
        permissions: [],
      }),
    ).rejects.toThrow(RoleServiceError);
  });

  it('rejects reserved fixed: prefix', async () => {
    await expect(
      h.service.createRole({
        orgId: 'org_main',
        name: 'fixed:my-role',
        permissions: [],
      }),
    ).rejects.toThrow(RoleServiceError);
  });

  it('rejects duplicate uid', async () => {
    await h.service.createRole({
      orgId: 'org_main',
      name: 'custom:dup',
      uid: 'my_dup',
      permissions: [],
    });
    await expect(
      h.service.createRole({
        orgId: 'org_main',
        name: 'custom:other-name',
        uid: 'my_dup',
        permissions: [],
      }),
    ).rejects.toThrow(/already exists/);
  });

  it('rejects invalid action format', async () => {
    await expect(
      h.service.createRole({
        orgId: 'org_main',
        name: 'custom:bad',
        permissions: [{ action: 'no-colon-action' }],
      }),
    ).rejects.toThrow(/kind:verb/);
  });
});

describe('RoleService — update', () => {
  let h: Harness;
  beforeEach(async () => {
    h = await setup();
  });

  it('updates a custom role with version match', async () => {
    const created = await h.service.createRole({
      orgId: 'org_main',
      name: 'custom:upd',
      permissions: [{ action: 'dashboards:read', scope: 'dashboards:*' }],
    });
    const updated = await h.service.updateRole({
      orgId: 'org_main',
      roleUid: created.role.uid,
      version: created.role.version,
      displayName: 'New Display',
      permissions: [{ action: 'folders:read', scope: 'folders:*' }],
    });
    expect(updated.role.displayName).toBe('New Display');
    expect(updated.permissions.length).toBe(1);
    expect(updated.permissions[0]?.action).toBe('folders:read');
  });

  it('rejects version mismatch with 409', async () => {
    const created = await h.service.createRole({
      orgId: 'org_main',
      name: 'custom:verlock',
      permissions: [],
    });
    try {
      await h.service.updateRole({
        orgId: 'org_main',
        roleUid: created.role.uid,
        version: 999,
      });
      expect.fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(RoleServiceError);
      expect((err as RoleServiceError).statusCode).toBe(409);
      expect((err as RoleServiceError).message).toMatch(/version mismatch/);
    }
  });

  it('refuses to update built-in basic:* roles', async () => {
    await expect(
      h.service.updateRole({
        orgId: 'org_main',
        roleUid: 'basic_viewer',
        version: 0,
      }),
    ).rejects.toThrow(/read-only/);
  });

  it('refuses to update fixed:* roles', async () => {
    await expect(
      h.service.updateRole({
        orgId: 'org_main',
        roleUid: 'fixed_dashboards_reader',
        version: 0,
      }),
    ).rejects.toThrow(/read-only/);
  });
});

describe('RoleService — delete', () => {
  let h: Harness;
  beforeEach(async () => {
    h = await setup();
  });

  it('deletes a custom role', async () => {
    const created = await h.service.createRole({
      orgId: 'org_main',
      name: 'custom:del',
      permissions: [],
    });
    const ok = await h.service.deleteRole('org_main', created.role.uid);
    expect(ok).toBe(true);
    expect(await h.service.getRole('org_main', created.role.uid)).toBeNull();
  });

  it('refuses to delete basic roles', async () => {
    await expect(h.service.deleteRole('org_main', 'basic_viewer')).rejects.toThrow(
      /read-only/,
    );
  });

  it('refuses to delete fixed roles', async () => {
    await expect(
      h.service.deleteRole('org_main', 'fixed_dashboards_reader'),
    ).rejects.toThrow(/read-only/);
  });

  it('returns false when role does not exist', async () => {
    expect(await h.service.deleteRole('org_main', 'unknown_uid')).toBe(false);
  });
});

describe('RoleService — user assignments', () => {
  let h: Harness;
  beforeEach(async () => {
    h = await setup();
  });

  it('assigns and unassigns a custom role to a user', async () => {
    const user = await h.seedUser();
    const role = await h.service.createRole({
      orgId: 'org_main',
      name: 'custom:assignable',
      permissions: [],
    });
    await h.service.assignRoleToUser('org_main', user.id, role.role.uid);
    const roles = await h.service.listUserRoles('org_main', user.id);
    expect(roles.map((r) => r.uid)).toContain(role.role.uid);

    const removed = await h.service.unassignRoleFromUser(
      'org_main',
      user.id,
      role.role.uid,
    );
    expect(removed).toBe(true);
  });

  it('assignment is idempotent', async () => {
    const user = await h.seedUser();
    const role = await h.service.createRole({
      orgId: 'org_main',
      name: 'custom:idem',
      permissions: [],
    });
    await h.service.assignRoleToUser('org_main', user.id, role.role.uid);
    await h.service.assignRoleToUser('org_main', user.id, role.role.uid);
    const roles = await h.service.listUserRoles('org_main', user.id);
    expect(roles.filter((r) => r.uid === role.role.uid)).toHaveLength(1);
  });

  it('setUserRoles replaces the assignment set', async () => {
    const user = await h.seedUser();
    const a = await h.service.createRole({
      orgId: 'org_main',
      name: 'custom:a',
      permissions: [],
    });
    const b = await h.service.createRole({
      orgId: 'org_main',
      name: 'custom:b',
      permissions: [],
    });
    await h.service.setUserRoles('org_main', user.id, [a.role.uid]);
    await h.service.setUserRoles('org_main', user.id, [b.role.uid]);
    const current = await h.service.listUserRoles('org_main', user.id);
    expect(current.map((r) => r.uid)).toEqual([b.role.uid]);
  });
});

describe('RoleService — team assignments', () => {
  let h: Harness;
  beforeEach(async () => {
    h = await setup();
  });

  it('assigns a role to a team', async () => {
    const team = await h.seedTeam('SRE');
    const role = await h.service.createRole({
      orgId: 'org_main',
      name: 'custom:team-role',
      permissions: [],
    });
    await h.service.assignRoleToTeam('org_main', team.id, role.role.uid);
    const roles = await h.service.listTeamRoles('org_main', team.id);
    expect(roles.map((r) => r.uid)).toContain(role.role.uid);
  });

  it('setTeamRoles replaces the assignment set', async () => {
    const team = await h.seedTeam('ReplaceSet');
    const a = await h.service.createRole({
      orgId: 'org_main',
      name: 'custom:ta',
      permissions: [],
    });
    const b = await h.service.createRole({
      orgId: 'org_main',
      name: 'custom:tb',
      permissions: [],
    });
    await h.service.setTeamRoles('org_main', team.id, [a.role.uid, b.role.uid]);
    await h.service.setTeamRoles('org_main', team.id, [a.role.uid]);
    const current = await h.service.listTeamRoles('org_main', team.id);
    expect(current.map((r) => r.uid)).toEqual([a.role.uid]);
  });
});

describe('RoleService — list + get', () => {
  let h: Harness;
  beforeEach(async () => {
    h = await setup();
  });

  it('list includes basic + fixed roles (global) plus any org-scoped customs', async () => {
    await h.service.createRole({
      orgId: 'org_main',
      name: 'custom:list-test',
      permissions: [],
    });
    const roles = await h.service.listRoles({ orgId: 'org_main' });
    const names = roles.map((r) => r.role.name);
    expect(names).toContain('custom:list-test');
    expect(names).toContain('fixed:dashboards:reader');
    expect(names).toContain('basic:viewer');
  });

  it('getRole returns role + permissions or null', async () => {
    const r = await h.service.getRole('org_main', 'basic_viewer');
    expect(r).not.toBeNull();
    expect(r!.permissions.length).toBeGreaterThan(0);
    expect(await h.service.getRole('org_main', 'unknown')).toBeNull();
  });
});
