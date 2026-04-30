import { eq } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { shareLinks } from '../../db/schema.js';
import type { IShareLinkRepository } from '../interfaces.js';
import type { ShareLink, SharePermission } from '../../stores/share-store.js';

type ShareRow = typeof shareLinks.$inferSelect;

function rowToShareLink(row: ShareRow): ShareLink {
  return {
    token: row.token,
    investigationId: row.investigationId,
    createdBy: row.createdBy,
    permission: row.permission as SharePermission,
    expiresAt: row.expiresAt ?? null,
    createdAt: row.createdAt,
  };
}

export class PostgresShareLinkRepository implements IShareLinkRepository {
  constructor(private readonly db: any) {}

  async create(params: {
    investigationId: string;
    createdBy: string;
    permission?: SharePermission;
    expiresInMs?: number;
  }): Promise<ShareLink> {
    const now = new Date();
    const token = randomUUID();
    const expiresAt = params.expiresInMs
      ? new Date(now.getTime() + params.expiresInMs).toISOString()
      : null;
    const [row] = await this.db
      .insert(shareLinks)
      .values({
        token,
        investigationId: params.investigationId,
        createdBy: params.createdBy,
        permission: params.permission ?? 'view_only',
        expiresAt,
        createdAt: now.toISOString(),
      })
      .returning();
    return rowToShareLink(row!);
  }

  async findByToken(token: string): Promise<ShareLink | undefined> {
    const [row] = await this.db
      .select()
      .from(shareLinks)
      .where(eq(shareLinks.token, token));
    if (!row) return undefined;
    const link = rowToShareLink(row);
    return this.checkExpiry(link);
  }

  async findByInvestigation(investigationId: string): Promise<ShareLink[]> {
    const rows = await this.db
      .select()
      .from(shareLinks)
      .where(eq(shareLinks.investigationId, investigationId));
    const now = Date.now();
    return rows
      .map(rowToShareLink)
      .filter((l: any) => !l.expiresAt || new Date(l.expiresAt).getTime() >= now);
  }

  async revoke(token: string): Promise<boolean> {
    const result = await this.db
      .delete(shareLinks)
      .where(eq(shareLinks.token, token))
      .returning();
    return result.length > 0;
  }

  private checkExpiry(link: ShareLink): ShareLink | undefined {
    if (link.expiresAt && new Date(link.expiresAt).getTime() < Date.now()) {
      void this.db.delete(shareLinks).where(eq(shareLinks.token, link.token));
      return undefined;
    }
    return link;
  }
}
