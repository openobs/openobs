/**
 * Map LDAP group DNs → openobs org memberships / server-admin flag.
 *
 * Each server config declares `[[servers.group_mappings]]` entries. A user
 * who is a member of `group_dn` gets `org_role` in `org_id` (or `grafana_admin
 * = true` → isServerAdmin). Multiple mappings stack; Admin wins over Editor
 * wins over Viewer within the same org.
 */

import type { LdapGroupMapping } from './config.js';

export interface MappingResult {
  /** orgId → role. Admin > Editor > Viewer > None ordering is enforced. */
  orgRoles: Map<string, 'Admin' | 'Editor' | 'Viewer' | 'None'>;
  isServerAdmin: boolean;
}

const ROLE_WEIGHT = {
  None: 0,
  Viewer: 1,
  Editor: 2,
  Admin: 3,
} as const;

export function mapGroupsToRoles(
  userGroupDns: string[],
  mappings: LdapGroupMapping[],
): MappingResult {
  // LDAP comparisons are case-insensitive on DN components; normalize.
  const norm = (s: string) => s.toLowerCase();
  const userGroups = new Set(userGroupDns.map(norm));
  const result: MappingResult = {
    orgRoles: new Map(),
    isServerAdmin: false,
  };
  for (const m of mappings) {
    if (!userGroups.has(norm(m.groupDn))) continue;
    if (m.grafanaAdmin) result.isServerAdmin = true;
    const prior = result.orgRoles.get(m.orgId);
    if (!prior || ROLE_WEIGHT[m.orgRole] > ROLE_WEIGHT[prior]) {
      result.orgRoles.set(m.orgId, m.orgRole);
    }
  }
  return result;
}
