import { eq, and, sql } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import type {
  Incident,
  IncidentTimelineEntry,
  IncidentTimelineEntryType,
} from '@agentic-obs/common';
import { incidents } from '../../db/sqlite-schema.js';
import type { IIncidentRepository, IncidentFindAllOptions } from '../interfaces.js';

type IncidentRow = typeof incidents.$inferSelect;

function rowToIncident(row: IncidentRow): Incident {
  return {
    id: row.id,
    title: row.title,
    severity: row.severity as Incident['severity'],
    status: row.status as Incident['status'],
    serviceIds: (row.serviceIds as string[]) ?? [],
    investigationIds: (row.investigationIds as string[]) ?? [],
    timeline: (row.timeline as IncidentTimelineEntry[]) ?? [],
    assignee: row.assignee ?? undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    resolvedAt: row.resolvedAt ?? undefined,
  };
}

export class PostgresIncidentRepository implements IIncidentRepository {
  constructor(private readonly db: any) {}

  async findById(id: string): Promise<Incident | undefined> {
    const [row] = await this.db.select().from(incidents).where(eq(incidents.id, id));
    return row ? rowToIncident(row) : undefined;
  }

  async findAll(opts: IncidentFindAllOptions = {}): Promise<Incident[]> {
    const conditions = [eq(incidents.archived, false)];
    if (opts.tenantId) conditions.push(eq(incidents.tenantId, opts.tenantId));
    if (opts.status) conditions.push(eq(incidents.status, opts.status));

    const rows = await this.db
      .select()
      .from(incidents)
      .where(and(...conditions))
      .limit(opts.limit ?? 100)
      .offset(opts.offset ?? 0);
    return rows.map(rowToIncident);
  }

  async create(data: Omit<Incident, 'id' | 'createdAt'> & { id?: string }): Promise<Incident> {
    const now = new Date().toISOString();
    const id = data.id ?? `inc_${randomUUID().slice(0, 8)}`;
    const tenantId = (data as Incident & { tenantId?: string }).tenantId ?? 'default';
    const [row] = await this.db
      .insert(incidents)
      .values({
        id,
        tenantId,
        title: data.title,
        severity: data.severity,
        status: data.status,
        serviceIds: data.serviceIds,
        investigationIds: data.investigationIds ?? [],
        timeline: data.timeline ?? [],
        assignee: data.assignee,
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    return rowToIncident(row!);
  }

  async update(id: string, patch: Partial<Omit<Incident, 'id'>>): Promise<Incident | undefined> {
    const sets: Record<string, unknown> = { updatedAt: new Date().toISOString() };
    if (patch.title !== undefined) sets.title = patch.title;
    if (patch.status !== undefined) sets.status = patch.status;
    if (patch.severity !== undefined) sets.severity = patch.severity;
    if (patch.serviceIds !== undefined) sets.serviceIds = patch.serviceIds;
    if (patch.investigationIds !== undefined) sets.investigationIds = patch.investigationIds;
    if (patch.timeline !== undefined) sets.timeline = patch.timeline;
    if (patch.assignee !== undefined) sets.assignee = patch.assignee;
    if (patch.resolvedAt !== undefined) sets.resolvedAt = patch.resolvedAt;

    const [row] = await this.db
      .update(incidents)
      .set(sets)
      .where(eq(incidents.id, id))
      .returning();
    return row ? rowToIncident(row) : undefined;
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.db.delete(incidents).where(eq(incidents.id, id)).returning();
    return result.length > 0;
  }

  async count(): Promise<number> {
    const result = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(incidents)
      .where(eq(incidents.archived, false));
    return Number(result[0]?.count ?? 0);
  }

  async addTimelineEntry(
    incidentId: string,
    entry: Omit<IncidentTimelineEntry, 'id' | 'timestamp'> & { type?: IncidentTimelineEntryType },
  ): Promise<IncidentTimelineEntry | undefined> {
    const incident = await this.findById(incidentId);
    if (!incident) return undefined;

    const newEntry: IncidentTimelineEntry = {
      id: `tle_${randomUUID().slice(0, 8)}`,
      timestamp: new Date().toISOString(),
      type: entry.type as IncidentTimelineEntry['type'],
      description: entry.description,
      actorType: entry.actorType ?? 'system',
      actorId: entry.actorId ?? '',
      referenceId: entry.referenceId,
      data: entry.data,
    };

    const timeline = [...incident.timeline, newEntry];
    await this.db
      .update(incidents)
      .set({ timeline, updatedAt: new Date().toISOString() })
      .where(eq(incidents.id, incidentId));

    return newEntry;
  }

  async findByService(serviceId: string, tenantId?: string): Promise<Incident[]> {
    const conditions = [eq(incidents.archived, false)];
    if (tenantId) conditions.push(eq(incidents.tenantId, tenantId));
    const rows = await this.db
      .select()
      .from(incidents)
      .where(and(...conditions));
    return rows
      .filter((r: any) => (r.serviceIds as string[]).includes(serviceId))
      .map(rowToIncident);
  }

  async findByWorkspace(workspaceId: string): Promise<Incident[]> {
    const rows = await this.db
      .select()
      .from(incidents)
      .where(and(eq(incidents.workspaceId, workspaceId), eq(incidents.archived, false)));
    return rows.map(rowToIncident);
  }

  async addInvestigation(incidentId: string, investigationId: string): Promise<Incident | undefined> {
    const incident = await this.findById(incidentId);
    if (!incident) return undefined;
    const ids = [...incident.investigationIds];
    if (!ids.includes(investigationId)) {
      ids.push(investigationId);
    }
    return this.update(incidentId, { investigationIds: ids });
  }

  async getTimeline(incidentId: string): Promise<IncidentTimelineEntry[] | undefined> {
    const incident = await this.findById(incidentId);
    return incident?.timeline;
  }

  async archive(id: string): Promise<Incident | undefined> {
    const [row] = await this.db
      .update(incidents)
      .set({ archived: true, updatedAt: new Date().toISOString() })
      .where(eq(incidents.id, id))
      .returning();
    return row ? rowToIncident(row) : undefined;
  }

  async restore(id: string): Promise<Incident | undefined> {
    const [row] = await this.db
      .update(incidents)
      .set({ archived: false, updatedAt: new Date().toISOString() })
      .where(eq(incidents.id, id))
      .returning();
    return row ? rowToIncident(row) : undefined;
  }

  async findArchived(tenantId?: string): Promise<Incident[]> {
    const conditions = [eq(incidents.archived, true)];
    if (tenantId) conditions.push(eq(incidents.tenantId, tenantId));
    const rows = await this.db
      .select()
      .from(incidents)
      .where(and(...conditions));
    return rows.map(rowToIncident);
  }

  getArchived(): Promise<Incident[]> {
    return this.findArchived();
  }

  restoreFromArchive(id: string): Promise<Incident | undefined> {
    return this.restore(id);
  }
}
