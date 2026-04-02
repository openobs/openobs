export interface QueryGuardConfig {
  /** Maximum allowed query time window in milliseconds. Default: 7 days */
  maxTimeWindowMs?: number;
  /** Maximum estimated label-combination cardinality. Default: 100_000 */
  maxCardinalityEstimate?: number;
  /** Maximum queries per session per minute (sliding window). Default: 60 */
  maxQueriesPerMinute?: number;
  /** Maximum total queries per session lifetime. Default: 200 */
  maxQueriesPerSession?: number;
}

export interface QueryValidationResult {
  allowed: boolean;
  reason?: string;
  warnings: string[];
}

export const QUERY_GUARD_DEFAULTS = {
  maxTimeWindowMs: 7 * 24 * 60 * 60 * 1000, // 7 days
  maxCardinalityEstimate: 100_000,
  maxQueriesPerMinute: 60,
  maxQueriesPerSession: 200,
} as const satisfies Required<QueryGuardConfig>;
