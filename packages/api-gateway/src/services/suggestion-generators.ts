/**
 * Suggestion generators — Wave 2 / step 3.
 *
 * Each generator inspects user-visible resources and proposes a row for the
 * AI Suggestions inbox. Generators are pure (no side effects) — the route
 * layer upserts the returned `NewAiSuggestion[]` through the repository,
 * which is responsible for dedup (UNIQUE(user_id, dedup_key)).
 *
 * Why these 3 to start:
 *   - MissingDashboard: "alert fired but no dashboard to look at" is the
 *     canonical post-pageout moment.
 *   - StaleDraft: surfaces personal-folder drafts the user has forgotten
 *     about (the equivalent of a "drafts" cleanup nag).
 *   - DuplicateDashboard: top-1 only — duplicate detection is heuristic
 *     and we don't want to spam the inbox if many dashboards share queries.
 */

import type {
  Dashboard,
  IDashboardRepository,
  NewAiSuggestion,
  PanelConfig,
  PanelQuery,
} from '@agentic-obs/common';
import type { IAlertRuleRepository } from '@agentic-obs/data-layer';

export interface GeneratorCtx {
  orgId: string;
  userId: string;
  dashboards: IDashboardRepository;
  alertRules: IAlertRuleRepository;
}

export interface SuggestionGenerator {
  kind: string;
  generate(ctx: GeneratorCtx): Promise<NewAiSuggestion[]>;
}

/**
 * Cap the per-generator output. The inbox is a glance-surface — too many
 * rows defeats the purpose of one inbox.
 */
const MAX_ALERTS_SCANNED = 5;

function firstPanelQuery(panels: PanelConfig[] | undefined): string | null {
  if (!panels || panels.length === 0) return null;
  const p = panels[0];
  if (!p) return null;
  const q: PanelQuery | undefined = p.queries?.[0];
  const expr = q?.expr;
  return expr && expr.trim() !== '' ? expr.trim() : null;
}

/**
 * MissingDashboardSuggestionGenerator
 *
 * Scans up to MAX_ALERTS_SCANNED of the most recent alert rules. For each
 * rule that has no dashboard mentioning its name or matching its first
 * label value, propose a `create_dashboard` action prefilled with the
 * alert's prompt.
 *
 * Heuristic: match by case-insensitive dashboard title containing the
 * alert name. Cheap, not semantic — false negatives are fine because the
 * dedup_key includes the alert id so we don't re-propose if the user
 * already accepted/dismissed.
 */
export class MissingDashboardSuggestionGenerator implements SuggestionGenerator {
  kind = 'missing_dashboard';

  async generate(ctx: GeneratorCtx): Promise<NewAiSuggestion[]> {
    const { list } = await ctx.alertRules.findAll({ limit: MAX_ALERTS_SCANNED });
    const dashboards = await ctx.dashboards.findAll();
    const titles = dashboards.map((d) => d.title.toLowerCase());

    const out: NewAiSuggestion[] = [];
    for (const rule of list) {
      const needle = rule.name.toLowerCase();
      const hasDashboard = titles.some((t) => t.includes(needle));
      if (hasDashboard) continue;
      out.push({
        orgId: ctx.orgId,
        userId: ctx.userId,
        kind: 'missing_dashboard',
        title: `${rule.name} has alerts but no dashboard. Create one?`,
        body: `Alert rule **${rule.name}** is configured but no dashboard contains "${rule.name}" in its title. Create a dashboard so the next page-out has a place to land.`,
        actionKind: 'create_dashboard',
        actionPayload: {
          prefill: {
            title: `${rule.name} overview`,
            prompt: rule.originalPrompt ?? `Dashboard for ${rule.name}`,
          },
          sourceAlertRuleId: rule.id,
        },
        dedupKey: `missing_dashboard:${rule.id}`,
      });
    }
    return out;
  }
}

/**
 * StaleDraftSuggestionGenerator
 *
 * Counts the user's personal-folder dashboards/alerts not opened in 30
 * days. We use `updatedAt` as the proxy because `last_opened_at` isn't a
 * column yet (Wave 1 / Open Risks — lifecycle archive deferred). The
 * action is `archive_resources` but the real-world handler navigates the
 * user to the list view with archivable items preselected (no auto
 * archive — see action-handlers.ts).
 */
export class StaleDraftSuggestionGenerator implements SuggestionGenerator {
  kind = 'stale_draft';

  async generate(ctx: GeneratorCtx): Promise<NewAiSuggestion[]> {
    const cutoffMs = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const cutoff = new Date(cutoffMs).toISOString();

    const dashboards = await ctx.dashboards.findAll(ctx.userId);
    // "personal folder" proxy: no folder set (Wave 1 personal-vs-shared
    // distinction). Anything in a shared folder is presumed intentional.
    const stale = dashboards.filter(
      (d: Dashboard) => !d.folder && (d.updatedAt ?? d.createdAt) <= cutoff,
    );
    if (stale.length === 0) return [];

    return [
      {
        orgId: ctx.orgId,
        userId: ctx.userId,
        kind: 'stale_draft',
        title: `You have ${stale.length} untouched drafts in My Workspace. Review?`,
        body: `${stale.length} dashboards in your personal workspace haven't been updated in 30 days. Open the review queue to archive what you don't need.`,
        actionKind: 'archive_resources',
        actionPayload: {
          resourceIds: stale.map((d) => d.id),
          resourceKind: 'dashboard',
        },
        // Dedup by user only — we want one rolling stale-draft suggestion,
        // not one per stale dashboard. State transitions on the row reset
        // the visibility window.
        dedupKey: `stale_draft:${ctx.userId}`,
      },
    ];
  }
}

/**
 * DuplicateDashboardSuggestionGenerator
 *
 * Naive: bucket dashboards by their first panel's first query expression
 * (after trim). If any bucket has >= 2 dashboards, emit ONE suggestion
 * pointing at the first pair we found. We deliberately do not emit a
 * suggestion per pair — duplicate-detection is fuzzy enough that flooding
 * the inbox would be worse than under-reporting.
 */
export class DuplicateDashboardSuggestionGenerator implements SuggestionGenerator {
  kind = 'duplicate_dashboard';

  async generate(ctx: GeneratorCtx): Promise<NewAiSuggestion[]> {
    const dashboards = await ctx.dashboards.findAll();
    const buckets = new Map<string, Dashboard[]>();
    for (const d of dashboards) {
      const q = firstPanelQuery(d.panels);
      if (!q) continue;
      const bucket = buckets.get(q) ?? [];
      bucket.push(d);
      buckets.set(q, bucket);
    }

    for (const [, bucket] of buckets) {
      if (bucket.length >= 2) {
        const [a, b] = bucket;
        if (!a || !b) continue;
        // Stable order so the dedup_key is deterministic.
        const [first, second] = a.id < b.id ? [a, b] : [b, a];
        return [
          {
            orgId: ctx.orgId,
            userId: ctx.userId,
            kind: 'duplicate_dashboard',
            title: `These 2 dashboards show the same metric. Merge?`,
            body: `**${first.title}** and **${second.title}** both lead with the same query. Compare them side by side and decide if one should be archived.`,
            actionKind: 'merge_dashboards',
            actionPayload: {
              dashboardIds: [first.id, second.id],
            },
            dedupKey: `duplicate_dashboard:${first.id}:${second.id}`,
          },
        ];
      }
    }
    return [];
  }
}

export function defaultGenerators(): SuggestionGenerator[] {
  return [
    new MissingDashboardSuggestionGenerator(),
    new StaleDraftSuggestionGenerator(),
    new DuplicateDashboardSuggestionGenerator(),
  ];
}
