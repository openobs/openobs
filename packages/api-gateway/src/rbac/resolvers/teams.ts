import { parseScope } from '@agentic-obs/common';
import type { ScopeResolver, ResolverDeps } from './index.js';

export function buildTeamsResolver(_deps: ResolverDeps): ScopeResolver {
  return (scope: string) => {
    const parsed = parseScope(scope);
    if (parsed.kind !== 'teams') return [scope];
    return [...new Set([scope, 'teams:*', 'teams:id:*'])];
  };
}
