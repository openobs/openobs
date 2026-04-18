/**
 * AccessControlService — resolves a user's effective permissions in an org and
 * evaluates requested (action, scope) checks against them.
 *
 * Grafana reference (read for semantics only):
 *   pkg/services/accesscontrol/acimpl/service.go
 *   pkg/services/accesscontrol/database/database.go
 *
 * Resolution order (union):
 *   1. Built-in role (org_user.role → basic:<Viewer|Editor|Admin>).
 *   2. Server Admin (basic:server_admin when user.is_admin=1).
 *   3. Custom user_role assignments scoped to the current org (or global).
 *   4. Custom team_role assignments — unioned across every team the user is
 *      a member of in the current org.
 *
 * The result is de-duplicated (action,scope) pairs. The evaluator then
 * walks the list looking for a match.
 *
 * Caching: `getUserPermissions(identity)` is pure per (userId, orgId). The
 * middleware caches the result on the request (`req.auth.permissions`) so
 * subsequent permission checks within the same request don't requery.
 */

import type {
  Identity,
  ResolvedPermission,
  IPermissionRepository,
  IRoleRepository,
  IUserRoleRepository,
  ITeamRoleRepository,
  ITeamMemberRepository,
  IOrgUserRepository,
} from '@agentic-obs/common';
import type { Evaluator } from '@agentic-obs/common';
import type { ResolverRegistry } from '../rbac/resolvers/index.js';

export interface AccessControlDeps {
  permissions: IPermissionRepository;
  roles: IRoleRepository;
  userRoles: IUserRoleRepository;
  teamRoles: ITeamRoleRepository;
  teamMembers: ITeamMemberRepository;
  orgUsers: IOrgUserRepository;
  /** Optional resolver registry — when set, evaluator scopes are expanded
   * through it before checking coverage. */
  resolvers?: (orgId: string) => ResolverRegistry;
}

export class AccessControlService {
  constructor(private readonly deps: AccessControlDeps) {}

  /**
   * Resolve the full flat permission list for `identity`. Does NOT consult
   * `identity.permissions` — caller decides whether to cache.
   */
  async getUserPermissions(identity: Identity): Promise<ResolvedPermission[]> {
    const { userId, orgId, isServerAdmin } = identity;
    const roleIds = new Set<string>();

    // 1 + 2. Built-in role per org + server admin.
    const builtinKey = identity.orgRole; // 'Admin' | 'Editor' | 'Viewer' | 'None'
    if (builtinKey && builtinKey !== 'None') {
      const mappings = await this.deps.roles.listBuiltinRoles(orgId);
      for (const m of mappings) {
        if (m.role === builtinKey) roleIds.add(m.roleId);
      }
    }
    if (isServerAdmin) {
      const globals = await this.deps.roles.listBuiltinRoles('');
      for (const m of globals) {
        if (m.role === 'Server Admin') roleIds.add(m.roleId);
      }
    }

    // 3. user_role (org-scoped + global).
    const userRoleRows = await this.deps.userRoles.listByUser(userId, orgId);
    for (const r of userRoleRows) roleIds.add(r.roleId);

    // 4. team_role — teams the user is in within this org.
    const memberships = await this.deps.teamMembers.listTeamsForUser(
      userId,
      orgId,
    );
    const teamIds = memberships.map((m) => m.teamId);
    if (teamIds.length > 0) {
      const teamRoleRows = await this.deps.teamRoles.listByTeams(
        teamIds,
        orgId,
      );
      for (const r of teamRoleRows) roleIds.add(r.roleId);
    }

    // -- Flatten permissions for the role set --
    if (roleIds.size === 0) return [];
    const perms = await this.deps.permissions.listByRoles([...roleIds]);
    // De-dupe on (action, scope).
    const seen = new Set<string>();
    const out: ResolvedPermission[] = [];
    for (const p of perms) {
      const key = `${p.action}|${p.scope}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ action: p.action, scope: p.scope });
    }
    return out;
  }

  /**
   * Evaluate `evaluator` against `identity`'s resolved permissions. Uses
   * `identity.permissions` when already populated (request-scoped cache) and
   * populates it otherwise.
   */
  async evaluate(identity: Identity, evaluator: Evaluator): Promise<boolean> {
    const permissions = await this.ensurePermissions(identity);

    // Resolve evaluator scopes through the registry (folder cascade etc.).
    // If no registry wired, the evaluator runs against raw scopes.
    let effective = evaluator;
    if (this.deps.resolvers) {
      const registry = this.deps.resolvers(identity.orgId);
      // mutate() expects a synchronous resolver. We pre-resolve async scopes
      // into a simple map lookup so the final check stays synchronous.
      const cache = new Map<string, string[]>();
      const scopesToPre = collectScopes(evaluator);
      for (const s of scopesToPre) {
        if (!cache.has(s)) cache.set(s, await registry.resolve(s));
      }
      effective = evaluator.mutate((s) => cache.get(s) ?? [s]);
    }

    return effective.evaluate(permissions);
  }

  /**
   * Populate `identity.permissions` if not yet set. Returns the cached list.
   * Callers that already have the list may pass it in via `identity.permissions`
   * and receive it back unchanged.
   */
  async ensurePermissions(identity: Identity): Promise<ResolvedPermission[]> {
    if (identity.permissions) return identity.permissions;
    const p = await this.getUserPermissions(identity);
    // Mutate in place so the middleware layer's cached reference sees the
    // populated list. The field is optional and typed as `readonly` in some
    // callers — the mutation is intentional and scoped to request lifetime.
    (identity as { permissions?: ResolvedPermission[] }).permissions = p;
    return p;
  }
}

/**
 * Walk an evaluator tree and collect every scope string it references. Lets
 * us pre-resolve scopes asynchronously before calling the sync `evaluate`.
 */
function collectScopes(evaluator: Evaluator): string[] {
  const s = evaluator.string();
  // Pattern: "<action> on <scope>, <scope>, ..." or "all(..., ...)".
  // Rather than parse the rendering, we do a coarse scan that catches all
  // `kind:attribute:identifier` tokens. Good enough for the resolver pre-fetch —
  // false positives (extra lookups) are cheap; missed scopes just miss the
  // cascade and fall back to literal match.
  const m = s.match(/[a-z][a-z0-9.]*:[^\s,()|]+/g) ?? [];
  return [...new Set(m)];
}
