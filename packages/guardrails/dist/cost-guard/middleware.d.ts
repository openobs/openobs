import type { CompletionMessage, LLMOptions, LLMResponse } from '@agentic-obs/llm-gateway';
import type { CostTracker } from './tracker.js';
/** Minimal gateway interface to avoid a hard dependency on the concrete class */
export interface LLMGatewayLike {
    complete(messages: CompletionMessage[], options: LLMOptions): Promise<LLMResponse>;
}
/** Wrapped gateway that enforces cost budget for a specific investigation */
export interface BudgetedGateway extends LLMGatewayLike {
    /** Returns the current tracker (for inspection in tests / reporting) */
    readonly tracker: CostTracker;
    readonly investigationId: string;
}
/**
 * Wraps an LLM gateway with cost budget enforcement.
 *
 * Before each call: checks budget; throws BudgetExceededError if exhausted.
 * After each call: records token consumption in the tracker.
 */
export declare function wrapLLMGateway(gateway: LLMGatewayLike, tracker: CostTracker, investigationId: string): BudgetedGateway;
//# sourceMappingURL=middleware.d.ts.map
