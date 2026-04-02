import type { CostBudget, CostRecord, CostStatus, BudgetCheckResult } from './types.js';

export const DEFAULT_BUDGET: CostBudget = {
  maxTokensPerInvestigation: 50_000,
  maxTokensPerSession: 200_000,
  maxQueriesPerInvestigation: 100,
  warningThresholdPercent: 80,
};

function emptyRecord(investigationId: string): CostRecord {
  return {
    investigationId,
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    queryCount: 0,
    timestamp: new Date().toISOString(),
  };
}

export class CostTracker {
  private readonly records = new Map<string, CostRecord>();
  private readonly budget: CostBudget;

  constructor(budget: CostBudget = DEFAULT_BUDGET) {
    this.budget = budget;
  }

  /** Record LLM token usage for an investigation */
  record(investigationId: string, tokens: { prompt: number; completion: number }): void {
    const rec = this.getOrCreate(investigationId);
    rec.promptTokens += tokens.prompt;
    rec.completionTokens += tokens.completion;
    rec.totalTokens += tokens.prompt + tokens.completion;
    rec.timestamp = new Date().toISOString();
  }

  /** Record a data-source query for an investigation */
  recordQuery(investigationId: string): void {
    const rec = this.getOrCreate(investigationId);
    rec.queryCount += 1;
    rec.timestamp = new Date().toISOString();
  }

  /** Get full cost status for an investigation */
  getStatus(investigationId: string): CostStatus {
    const used = this.getOrCreate(investigationId);
    const percentUsed = (used.totalTokens / this.budget.maxTokensPerInvestigation) * 100;

    return {
      used: { ...used },
      budget: { ...this.budget },
      percentUsed,
      isOverBudget:
        used.totalTokens > this.budget.maxTokensPerInvestigation ||
        used.queryCount > this.budget.maxQueriesPerInvestigation,
      isWarning: percentUsed >= this.budget.warningThresholdPercent && percentUsed < 100,
    };
  }

  /** Check whether a new LLM call / query is allowed */
  checkBudget(investigationId: string): BudgetCheckResult {
    const rec = this.records.get(investigationId) ?? emptyRecord(investigationId);

    if (rec.totalTokens >= this.budget.maxTokensPerInvestigation) {
      return {
        allowed: false,
        reason: `Token budget exhausted: ${rec.totalTokens}/${this.budget.maxTokensPerInvestigation} tokens used`,
      };
    }

    if (rec.queryCount >= this.budget.maxQueriesPerInvestigation) {
      return {
        allowed: false,
        reason: `Query budget exhausted: ${rec.queryCount}/${this.budget.maxQueriesPerInvestigation} queries used`,
      };
    }

    // Session-level check
    const sessionTotal = this.getSessionTotal();
    if (sessionTotal >= this.budget.maxTokensPerSession) {
      return {
        allowed: false,
        reason: `Session token budget exhausted: ${sessionTotal}/${this.budget.maxTokensPerSession} tokens used`,
      };
    }

    return { allowed: true };
  }

  /** Reset cost records for an investigation */
  reset(investigationId: string): void {
    this.records.delete(investigationId);
  }

  /** Return aggregate totals across all tracked investigations */
  getTotalCost(): { totalTokens: number; totalQueries: number } {
    let totalTokens = 0;
    let totalQueries = 0;
    for (const rec of this.records.values()) {
      totalTokens += rec.totalTokens;
      totalQueries += rec.queryCount;
    }
    return { totalTokens, totalQueries };
  }

  /** Return a cost report for all tracked investigations */
  getReport(): CostRecord[] {
    return Array.from(this.records.values()).map((r) => ({ ...r }));
  }

  private getOrCreate(investigationId: string): CostRecord {
    let rec = this.records.get(investigationId);
    if (!rec) {
      rec = emptyRecord(investigationId);
      this.records.set(investigationId, rec);
    }
    return rec;
  }

  private getSessionTotal(): number {
    let total = 0;
    for (const rec of this.records.values()) {
      total += rec.totalTokens;
    }
    return total;
  }
}
