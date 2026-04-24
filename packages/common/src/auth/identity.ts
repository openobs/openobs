/**
 * Identity type — the authenticated principal on a request.
 *
 * Populated by the auth middleware (session cookie OR API-key). The
 * access-control layer (T3) optionally fills `permissions` when a handler
 * needs them; until then the field is undefined.
 *
 * See docs/auth-perm-design/02-authentication.md §identity-model.
 */

import type { OrgRole } from '../models/org.js';

export type AuthMethod =
  | 'password'
  | 'oauth'
  | 'saml'
  | 'ldap'
  | 'api_key'
  | 'session';

export interface ResolvedPermission {
  /** e.g. `dashboards:read`. */
  action: string;
  /** e.g. `dashboards:uid:abc` or `dashboards:*`. */
  scope: string;
}

export interface Identity {
  userId: string;
  orgId: string;
  orgRole: OrgRole;
  isServerAdmin: boolean;
  authenticatedBy: AuthMethod;
  /**
   * Populated by the access-control layer (T3) on demand. Undefined until then.
   * Consumers must not assume a value without an explicit resolve step.
   */
  permissions?: ResolvedPermission[];
  /** user_auth_token.id for cookie-session auth. Undefined for api_key auth. */
  sessionId?: string;
  /** user.id of the underlying service account. Undefined for human users. */
  serviceAccountId?: string;
}

export type { OrgRole } from '../models/org.js';
