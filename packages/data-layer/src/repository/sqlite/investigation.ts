import { eq, and, sql } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import type { Investigation } from '@agentic-obs/common';
import type { ExplanationResult } from '@agentic-obs/common';
import type { SqliteClient } from '../../db/sqlite-client.js';
import {
  investigations,
  investigationFollowUps,
  investigationFeedback,
  investigationConclusions,
} from '../../db/sqlite-schema.js';
import type {
  IInvestigationRepository,
  InvestigationFindAllOptions,
} from '../interfaces.js';
import type { FollowUpRecord, FeedbackBody, StoredFeedback } from '../../stores/investigation-store.js';

type DbRow = typeof investigations.$inferSelect;

function rowToInvestigation(row: DbRow): Investigation {
  return {
    id: row.id,
    sessionId: row.sessionId ?? '',
    userId: row.userId ?? '',
    intent: row.intent,
    structuredIntent: (row.structuredIntent ?? {}) as Investigation['structuredIntent'],
    plan: (row.plan ?? { entity: '', objective: '', steps: [], stopConditions: [] }) as Investigation['plan'],
    status: row.status as Investigation['status'],
    hypotheses: (row.hypotheses as Investigation['hypotheses']) ?? [],
    evidence: (row.evidence as Investigation['evidence']) ?? [],
    symptoms: (row.symptoms as Investigation['symptoms']) ?? [],
    actions: (row.actions as Investigation['actions']) ?? [],
    workspaceId: row.workspaceId ?? undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class SqliteInvestigationRepository implements IInvestigationRepository {
  constructor(private readonly db: SqliteClient) {}

  async findById(id: string): Promise<Investigation | undefined> {
    const [row] = await this.db.select().from(investigations).where(eq(investigations.id, id));
    return row ? rowToInvestigation(row) : undefined;
  }

  async findAll(opts: InvestigationFindAllOptions = {}): Promise<Investigation[]> {
    const conditions = [eq(investigations.archived, false)];
    if (opts.tenantId) conditions.push(eq(investigations.tenantId, opts.tenantId));
    if (opts.status) conditions.push(eq(investigations.status, opts.status));

    const rows = await this.db
      .select()
      .from(investigations)
      .where(and(...conditions))
      .limit(opts.limit ?? 100)
      .offset(opts.offset ?? 0);

    return rows.map(rowToInvestigation);
  }

  async create(
    data: (Omit<Investigation, 'id' | 'createdAt'> & { id?: string })
      | { question: string; sessionId: string; userId: string; entity?: string; timeRange?: { start: string; end: string }; tenantId?: string; workspaceId?: string },
  ): Promise<Investigation> {
    const now = new Date().toISOString();

    // Support both IGatewayInvestigationStore.create({ question }) and
    // IRepository<Investigation>.create({ intent }) signatures.
    const isGatewayParams = 'question' in data;
    const intent = isGatewayParams ? (data as { question: string }).question : (data as Investigation).intent;
    const sessionId = data.sessionId;
    const userId = data.userId;
    const tenantId = (data as Record<string, unknown>).tenantId as string | undefined ?? 'default';
    const workspaceId = (data as Record<string, unknown>).workspaceId as string | undefined;
    const entity = isGatewayParams ? (data as { entity?: string }).entity ?? '' : '';
    const timeRange = isGatewayParams
      ? (data as { timeRange?: { start: string; end: string } }).timeRange ?? { start: new Date(Date.now() - 3600_000).toISOString(), end: now }
      : { start: new Date(Date.now() - 3600_000).toISOString(), end: now };

    const structuredIntent = isGatewayParams
      ? { taskType: 'general_query' as const, entity, timeRange, goal: intent }
      : (data as Investigation).structuredIntent;
    const plan = isGatewayParams
      ? { entity, objective: intent, steps: [] as unknown[], stopConditions: [] as string[] }
      : (data as Investigation).plan;
    const status = isGatewayParams ? 'planning' : (data as Investigation).status;

    const id = ('id' in data && data.id) ? data.id as string : `inv_${randomUUID().slice(0, 8)}`;
    const [row] = await this.db
      .insert(investigations)
      .values({
        id,
        tenantId,
        sessionId,
        userId,
        intent,
        structuredIntent: structuredIntent as unknown as Record<string, unknown>,
        plan: plan as unknown as Record<string, unknown>,
        status,
        hypotheses: isGatewayParams ? [] : (data as Investigation).hypotheses,
        actions: isGatewayParams ? [] : ((data as Investigation).actions ?? []),
        evidence: isGatewayParams ? [] : (data as Investigation).evidence,
        symptoms: isGatewayParams ? [] : (data as Investigation).symptoms,
        workspaceId,
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    return rowToInvestigation(row!);
  }

  async update(
    id: string,
    patch: Partial<Omit<Investigation, 'id'>>,
  ): Promise<Investigation | undefined> {
    const sets: Record<string, unknown> = { updatedAt: new Date().toISOString() };
    if (patch.status !== undefined) sets.status = patch.status;
    if (patch.plan !== undefined) sets.plan = patch.plan;
    if (patch.hypotheses !== undefined) sets.hypotheses = patch.hypotheses;
    if (patch.evidence !== undefined) sets.evidence = patch.evidence;
    if (patch.symptoms !== undefined) sets.symptoms = patch.symptoms;
    if (patch.actions !== undefined) sets.actions = patch.actions;
    if (patch.intent !== undefined) sets.intent = patch.intent;

    const [row] = await this.db
      .update(investigations)
      .set(sets)
      .where(eq(investigations.id, id))
      .returning();

    return row ? rowToInvestigation(row) : undefined;
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.db.delete(investigations).where(eq(investigations.id, id)).returning();
    return result.length > 0;
  }

  async count(): Promise<number> {
    const result = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(investigations)
      .where(eq(investigations.archived, false));
    return Number(result[0]?.count ?? 0);
  }

  async findBySession(sessionId: string): Promise<Investigation[]> {
    const rows = await this.db
      .select()
      .from(investigations)
      .where(eq(investigations.sessionId, sessionId));
    return rows.map(rowToInvestigation);
  }

  async findByUser(userId: string, tenantId?: string): Promise<Investigation[]> {
    const conditions = [eq(investigations.userId, userId), eq(investigations.archived, false)];
    if (tenantId) conditions.push(eq(investigations.tenantId, tenantId));
    const rows = await this.db
      .select()
      .from(investigations)
      .where(and(...conditions));
    return rows.map(rowToInvestigation);
  }

  async findByWorkspace(workspaceId: string): Promise<Investigation[]> {
    const rows = await this.db
      .select()
      .from(investigations)
      .where(and(eq(investigations.workspaceId, workspaceId), eq(investigations.archived, false)));
    return rows.map(rowToInvestigation);
  }

  async archive(id: string): Promise<Investigation | undefined> {
    const [row] = await this.db
      .update(investigations)
      .set({ archived: true, updatedAt: new Date().toISOString() })
      .where(eq(investigations.id, id))
      .returning();
    return row ? rowToInvestigation(row) : undefined;
  }

  async restore(id: string): Promise<Investigation | undefined> {
    const [row] = await this.db
      .update(investigations)
      .set({ archived: false, updatedAt: new Date().toISOString() })
      .where(eq(investigations.id, id))
      .returning();
    return row ? rowToInvestigation(row) : undefined;
  }

  async findArchived(tenantId?: string): Promise<Investigation[]> {
    const conditions = [eq(investigations.archived, true)];
    if (tenantId) conditions.push(eq(investigations.tenantId, tenantId));
    const rows = await this.db
      .select()
      .from(investigations)
      .where(and(...conditions));
    return rows.map(rowToInvestigation);
  }

  // — Follow-ups

  async addFollowUp(investigationId: string, question: string): Promise<FollowUpRecord> {
    const now = new Date().toISOString();
    const id = `fu_${randomUUID().slice(0, 8)}`;
    const [row] = await this.db
      .insert(investigationFollowUps)
      .values({ id, investigationId, question, createdAt: now })
      .returning();
    return { id: row!.id, investigationId: row!.investigationId, question: row!.question, createdAt: row!.createdAt };
  }

  async getFollowUps(investigationId: string): Promise<FollowUpRecord[]> {
    const rows = await this.db
      .select()
      .from(investigationFollowUps)
      .where(eq(investigationFollowUps.investigationId, investigationId));
    return rows.map((r) => ({ id: r.id, investigationId: r.investigationId, question: r.question, createdAt: r.createdAt }));
  }

  // — Feedback

  async addFeedback(investigationId: string, body: FeedbackBody): Promise<StoredFeedback> {
    const now = new Date().toISOString();
    const id = `fb_${randomUUID().slice(0, 8)}`;
    const [row] = await this.db
      .insert(investigationFeedback)
      .values({
        id,
        investigationId,
        helpful: body.helpful,
        comment: body.comment ?? null,
        rootCauseVerdict: body.rootCauseVerdict ?? null,
        hypothesisFeedbacks: body.hypothesisFeedbacks ?? null,
        actionFeedbacks: body.actionFeedbacks ?? null,
        createdAt: now,
      })
      .returning();
    return {
      id: row!.id,
      investigationId: row!.investigationId,
      helpful: row!.helpful,
      comment: row!.comment ?? undefined,
      rootCauseVerdict: row!.rootCauseVerdict as StoredFeedback['rootCauseVerdict'],
      hypothesisFeedbacks: row!.hypothesisFeedbacks as StoredFeedback['hypothesisFeedbacks'],
      actionFeedbacks: row!.actionFeedbacks as StoredFeedback['actionFeedbacks'],
      createdAt: row!.createdAt,
    };
  }

  // — Conclusions

  async getConclusion(id: string): Promise<ExplanationResult | undefined> {
    const [row] = await this.db
      .select()
      .from(investigationConclusions)
      .where(eq(investigationConclusions.investigationId, id));
    return row ? (row.conclusion as ExplanationResult) : undefined;
  }

  async setConclusion(id: string, conclusion: ExplanationResult): Promise<void> {
    // Upsert: try insert, on conflict update
    const existing = await this.db
      .select()
      .from(investigationConclusions)
      .where(eq(investigationConclusions.investigationId, id));
    if (existing.length > 0) {
      await this.db
        .update(investigationConclusions)
        .set({ conclusion: conclusion as unknown as Record<string, unknown> })
        .where(eq(investigationConclusions.investigationId, id));
    } else {
      await this.db
        .insert(investigationConclusions)
        .values({ investigationId: id, conclusion: conclusion as unknown as Record<string, unknown> });
    }
  }

  // — Orchestrator write-back

  async updateStatus(id: string, status: string): Promise<Investigation | undefined> {
    return this.update(id, { status: status as Investigation['status'] });
  }

  async updatePlan(id: string, plan: Investigation['plan']): Promise<Investigation | undefined> {
    return this.update(id, { plan });
  }

  async updateResult(id: string, result: {
    hypotheses: Investigation['hypotheses'];
    evidence: Investigation['evidence'];
    conclusion: ExplanationResult | null;
  }): Promise<Investigation | undefined> {
    const inv = await this.update(id, {
      hypotheses: result.hypotheses,
      evidence: result.evidence,
    });
    if (inv && result.conclusion) {
      await this.setConclusion(id, result.conclusion);
    }
    return inv;
  }
}
