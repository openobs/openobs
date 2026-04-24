import { parseScope } from '@agentic-obs/common';
import type { ScopeResolver, ResolverDeps } from './index.js';

export function buildServiceAccountsResolver(_deps: ResolverDeps): ScopeResolver {
  return (scope: string) => {
    const parsed = parseScope(scope);
    if (parsed.kind !== 'serviceaccounts') return [scope];
    return [...new Set([scope, 'serviceaccounts:*', 'serviceaccounts:id:*'])];
  };
}
