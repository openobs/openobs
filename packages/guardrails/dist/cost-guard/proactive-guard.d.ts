/**
 * ProactiveCostGuard - independent budget pool for background (proactive)
 * investigations triggered by ChangeWatcher, AnomalyDetector, etc.
 *
 * Separate from the user-initiated CostTracker so that background pipelines
 * cannot consume user-facing budget and vice-versa.
 *
 * Daily counters are reset automatically when the calendar date changes.
 */
import type { BudgetCheckResult, CostRecord } from './types.js';
export interface ProactiveCostGuardConfig {
    /**
     * Total tokens the background pipeline may spend per calendar day.
     * Default: 500_000
     */
    proactiveDailyTokenBudget?: number;
    /**
     * Max number of background investigations allowed per calendar day.
     * Default: 200
     */
    proactiveDailyInvestigationLimit?: number;
    /**
     * Per-investigation token cap for background runs (should be lower than
     * the user-facing maxTokensPerInvestigation).
     * Default: 10_000
     */
    proactiveSingleInvestigationBudget?: number;
    /**
     * Percentage of a budget consumed that triggers a warning (0-100).
     * Default: 80
     */
    warningThresholdPercent?: number;
}
export interface ProactiveDailyStatus {
    /** Calendar date this window covers (YYYY-MM-DD) */
    date: string;
    tokensUsed: number;
    dailyTokenBudget: number;
    tokenPercentUsed: number;
    investigationsRun: number;
    dailyInvestigationLimit: number;
    isDailyTokenBudgetExhausted: boolean;
    isDailyInvestigationLimitReached: boolean;
    isWarning: boolean;
}
export declare class ProactiveCostGuard {
    private readonly cfg;
    /** Day window (YYYY-MM-DD) for the current daily counters */
    private dailyDate;
    /** Total tokens consumed today across all background investigations */
    private dailyTokensUsed;
    /** Number of background investigations started today */
    private dailyInvestigationsRun;
    /** Per-investigation token usage for budget enforcement */
    private readonly perInvestigation;
    constructor(cfg?: ProactiveCostGuardConfig);
    /**
     * Check whether a new background investigation may be started.
     * Call this before launching an investigation; does NOT consume budget.
     */
    canRun(): BudgetCheckResult;
    /**
     * Check whether more token usage is allowed within a single background
     * investigation. Call before each LLM call inside the investigation.
     */
    checkInvestigationBudget(investigationId: string): BudgetCheckResult;
    /**
     * Register the start of a new background investigation.
     * Increments the daily investigation counter.
     * Does NOT pre-check the budget - call canRun() first.
     */
    recordInvestigationStart(investigationId: string): void;
    /**
     * Record LLM token usage for a background investigation.
     * Counts against both the per-investigation and daily budgets.
     */
    recordTokenUsage(investigationId: string, tokens: {
        prompt: number;
        completion: number;
    }): void;
    /**
     * Record a data-source query for a background investigation.
     */
    recordQuery(investigationId: string): void;
    /** Return the current daily budget status. */
    getDailyStatus(): ProactiveDailyStatus;
    /** Return per-investigation cost record (undefined if not started). */
    getInvestigationRecord(investigationId: string): CostRecord | undefined;
    /**
     * Manually reset daily counters.
     * Useful in tests and for forced resets (e.g. at midnight via a cron job).
     */
    resetDaily(): void;
    private rolloverIfNeeded;
    private getOrCreateRecord;
}
//# sourceMappingURL=proactive-guard.d.ts.map
