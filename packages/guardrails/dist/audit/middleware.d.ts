import type { AuditLogger } from './logger.js';
import type { AuditEntry, AuditAction } from './types.js';
import type { InvestigationStatus } from '@agentic-obs/common';
export interface BoundAuditLogger {
    /** Log a raw action with full detail */
    log(action: AuditAction, phase: InvestigationStatus, detail: Record<string, unknown>, metadata?: Record<string, string>): AuditEntry;
    /** User submitted a natural language intent */
    intent(intentText: string, metadata?: Record<string, string>): AuditEntry;
    /** System context was gathered (services, topology, recent changes) */
    context(context: Record<string, unknown>, metadata?: Record<string, string>): AuditEntry;
    /** Investigation plan was generated */
    plan(plan: unknown, metadata?: Record<string, string>): AuditEntry;
    /** A plan step was executed */
    step(stepId: string, result: unknown, metadata?: Record<string, string>): AuditEntry;
    /** A hypothesis was proposed by an agent */
    hypothesis(hypothesis: unknown, metadata?: Record<string, string>): AuditEntry;
    /** Evidence was bound to a hypothesis */
    evidence(evidenceId: string, hypothesisId: string, summary: string, metadata?: Record<string, string>): AuditEntry;
    /** A structured conclusion was generated */
    conclusion(conclusion: unknown, metadata?: Record<string, string>): AuditEntry;
    /** An action was proposed */
    actionProposed(action: unknown, metadata?: Record<string, string>): AuditEntry;
    /** A proposed action was approved */
    actionApproved(actionId: string, approvedBy: string, metadata?: Record<string, string>): AuditEntry;
    /** An action was executed */
    actionExecuted(actionId: string, result: unknown, metadata?: Record<string, string>): AuditEntry;
    /** An action failed */
    actionFailed(actionId: string, error: string, metadata?: Record<string, string>): AuditEntry;
    /** Investigation completed successfully */
    completed(summary: string, metadata?: Record<string, string>): AuditEntry;
    /** Investigation failed */
    failed(reason: string, metadata?: Record<string, string>): AuditEntry;
}
/**
 * Create a context-bound audit recorder for a specific investigation and user.
 * Eliminates the need to repeat investigationId/userId on every log call.
 *
 * Example
 * const audit = withAudit(logger, investigationId, userId);
 * audit.intent('Why is checkout latency high?');
 * audit.plan(generatedPlan);
 * audit.conclusion(findings);
 */
export declare function withAudit(logger: AuditLogger, investigationId: string, userId: string): BoundAuditLogger;
//# sourceMappingURL=middleware.d.ts.map
