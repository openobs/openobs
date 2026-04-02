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
export class ScopeGuard {
    scope;
    constructor(scope) {
        this.scope = scope;
    }
    /**
     * Returns { effect: 'allow' } if the action falls within the user's scope,
     * or { effect: 'deny', reason: '...' } otherwise.
     */
    checkScope(action) {
        // Service check
        if (this.scope.services !== undefined) {
            if (!this.scope.services.includes(action.targetService)) {
                return {
                    effect: 'deny',
                    reason: `Service "${action.targetService}" is not in the authorised scope (allowed: ${this.scope.services.join(', ') || 'none'})`,
                };
            }
        }
        // Namespace check (for k8s-class actions)
        // Only applies when the action has a string namespace param.
        // Actions without a namespace param are not namespace-constrained (e.g. non-k8s operations).
        if (this.scope.namespaces !== undefined) {
            const namespace = action.params?.['namespace'];
            if (typeof namespace === 'string' && !this.scope.namespaces.includes(namespace)) {
                return {
                    effect: 'deny',
                    reason: `Namespace "${namespace}" is not in the authorised scope (allowed: ${this.scope.namespaces.join(', ') || 'none'})`,
                };
            }
        }
        // Environment check
        // Only applies when the action specifies an environment.
        // Actions without an environment field are not environment-constrained.
        if (this.scope.environments !== undefined) {
            if (action.environment !== undefined && !this.scope.environments.includes(action.environment)) {
                return {
                    effect: 'deny',
                    reason: `Environment "${action.environment}" is not in the authorised scope (allowed: ${this.scope.environments.join(', ') || 'none'})`,
                };
            }
        }
        return { effect: 'allow', reason: 'Action is within authorised scope' };
    }
}
// -- Factory --
/** Admin scope - unrestricted on all dimensions */
export function adminScope() {
    return {};
}
/**
 * Operator scope - restricted to specific namespaces, services, environments.
 * Any dimension set to [] means nothing is permitted on that dimension.
 */
export function operatorScope(opts) {
    return opts;
}
//# sourceMappingURL=scope-guard.js.map
