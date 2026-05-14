/**
 * SQLite repository for `ai_suggestions` — Wave 2 / step 3.
 *
 * The unique `(user_id, dedup_key)` index drives idempotent generation:
 * a generator can call `create()` on every run and the second call is a
 * no-op (we keep the existing row).
 */

import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import type {
  AiSuggestion,
  AiSuggestionActionKind,
  AiSuggestionKind,
  AiSuggestionState,
  IAiSuggestionRepository,
  NewAiSuggestion,
} from '@agentic-obs/common';
import type { SqliteClient } from '../../db/sqlite-client.js';

interface Row {
  id: string;
  org_id: string;
  user_id: string;
  kind: string;
  title: string;
  body: string;
  action_kind: string | null;
  action_payload: string | null;
  state: string;
  snoozed_until: string | null;
  created_at: string;
  updated_at: string;
  dedup_key: string;
}

function nowIso(): string {
  return new Date().toISOString();
}

function rowTo(r: Row): AiSuggestion {
  let payload: Record<string, unknown> | null = null;
  if (r.action_payload) {
    try {
      const parsed = JSON.parse(r.action_payload);
      if (parsed && typeof parsed === 'object') {
        payload = parsed as Record<string, unknown>;
      }
    } catch {
      payload = null;
    }
  }
  return {
    id: r.id,
    orgId: r.org_id,
    userId: r.user_id,
    kind: r.kind as AiSuggestionKind,
    title: r.title,
    body: r.body,
    actionKind: (r.action_kind as AiSuggestionActionKind | null) ?? null,
    actionPayload: payload,
    state: r.state as AiSuggestionState,
    snoozedUntil: r.snoozed_until,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    dedupKey: r.dedup_key,
  };
}

export class SqliteAiSuggestionRepository implements IAiSuggestionRepository {
  constructor(private readonly db: SqliteClient) {}

  async create(input: NewAiSuggestion): Promise<AiSuggestion> {
    // Idempotent upsert by (user_id, dedup_key). Existing row is preserved.
    const existing = this.db.all<Row>(sql`
      SELECT * FROM ai_suggestions
      WHERE user_id = ${input.userId} AND dedup_key = ${input.dedupKey}
      LIMIT 1
    `);
    if (existing[0]) return rowTo(existing[0]);

    const id = input.id ?? randomUUID();
    const now = nowIso();
    const payload = input.actionPayload ? JSON.stringify(input.actionPayload) : null;
    this.db.run(sql`
      INSERT INTO ai_suggestions (
        id, org_id, user_id, kind, title, body,
        action_kind, action_payload,
        state, snoozed_until,
        created_at, updated_at, dedup_key
      ) VALUES (
        ${id}, ${input.orgId}, ${input.userId}, ${input.kind}, ${input.title}, ${input.body},
        ${input.actionKind ?? null}, ${payload},
        'open', NULL,
        ${now}, ${now}, ${input.dedupKey}
      )
    `);
    const rows = this.db.all<Row>(sql`SELECT * FROM ai_suggestions WHERE id = ${id}`);
    return rowTo(rows[0]!);
  }

  async findById(id: string): Promise<AiSuggestion | null> {
    const rows = this.db.all<Row>(sql`SELECT * FROM ai_suggestions WHERE id = ${id}`);
    return rows[0] ? rowTo(rows[0]) : null;
  }

  async findOpenForUser(
    userId: string,
    orgId: string,
    now: string = nowIso(),
  ): Promise<AiSuggestion[]> {
    const rows = this.db.all<Row>(sql`
      SELECT * FROM ai_suggestions
      WHERE user_id = ${userId}
        AND org_id = ${orgId}
        AND (
          state = 'open'
          OR (state = 'snoozed' AND snoozed_until IS NOT NULL AND snoozed_until <= ${now})
        )
      ORDER BY created_at DESC
    `);
    return rows.map(rowTo);
  }

  async updateState(
    id: string,
    state: AiSuggestionState,
    snoozedUntil?: string | null,
  ): Promise<AiSuggestion | null> {
    const now = nowIso();
    const effectiveSnooze = state === 'snoozed' ? (snoozedUntil ?? null) : null;
    this.db.run(sql`
      UPDATE ai_suggestions
      SET state = ${state},
          snoozed_until = ${effectiveSnooze},
          updated_at = ${now}
      WHERE id = ${id}
    `);
    return this.findById(id);
  }

  async snoozeAllForUser(
    userId: string,
    orgId: string,
    snoozedUntil: string,
  ): Promise<number> {
    const before = this.db.all<{ n: number }>(sql`
      SELECT COUNT(*) AS n FROM ai_suggestions
      WHERE user_id = ${userId} AND org_id = ${orgId} AND state = 'open'
    `);
    const count = Number(before[0]?.n ?? 0);
    const now = nowIso();
    this.db.run(sql`
      UPDATE ai_suggestions
      SET state = 'snoozed',
          snoozed_until = ${snoozedUntil},
          updated_at = ${now}
      WHERE user_id = ${userId} AND org_id = ${orgId} AND state = 'open'
    `);
    return count;
  }
}
