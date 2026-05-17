import { describe, it, expect } from 'vitest';
import { EventTypes, type ApprovalCreatedEventPayload, type EventEnvelope } from '@agentic-obs/common/events';
import { InMemoryEventBus } from '@agentic-obs/common/events/node';
import type {
  ApprovalAction,
  ApprovalContext,
  ApprovalRequest,
  ApprovalScopeFilter,
  ApprovalStatus,
  IApprovalRequestRepository,
} from '@agentic-obs/data-layer';
import { PublishingApprovalRepository } from './publishing-approval-repository.js';

class FakeRepo implements IApprovalRequestRepository {
  rows: ApprovalRequest[] = [];
  shouldThrow = false;

  async findById(id: string) { return this.rows.find((r) => r.id === id); }

  async submit(params: {
    action: ApprovalAction;
    context: ApprovalContext;
    ttlMs?: number;
    opsConnectorId?: string | null;
    targetNamespace?: string | null;
    requesterTeamId?: string | null;
  }): Promise<ApprovalRequest> {
    if (this.shouldThrow) throw new Error('boom');
    const row: ApprovalRequest = {
      id: `ap_${this.rows.length + 1}`,
      action: params.action,
      context: params.context,
      status: 'pending',
      createdAt: '2026-05-03T00:00:00.000Z',
      expiresAt: '2026-05-04T00:00:00.000Z',
      opsConnectorId: params.opsConnectorId ?? null,
      targetNamespace: params.targetNamespace ?? null,
      requesterTeamId: params.requesterTeamId ?? null,
    };
    this.rows.push(row);
    return row;
  }

  async listPending() { return this.rows.filter((r) => r.status === 'pending'); }
  async list(_orgId: string, _opts?: { scopeFilter?: ApprovalScopeFilter; status?: ApprovalStatus | ApprovalStatus[] }) {
    return [...this.rows];
  }
  async approve(id: string) { return this.findById(id); }
  async reject(id: string) { return this.findById(id); }
  async override(id: string) { return this.findById(id); }
}

describe('PublishingApprovalRepository.submit', () => {
  it('publishes approval.created AFTER a successful commit, with all scope tags on the payload', async () => {
    const bus = new InMemoryEventBus();
    const inner = new FakeRepo();
    const seen: EventEnvelope<ApprovalCreatedEventPayload>[] = [];
    bus.subscribe<ApprovalCreatedEventPayload>(EventTypes.APPROVAL_CREATED, (env) => {
      seen.push(env);
    });

    const repo = new PublishingApprovalRepository({ inner, bus, orgId: 'org_main' });

    const result = await repo.submit({
      action: { type: 'plan', targetService: 'remediation-plan', params: { planId: 'plan_1', summary: 's', stepCount: 1 } },
      context: { investigationId: 'inv_9', requestedBy: 'agent', reason: 'fix prod-eks pod crashloop' },
      opsConnectorId: 'prod-eks',
      targetNamespace: 'platform',
      requesterTeamId: 'team_payments',
    });

    expect(result.id).toBe('ap_1');
    expect(seen).toHaveLength(1);
    const payload = seen[0]!.payload;
    expect(payload.approvalId).toBe('ap_1');
    expect(payload.orgId).toBe('org_main');
    expect(payload.opsConnectorId).toBe('prod-eks');
    expect(payload.targetNamespace).toBe('platform');
    expect(payload.requesterTeamId).toBe('team_payments');
    expect(payload.planId).toBe('plan_1');
    expect(payload.investigationId).toBe('inv_9');
    expect(payload.summary).toBe('fix prod-eks pod crashloop');
  });

  it('does NOT publish when the underlying submit throws', async () => {
    const bus = new InMemoryEventBus();
    const inner = new FakeRepo();
    inner.shouldThrow = true;
    const seen: unknown[] = [];
    bus.subscribe(EventTypes.APPROVAL_CREATED, (env) => { seen.push(env); });

    const repo = new PublishingApprovalRepository({ inner, bus, orgId: 'org_main' });

    await expect(repo.submit({
      action: { type: 'plan', targetService: 'x', params: {} },
      context: { requestedBy: 'agent', reason: 'r' },
    })).rejects.toThrow('boom');

    expect(seen).toHaveLength(0);
    expect(inner.rows).toHaveLength(0);
  });

  it('per-step approvals carry planId from context.planId', async () => {
    const bus = new InMemoryEventBus();
    const inner = new FakeRepo();
    const seen: EventEnvelope<ApprovalCreatedEventPayload>[] = [];
    bus.subscribe<ApprovalCreatedEventPayload>(EventTypes.APPROVAL_CREATED, (env) => { seen.push(env); });

    const repo = new PublishingApprovalRepository({ inner, bus, orgId: 'org_main' });

    await repo.submit({
      action: { type: 'ops.run_command', targetService: 'prod-eks', params: { argv: [] } },
      context: { requestedBy: 'agent', reason: 'r', planId: 'plan_42', stepOrdinal: 2 } as ApprovalContext,
      opsConnectorId: 'prod-eks',
      targetNamespace: null,
      requesterTeamId: null,
    });

    expect(seen[0]!.payload.planId).toBe('plan_42');
    expect(seen[0]!.payload.targetNamespace).toBeNull();
  });
});
