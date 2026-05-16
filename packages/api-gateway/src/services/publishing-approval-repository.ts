/**
 * PublishingApprovalRepository — wraps `IApprovalRequestRepository.submit` so
 * a successful row-commit publishes an `approval.created` event on the shared
 * IEventBus. All other methods delegate to the wrapped repo.
 *
 * Design choice: a thin adapter over the data-layer repo (mirrors the
 * EventEmittingApprovalRepository pattern). Keeps agent-core unaware of the
 * bus — the agent's `ApprovalRequestStore` interface needs no new fields.
 *
 * Publish ordering: ONLY after `submit()` resolves. A throwing submit → no
 * publish. See approvals-multi-team-scope §3.7 / T3.1 acceptance #1.
 */

import type {
  IApprovalRequestRepository,
  ApprovalScopeFilter,
  ApprovalStatus,
  ApprovalRequest,
  ApprovalAction,
  ApprovalContext,
} from '@agentic-obs/data-layer';
import type { IEventBus } from '@agentic-obs/common';
import {
  EventTypes,
  createEvent,
  type ApprovalCreatedEventPayload,
} from '@agentic-obs/common/events';
import { createLogger } from '@agentic-obs/server-utils/logging';

const log = createLogger('publishing-approval-repo');

export interface PublishingApprovalRepoDeps {
  inner: IApprovalRequestRepository;
  bus: IEventBus;
  /** OrgId injected at construction (per-request scoping isn't applicable;
   *  the inner repo is org-keyed via the row write itself). */
  orgId: string;
}

function deriveSummary(action: ApprovalAction, context: ApprovalContext): string {
  if (typeof context.reason === 'string' && context.reason.length > 0) return context.reason;
  return `${action.type} on ${action.targetService}`;
}

function derivePlanId(action: ApprovalAction, context: ApprovalContext): string | null {
  // Plan-level approval: action.type === 'plan' and params.planId is the plan.
  // Per-step approval: action.type === 'ops.run_command' and context.planId is the plan.
  if (action.type === 'plan') {
    const p = (action.params ?? {})['planId'];
    return typeof p === 'string' ? p : null;
  }
  const p = (context as Record<string, unknown>)['planId'];
  return typeof p === 'string' ? p : null;
}

export class PublishingApprovalRepository implements IApprovalRequestRepository {
  constructor(private readonly deps: PublishingApprovalRepoDeps) {}

  findById(id: string): Promise<ApprovalRequest | undefined> {
    return this.deps.inner.findById(id);
  }

  async submit(params: {
    action: ApprovalAction;
    context: ApprovalContext;
    ttlMs?: number;
    opsConnectorId?: string | null;
    targetNamespace?: string | null;
    requesterTeamId?: string | null;
  }): Promise<ApprovalRequest> {
    const row = await this.deps.inner.submit(params);
    // Publish after commit. A failure to publish is logged but does NOT
    // unwind the row — the row exists, the missed notification is the
    // operator's recoverable problem.
    const payload: ApprovalCreatedEventPayload = {
      approvalId: row.id,
      orgId: this.deps.orgId,
      planId: derivePlanId(params.action, params.context),
      investigationId: params.context.investigationId ?? null,
      opsConnectorId: params.opsConnectorId ?? null,
      targetNamespace: params.targetNamespace ?? null,
      requesterTeamId: params.requesterTeamId ?? null,
      summary: deriveSummary(params.action, params.context),
      severity: null,
      createdAt: row.createdAt,
    };
    try {
      await this.deps.bus.publish(
        EventTypes.APPROVAL_CREATED,
        createEvent(EventTypes.APPROVAL_CREATED, payload),
      );
    } catch (err) {
      log.error(
        { err: err instanceof Error ? err.message : String(err), approvalId: row.id },
        'failed to publish approval.created event',
      );
    }
    return row;
  }

  listPending(): Promise<ApprovalRequest[]> {
    return this.deps.inner.listPending();
  }

  list(
    orgId: string,
    opts?: { scopeFilter?: ApprovalScopeFilter; status?: ApprovalStatus | ApprovalStatus[] },
  ): Promise<ApprovalRequest[]> {
    return this.deps.inner.list(orgId, opts);
  }

  approve(id: string, by: string, roles?: string[]): Promise<ApprovalRequest | undefined> {
    return this.deps.inner.approve(id, by, roles);
  }

  reject(id: string, by: string, roles?: string[]): Promise<ApprovalRequest | undefined> {
    return this.deps.inner.reject(id, by, roles);
  }

  override(id: string, by: string, roles?: string[]): Promise<ApprovalRequest | undefined> {
    return this.deps.inner.override(id, by, roles);
  }
}
