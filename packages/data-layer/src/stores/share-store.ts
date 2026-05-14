import { randomUUID } from 'node:crypto';
import { createLogger } from '@agentic-obs/common/logging';
import type { Persistable } from './persistence.js';
import { markDirty } from './persistence.js';

export type SharePermission = 'view_only' | 'can_comment';

export interface ShareLink {
  token: string;
  investigationId: string;
  createdBy: string;
  permission: SharePermission;
  createdAt: string;
  expiresAt: string | null;
}

/**
 * Result type that distinguishes the three terminal states for a share-link
 * lookup: hit, expired (so the UI can say "this link expired"), and absent
 * (typo / revoked). Returned by `findByTokenStatus`. The legacy
 * `findByToken` collapses expired and not-found to `undefined` and is kept
 * for callers that don't need the distinction.
 */
export type ShareLookupResult =
  | { kind: 'ok'; link: ShareLink }
  | { kind: 'expired' }
  | { kind: 'not_found' };

const log = createLogger('share-store');

export class ShareStore implements Persistable {
  private readonly shares = new Map<string, ShareLink>();

  create(params: {
    investigationId: string;
    createdBy: string;
    permission?: SharePermission;
    expiresInMs?: number;
  }): ShareLink {
    const token = randomUUID();
    const now = new Date();
    const link: ShareLink = {
      token,
      investigationId: params.investigationId,
      createdBy: params.createdBy,
      permission: params.permission ?? 'view_only',
      createdAt: now.toISOString(),
      expiresAt: params.expiresInMs
        ? new Date(now.getTime() + params.expiresInMs).toISOString()
        : null,
    };
    this.shares.set(token, link);
    markDirty();
    return link;
  }

  findByToken(token: string): ShareLink | undefined {
    const result = this.findByTokenStatus(token);
    return result.kind === 'ok' ? result.link : undefined;
  }

  /**
   * Distinguishes `expired` from `not_found` so the route layer can return a
   * specific 410 / "this link expired" message instead of a generic 404. We
   * also log a structured warn on expiry so operators can correlate failed
   * share visits to expired links.
   */
  findByTokenStatus(token: string): ShareLookupResult {
    const link = this.shares.get(token);
    if (!link)
      return { kind: 'not_found' };

    if (link.expiresAt && new Date(link.expiresAt).getTime() < Date.now()) {
      this.shares.delete(token);
      markDirty();
      log.warn(
        {
          token,
          investigationId: link.investigationId,
          expiresAt: link.expiresAt,
        },
        'share-store: token expired — purging',
      );
      return { kind: 'expired' };
    }

    return { kind: 'ok', link };
  }

  findByInvestigation(investigationId: string): ShareLink[] {
    const now = Date.now();
    return [...this.shares.values()].filter(
      (s) => s.investigationId === investigationId
        && (!s.expiresAt || new Date(s.expiresAt).getTime() >= now),
    );
  }

  revoke(token: string): boolean {
    const result = this.shares.delete(token);
    if (result)
      markDirty();
    return result;
  }

  get size(): number {
    return this.shares.size;
  }

  clear(): void {
    this.shares.clear();
  }

  toJSON(): unknown {
    return [...this.shares.values()];
  }

  loadJSON(data: unknown): void {
    if (!Array.isArray(data))
      return;
    for (const s of data as ShareLink[]) {
      if (s?.token)
        this.shares.set(s.token, s);
    }
  }
}

export const defaultShareStore = new ShareStore();
