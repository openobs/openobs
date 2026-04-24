import { parseScope } from '@agentic-obs/common';
import type { ScopeResolver, ResolverDeps } from './index.js';

/**
 * Users resolver — mirrors the grafana convention of supporting both the
 * `users:id:<n>` scope kind (org-scoped) and `global.users:id:<n>` (server
 * admin scope). Adds wildcards so operator-granted `users:*` covers concrete
 * ids.
 */
export function buildUsersResolver(_deps: ResolverDeps): ScopeResolver {
  return (scope: string) => {
    const parsed = parseScope(scope);
    if (parsed.kind !== 'users') return [scope];
    return [...new Set([scope, 'users:*', 'users:id:*'])];
  };
}
