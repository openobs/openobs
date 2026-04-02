// withAudit - convenience bound-context audit recorder
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
export function withAudit(logger, investigationId, userId) {
    function emit(action, phase, detail, metadata) {
        return logger.log({ investigationId, userId, action, phase, detail, metadata });
    }
    return {
        log: emit,
        intent(intentText, metadata) {
            return emit('intent_parsed', 'planning', { intent: intentText }, metadata);
        },
        context(ctx, metadata) {
            return emit('context_gathered', 'investigating', { context: ctx }, metadata);
        },
        plan(plan, metadata) {
            return emit('plan_generated', 'planning', { plan }, metadata);
        },
        step(stepId, result, metadata) {
            return emit('step_executed', 'investigating', { stepId, result }, metadata);
        },
        hypothesis(hypothesis, metadata) {
            return emit('hypothesis_proposed', 'evidencing', { hypothesis }, metadata);
        },
        evidence(evidenceId, hypothesisId, summary, metadata) {
            return emit('evidence_bound', 'evidencing', { evidenceId, hypothesisId, summary }, metadata);
        },
        conclusion(conclusion, metadata) {
            return emit('conclusion_generated', 'explaining', { conclusion }, metadata);
        },
        actionProposed(action, metadata) {
            return emit('action_proposed', 'acting', { action }, metadata);
        },
        actionApproved(actionId, approvedBy, metadata) {
            return emit('action_approved', 'acting', { actionId, approvedBy }, metadata);
        },
        actionExecuted(actionId, result, metadata) {
            return emit('action_executed', 'acting', { actionId, result }, metadata);
        },
        actionFailed(actionId, error, metadata) {
            return emit('action_failed', 'acting', { actionId, error }, metadata);
        },
        completed(summary, metadata) {
            return emit('investigation_completed', 'completed', { summary }, metadata);
        },
        failed(reason, metadata) {
            return emit('investigation_failed', 'failed', { reason }, metadata);
        },
    };
}
//# sourceMappingURL=middleware.js.map
