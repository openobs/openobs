import { eq } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import type { PostMortemReport } from '@agentic-obs/common';
import { postMortems } from '../../db/schema.js';
import type { IPostMortemRepository } from '../interfaces.js';

type PostMortemRow = typeof postMortems.$inferSelect;

function rowToReport(row: PostMortemRow): PostMortemReport {
  return {
    id: row.id,
    incidentId: row.incidentId,
    summary: row.summary,
    impact: row.impact,
    timeline: row.timeline as PostMortemReport['timeline'],
    rootCause: row.rootCause,
    actionsTaken: row.actionsTaken as string[],
    lessonsLearned: row.lessonsLearned as string[],
    actionItems: row.actionItems as string[],
    generatedAt: row.generatedAt,
    generatedBy: row.generatedBy as 'llm',
  };
}

export class PostgresPostMortemRepository implements IPostMortemRepository {
  constructor(private readonly db: any) {}

  async set(incidentId: string, report: PostMortemReport): Promise<void> {
    const existing = await this.db
      .select()
      .from(postMortems)
      .where(eq(postMortems.incidentId, incidentId));

    if (existing.length > 0) {
      await this.db
        .update(postMortems)
        .set({
          summary: report.summary,
          impact: report.impact,
          timeline: report.timeline as unknown[],
          rootCause: report.rootCause,
          actionsTaken: report.actionsTaken,
          lessonsLearned: report.lessonsLearned,
          actionItems: report.actionItems,
          generatedAt: report.generatedAt,
          generatedBy: report.generatedBy,
        })
        .where(eq(postMortems.incidentId, incidentId));
    } else {
      await this.db
        .insert(postMortems)
        .values({
          id: report.id ?? `pm_${randomUUID().slice(0, 8)}`,
          incidentId,
          summary: report.summary,
          impact: report.impact,
          timeline: report.timeline as unknown[],
          rootCause: report.rootCause,
          actionsTaken: report.actionsTaken,
          lessonsLearned: report.lessonsLearned,
          actionItems: report.actionItems,
          generatedAt: report.generatedAt,
          generatedBy: report.generatedBy,
        });
    }
  }

  async get(incidentId: string): Promise<PostMortemReport | undefined> {
    const [row] = await this.db
      .select()
      .from(postMortems)
      .where(eq(postMortems.incidentId, incidentId));
    return row ? rowToReport(row) : undefined;
  }

  async has(incidentId: string): Promise<boolean> {
    const [row] = await this.db
      .select()
      .from(postMortems)
      .where(eq(postMortems.incidentId, incidentId));
    return !!row;
  }
}
