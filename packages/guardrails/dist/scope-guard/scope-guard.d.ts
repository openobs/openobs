/**
 * ScopeGuard - prevents operations from affecting resources outside a user's
 * authorised scope.
 *
 * Rules:
 * - If a scope field is undefined - that dimension is unrestricted (admin-like)
 * - If a scope field is an empty array [] - nothing is permitted on that dimension
 * - If a scope field is a non-empty array - only listed values are permitted
 *
 * Typically:
 * - Admin role:    scope = {} (all undefined) - all operations allowed
 * - Operator role: scope = { namespaces: ['production'], services: ['checkout'] }
 */
import type { Scope } from './types.js';
export interface ScopeAction {
    /** Adapter-scoped operation type, e.g. 'k8s:scale', 'slack:notify' */
    type: string;
    /** The service / resource being targeted */
    targetService: string;
    /** Action parameters - must contain `namespace` for k8s-class operations */
    params: Record<string, unknown>;
    /** Optional environment hint */
    environment?: string;
}
export type ScopeEffect = 'allow' | 'deny';
export interface ScopeDecision {
    effect: ScopeEffect;
    /** Human-readable reason for the decision */
    reason: string;
}
export declare class ScopeGuard {
    private readonly scope;
    constructor(scope: Scope);
    /**
     * Returns { effect: 'allow' } if the action falls within the user's scope,
     * or { effect: 'deny', reason: '...' } otherwise.
     */
    checkScope(action: ScopeAction): ScopeDecision;
}
/** Admin scope - unrestricted on all dimensions */
export declare function adminScope(): Scope;
/**
 * Operator scope - restricted to specific namespaces, services, environments.
 * Any dimension set to [] means nothing is permitted on that dimension.
 */
export declare function operatorScope(opts: Scope): Scope;
//# sourceMappingURL=scope-guard.d.ts.map
