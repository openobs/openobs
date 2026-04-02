import type {
  SemanticQuery,
  DataAdapter,
  StructuredResult,
  StreamSubscription,
  EventStream,
} from '@agentic-obs/adapters';
import type { QueryGuardConfig, QueryValidationResult } from './types.js';
import { QueryValidator } from './validator.js';
import { QueryRateLimiter } from './rate-limiter.js';

export class QueryGuard {
  private readonly validator: QueryValidator;
  private readonly rateLimiter: QueryRateLimiter;

  constructor(config: QueryGuardConfig = {}) {
    this.validator = new QueryValidator(config);
    this.rateLimiter = new QueryRateLimiter(config);
  }

  /**
   * Check whether a query is allowed for the given session.
   * Records the query against the rate limiter only on success.
   */
  check(query: SemanticQuery, sessionId: string): QueryValidationResult {
    const rateCheck = this.rateLimiter.checkRate(sessionId);
    if (!rateCheck.allowed) {
      return { allowed: false, reason: rateCheck.reason, warnings: [] };
    }

    const validation = this.validator.validate(query);
    if (!validation.allowed) {
      return validation;
    }

    this.rateLimiter.record(sessionId);
    return validation;
  }

  /**
   * Wrap a DataAdapter so every query() call is automatically checked before
   * it reaches the underlying adapter. Other adapter methods are proxied
   * unchanged.
   */
  wrapAdapter(adapter: DataAdapter, sessionId: string): DataAdapter {
    const guard = this;
    const wrapped: DataAdapter = {
      name: adapter.name,
      description: adapter.description,
      meta: () => adapter.meta(),
      query: async <T = unknown>(semanticQuery: SemanticQuery): Promise<StructuredResult<T>> => {
        const result = guard.check(semanticQuery, sessionId);
        if (!result.allowed) {
          throw new Error(`QueryGuard blocked query: ${result.reason}`);
        }
        return adapter.query<T>(semanticQuery);
      },
      healthCheck: () => adapter.healthCheck(),
    };

    if (adapter.stream) {
      wrapped.stream = <T = unknown>(sub: StreamSubscription): EventStream<T> =>
        adapter.stream!<T>(sub);
    }

    return wrapped;
  }
}
