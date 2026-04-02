import { BudgetExceededError } from './types.js';
/**
 * Wraps an LLM gateway with cost budget enforcement.
 *
 * Before each call: checks budget; throws BudgetExceededError if exhausted.
 * After each call: records token consumption in the tracker.
 */
export function wrapLLMGateway(gateway, tracker, investigationId) {
    return {
        tracker,
        investigationId,
        async complete(messages, options) {
            // Pre-call budget check
            const check = tracker.checkBudget(investigationId);
            if (!check.allowed) {
                throw new BudgetExceededError(investigationId, check.reason ?? 'Budget exceeded');
            }
            // Delegate to the real gateway
            const response = await gateway.complete(messages, options);
            // Post-call: record actual token consumption
            tracker.record(investigationId, {
                prompt: response.usage.promptTokens,
                completion: response.usage.completionTokens,
            });
            return response;
        },
    };
}
//# sourceMappingURL=middleware.js.map
