/**
 * RoleService — custom role CRUD + user/team role assignments.
 *
 * Corresponds to the endpoints listed in docs/auth-perm-design/08-api-surface.md
 * §access-control.
 *
 * Built-in (`basic:*`) and fixed (`fixed:*`) roles are read-only through this
 * service: GET is allowed, mutations throw a `RoleServiceError` that the
 * route layer maps to 400.
 */

import type {
  IRoleRepository,
  IPermissionRepository,
  IUserRoleRepository,
  ITeamRoleRepository,
  Role,
  NewRole,
  Permission,
} from '@agentic-obs/common';
import { parseScope, isKnownAction } from '@agentic-obs/common';

export class RoleServiceError extends Error {
  constructor(
    public readonly kind:
      | 'validation'
      | 'conflict'
      | 'not_found'
      | 'protected',
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
    this.name = 'RoleServiceError';
  }
}

export interface RoleWithPermissions {
  role: Role;
  permissions: Permission[];
}

export interface CreateRoleInput {
  name: string;
  uid?: string;
  displayName?: string | null;
  description?: string | null;
  groupName?: string | null;
  hidden?: boolean;
  /** Empty string means global — requires Server Admin. Otherwise per-org. */
  orgId: string;
  permissions: Array<{ action: string; scope?: string }>;
}

export interface UpdateRoleInput {
  roleUid: string;
  orgId: string;
  version: number;
  displayName?: string | null;
  description?: string | null;
  groupName?: string | null;
  hidden?: boolean;
  permissions?: Array<{ action: string; scope?: string }>;
}

export interface ListRolesOpts {
  orgId: string;
  includeGlobal?: boolean;
  includeHidden?: boolean;
  limit?: number;
  offset?: number;
}

export class RoleService {
  constructor(
    private readonly roles: IRoleRepository,
    private readonly permissions: IPermissionRepository,
    private readonly userRoles: IUserRoleRepository,
    private readonly teamRoles: ITeamRoleRepository,
  ) {}

  // -- Read ---------------------------------------------------------------

  async listRoles(opts: ListRolesOpts): Promise<RoleWithPermissions[]> {
    const page = await this.roles.list({
      orgId: opts.orgId,
      includeGlobal: opts.includeGlobal ?? true,
      limit: opts.limit ?? 200,
      offset: opts.offset ?? 0,
    });
    const filtered = opts.includeHidden
      ? page.items
      : page.items.filter((r) => !r.hidden);
    const out: RoleWithPermissions[] = [];
    for (const r of filtered) {
      const perms = await this.permissions.listByRole(r.id);
      out.push({ role: r, permissions: perms });
    }
    return out;
  }

  async getRole(orgId: string, roleUid: string): Promise<RoleWithPermissions | null> {
    // Try org-scoped first, then global.
    const role =
      (await this.roles.findByUid(orgId, roleUid)) ??
      (await this.roles.findByUid('', roleUid));
    if (!role) return null;
    const perms = await this.permissions.listByRole(role.id);
    return { role, permissions: perms };
  }

  // -- Create -------------------------------------------------------------

  async createRole(input: CreateRoleInput): Promise<RoleWithPermissions> {
    this.validateCustomName(input.name);
    this.validatePermissions(input.permissions);

    const uid = input.uid ?? input.name.replace(/[:.]/g, '_');
    const existing =
      (await this.roles.findByUid(input.orgId, uid)) ??
      (await this.roles.findByName(input.orgId, input.name));
    if (existing) {
      throw new RoleServiceError(
        'conflict',
        `role with uid or name already exists`,
        409,
      );
    }

    const payload: NewRole = {
      orgId: input.orgId,
      name: input.name,
      uid,
      displayName: input.displayName ?? null,
      description: input.description ?? null,
      groupName: input.groupName ?? null,
      hidden: input.hidden ?? false,
    };
    const role = await this.roles.create(payload);
    const perms = await this.permissions.createMany(
      input.permissions.map((p) => ({
        roleId: role.id,
        action: p.action,
        scope: p.scope ?? '',
      })),
    );
    return { role, permissions: perms };
  }

  // -- Update -------------------------------------------------------------

  async updateRole(input: UpdateRoleInput): Promise<RoleWithPermissions> {
    const existing = await this.findAcrossScopes(input.orgId, input.roleUid);
    if (!existing) {
      throw new RoleServiceError('not_found', 'role not found', 404);
    }
    this.refuseProtected(existing.name);

    if (existing.version !== input.version) {
      throw new RoleServiceError(
        'conflict',
        'role version mismatch',
        409,
      );
    }

    // Apply metadata patch.
    const patched = await this.roles.update(existing.id, {
      displayName: input.displayName,
      description: input.description,
      groupName: input.groupName,
      hidden: input.hidden,
    });
    if (!patched) {
      throw new RoleServiceError('not_found', 'role not found', 404);
    }

    // Full replace of permissions, if supplied.
    let perms: Permission[];
    if (input.permissions) {
      this.validatePermissions(input.permissions);
      await this.permissions.deleteByRole(existing.id);
      perms = await this.permissions.createMany(
        input.permissions.map((p) => ({
          roleId: existing.id,
          action: p.action,
          scope: p.scope ?? '',
        })),
      );
    } else {
      perms = await this.permissions.listByRole(existing.id);
    }
    return { role: patched, permissions: perms };
  }

  // -- Delete -------------------------------------------------------------

  async deleteRole(orgId: string, roleUid: string): Promise<boolean> {
    const existing = await this.findAcrossScopes(orgId, roleUid);
    if (!existing) return false;
    this.refuseProtected(existing.name);
    // FK cascades handle permission / user_role / team_role cleanup.
    return this.roles.delete(existing.id);
  }

  // -- Assignments --------------------------------------------------------

  async assignRoleToUser(
    orgId: string,
    userId: string,
    roleUid: string,
  ): Promise<void> {
    const role = await this.findAcrossScopes(orgId, roleUid);
    if (!role) throw new RoleServiceError('not_found', 'role not found', 404);
    // listByUser is idempotent-friendly: don't insert if already assigned.
    const existing = await this.userRoles.listByUser(userId, orgId);
    if (existing.some((r) => r.roleId === role.id)) return;
    await this.userRoles.create({
      orgId: role.orgId === '' ? '' : orgId,
      userId,
      roleId: role.id,
    });
  }

  async unassignRoleFromUser(
    orgId: string,
    userId: string,
    roleUid: string,
  ): Promise<boolean> {
    const role = await this.findAcrossScopes(orgId, roleUid);
    if (!role) return false;
    return this.userRoles.remove(role.orgId === '' ? '' : orgId, userId, role.id);
  }

  async setUserRoles(
    orgId: string,
    userId: string,
    roleUids: string[],
  ): Promise<void> {
    // Replace: compute which roles to add/remove, apply individually.
    const current = await this.userRoles.listByUser(userId, orgId);
    const desired = new Map<string, string>(); // roleId -> effective orgId
    for (const uid of roleUids) {
      const role = await this.findAcrossScopes(orgId, uid);
      if (!role) {
        throw new RoleServiceError('not_found', `role ${uid} not found`, 404);
      }
      desired.set(role.id, role.orgId === '' ? '' : orgId);
    }
    // Removals.
    for (const r of current) {
      if (!desired.has(r.roleId)) {
        await this.userRoles.remove(r.orgId, userId, r.roleId);
      }
    }
    // Additions.
    for (const [roleId, roleOrgId] of desired) {
      if (!current.some((r) => r.roleId === roleId)) {
        await this.userRoles.create({ orgId: roleOrgId, userId, roleId });
      }
    }
  }

  async listUserRoles(orgId: string, userId: string): Promise<Role[]> {
    const rows = await this.userRoles.listByUser(userId, orgId);
    const roles: Role[] = [];
    for (const r of rows) {
      const role = await this.roles.findById(r.roleId);
      if (role) roles.push(role);
    }
    return roles;
  }

  async assignRoleToTeam(
    orgId: string,
    teamId: string,
    roleUid: string,
  ): Promise<void> {
    const role = await this.findAcrossScopes(orgId, roleUid);
    if (!role) throw new RoleServiceError('not_found', 'role not found', 404);
    const existing = await this.teamRoles.listByTeam(teamId, orgId);
    if (existing.some((r) => r.roleId === role.id)) return;
    await this.teamRoles.create({
      orgId: role.orgId === '' ? '' : orgId,
      teamId,
      roleId: role.id,
    });
  }

  async unassignRoleFromTeam(
    orgId: string,
    teamId: string,
    roleUid: string,
  ): Promise<boolean> {
    const role = await this.findAcrossScopes(orgId, roleUid);
    if (!role) return false;
    return this.teamRoles.remove(role.orgId === '' ? '' : orgId, teamId, role.id);
  }

  async setTeamRoles(
    orgId: string,
    teamId: string,
    roleUids: string[],
  ): Promise<void> {
    const current = await this.teamRoles.listByTeam(teamId, orgId);
    const desired = new Map<string, string>();
    for (const uid of roleUids) {
      const role = await this.findAcrossScopes(orgId, uid);
      if (!role) {
        throw new RoleServiceError('not_found', `role ${uid} not found`, 404);
      }
      desired.set(role.id, role.orgId === '' ? '' : orgId);
    }
    for (const r of current) {
      if (!desired.has(r.roleId)) {
        await this.teamRoles.remove(r.orgId, teamId, r.roleId);
      }
    }
    for (const [roleId, roleOrgId] of desired) {
      if (!current.some((r) => r.roleId === roleId)) {
        await this.teamRoles.create({ orgId: roleOrgId, teamId, roleId });
      }
    }
  }

  async listTeamRoles(orgId: string, teamId: string): Promise<Role[]> {
    const rows = await this.teamRoles.listByTeam(teamId, orgId);
    const roles: Role[] = [];
    for (const r of rows) {
      const role = await this.roles.findById(r.roleId);
      if (role) roles.push(role);
    }
    return roles;
  }

  // -- Internal helpers --------------------------------------------------

  private async findAcrossScopes(
    orgId: string,
    roleUid: string,
  ): Promise<Role | null> {
    return (
      (await this.roles.findByUid(orgId, roleUid)) ??
      (await this.roles.findByUid('', roleUid))
    );
  }

  private validateCustomName(name: string): void {
    if (!name || name.trim().length === 0) {
      throw new RoleServiceError('validation', 'role name is required', 400);
    }
    if (name.startsWith('basic:') || name.startsWith('fixed:')) {
      throw new RoleServiceError(
        'validation',
        'custom role names cannot start with basic: or fixed: (reserved for system roles)',
        400,
      );
    }
  }

  private refuseProtected(name: string): void {
    if (name.startsWith('basic:') || name.startsWith('fixed:')) {
      throw new RoleServiceError(
        'protected',
        'built-in / fixed roles are read-only',
        400,
      );
    }
  }

  private validatePermissions(
    perms: Array<{ action: string; scope?: string }>,
  ): void {
    for (const p of perms) {
      if (!p.action || p.action.trim().length === 0) {
        throw new RoleServiceError('validation', 'action is required', 400);
      }
      if (!isKnownAction(p.action)) {
        // Unknown actions are allowed through (plugin systems, future
        // extensions) but we still need the kind:verb shape to parse.
        if (!p.action.includes(':')) {
          throw new RoleServiceError(
            'validation',
            `invalid action ${p.action} — expected kind:verb form`,
            400,
          );
        }
      }
      if (p.scope) {
        // parseScope tolerates anything; we only validate non-empty segments.
        const parsed = parseScope(p.scope);
        if (!parsed.kind) {
          throw new RoleServiceError(
            'validation',
            `invalid scope ${p.scope}`,
            400,
          );
        }
      }
    }
  }
}
