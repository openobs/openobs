import type { InvestigationStatus } from '@agentic-obs/common';
export type AuditAction = 'investigation_created' | 'intent_parsed' | 'context_gathered' | 'plan_generated' | 'step_executed' | 'hypothesis_proposed' | 'evidence_bound' | 'conclusion_generated' | 'action_proposed' | 'action_approved' | 'action_executed' | 'action_failed' | 'investigation_completed' | 'investigation_failed';
/**
 * A single immutable audit log entry capturing one event in the investigation lifecycle.
 * Records who acted, when, in which investigation phase, with structured detail.
 */
export interface AuditEntry {
    id: string;
    timestamp: string;
    investigationId: string;
    userId: string;
    action: AuditAction;
    /** Investigation lifecycle phase at the time of this event */
    phase: InvestigationStatus;
    /** Structured payload - what happened (intent text, plan object, hypothesis, etc.) */
    detail: Record<string, unknown>;
    metadata?: Record<string, string>;
}
export interface AuditQuery {
    investigationId?: string;
    userId?: string;
    action?: AuditAction;
    timeRange?: {
        start: string;
        end: string;
    };
    limit?: number;
}
//# sourceMappingURL=types.d.ts.map
