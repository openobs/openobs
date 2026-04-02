import { QUERY_GUARD_DEFAULTS } from './types.js';
import type { QueryGuardConfig } from './types.js';

interface SessionRecord {
  /** Timestamps (epoch ms) of queries within the sliding per-minute window */
  recentTimestamps: number[];
  /** Lifetime query count for this session */
  total: number;
}

const WINDOW_MS = 60_000; // 1 minute sliding window

export class QueryRateLimiter {
  private readonly sessions = new Map<string, SessionRecord>();
  private readonly maxPerMinute: number;
  private readonly maxPerSession: number;

  constructor(config: QueryGuardConfig = {}) {
    this.maxPerMinute = config.maxQueriesPerMinute ?? QUERY_GUARD_DEFAULTS.maxQueriesPerMinute;
    this.maxPerSession = config.maxQueriesPerSession ?? QUERY_GUARD_DEFAULTS.maxQueriesPerSession;
  }

  checkRate(sessionId: string): { allowed: boolean; reason?: string } {
    const record = this.getOrCreate(sessionId);
    const now = Date.now();

    if (record.total >= this.maxPerSession) {
      return {
        allowed: false,
        reason: `Session query limit reached (${this.maxPerSession} queries per session)`,
      };
    }

    const recent = record.recentTimestamps.filter(t => t > now - WINDOW_MS);
    if (recent.length >= this.maxPerMinute) {
      return {
        allowed: false,
        reason: `Rate limit exceeded (${this.maxPerMinute} queries per minute)`,
      };
    }

    return { allowed: true };
  }

  record(sessionId: string): void {
    const record = this.getOrCreate(sessionId);
    const now = Date.now();

    // Prune timestamps outside the sliding window before appending
    record.recentTimestamps = record.recentTimestamps.filter(t => t > now - WINDOW_MS);
    record.recentTimestamps.push(now);
    record.total += 1;
  }

  private getOrCreate(sessionId: string): SessionRecord {
    let record = this.sessions.get(sessionId);
    if (!record) {
      record = { recentTimestamps: [], total: 0 };
      this.sessions.set(sessionId, record);
    }
    return record;
  }
}
