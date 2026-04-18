import { parseScope } from '@agentic-obs/common';
import type { ScopeResolver, ResolverDeps } from './index.js';

/**
 * Alert rules in Grafana inherit permissions from the containing folder.
 * Scopes look like `alert.rules:uid:<rule>` OR `folders:uid:<folder>` — we
 * expand to both forms so operator-granted folder perms cover alert rules.
 * For Wave 2, we emit the standard wildcards; the folder mapping (rule → folder)
 * comes online in T7.
 */
export function buildAlertRulesResolver(_deps: ResolverDeps): ScopeResolver {
  return (scope: string) => {
    const parsed = parseScope(scope);
    if (parsed.kind !== 'alert.rules') return [scope];
    return [
      ...new Set([
        scope,
        'alert.rules:*',
        'alert.rules:uid:*',
        // folders:* covers alert rules via cascade once T7 wires rule.folderUid.
        'folders:*',
      ]),
    ];
  };
}
