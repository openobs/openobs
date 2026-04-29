import { eq, and, like, sql } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { cases } from '../../db/sqlite-schema.js';
import type { ICaseRepository, CaseFindAllOptions } from '../interfaces.js';
import type { Case } from '../types.js';

type CaseRow = typeof cases.$inferSelect;

function rowToCase(row: CaseRow): Case {
  return {
    id: row.id,
    tenantId: row.tenantId,
    title: row.title,
    symptoms: (row.symptoms as string[]) ?? [],
    rootCause: row.rootCause,
    resolution: row.resolution,
    services: (row.services as string[]) ?? [],
    tags: (row.tags as string[]) ?? [],
    evidenceRefs: (row.evidenceRefs as string[]) ?? [],
    actions: (row.actions as string[]) ?? [],
    outcome: row.outcome ?? undefined,
    createdAt: row.createdAt,
  };
}

export class PostgresCaseRepository implements ICaseRepository {
  constructor(private readonly db: any) {}

  async findById(id: string): Promise<Case | undefined> {
    const [row] = await this.db.select().from(cases).where(eq(cases.id, id));
    return row ? rowToCase(row) : undefined;
  }

  async findAll(opts: CaseFindAllOptions = {}): Promise<Case[]> {
    const conditions = opts.tenantId ? [eq(cases.tenantId, opts.tenantId)] : [];
    const rows = await this.db
      .select()
      .from(cases)
      .where(conditions.length ? and(...conditions) : undefined)
      .limit(opts.limit ?? 100)
      .offset(opts.offset ?? 0);
    return rows.map(rowToCase);
  }

  async create(data: Omit<Case, 'id' | 'createdAt'> & { id?: string }): Promise<Case> {
    const now = new Date().toISOString();
    const id = data.id ?? `case_${randomUUID().slice(0, 8)}`;
    const [row] = await this.db
      .insert(cases)
      .values({
        id,
        tenantId: data.tenantId,
        title: data.title,
        symptoms: data.symptoms,
        rootCause: data.rootCause,
        resolution: data.resolution,
        services: data.services,
        tags: data.tags,
        evidenceRefs: data.evidenceRefs,
        actions: data.actions,
        outcome: data.outcome,
        createdAt: now,
      })
      .returning();
    return rowToCase(row!);
  }

  async update(id: string, patch: Partial<Omit<Case, 'id'>>): Promise<Case | undefined> {
    const sets: Record<string, unknown> = {};
    if (patch.title !== undefined) sets.title = patch.title;
    if (patch.rootCause !== undefined) sets.rootCause = patch.rootCause;
    if (patch.resolution !== undefined) sets.resolution = patch.resolution;
    if (patch.symptoms !== undefined) sets.symptoms = patch.symptoms;
    if (patch.services !== undefined) sets.services = patch.services;
    if (patch.tags !== undefined) sets.tags = patch.tags;
    if (patch.evidenceRefs !== undefined) sets.evidenceRefs = patch.evidenceRefs;
    if (patch.actions !== undefined) sets.actions = patch.actions;
    if (patch.outcome !== undefined) sets.outcome = patch.outcome;

    const [row] = await this.db
      .update(cases)
      .set(sets)
      .where(eq(cases.id, id))
      .returning();
    return row ? rowToCase(row) : undefined;
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.db.delete(cases).where(eq(cases.id, id)).returning();
    return result.length > 0;
  }

  async count(): Promise<number> {
    const result = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(cases);
    return Number(result[0]?.count ?? 0);
  }

  async search(query: string, limit = 10, tenantId?: string): Promise<Case[]> {
    const conditions = [like(cases.title, `%${query}%`)];
    if (tenantId) conditions.push(eq(cases.tenantId, tenantId));
    const rows = await this.db
      .select()
      .from(cases)
      .where(and(...conditions))
      .limit(limit);
    return rows.map(rowToCase);
  }

  async findByService(serviceId: string, tenantId?: string): Promise<Case[]> {
    const rows = await this.db
      .select()
      .from(cases)
      .where(tenantId ? eq(cases.tenantId, tenantId) : undefined);
    return rows
      .filter((r: any) => (r.services as string[]).includes(serviceId))
      .map(rowToCase);
  }
}
