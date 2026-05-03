import { describe, it, expect } from 'vitest';
import type {
  Permission,
  UserRole,
  TeamRole,
  TeamMember,
  BuiltinRole,
  IPermissionRepository,
  IRoleRepository,
  IUserRoleRepository,
  ITeamRoleRepository,
  ITeamMemberRepository,
  IOrgUserRepository,
} from '@agentic-obs/common';
import { ApprovalRouter, buildCandidateScopes } from './approval-router.js';

// Tiny shape-mocked repos. Only the methods ApprovalRouter actually calls are
// implemented; everything else throws if accidentally invoked.
function notImpl(): never { throw new Error('not implemented'); }

function permRepo(perms: Array<{ id?: string; roleId: string; action: string; scope: string }>): IPermissionRepository {
  return {
    listByAction: async (action) =>
      perms.filter((p) => p.action === action).map((p, i) => ({
        id: p.id ?? `p_${i}`,
        roleId: p.roleId,
        action: p.action,
        scope: p.scope,
        kind: p.scope.split(':')[0] ?? '*',
        attribute: p.scope.split(':')[1] ?? '*',
        identifier: p.scope.split(':').slice(2).join(':') || '*',
        created: '',
        updated: '',
      })) as Permission[],
    listByRole: async () => notImpl(),
    listByRoles: async () => notImpl(),
    create: async () => notImpl(),
    createMany: async () => notImpl(),
    findById: async () => notImpl(),
    delete: async () => notImpl(),
    deleteByRole: async () => notImpl(),
  };
}

function roleRepo(builtins: Array<{ role: string; roleId: string; orgId: string }>): IRoleRepository {
  return {
    listBuiltinRoles: async (orgId) => builtins.filter((b) => b.orgId === orgId).map<BuiltinRole>((b) => ({
      id: `br_${b.roleId}_${b.role}`,
      role: b.role,
      roleId: b.roleId,
      orgId: b.orgId,
      created: '',
      updated: '',
    })),
    create: async () => notImpl(),
    findById: async () => notImpl(),
    findByUid: async () => notImpl(),
    findByName: async () => notImpl(),
    list: async () => notImpl(),
    update: async () => notImpl(),
    delete: async () => notImpl(),
    upsertBuiltinRole: async () => notImpl(),
    findBuiltinRole: async () => notImpl(),
    removeBuiltinRole: async () => notImpl(),
  };
}

function userRoleRepo(rows: Array<{ orgId: string; userId: string; roleId: string }>): IUserRoleRepository {
  return {
    listByRole: async (roleId) => rows.filter((r) => r.roleId === roleId).map<UserRole>((r, i) => ({
      id: `ur_${i}`, orgId: r.orgId, userId: r.userId, roleId: r.roleId, created: '',
    })),
    create: async () => notImpl(),
    findById: async () => notImpl(),
    listByUser: async () => notImpl(),
    delete: async () => notImpl(),
    remove: async () => notImpl(),
  };
}

function teamRoleRepo(rows: Array<{ orgId: string; teamId: string; roleId: string }>): ITeamRoleRepository {
  return {
    listByRole: async (roleId) => rows.filter((r) => r.roleId === roleId).map<TeamRole>((r, i) => ({
      id: `tr_${i}`, orgId: r.orgId, teamId: r.teamId, roleId: r.roleId, created: '',
    })),
    create: async () => notImpl(),
    findById: async () => notImpl(),
    listByTeam: async () => notImpl(),
    listByTeams: async () => notImpl(),
    delete: async () => notImpl(),
    remove: async () => notImpl(),
  };
}

function teamMemberRepo(members: Array<{ teamId: string; userId: string }>): ITeamMemberRepository {
  return {
    listByTeam: async (teamId) => members.filter((m) => m.teamId === teamId).map<TeamMember>((m) => ({
      id: `tm_${m.teamId}_${m.userId}`, teamId: m.teamId, userId: m.userId, permission: 0,
    } as TeamMember)),
    listTeamsForUser: async (userId) => members.filter((m) => m.userId === userId).map<TeamMember>((m) => ({
      id: `tm_${m.teamId}_${m.userId}`, teamId: m.teamId, userId: m.userId, permission: 0,
    } as TeamMember)),
    create: async () => notImpl(),
    findById: async () => notImpl(),
    findMembership: async () => notImpl(),
    listByTeamWithProfile: async () => notImpl(),
    updatePermission: async () => notImpl(),
    remove: async () => notImpl(),
    removeAllByUser: async () => notImpl(),
  };
}

function orgUserRepo(rows: Array<{ orgId: string; userId: string; role: string }>): IOrgUserRepository {
  return {
    listUsersByOrg: async (orgId) => ({
      items: rows.filter((r) => r.orgId === orgId).map((r) => ({
        orgId: r.orgId, userId: r.userId, role: r.role,
        email: `${r.userId}@x`, name: r.userId, login: r.userId, isServiceAccount: false,
      } as never)),
      total: rows.length,
      offset: 0,
      limit: 10000,
    }),
    create: async () => notImpl(),
    findById: async () => notImpl(),
    findMembership: async () => notImpl(),
    listOrgsByUser: async () => notImpl(),
    listOrgsByUserWithName: async () => notImpl(),
    updateRole: async () => notImpl(),
    remove: async () => notImpl(),
  };
}

describe('buildCandidateScopes', () => {
  it('includes uid + connector + namespace + team for the row', () => {
    const scopes = buildCandidateScopes({
      id: 'ap_1',
      opsConnectorId: 'prod-eks',
      targetNamespace: 'platform',
      requesterTeamId: 'team_payments',
    });
    expect(scopes).toContain('approvals:uid:ap_1');
    expect(scopes).toContain('approvals:connector:prod-eks');
    expect(scopes).toContain('approvals:namespace:prod-eks:platform');
    expect(scopes).toContain('approvals:team:team_payments');
    // approvals:* is a PERMISSION shape, not a row shape — must not appear here.
    expect(scopes).not.toContain('approvals:*');
  });

  it('omits namespace when targetNamespace is null', () => {
    const scopes = buildCandidateScopes({
      id: 'ap_1', opsConnectorId: 'prod-eks', targetNamespace: null, requesterTeamId: null,
    });
    expect(scopes.some((s) => s.startsWith('approvals:namespace:'))).toBe(false);
  });

  it('null row has only uid', () => {
    const scopes = buildCandidateScopes({ id: 'ap_1' });
    expect(scopes).toEqual(['approvals:uid:ap_1']);
  });
});

describe('ApprovalRouter.findApprovers — single-team / wildcard', () => {
  it('a user with approvals:* on Editor role gets returned for every approval', async () => {
    const router = new ApprovalRouter({
      permissions: permRepo([{ roleId: 'role_editor', action: 'approvals:approve', scope: 'approvals:*' }]),
      roles: roleRepo([{ role: 'Editor', roleId: 'role_editor', orgId: 'org_main' }]),
      userRoles: userRoleRepo([]),
      teamRoles: teamRoleRepo([]),
      teamMembers: teamMemberRepo([]),
      orgUsers: orgUserRepo([
        { orgId: 'org_main', userId: 'u_alice', role: 'Editor' },
        { orgId: 'org_main', userId: 'u_bob', role: 'Viewer' },
      ]),
    });
    const got = await router.findApprovers('org_main', {
      id: 'ap_1', opsConnectorId: 'prod-eks', targetNamespace: 'platform', requesterTeamId: null,
    });
    expect(got).toEqual(['u_alice']);
  });

  it('NULL row routing — only approvals:* holders match', async () => {
    const router = new ApprovalRouter({
      permissions: permRepo([
        { roleId: 'role_editor', action: 'approvals:approve', scope: 'approvals:*' },
        { roleId: 'role_conn', action: 'approvals:approve', scope: 'approvals:connector:prod-eks' },
      ]),
      roles: roleRepo([{ role: 'Editor', roleId: 'role_editor', orgId: 'org_main' }]),
      userRoles: userRoleRepo([{ orgId: 'org_main', userId: 'u_conn', roleId: 'role_conn' }]),
      teamRoles: teamRoleRepo([]),
      teamMembers: teamMemberRepo([]),
      orgUsers: orgUserRepo([{ orgId: 'org_main', userId: 'u_alice', role: 'Editor' }]),
    });
    const got = await router.findApprovers('org_main', { id: 'ap_legacy' }); // all NULL
    expect(got).toContain('u_alice');
    expect(got).not.toContain('u_conn');
  });
});

describe('ApprovalRouter.findApprovers — multi-team narrow grants', () => {
  it('connector-narrow grants only match their connector', async () => {
    const router = new ApprovalRouter({
      permissions: permRepo([
        { roleId: 'role_prod', action: 'approvals:approve', scope: 'approvals:connector:prod-eks' },
        { roleId: 'role_dev', action: 'approvals:approve', scope: 'approvals:connector:dev-eks' },
      ]),
      roles: roleRepo([]),
      userRoles: userRoleRepo([
        { orgId: 'org_main', userId: 'u_prod', roleId: 'role_prod' },
        { orgId: 'org_main', userId: 'u_dev', roleId: 'role_dev' },
      ]),
      teamRoles: teamRoleRepo([]),
      teamMembers: teamMemberRepo([]),
      orgUsers: orgUserRepo([]),
    });
    const got = await router.findApprovers('org_main', {
      id: 'ap_1', opsConnectorId: 'prod-eks', targetNamespace: null, requesterTeamId: null,
    });
    expect(got).toContain('u_prod');
    expect(got).not.toContain('u_dev');
  });

  it('namespace-narrow grants distinguish namespace within one connector', async () => {
    const router = new ApprovalRouter({
      permissions: permRepo([
        { roleId: 'role_pf', action: 'approvals:approve', scope: 'approvals:namespace:prod-eks:platform' },
        { roleId: 'role_ks', action: 'approvals:approve', scope: 'approvals:namespace:prod-eks:kube-system' },
      ]),
      roles: roleRepo([]),
      userRoles: userRoleRepo([
        { orgId: 'org_main', userId: 'u_pf', roleId: 'role_pf' },
        { orgId: 'org_main', userId: 'u_ks', roleId: 'role_ks' },
      ]),
      teamRoles: teamRoleRepo([]),
      teamMembers: teamMemberRepo([]),
      orgUsers: orgUserRepo([]),
    });
    const got = await router.findApprovers('org_main', {
      id: 'ap_1', opsConnectorId: 'prod-eks', targetNamespace: 'platform', requesterTeamId: null,
    });
    expect(got).toEqual(['u_pf']);
  });

  it('FAIL-CLOSED: a user with non-matching narrow grant is NOT notified, even when they hold OTHER approvals grants in OTHER orgs', async () => {
    // u_dev holds approvals:approve on connector:dev-eks in org_main and
    // approvals:* in some other-org. The org isolation must keep them out
    // of org_main's prod-eks routing list.
    const router = new ApprovalRouter({
      permissions: permRepo([
        { roleId: 'role_dev', action: 'approvals:approve', scope: 'approvals:connector:dev-eks' },
        { roleId: 'role_other', action: 'approvals:approve', scope: 'approvals:*' },
      ]),
      roles: roleRepo([]),
      userRoles: userRoleRepo([
        { orgId: 'org_main', userId: 'u_dev', roleId: 'role_dev' },
        // CROSS-ORG grant: must NOT bleed into org_main routing.
        { orgId: 'org_other', userId: 'u_dev', roleId: 'role_other' },
      ]),
      teamRoles: teamRoleRepo([]),
      teamMembers: teamMemberRepo([]),
      orgUsers: orgUserRepo([]),
    });
    const got = await router.findApprovers('org_main', {
      id: 'ap_1', opsConnectorId: 'prod-eks', targetNamespace: null, requesterTeamId: null,
    });
    expect(got).not.toContain('u_dev');
    expect(got).toEqual([]);
  });

  it('team-role + team-member fan-out: matching grant on a team role notifies all its members', async () => {
    const router = new ApprovalRouter({
      permissions: permRepo([
        { roleId: 'role_prod', action: 'approvals:approve', scope: 'approvals:connector:prod-eks' },
      ]),
      roles: roleRepo([]),
      userRoles: userRoleRepo([]),
      teamRoles: teamRoleRepo([{ orgId: 'org_main', teamId: 'team_ops', roleId: 'role_prod' }]),
      teamMembers: teamMemberRepo([
        { teamId: 'team_ops', userId: 'u_a' },
        { teamId: 'team_ops', userId: 'u_b' },
      ]),
      orgUsers: orgUserRepo([]),
    });
    const got = await router.findApprovers('org_main', {
      id: 'ap_1', opsConnectorId: 'prod-eks', targetNamespace: null, requesterTeamId: null,
    });
    expect(new Set(got)).toEqual(new Set(['u_a', 'u_b']));
  });
});
