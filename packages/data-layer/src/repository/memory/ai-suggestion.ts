/**
 * In-memory IAiSuggestionRepository. Test-fixture only.
 */

import { randomUUID } from 'node:crypto';
import type {
  AiSuggestion,
  AiSuggestionState,
  IAiSuggestionRepository,
  NewAiSuggestion,
} from '@agentic-obs/common';

function nowIso(): string {
  return new Date().toISOString();
}

export class InMemoryAiSuggestionRepository implements IAiSuggestionRepository {
  private readonly rows = new Map<string, AiSuggestion>();

  async create(input: NewAiSuggestion): Promise<AiSuggestion> {
    for (const existing of this.rows.values()) {
      if (existing.userId === input.userId && existing.dedupKey === input.dedupKey) {
        return existing;
      }
    }
    const id = input.id ?? randomUUID();
    const now = nowIso();
    const row: AiSuggestion = {
      id,
      orgId: input.orgId,
      userId: input.userId,
      kind: input.kind,
      title: input.title,
      body: input.body,
      actionKind: input.actionKind ?? null,
      actionPayload: input.actionPayload ?? null,
      state: 'open',
      snoozedUntil: null,
      createdAt: now,
      updatedAt: now,
      dedupKey: input.dedupKey,
    };
    this.rows.set(id, row);
    return row;
  }

  async findById(id: string): Promise<AiSuggestion | null> {
    return this.rows.get(id) ?? null;
  }

  async findOpenForUser(
    userId: string,
    orgId: string,
    now: string = nowIso(),
  ): Promise<AiSuggestion[]> {
    const list = [...this.rows.values()].filter((r) => {
      if (r.userId !== userId || r.orgId !== orgId) return false;
      if (r.state === 'open') return true;
      if (r.state === 'snoozed' && r.snoozedUntil !== null && r.snoozedUntil <= now) return true;
      return false;
    });
    list.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    return list;
  }

  async updateState(
    id: string,
    state: AiSuggestionState,
    snoozedUntil?: string | null,
  ): Promise<AiSuggestion | null> {
    const r = this.rows.get(id);
    if (!r) return null;
    const updated: AiSuggestion = {
      ...r,
      state,
      snoozedUntil: state === 'snoozed' ? (snoozedUntil ?? null) : null,
      updatedAt: nowIso(),
    };
    this.rows.set(id, updated);
    return updated;
  }

  async snoozeAllForUser(
    userId: string,
    orgId: string,
    snoozedUntil: string,
  ): Promise<number> {
    let count = 0;
    for (const [id, r] of this.rows.entries()) {
      if (r.userId === userId && r.orgId === orgId && r.state === 'open') {
        this.rows.set(id, {
          ...r,
          state: 'snoozed',
          snoozedUntil,
          updatedAt: nowIso(),
        });
        count += 1;
      }
    }
    return count;
  }
}
