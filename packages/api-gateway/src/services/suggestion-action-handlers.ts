/**
 * Action handlers for the AI Suggestions inbox — Wave 2 / step 3.
 *
 * When the user clicks "Accept" on a suggestion, the route layer looks up
 * the handler by `actionKind` and invokes it. The handler returns either:
 *
 *   { kind: 'navigate', url }        — the UI should open this URL.
 *   { kind: 'message', message }     — the UI shows a toast/banner.
 *
 * `archive_resources` is STUBBED in this wave: the dashboard lifecycle
 * archive column doesn't exist yet (Wave 1 PR-C deferred this — see Open
 * Risks in docs/wave1/). Instead of silently failing or fabricating a
 * delete, we route the user to a list view with the candidate IDs
 * preselected so they can decide what to do manually. This matches the
 * "no auto-archive" decision in the design.
 *
 * `merge_dashboards` is also stub-shaped (no real merge UI yet) — we
 * route the user to a compare view rendered by the web app.
 */

import type { AiSuggestionActionKind } from '@agentic-obs/common';

export type ActionResult =
  | { kind: 'navigate'; url: string }
  | { kind: 'message'; message: string };

export interface ActionHandlerDeps {
  // No real services needed yet — the handlers compute URLs only.
  // Keeping the dep object reserves a hook for future handlers (e.g.
  // create_dashboard could call the dashboard service directly).
  _reserved?: never;
}

export type ActionHandler = (
  payload: Record<string, unknown>,
  deps: ActionHandlerDeps,
) => Promise<ActionResult>;

const handlers: Record<AiSuggestionActionKind, ActionHandler> = {
  create_dashboard: async (payload) => {
    const prefill = (payload['prefill'] ?? {}) as { title?: string; prompt?: string };
    const params = new URLSearchParams();
    if (prefill.title) params.set('title', prefill.title);
    if (prefill.prompt) params.set('prompt', prefill.prompt);
    return {
      kind: 'navigate',
      url: `/dashboards/new${params.toString() ? `?${params.toString()}` : ''}`,
    };
  },
  archive_resources: async (payload) => {
    // Stubbed: lifecycle archive column isn't built. Navigate to the
    // dashboards list with the candidate IDs preselected. The web app
    // reads `?preselect=...` to highlight rows.
    const ids = Array.isArray(payload['resourceIds'])
      ? (payload['resourceIds'] as string[])
      : [];
    const params = new URLSearchParams();
    if (ids.length > 0) params.set('preselect', ids.join(','));
    return {
      kind: 'navigate',
      url: `/dashboards${params.toString() ? `?${params.toString()}` : ''}`,
    };
  },
  merge_dashboards: async (payload) => {
    const ids = Array.isArray(payload['dashboardIds'])
      ? (payload['dashboardIds'] as string[])
      : [];
    if (ids.length < 2) {
      return { kind: 'message', message: 'Need two dashboards to compare.' };
    }
    return {
      kind: 'navigate',
      url: `/dashboards/compare?a=${encodeURIComponent(ids[0]!)}&b=${encodeURIComponent(ids[1]!)}`,
    };
  },
};

export function dispatchSuggestionAction(
  kind: AiSuggestionActionKind,
  payload: Record<string, unknown>,
  deps: ActionHandlerDeps,
): Promise<ActionResult> {
  const handler = handlers[kind];
  if (!handler) {
    return Promise.resolve({
      kind: 'message',
      message: `Unknown action: ${kind}`,
    });
  }
  return handler(payload, deps);
}

/** Exposed for tests + the docstring of suggestions.ts. */
export const SUGGESTION_ACTION_HANDLERS: ReadonlyArray<AiSuggestionActionKind> =
  Object.keys(handlers) as AiSuggestionActionKind[];
