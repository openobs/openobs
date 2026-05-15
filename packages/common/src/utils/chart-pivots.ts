/**
 * Pivot suggestions for the inline chart bubble — small "Show X" chips
 * that, when clicked, send a follow-up prompt back to the agent.
 *
 * Backend-computed (vs. LLM-generated) so suggestions are deterministic,
 * cheap, and ship without a round-trip. Rules per metric kind — see
 * `suggestPivots` JSDoc. Max 3 chips.
 */

import type { ChartMetricKind, ChartSummary } from './chart-summary.js';

export interface PivotSuggestion {
  /** Chip text (short). */
  label: string;
  /** Prompt sent as a new chat message when the chip is clicked. */
  prompt: string;
}

export interface SuggestPivotsArgs {
  query: string;
  metricKind: ChartMetricKind;
  summary: ChartSummary;
  /**
   * Optional label hints the caller can pass in (e.g. parsed from the
   * series). Currently only `path`/`route` is consulted (errors bucket).
   */
  hasLabels?: {
    service?: string;
    instance?: string;
    method?: string;
    status?: string;
    path?: string;
    route?: string;
  };
}

const MAX_CHIPS = 3;

/**
 * Compute pivot chips for a chart given its query, kind, and summary.
 *
 * Rules:
 * - latency: p50/p99 swap based on which quantile is in the query;
 *   always suggest "Show errors".
 * - counter: status breakdown when not already grouped by status;
 *   error-rate; "today's total" when the query is rate-based.
 * - gauge: top-5 by instance (when not already by-instance);
 *   compare to yesterday.
 * - errors: request rate; group by path/route (only when such a label
 *   is in `hasLabels`); top error messages from logs.
 *
 * Bounded to `MAX_CHIPS` — earlier rules win.
 */
export function suggestPivots(args: SuggestPivotsArgs): PivotSuggestion[] {
  const q = args.query.toLowerCase();
  const chips: PivotSuggestion[] = [];

  const push = (chip: PivotSuggestion): void => {
    if (chips.length < MAX_CHIPS) chips.push(chip);
  };

  switch (args.metricKind) {
    case 'latency': {
      // Quantile swap suggestions.
      if (/histogram_quantile\s*\(\s*0?\.5\b/.test(q)) {
        push({ label: 'Show p99', prompt: 'Show p99 instead' });
      } else if (/0\.99\b/.test(q)) {
        push({ label: 'Show p50 + p99', prompt: 'Show p50 and p99 together' });
      }
      push({ label: 'Show errors', prompt: 'Show error rate for the same period' });
      break;
    }
    case 'counter': {
      // "Break down by status" when no obvious status grouping.
      const hasStatusGrouping = /by\s*\([^)]*\b(status|status_code)\b[^)]*\)/.test(q)
        || /\bstatus(?:_code)?\b\s*=/.test(q);
      if (!hasStatusGrouping) {
        push({ label: 'Break down by status', prompt: 'Break down by status_code label' });
      }
      push({ label: 'Show errors', prompt: 'Show error rate' });
      // "Daily total" — only meaningful when query is rate-based.
      if (/\brate\s*\(/.test(q)) {
        push({ label: 'Daily total', prompt: 'What was the total for today?' });
      }
      break;
    }
    case 'gauge': {
      // Top 5 by instance when not already by-instance.
      const byInstance = /by\s*\([^)]*\binstance\b[^)]*\)/.test(q);
      if (!byInstance) {
        push({ label: 'Top 5 by instance', prompt: 'Show top 5 instances' });
      }
      push({ label: 'Compare yesterday', prompt: 'Compare to the same time yesterday' });
      break;
    }
    case 'errors': {
      push({ label: 'Show request rate', prompt: 'Show request rate for the same period' });
      const hasPathLabel = !!(args.hasLabels?.path || args.hasLabels?.route)
        || /\b(path|route)\b/.test(q);
      if (hasPathLabel) {
        push({ label: 'Group by endpoint', prompt: 'Break down errors by path/route' });
      }
      push({
        label: 'Show top error messages',
        prompt: 'What are the top 5 error messages from logs in this window?',
      });
      break;
    }
  }

  return chips;
}
