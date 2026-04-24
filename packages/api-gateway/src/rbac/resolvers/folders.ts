/**
 * Folders scope resolver — expands `folders:uid:<uid>` to include the folder
 * itself, its ancestor chain, and the folders:* wildcard.
 *
 * Uses the FolderRepository to walk ancestors. If the repo isn't wired in
 * (deps.folders is undefined) the resolver returns only the scope + its
 * obvious wildcards.
 */

import { parseScope } from '@agentic-obs/common';
import type { ScopeResolver, ResolverDeps } from './index.js';

export function buildFoldersResolver(deps: ResolverDeps): ScopeResolver {
  return async (scope: string) => {
    const parsed = parseScope(scope);
    if (parsed.kind !== 'folders') return [scope];

    const expanded = new Set<string>();
    expanded.add(scope);
    expanded.add('folders:*');
    expanded.add('folders:uid:*');

    if (
      deps.folders &&
      parsed.attribute === 'uid' &&
      parsed.identifier !== '*'
    ) {
      try {
        const ancestors = await deps.folders.listAncestors(
          deps.orgId,
          parsed.identifier,
        );
        for (const f of ancestors) {
          expanded.add(`folders:uid:${f.uid}`);
        }
      } catch {
        // Unknown folder / folder repo unavailable — fall back to literal
        // scope. Coverage through wildcards still works.
      }
    }

    return [...expanded];
  };
}
