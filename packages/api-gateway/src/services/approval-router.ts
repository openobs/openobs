/**
 * ApprovalRouter — finds the users in an org whose `approvals:approve` grant
 * covers a given approval row's scope.
 *
 * This is the routing primitive consumed by NotificationConsumer when an
 * `approval.created` event lands. The candidate scopes are built via the
 * shared `approvalRowScopes()` helper plus `approvals:*` (because we're
 * matching against permission rows, not gating one user's request — wildcard
 * holders are legitimate recipients here).
 *
 * Resolution path (mirrors AccessControlService.getUserPermissions but
 * inverted: from permissions to users):
 *
 *   1. permissions.listByAction('approvals:approve') → all `approve` perms.
 *   2. Filter to those whose `scope` is covered by ANY candidate scope.
 *      "Covered by" uses scopeCovers(parent=row-scope, child=perm-scope) —
 *      a row-scope of `approvals:connector:prod-eks` matches a permission
 *      with the same scope, OR a permission scoped narrower (uid). We also
 *      treat `approvals:*` as a parent that matches any row.
 *   3. Collect roleIds → find users via:
 *        - builtin_role mapping in this org (Viewer/Editor/Admin → users
 *          with that role on org_user)
 *        - user_role direct assignment scoped to this org (or global)
 *        - team_role assignment + team_members in this org
 *   4. Return deduped user IDs.
 *
 * Fail-closed: a user MUST NOT be returned for a row their grants do not
 * cover, even if they hold OTHER grants in OTHER orgs. Org-isolation comes
 * from filtering user_role/team_role/builtin_role/team_members by orgId. See
 * approvals-multi-team-scope §3.4 / R1.
 */

import type {
  IPermissionRepository,
  IRoleRepository,
  IUserRoleRepository,
  ITeamRoleRepository,
  ITeamMemberRepository,
  IOrgUserRepository,
  Permission,
} from '@agentic-obs/common';
import { ACTIONS, scopeCovers } from '@agentic-obs/common';
import { approvalRowScopes } from '@agentic-obs/common';

export interface ApprovalRouterDeps {
  permissions: IPermissionRepository;
  roles: IRoleRepository;
  userRoles: IUserRoleRepository;
  teamRoles: ITeamRoleRepository;
  teamMembers: ITeamMemberRepository;
  orgUsers: IOrgUserRepository;
}

export interface ApprovalRow {
  id: string;
  opsConnectorId?: string | null;
  targetNamespace?: string | null;
  requesterTeamId?: string | null;
}

/**
 * Build the candidate row scopes — the set of scope strings that *describe*
 * this row. A user is a recipient if their `approvals:approve` permission
 * covers ANY of these.
 *
 * Note: NEITHER includes `approvals:*` here — that's a *permission* shape,
 * not a row-shape. A user holding `approvals:*` is matched by coverage
 * against e.g. `approvals:uid:<id>` (since `scopeCovers('approvals:*',
 * 'approvals:uid:<id>')` is true). Adding `approvals:*` to the row scopes
 * would over-match narrow grants like `approvals:connector:dev-eks` to
 * unrelated prod rows — the fail-closed bug
 * approvals-multi-team-scope §3.4 / R1 explicitly forbids.
 */
export function buildCandidateScopes(row: ApprovalRow): string[] {
  return approvalRowScopes(row);
}

/**
 * True iff a permission scoped to `permScope` is sufficient to act on a row
 * whose candidate scopes are `candidateScopes`.
 *
 * Semantics: `scopeCovers(parent=permission, child=row-scope)`. A permission
 * `approvals:*` covers row scope `approvals:connector:prod-eks` (wildcard
 * parent ⊇ narrower child). A permission `approvals:connector:prod-eks`
 * covers row scope `approvals:uid:ap_1` ONLY if uid is one of the candidate
 * row scopes that the permission also covers — checked here by iterating
 * row scopes and asking whether the permission covers any of them.
 *
 * Critical: a permission `approvals:connector:dev-eks` MUST NOT match a
 * prod-eks row's candidate set. The fail-closed invariant
 * (approvals-multi-team-scope §3.4 / R1) requires this asymmetry — the
 * row's scopes are the targets; the permission is the gate.
 */
function permScopeMatchesRow(permScope: string, candidateScopes: string[]): boolean {
  for (const candidate of candidateScopes) {
    if (scopeCovers(permScope, candidate)) return true;
  }
  return false;
}

export class ApprovalRouter {
  constructor(private readonly deps: ApprovalRouterDeps) {}

  /**
   * Return the deduped set of user IDs in `orgId` that hold an
   * `approvals:approve` grant whose scope is covered by any candidate
   * scope built from `row`.
   *
   * Returns the set in deterministic insertion order (helpful for tests).
   */
  async findApprovers(orgId: string, row: ApprovalRow): Promise<string[]> {
    const candidates = buildCandidateScopes(row);

    // 1. All permissions for action='approvals:approve'.
    const allPerms = await this.deps.permissions.listByAction(ACTIONS.ApprovalsApprove);

    // 2. Filter to those whose scope is covered by the row's candidates.
    const matching: Permission[] = allPerms.filter((p) =>
      permScopeMatchesRow(p.scope, candidates),
    );
    if (matching.length === 0) return [];

    const matchingRoleIds = new Set(matching.map((p) => p.roleId));

    // 3a. user_role direct assignment, scoped to this org or global ('').
    const userIds = new Set<string>();
    for (const roleId of matchingRoleIds) {
      const rows = await this.deps.userRoles.listByRole(roleId);
      for (const r of rows) {
        if (r.orgId === orgId || r.orgId === '') userIds.add(r.userId);
      }
    }

    // 3b. team_role + team_member, scoped to this org.
    for (const roleId of matchingRoleIds) {
      const rows = await this.deps.teamRoles.listByRole(roleId);
      const teamIds = rows.filter((r) => r.orgId === orgId || r.orgId === '').map((r) => r.teamId);
      for (const teamId of teamIds) {
        const members = await this.deps.teamMembers.listByTeam(teamId);
        for (const m of members) userIds.add(m.userId);
      }
    }

    // 3c. builtin_role mapping — users in this org whose org-role is bound
    //     to one of the matching roleIds.
    const builtinRoles = await this.deps.roles.listBuiltinRoles(orgId);
    const builtinByRoleName = new Map<string, Set<string>>(); // role name -> roleIds
    for (const m of builtinRoles) {
      if (!builtinByRoleName.has(m.role)) builtinByRoleName.set(m.role, new Set());
      builtinByRoleName.get(m.role)!.add(m.roleId);
    }
    const matchingBuiltinRoleNames = new Set<string>();
    for (const [roleName, roleIds] of builtinByRoleName) {
      for (const id of roleIds) {
        if (matchingRoleIds.has(id)) {
          matchingBuiltinRoleNames.add(roleName);
          break;
        }
      }
    }
    if (matchingBuiltinRoleNames.size > 0) {
      // Fan out across all members of the org; keep those whose org_user.role
      // matches one of the matching builtin role names.
      const page = await this.deps.orgUsers.listUsersByOrg(orgId, { limit: 10_000 });
      for (const u of page.items) {
        if (matchingBuiltinRoleNames.has(u.role)) userIds.add(u.userId);
      }
    }

    return [...userIds];
  }
}
