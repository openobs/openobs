/**
 * Scope grammar + coverage check.
 *
 * Grafana reference (read for semantics only):
 *   pkg/services/accesscontrol/models.go (Scope parsing).
 *   pkg/services/accesscontrol/evaluator.go (wildcard coverage).
 *
 * Grammar: `kind[:attribute[:identifier]]`. `*` is a wildcard at any segment.
 * An empty string means "unrestricted for the action's kind".
 *
 * See docs/auth-perm-design/03-rbac-model.md §scope-grammar.
 */

import { parseScope, type ParsedScope } from '../models/rbac.js';

export { parseScope };
export type { ParsedScope };

/** Well-known scope kinds used across the catalog. */
export const SCOPE_KINDS = [
  'dashboards',
  'folders',
  'datasources',
  'users',
  'teams',
  'serviceaccounts',
  'orgs',
  'roles',
  'alert.rules',
  'alert.notifications',
  'alert.instances',
  'alert.silences',
  'alert.provisioning',
  'annotations',
  'server',
  'apikeys',
  // openobs-specific kinds — same wildcard semantics.
  'investigations',
  'approvals',
  'chat',
  'agents.config',
] as const;

export type ScopeKind = (typeof SCOPE_KINDS)[number];

/**
 * Build a scope string from parts. Missing parts default to '*'.
 *
 * Examples:
 *   buildScope('dashboards', 'uid', 'abc') => 'dashboards:uid:abc'
 *   buildScope('dashboards')               => 'dashboards:*:*'
 *   buildScope('dashboards', '*')          => 'dashboards:*:*'
 */
export function buildScope(
  kind: string,
  attribute: string = '*',
  identifier: string = '*',
): string {
  return `${kind}:${attribute}:${identifier}`;
}

/**
 * True iff `parent` covers `child` — i.e., a permission with scope `parent`
 * is sufficient for a request targeting scope `child`.
 *
 * Rules (mirror Grafana's evaluator wildcard semantics):
 *   - `parent === ''`  → covers every `child` (unrestricted within action kind).
 *   - Exact string equality → covers.
 *   - Any segment `*` in parent acts as a wildcard. A `*` segment covers
 *     every concrete value of the child at the same position and implicitly
 *     covers missing (trailing) segments in the child.
 *   - Kind segment must match (except when parent is empty / all wildcards).
 *
 * Does NOT expand scopes via the folder cascade — that's the resolver's job.
 * This function only evaluates a single (parent, child) pair literally.
 */
export function scopeCovers(parent: string, child: string): boolean {
  // Unrestricted parent covers anything.
  if (parent === '' || parent === '*') return true;
  // Exact match.
  if (parent === child) return true;

  const p = parseScope(parent);
  const c = parseScope(child);

  // Each segment: parent '*' is a wildcard; otherwise must match literally.
  const matches = (parentSeg: string, childSeg: string): boolean =>
    parentSeg === '*' || parentSeg === childSeg;

  return (
    matches(p.kind, c.kind) &&
    matches(p.attribute, c.attribute) &&
    matches(p.identifier, c.identifier)
  );
}

/**
 * Normalize a scope for storage — returns '' for undefined/null inputs,
 * otherwise returns the scope verbatim (callers should parse, not canonicalize,
 * to preserve operator-typed strings for audit trails).
 */
export function normalizeScope(scope: string | null | undefined): string {
  return scope == null ? '' : scope;
}
