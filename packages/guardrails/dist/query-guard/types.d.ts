export interface QueryGuardConfig {
    /** Maximum allowed query time window in milliseconds. Defaults: 7 days */
    maxTimeWindowMs?: number;
    /** Maximum estimated label-combination cardinality. Defaults: 100,000 */
    maxCardinalityEstimate?: number;
    /** Maximum queries per session per minute (sliding window). Defaults: 60 */
    maxQueriesPerMinute?: number;
    /** Maximum total queries per session lifetime. Defaults: 200 */
    maxQueriesPerSession?: number;
}
export interface QueryValidationResult {
    allowed: boolean;
    reason?: string;
    warnings: string[];
}
export declare const QUERY_GUARD_DEFAULTS: {
    readonly maxTimeWindowMs: number;
    readonly maxCardinalityEstimate: 100000;
    readonly maxQueriesPerMinute: 60;
    readonly maxQueriesPerSession: 200;
};
//# sourceMappingURL=types.d.ts.map
