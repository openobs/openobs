import { randomUUID } from 'node:crypto';
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
    const link = this.shares.get(token);
    if (!link)
      return undefined;

    // Check expiration
    if (link.expiresAt && new Date(link.expiresAt).getTime() < Date.now()) {
      this.shares.delete(token);
      return undefined;
    }

    return link;
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
