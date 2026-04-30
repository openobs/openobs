import { and, eq, desc } from 'drizzle-orm';
import type { ChatSession } from '@agentic-obs/common';
import type { SqliteClient } from '../../db/sqlite-client.js';
import { chatSessions } from '../../db/sqlite-schema.js';
import type { IChatSessionRepository } from '../interfaces.js';

type DbRow = typeof chatSessions.$inferSelect;

function rowToSession(row: DbRow): ChatSession {
  return {
    id: row.id,
    title: row.title,
    orgId: row.orgId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    ...(row.contextSummary ? { contextSummary: row.contextSummary } : {}),
  };
}

export class SqliteChatSessionRepository implements IChatSessionRepository {
  constructor(private readonly db: SqliteClient) {}

  async create(session: { id: string; title?: string; orgId?: string }): Promise<ChatSession> {
    const now = new Date().toISOString();
    const [row] = await this.db
      .insert(chatSessions)
      .values({
        id: session.id,
        title: session.title ?? '',
        orgId: session.orgId ?? 'org_main',
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    return rowToSession(row!);
  }

  async findById(id: string, scope: { orgId?: string } = {}): Promise<ChatSession | undefined> {
    const where = scope.orgId
      ? and(eq(chatSessions.id, id), eq(chatSessions.orgId, scope.orgId))
      : eq(chatSessions.id, id);
    const [row] = await this.db.select().from(chatSessions).where(where);
    return row ? rowToSession(row) : undefined;
  }

  async findAll(limit = 50, scope: { orgId?: string } = {}): Promise<ChatSession[]> {
    const base = this.db.select().from(chatSessions);
    const rows = scope.orgId
      ? await base
          .where(eq(chatSessions.orgId, scope.orgId))
          .orderBy(desc(chatSessions.updatedAt))
          .limit(limit)
      : await base.orderBy(desc(chatSessions.updatedAt)).limit(limit);
    return rows.map(rowToSession);
  }

  async updateTitle(id: string, title: string, scope: { orgId?: string } = {}): Promise<ChatSession | undefined> {
    const where = scope.orgId
      ? and(eq(chatSessions.id, id), eq(chatSessions.orgId, scope.orgId))
      : eq(chatSessions.id, id);
    const [row] = await this.db
      .update(chatSessions)
      .set({ title, updatedAt: new Date().toISOString() })
      .where(where)
      .returning();
    return row ? rowToSession(row) : undefined;
  }

  async updateContextSummary(id: string, summary: string, scope: { orgId?: string } = {}): Promise<ChatSession | undefined> {
    const where = scope.orgId
      ? and(eq(chatSessions.id, id), eq(chatSessions.orgId, scope.orgId))
      : eq(chatSessions.id, id);
    const [row] = await this.db
      .update(chatSessions)
      .set({ contextSummary: summary, updatedAt: new Date().toISOString() })
      .where(where)
      .returning();
    return row ? rowToSession(row) : undefined;
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.db.delete(chatSessions).where(eq(chatSessions.id, id)).returning();
    return result.length > 0;
  }
}
