import { eq, and, sql } from 'drizzle-orm';
import type { AssetType, AssetVersion, EditSource } from '@agentic-obs/common';
import { assetVersions } from '../../db/sqlite-schema.js';
import type { IVersionRepository } from '../interfaces.js';

type VersionRow = typeof assetVersions.$inferSelect;

function uid(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function rowToVersion(row: VersionRow): AssetVersion {
  return {
    id: row.id,
    assetType: row.assetType as AssetType,
    assetId: row.assetId,
    version: row.version,
    snapshot: row.snapshot,
    diff: row.diff ?? undefined,
    editedBy: row.editedBy,
    editSource: row.editSource as EditSource,
    message: row.message ?? undefined,
    createdAt: row.createdAt,
  };
}

export class PostgresVersionRepository implements IVersionRepository {
  constructor(private readonly db: any) {}

  async record(
    assetType: AssetType,
    assetId: string,
    snapshot: unknown,
    editedBy: string,
    editSource: EditSource,
    message?: string,
  ): Promise<AssetVersion> {
    // Get the latest version number
    const latest = await this.getLatest(assetType, assetId);
    const nextVersion = latest ? latest.version + 1 : 1;
    const now = new Date().toISOString();

    const [row] = await this.db
      .insert(assetVersions)
      .values({
        id: uid(),
        assetType,
        assetId,
        version: nextVersion,
        snapshot: snapshot as Record<string, unknown>,
        editedBy,
        editSource,
        message: message ?? null,
        createdAt: now,
      })
      .returning();
    return rowToVersion(row!);
  }

  async getHistory(assetType: AssetType, assetId: string): Promise<AssetVersion[]> {
    const rows = await this.db
      .select()
      .from(assetVersions)
      .where(
        and(
          eq(assetVersions.assetType, assetType),
          eq(assetVersions.assetId, assetId),
        ),
      )
      .orderBy(sql`${assetVersions.version} desc`);
    return rows.map(rowToVersion);
  }

  async getVersion(assetType: AssetType, assetId: string, version: number): Promise<AssetVersion | undefined> {
    const [row] = await this.db
      .select()
      .from(assetVersions)
      .where(
        and(
          eq(assetVersions.assetType, assetType),
          eq(assetVersions.assetId, assetId),
          eq(assetVersions.version, version),
        ),
      );
    return row ? rowToVersion(row) : undefined;
  }

  async getLatest(assetType: AssetType, assetId: string): Promise<AssetVersion | undefined> {
    const [row] = await this.db
      .select()
      .from(assetVersions)
      .where(
        and(
          eq(assetVersions.assetType, assetType),
          eq(assetVersions.assetId, assetId),
        ),
      )
      .orderBy(sql`${assetVersions.version} desc`)
      .limit(1);
    return row ? rowToVersion(row) : undefined;
  }

  async rollback(assetType: AssetType, assetId: string, version: number): Promise<unknown | undefined> {
    const entry = await this.getVersion(assetType, assetId, version);
    return entry?.snapshot;
  }
}
