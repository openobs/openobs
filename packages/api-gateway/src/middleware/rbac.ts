import type { Response, NextFunction } from 'express'
import type { AuthenticatedRequest } from './auth.js'

export interface Role {
  name: string
  /** Permissions in "resource:action" format; "*" is a wildcard for either part */
  permissions: string[]
}

// --- Built-in roles
export const BUILTIN_ROLES: Readonly<Record<string, Role>> = {
  admin: {
    name: 'admin',
    permissions: ['*:*'],
  },
  operator: {
    name: 'operator',
    permissions: [
      'investigation:*',
      'execution:read',
      'execution:execute',
      'execution:approve',
      'incident:*',
      'feed:*',
      'dashboard:*',
      'query:*',
      'meta:read',
    ],
  },
  investigator: {
    name: 'investigator',
    permissions: ['investigation:*', 'evidence:read', 'execution:read', 'feed:*', 'incident:read', 'dashboard:*', 'query:*', 'meta:read'],
  },
  viewer: {
    name: 'viewer',
    permissions: [
      'investigation:read',
      'evidence:read',
      'feed:read',
      'incident:read',
      'dashboard:read',
      'query:read',
    ],
  },
  readonly: {
    name: 'readonly',
    permissions: ['investigation:read', 'feed:read'],
  },
}

// --- RoleStore: in-memory CRUD with built-in roles
export class RoleStore {
  private roles: Map<string, Role>

  constructor() {
    this.roles = new Map(
      Object.values(BUILTIN_ROLES).map((r) => [r.name, { ...r, permissions: [...r.permissions] }]),
    )
  }

  getRole(name: string): Role | undefined {
    return this.roles.get(name)
  }

  getAllRoles(): Role[] {
    return [...this.roles.values()]
  }

  /** Create or replace a role */
  createRole(role: Role): void {
    this.roles.set(role.name, { ...role, permissions: [...role.permissions] })
  }

  /** Update an existing role (alias for createRole when name already exists) */
  updateRole(role: Role): boolean {
    if (!this.roles.has(role.name))
      return false
    this.roles.set(role.name, { ...role, permissions: [...role.permissions] })
    return true
  }

  deleteRole(name: string): boolean {
    return this.roles.delete(name)
  }

  /**
   * Resolve the merged permission set for a list of role names.
   * Permissions from all matching roles are combined and deduplicated.
   */
  resolvePermissions(roleNames: string[]): string[] {
    const perms = new Set<string>()
    for (const name of roleNames) {
      const role = this.roles.get(name)
      if (role) {
        for (const p of role.permissions)
          perms.add(p)
      }
    }

    return [...perms]
  }
}

export const roleStore = new RoleStore()

// --- Permission helpers
/**
 * Returns true if `required` is covered by at least one entry in `userPermissions`.
 *
 * Wildcard rules (both parts may independently be "*"):
 * - "*:*" matches everything
 * - "res:*" matches any action on resource "res"
 * - "*:act" matches action "act" on any resource
 * - "res:act" exact match only
 */
export function hasPermission(userPermissions: string[], required: string): boolean {
  const colonIdx = required.indexOf(':')
  const reqRes = colonIdx >= 0 ? required.slice(0, colonIdx) : required
  const reqAct = colonIdx >= 0 ? required.slice(colonIdx + 1) : '*'

  for (const perm of userPermissions) {
    const pi = perm.indexOf(':')
    const pRes = pi >= 0 ? perm.slice(0, pi) : perm
    const pAct = pi >= 0 ? perm.slice(pi + 1) : '*'

    const resMatch = pRes === '*' || pRes === reqRes
    const actMatch = pAct === '*' || pAct === reqAct
    if (resMatch && actMatch)
      return true
  }

  return false
}

/** Returns true if ALL required permissions are covered by userPermissions */
export function hasAllPermissions(userPermissions: string[], required: string[]): boolean {
  return required.every((r) => hasPermission(userPermissions, r))
}

/**
 * Derive the legacy pre-T3 role name from the new Identity shape. Admin →
 * 'admin', Editor → 'operator', Viewer / None → 'viewer'. Server admins
 * always resolve to 'admin'. T3's `createRequirePermission` supersedes
 * this middleware; this helper exists only for legacy routes that still
 * gate via resource:action strings.
 */
function legacyRoleFromIdentity(
  auth: AuthenticatedRequest['auth'] | undefined,
): string {
  if (!auth) return 'viewer';
  if (auth.isServerAdmin) return 'admin';
  if (auth.orgRole === 'Admin') return 'admin';
  if (auth.orgRole === 'Editor') return 'operator';
  return 'viewer';
}

/** Express middleware - rejects the request with 403 if permission is missing */
export function requirePermission(permission: string) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    // Legacy RBAC middleware derives permissions from the new Identity's
    // orgRole + isServerAdmin directly — the pre-T9 back-compat fields
    // on req.auth were removed in Wave 6 cleanup.
    const roleName = legacyRoleFromIdentity(req.auth);
    const permissions = roleStore.resolvePermissions([roleName]);
    if (hasPermission(permissions, permission)) {
      next()
      return
    }

    res.status(403).json({
      error: {
        code: 'FORBIDDEN',
        message: `Insufficient permissions: requires ${permission}`,
      },
    })
  }
}
