import { sql } from 'drizzle-orm';
import type { DbClient } from '../../../db/client.js';
import { pgAll, pgRun } from '../pg-helpers.js';
import type { IQuotaRepository } from '@agentic-obs/common';
import type { Quota, NewQuota } from '@agentic-obs/common';
import { uid, nowIso } from './shared.js';

interface Row {
  id: string;
  org_id: string | null;
  user_id: string | null;
  target: string;
  limit_val: number;
  created: string;
  updated: string;
}

function rowTo(r: Row): Quota {
  return {
    id: r.id,
    orgId: r.org_id,
    userId: r.user_id,
    target: r.target,
    limitVal: r.limit_val,
    created: r.created,
    updated: r.updated,
  };
}

export class QuotaRepository implements IQuotaRepository {
  constructor(private readonly db: DbClient) {}

  async create(input: NewQuota): Promise<Quota> {
    // Invariant: exactly one of (orgId, userId) is non-null.
    const hits = (input.orgId ? 1 : 0) + (input.userId ? 1 : 0);
    if (hits !== 1) {
      throw new Error(
        `[QuotaRepository] exactly one of (orgId, userId) must be set — got ${hits}`,
      );
    }
    const id = input.id ?? uid();
    const now = nowIso();
    await pgRun(this.db, sql`
      INSERT INTO quota (id, org_id, user_id, target, limit_val, created, updated)
      VALUES (
        ${id}, ${input.orgId ?? null}, ${input.userId ?? null},
        ${input.target}, ${input.limitVal}, ${now}, ${now}
      )
    `);
    const rows = await pgAll<Row>(this.db, sql`SELECT * FROM quota WHERE id = ${id}`);
    return rowTo(rows[0]!);
  }

  async upsertOrgQuota(orgId: string, target: string, limitVal: number): Promise<Quota> {
    const existing = await this.findOrgQuota(orgId, target);
    if (existing) {
      const now = nowIso();
      await pgRun(this.db, sql`
        UPDATE quota SET limit_val = ${limitVal}, updated = ${now} WHERE id = ${existing.id}
      `);
      return { ...existing, limitVal, updated: now };
    }
    return this.create({ orgId, target, limitVal });
  }

  async upsertUserQuota(userId: string, target: string, limitVal: number): Promise<Quota> {
    const existing = await this.findUserQuota(userId, target);
    if (existing) {
      const now = nowIso();
      await pgRun(this.db, sql`
        UPDATE quota SET limit_val = ${limitVal}, updated = ${now} WHERE id = ${existing.id}
      `);
      return { ...existing, limitVal, updated: now };
    }
    return this.create({ userId, target, limitVal });
  }

  async findOrgQuota(orgId: string, target: string): Promise<Quota | null> {
    const rows = await pgAll<Row>(this.db, sql`
      SELECT * FROM quota
      WHERE org_id = ${orgId} AND user_id IS NULL AND target = ${target}
    `);
    return rows[0] ? rowTo(rows[0]) : null;
  }

  async findUserQuota(userId: string, target: string): Promise<Quota | null> {
    const rows = await pgAll<Row>(this.db, sql`
      SELECT * FROM quota
      WHERE user_id = ${userId} AND org_id IS NULL AND target = ${target}
    `);
    return rows[0] ? rowTo(rows[0]) : null;
  }

  async listOrgQuotas(orgId: string): Promise<Quota[]> {
    const rows = await pgAll<Row>(this.db, sql`
      SELECT * FROM quota WHERE org_id = ${orgId} AND user_id IS NULL ORDER BY target
    `);
    return rows.map(rowTo);
  }

  async listUserQuotas(userId: string): Promise<Quota[]> {
    const rows = await pgAll<Row>(this.db, sql`
      SELECT * FROM quota WHERE user_id = ${userId} AND org_id IS NULL ORDER BY target
    `);
    return rows.map(rowTo);
  }

  async delete(id: string): Promise<boolean> {
    const before = await pgAll<Row>(this.db, sql`SELECT id FROM quota WHERE id = ${id}`);
    if (before.length === 0) return false;
    await pgRun(this.db, sql`DELETE FROM quota WHERE id = ${id}`);
    return true;
  }
}
