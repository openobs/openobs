import type { PostMortemReport } from '@agentic-obs/common';

/**
 * Simple in-memory store for generated post-mortem reports, keyed by incidentId.
 * One report per incident; re-generating overwrites the previous report.
 */
export class PostMortemStore {
  private readonly reports = new Map<string, PostMortemReport>();

  set(incidentId: string, report: PostMortemReport): void {
    this.reports.set(incidentId, report);
  }

  get(incidentId: string): PostMortemReport | undefined {
    return this.reports.get(incidentId);
  }

  has(incidentId: string): boolean {
    return this.reports.has(incidentId);
  }

  get size(): number {
    return this.reports.size;
  }
}

export const postMortemStore = new PostMortemStore();
