import { describe, it, expect } from 'vitest';
import { mapGroupsToRoles } from './group-mapping.js';
import type { LdapGroupMapping } from './config.js';

const MAPPINGS: LdapGroupMapping[] = [
  {
    groupDn: 'cn=viewers,ou=groups,dc=example,dc=com',
    orgId: 'org_main',
    orgRole: 'Viewer',
  },
  {
    groupDn: 'cn=editors,ou=groups,dc=example,dc=com',
    orgId: 'org_main',
    orgRole: 'Editor',
  },
  {
    groupDn: 'cn=admins,ou=groups,dc=example,dc=com',
    orgId: 'org_main',
    orgRole: 'Admin',
    grafanaAdmin: true,
  },
];

describe('mapGroupsToRoles', () => {
  it('returns no roles when user has no matching groups', () => {
    const r = mapGroupsToRoles(['cn=other,dc=example,dc=com'], MAPPINGS);
    expect(r.orgRoles.size).toBe(0);
    expect(r.isServerAdmin).toBe(false);
  });

  it('maps a single group membership', () => {
    const r = mapGroupsToRoles(
      ['cn=viewers,ou=groups,dc=example,dc=com'],
      MAPPINGS,
    );
    expect(r.orgRoles.get('org_main')).toBe('Viewer');
    expect(r.isServerAdmin).toBe(false);
  });

  it('promotes Viewer → Admin when user is in both groups', () => {
    const r = mapGroupsToRoles(
      [
        'cn=viewers,ou=groups,dc=example,dc=com',
        'cn=admins,ou=groups,dc=example,dc=com',
      ],
      MAPPINGS,
    );
    expect(r.orgRoles.get('org_main')).toBe('Admin');
    expect(r.isServerAdmin).toBe(true);
  });

  it('Editor beats Viewer', () => {
    const r = mapGroupsToRoles(
      [
        'cn=viewers,ou=groups,dc=example,dc=com',
        'cn=editors,ou=groups,dc=example,dc=com',
      ],
      MAPPINGS,
    );
    expect(r.orgRoles.get('org_main')).toBe('Editor');
  });

  it('is case-insensitive on DN', () => {
    const r = mapGroupsToRoles(
      ['CN=Admins,OU=Groups,DC=Example,DC=Com'],
      MAPPINGS,
    );
    expect(r.orgRoles.get('org_main')).toBe('Admin');
    expect(r.isServerAdmin).toBe(true);
  });

  it('separates roles per org', () => {
    const mappings: LdapGroupMapping[] = [
      {
        groupDn: 'cn=a,dc=x',
        orgId: 'org1',
        orgRole: 'Admin',
      },
      {
        groupDn: 'cn=b,dc=x',
        orgId: 'org2',
        orgRole: 'Viewer',
      },
    ];
    const r = mapGroupsToRoles(['cn=a,dc=x', 'cn=b,dc=x'], mappings);
    expect(r.orgRoles.get('org1')).toBe('Admin');
    expect(r.orgRoles.get('org2')).toBe('Viewer');
  });
});
