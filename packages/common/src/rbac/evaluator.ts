/**
 * Permission evaluator — used both by backend middleware and frontend UI
 * gating. The same `ac.eval / ac.all / ac.any` builder is consumed on both
 * sides; handlers wrap it with `requirePermission`, frontend components with
 * a `hasPermission` hook.
 *
 * Grafana reference (semantics only): pkg/services/accesscontrol/evaluator.go.
 *
 * Design constraints:
 *   - Pure TypeScript. No node-only imports. Must run in the browser bundle.
 *   - Every evaluator is immutable. `mutate` returns a new instance.
 *   - `.string()` produces a stable human-readable form used in 403 errors.
 *
 * See docs/auth-perm-design/03-rbac-model.md §evaluator.
 */

import type { ResolvedPermission } from '../auth/identity.js';
import { scopeCovers } from './scope.js';

export type ScopeResolver = (scope: string) => string[];

/**
 * A reusable check. `evaluate` returns true iff the `permissions` set
 * satisfies the evaluator. `mutate` rewrites scopes through a resolver
 * (typically the folder-cascade resolver on the backend) and returns a
 * new evaluator — the original stays untouched.
 */
export interface Evaluator {
  evaluate(permissions: readonly ResolvedPermission[]): boolean;
  string(): string;
  mutate(resolveScope: ScopeResolver): Evaluator;
}

// -- Atomic action/scope check ---------------------------------------------

class ActionEvaluator implements Evaluator {
  constructor(
    private readonly action: string,
    /** Required scopes — all must be covered (grafana's AND semantics). */
    private readonly scopes: readonly string[],
  ) {}

  evaluate(permissions: readonly ResolvedPermission[]): boolean {
    // Collect every permission that matches this action.
    const matching = permissions.filter((p) => p.action === this.action);
    if (matching.length === 0) return false;

    // No scope requirement → action alone is enough.
    if (this.scopes.length === 0) return true;

    // Every required scope must be covered by at least one permission scope.
    return this.scopes.every((want) =>
      matching.some((p) => scopeCovers(p.scope, want)),
    );
  }

  string(): string {
    if (this.scopes.length === 0) return this.action;
    return `${this.action} on ${this.scopes.join(', ')}`;
  }

  mutate(resolveScope: ScopeResolver): Evaluator {
    if (this.scopes.length === 0) return this;
    // Expand each scope through the resolver, flatten, and switch to "any
    // resolved variant covers" semantics — mirrors grafana's
    // `evaluator.go::ScopeResolution`. The resolver should emit every scope
    // a permission COULD use to cover the original request (including
    // ancestor folders, wildcards, etc.).
    const expanded = this.scopes.map(resolveScope);
    return new ResolvedActionEvaluator(this.action, expanded);
  }
}

class ResolvedActionEvaluator implements Evaluator {
  constructor(
    private readonly action: string,
    /** For each original scope, the list of scopes any of which would cover. */
    private readonly resolvedScopes: readonly (readonly string[])[],
  ) {}

  evaluate(permissions: readonly ResolvedPermission[]): boolean {
    const matching = permissions.filter((p) => p.action === this.action);
    if (matching.length === 0) return false;

    // For every original requirement, at least one of its resolved scopes
    // must be covered by some permission scope.
    return this.resolvedScopes.every((options) =>
      options.some((want) =>
        matching.some((p) => scopeCovers(p.scope, want)),
      ),
    );
  }

  string(): string {
    const joined = this.resolvedScopes
      .map((opts) => opts.join('|'))
      .join(', ');
    return `${this.action} on ${joined}`;
  }

  mutate(_resolveScope: ScopeResolver): Evaluator {
    // Already resolved — re-resolving is a no-op by design.
    return this;
  }
}

// -- Composite AND / OR ----------------------------------------------------

class AllEvaluator implements Evaluator {
  constructor(private readonly children: readonly Evaluator[]) {}

  evaluate(permissions: readonly ResolvedPermission[]): boolean {
    if (this.children.length === 0) return true;
    return this.children.every((c) => c.evaluate(permissions));
  }

  string(): string {
    return `all(${this.children.map((c) => c.string()).join(', ')})`;
  }

  mutate(resolveScope: ScopeResolver): Evaluator {
    return new AllEvaluator(this.children.map((c) => c.mutate(resolveScope)));
  }
}

class AnyEvaluator implements Evaluator {
  constructor(private readonly children: readonly Evaluator[]) {}

  evaluate(permissions: readonly ResolvedPermission[]): boolean {
    if (this.children.length === 0) return false;
    return this.children.some((c) => c.evaluate(permissions));
  }

  string(): string {
    return `any(${this.children.map((c) => c.string()).join(', ')})`;
  }

  mutate(resolveScope: ScopeResolver): Evaluator {
    return new AnyEvaluator(this.children.map((c) => c.mutate(resolveScope)));
  }
}

// -- Builder ---------------------------------------------------------------

/**
 * `ac.eval(action, scope?)` — single (action, scope) check.
 * `ac.all(...evals)`        — all children must pass.
 * `ac.any(...evals)`        — any child passing is enough.
 *
 * Example:
 *   ac.all(
 *     ac.eval('dashboards:write', `dashboards:uid:${uid}`),
 *     ac.eval('folders:read',     `folders:uid:${folderUid}`),
 *   )
 */
export const ac = {
  eval(action: string, scope?: string | readonly string[]): Evaluator {
    const scopes: string[] = [];
    if (typeof scope === 'string') scopes.push(scope);
    else if (Array.isArray(scope)) scopes.push(...scope);
    return new ActionEvaluator(action, scopes);
  },

  all(...evals: Evaluator[]): Evaluator {
    return new AllEvaluator(evals);
  },

  any(...evals: Evaluator[]): Evaluator {
    return new AnyEvaluator(evals);
  },
};
