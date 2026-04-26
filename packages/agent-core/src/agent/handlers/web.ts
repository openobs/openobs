import type { ActionContext } from './_context.js';

// ---------------------------------------------------------------------------
// Web search
// ---------------------------------------------------------------------------

// TODO: migrate to withToolEventBoundary
export async function handleWebSearch(ctx: ActionContext, args: Record<string, unknown>): Promise<string> {
  if (!ctx.webSearchAdapter) return 'Error: No web search adapter configured.';
  const query = String(args.query ?? '');
  if (!query) return 'Error: "query" is required.';
  const maxResults = Number(args.max_results ?? 8);
  ctx.sendEvent({ type: 'tool_call', tool: 'web_search', args: { query }, displayText: `Searching: ${query.slice(0, 60)}` });
  try {
    const results = await ctx.webSearchAdapter.search(query, maxResults);
    const summary = results.length === 0
      ? 'No results found.'
      : results.map((r) => `${r.title ?? 'Result'}: ${r.snippet}${r.url ? ` (${r.url})` : ''}`).join('\n\n');
    ctx.sendEvent({ type: 'tool_result', tool: 'web_search', summary: `${results.length} results`, success: results.length > 0 });
    return summary;
  } catch (err) {
    const msg = `Web search failed: ${err instanceof Error ? err.message : String(err)}`;
    ctx.sendEvent({ type: 'tool_result', tool: 'web_search', summary: msg, success: false });
    return msg;
  }
}
