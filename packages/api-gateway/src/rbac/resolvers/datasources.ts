import { parseScope } from '@agentic-obs/common';
import type { ScopeResolver, ResolverDeps } from './index.js';

/**
 * Datasources resolver — UID == ID on openobs (single identifier). Adds the
 * datasources:* wildcard so operator-set wildcard scopes cover specific UIDs.
 */
export function buildDatasourcesResolver(_deps: ResolverDeps): ScopeResolver {
  return (scope: string) => {
    const parsed = parseScope(scope);
    if (parsed.kind !== 'datasources') return [scope];
    return [...new Set([scope, 'datasources:*', 'datasources:uid:*'])];
  };
}
