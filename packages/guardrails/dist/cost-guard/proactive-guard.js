/**
 * ProactiveCostGuard - independent budget pool for background (proactive)
 * investigations triggered by ChangeWatcher, AnomalyDetector, etc.
 *
 * Separate from the user-initiated CostTracker so that background pipelines
 * cannot consume user-facing budget and vice-versa.
 *
 * Daily counters are reset automatically when the calendar date changes.
 */
const DEFAULTS = {
    proactiveDailyTokenBudget: 500_000,
    proactiveDailyInvestigationLimit: 200,
    proactiveSingleInvestigationBudget: 10_000,
    warningThresholdPercent: 80,
};
export class ProactiveCostGuard {
    cfg;
    /** Day window (YYYY-MM-DD) for the current daily counters */
    dailyDate;
    /** Total tokens consumed today across all background investigations */
    dailyTokensUsed = 0;
    /** Number of background investigations started today */
    dailyInvestigationsRun = 0;
    /** Per-investigation token usage for budget enforcement */
    perInvestigation = new Map();
    constructor(cfg = {}) {
        this.cfg = { ...DEFAULTS, ...cfg };
        this.dailyDate = todayLabel();
    }
    // -- Gate --
    /**
     * Check whether a new background investigation may be started.
     * Call this before launching an investigation; does NOT consume budget.
     */
    canRun() {
        this.rolloverIfNeeded();
        if (this.dailyInvestigationsRun >= this.cfg.proactiveDailyInvestigationLimit) {
            return {
                allowed: false,
                reason: `Daily investigation limit reached: ${this.dailyInvestigationsRun}/${this.cfg.proactiveDailyInvestigationLimit}`,
            };
        }
        if (this.dailyTokensUsed >= this.cfg.proactiveDailyTokenBudget) {
            return {
                allowed: false,
                reason: `Daily token budget exhausted: ${this.dailyTokensUsed}/${this.cfg.proactiveDailyTokenBudget} tokens used`,
            };
        }
        return { allowed: true };
    }
    /**
     * Check whether more token usage is allowed within a single background
     * investigation. Call before each LLM call inside the investigation.
     */
    checkInvestigationBudget(investigationId) {
        this.rolloverIfNeeded();
        const rec = this.perInvestigation.get(investigationId);
        const used = rec?.totalTokens ?? 0;
        if (used >= this.cfg.proactiveSingleInvestigationBudget) {
            return {
                allowed: false,
                reason: `Single investigation budget exhausted: ${used}/${this.cfg.proactiveSingleInvestigationBudget} tokens used`,
            };
        }
        return { allowed: true };
    }
    // -- Consumption --
    /**
     * Register the start of a new background investigation.
     * Increments the daily investigation counter.
     * Does NOT pre-check the budget - call canRun() first.
     */
    recordInvestigationStart(investigationId) {
        this.rolloverIfNeeded();
        this.dailyInvestigationsRun += 1;
        if (!this.perInvestigation.has(investigationId)) {
            this.perInvestigation.set(investigationId, {
                investigationId,
                promptTokens: 0,
                completionTokens: 0,
                totalTokens: 0,
                queryCount: 0,
                timestamp: new Date().toISOString(),
            });
        }
    }
    /**
     * Record LLM token usage for a background investigation.
     * Counts against both the per-investigation and daily budgets.
     */
    recordTokenUsage(investigationId, tokens) {
        this.rolloverIfNeeded();
        const total = tokens.prompt + tokens.completion;
        this.dailyTokensUsed += total;
        const rec = this.getOrCreateRecord(investigationId);
        rec.promptTokens += tokens.prompt;
        rec.completionTokens += tokens.completion;
        rec.totalTokens += total;
        rec.timestamp = new Date().toISOString();
    }
    /**
     * Record a data-source query for a background investigation.
     */
    recordQuery(investigationId) {
        const rec = this.getOrCreateRecord(investigationId);
        rec.queryCount += 1;
        rec.timestamp = new Date().toISOString();
    }
    // -- Observation --
    /** Return the current daily budget status. */
    getDailyStatus() {
        this.rolloverIfNeeded();
        const tokenPercent = this.cfg.proactiveDailyTokenBudget > 0
            ? (this.dailyTokensUsed / this.cfg.proactiveDailyTokenBudget) * 100
            : 0;
        const invPercent = this.cfg.proactiveDailyInvestigationLimit > 0
            ? (this.dailyInvestigationsRun / this.cfg.proactiveDailyInvestigationLimit) * 100
            : 0;
        const isWarning = (tokenPercent >= this.cfg.warningThresholdPercent && tokenPercent < 100) ||
            (invPercent >= this.cfg.warningThresholdPercent && invPercent < 100);
        return {
            date: this.dailyDate,
            tokensUsed: this.dailyTokensUsed,
            dailyTokenBudget: this.cfg.proactiveDailyTokenBudget,
            tokenPercentUsed: tokenPercent,
            investigationsRun: this.dailyInvestigationsRun,
            dailyInvestigationLimit: this.cfg.proactiveDailyInvestigationLimit,
            isDailyTokenBudgetExhausted: this.dailyTokensUsed >= this.cfg.proactiveDailyTokenBudget,
            isDailyInvestigationLimitReached: this.dailyInvestigationsRun >= this.cfg.proactiveDailyInvestigationLimit,
            isWarning,
        };
    }
    /** Return per-investigation cost record (undefined if not started). */
    getInvestigationRecord(investigationId) {
        const rec = this.perInvestigation.get(investigationId);
        return rec ? { ...rec } : undefined;
    }
    // -- Reset --
    /**
     * Manually reset daily counters.
     * Useful in tests and for forced resets (e.g. at midnight via a cron job).
     */
    resetDaily() {
        this.dailyDate = todayLabel();
        this.dailyTokensUsed = 0;
        this.dailyInvestigationsRun = 0;
        this.perInvestigation.clear();
    }
    // -- Private helpers --
    rolloverIfNeeded() {
        const today = todayLabel();
        if (today !== this.dailyDate) {
            this.dailyDate = today;
            this.dailyTokensUsed = 0;
            this.dailyInvestigationsRun = 0;
            this.perInvestigation.clear();
        }
    }
    getOrCreateRecord(investigationId) {
        let rec = this.perInvestigation.get(investigationId);
        if (!rec) {
            rec = {
                investigationId,
                promptTokens: 0,
                completionTokens: 0,
                totalTokens: 0,
                queryCount: 0,
                timestamp: new Date().toISOString(),
            };
            this.perInvestigation.set(investigationId, rec);
        }
        return rec;
    }
}
// -- Utility --
function todayLabel() {
    return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}
//# sourceMappingURL=proactive-guard.js.map
