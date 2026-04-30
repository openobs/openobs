import { eq, desc } from 'drizzle-orm';
import type { ChatSession } from '@agentic-obs/common';
import { chatSessions } from '../../db/schema.js';
import type { IChatSessionRepository } from '../interfaces.js';

type DbRow = typeof chatSessions.$inferSelect;

function rowToSession(row: DbRow): ChatSession {
  return {
    id: row.id,
    title: row.title,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    ...(row.contextSummary ? { contextSummary: row.contextSummary } : {}),
  };
}

export class PostgresChatSessionRepository implements IChatSessionRepository {
  constructor(private readonly db: any) {}

  async create(session: { id: string; title?: string }): Promise<ChatSession> {
    const now = new Date().toISOString();
    const [row] = await this.db
      .insert(chatSessions)
      .values({
        id: session.id,
        title: session.title ?? '',
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    return rowToSession(row!);
  }

  async findById(id: string): Promise<ChatSession | undefined> {
    const [row] = await this.db.select().from(chatSessions).where(eq(chatSessions.id, id));
    return row ? rowToSession(row) : undefined;
  }

  async findAll(limit = 50): Promise<ChatSession[]> {
    const rows = await this.db
      .select()
      .from(chatSessions)
      .orderBy(desc(chatSessions.updatedAt))
      .limit(limit);
    return rows.map(rowToSession);
  }

  async updateTitle(id: string, title: string): Promise<ChatSession | undefined> {
    const [row] = await this.db
      .update(chatSessions)
      .set({ title, updatedAt: new Date().toISOString() })
      .where(eq(chatSessions.id, id))
      .returning();
    return row ? rowToSession(row) : undefined;
  }

  async updateContextSummary(id: string, summary: string): Promise<ChatSession | undefined> {
    const [row] = await this.db
      .update(chatSessions)
      .set({ contextSummary: summary, updatedAt: new Date().toISOString() })
      .where(eq(chatSessions.id, id))
      .returning();
    return row ? rowToSession(row) : undefined;
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.db.delete(chatSessions).where(eq(chatSessions.id, id)).returning();
    return result.length > 0;
  }
}
