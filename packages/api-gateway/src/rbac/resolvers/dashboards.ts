/**
 * Dashboards scope resolver — expands `dashboards:uid:<uid>` to include
 * the dashboard itself + its folder chain + the all-dashboards/all-folders
 * wildcards.
 *
 * For Wave 2, dashboards-in-folders wiring isn't complete (Phase 7). If the
 * folder repository is empty the resolver returns only the scope itself plus
 * the obvious wildcards — operators setting `dashboards:*` or `folders:*`
 * still get the expected coverage via the scopeCovers() wildcard check.
 */

import { parseScope } from '@agentic-obs/common';
import type { ScopeResolver, ResolverDeps } from './index.js';

export function buildDashboardsResolver(_deps: ResolverDeps): ScopeResolver {
  return (scope: string) => {
    const parsed = parseScope(scope);
    if (parsed.kind !== 'dashboards') return [scope];
    const expanded: string[] = [scope];
    // Every dashboard scope is also covered by dashboards:* and by the empty
    // scope (== global for the action kind). Folder-cascade additions happen
    // in T7 when the folder-id ↔ dashboard-uid wiring exists.
    expanded.push('dashboards:*');
    expanded.push('dashboards:uid:*');
    return dedupe(expanded);
  };
}

function dedupe(scopes: string[]): string[] {
  return [...new Set(scopes)];
}
