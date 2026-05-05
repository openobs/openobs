/**
 * Measurement harness — count tool_search round-trips at the start of a
 * Claude orchestrator session before any "real work" tool fires.
 *
 * Drives the Anthropic API with the production system prompt, always-on
 * tool schemas, and tool_search wiring. For tool_search calls we resolve
 * real schemas from TOOL_REGISTRY; for other tool calls we return canned
 * plausible results so the loop progresses without needing live infra.
 *
 * No workspace package imports — all source files imported by relative
 * path so tsx doesn't trip on workspace exports maps.
 *
 * Run:
 *   ANTHROPIC_API_KEY=... npx tsx tests/scripts/measure-tool-search.ts
 */

import 'dotenv/config';
import { buildSystemPrompt } from '../../packages/agent-core/src/agent/orchestrator-prompt.js';
import {
  TOOL_SCHEMAS,
  alwaysOnToolsForAgent,
  deferredToolNamesForAgent,
  deferredSchemasByName,
} from '../../packages/agent-core/src/agent/tool-schema-registry.js';
import { searchTools, selectTools } from '../../packages/agent-core/src/agent/tool-search.js';
import { agentRegistry } from '../../packages/agent-core/src/agent/agent-registry.js';
import { SYSTEM_PROMPT_DYNAMIC_BOUNDARY } from '../../packages/agent-core/src/agent/orchestrator-prompt.js';

interface ToolDef {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}
interface ToolUseBlock { type: 'tool_use'; id: string; name: string; input: Record<string, unknown>; }
interface TextBlock { type: 'text'; text: string; cache_control?: { type: 'ephemeral' }; }
interface ToolResultBlock { type: 'tool_result'; tool_use_id: string; content: string; }
type ContentBlock = TextBlock | ToolUseBlock | ToolResultBlock;
interface AnthropicMsg { role: 'user' | 'assistant'; content: string | ContentBlock[]; }

const MAX_TURNS = 10;

const PROMPTS = [
  'Why is p99 latency on api-gateway so high in the last hour?',
  'Investigate why our error rate spiked at 14:30',
  'My web service looks slow — figure out what changed',
];

function cannedToolResult(name: string): string {
  switch (name) {
    case 'datasources_list':
      return JSON.stringify([{ id: 'prom-prod', name: 'prom-prod', type: 'prometheus', isDefault: true }]);
    case 'datasources_suggest':
      return JSON.stringify({ chosen: { id: 'prom-prod', type: 'prometheus' }, alternatives: [] });
    case 'investigation_create':
      return JSON.stringify({ investigationId: 'inv-test-123' });
    case 'metrics_query':
      return JSON.stringify({ value: 0.099, unit: 'seconds' });
    case 'metrics_range_query':
      return JSON.stringify({ samples: [[1700000000, '0.05'], [1700001800, '0.099']] });
    case 'metrics_discover':
      return JSON.stringify({ names: ['http_requests_total', 'http_request_duration_seconds_bucket'] });
    case 'changes_list_recent':
      return JSON.stringify({ changes: [] });
    case 'investigation_add_section':
      return JSON.stringify({ sectionId: 's-' + Math.random().toString(36).slice(2, 8) });
    case 'investigation_complete':
      return JSON.stringify({ ok: true });
    case 'web_search':
      return JSON.stringify({ results: [{ title: 'mock', url: 'https://example.com', snippet: '...' }] });
    default:
      return JSON.stringify({ ok: true, note: `canned result for ${name}` });
  }
}

function resolveToolSearch(input: Record<string, unknown>, allowedDeferred: Set<string>): { observation: string; loaded: string[] } {
  const query = String(input['query'] ?? '');
  const all = TOOL_SCHEMAS;
  let matched: { name: string; description: string; input_schema: Record<string, unknown> }[];
  if (query.toLowerCase().startsWith('select:')) {
    const names = query.slice('select:'.length).split(',').map((s) => s.trim()).filter(Boolean);
    matched = selectTools(names, all) as never;
  } else {
    matched = searchTools(query, all) as never;
  }
  matched = matched.filter((t) => allowedDeferred.has(t.name));
  const loaded = matched.map((t) => t.name);
  if (loaded.length === 0) {
    return { observation: `<functions>\n(no tools matched query "${query}")\n</functions>`, loaded };
  }
  const blocks = matched.map((t) => `<function>${JSON.stringify({ name: t.name, description: t.description, parameters: t.input_schema })}</function>`).join('\n');
  return { observation: `<functions>\n${blocks}\n</functions>`, loaded };
}

function buildSystemField(systemText: string): TextBlock[] {
  const idx = systemText.indexOf(SYSTEM_PROMPT_DYNAMIC_BOUNDARY);
  if (idx === -1) return [{ type: 'text', text: systemText }];
  const staticPart = systemText.slice(0, idx).replace(/\n+$/, '');
  const dynamicPart = systemText.slice(idx + SYSTEM_PROMPT_DYNAMIC_BOUNDARY.length).replace(/^\n+/, '');
  const blocks: TextBlock[] = [{ type: 'text', text: staticPart, cache_control: { type: 'ephemeral' } }];
  if (dynamicPart.length > 0) blocks.push({ type: 'text', text: dynamicPart });
  return blocks;
}

async function callAnthropic(model: string, apiKey: string, baseUrl: string, system: TextBlock[], messages: AnthropicMsg[], tools: ToolDef[]): Promise<{ content: ContentBlock[]; stop_reason: string }> {
  const body = {
    model,
    max_tokens: 4096,
    temperature: 0,
    system,
    messages,
    tools,
    tool_choice: { type: 'auto' as const },
  };
  const r = await fetch(`${baseUrl}/v1/messages`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'anthropic-version': '2023-06-01',
      'x-api-key': apiKey,
    },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    throw new Error(`anthropic ${r.status}: ${await r.text().catch(() => '')}`);
  }
  const j = (await r.json()) as { content: ContentBlock[]; stop_reason: string };
  return j;
}

interface Trace {
  prompt: string;
  totalTurns: number;
  toolSearchCount: number;
  toolNames: string[];
  firstNonSearchToolAtTurn: number | null;
  endedReason: 'plain-text' | 'max-turns' | 'enough-work';
}

async function runOne(model: string, apiKey: string, baseUrl: string, prompt: string): Promise<Trace> {
  const orch = agentRegistry.get('orchestrator')!;
  const allowedTools = orch.allowedTools;

  const systemPrompt = buildSystemPrompt(null, [], [], null, [
    { id: 'prom-prod', name: 'prom-prod', type: 'prometheus', isDefault: true } as never,
  ], { hasPrometheus: true, allowedTools, now: new Date().toISOString() });

  const system = buildSystemField(systemPrompt);
  const alwaysOn = alwaysOnToolsForAgent(allowedTools) as ToolDef[];
  const deferredNames = new Set(deferredToolNamesForAgent(allowedTools));
  const loaded = new Set<string>();
  const toolsForTurn = (): ToolDef[] => [...alwaysOn, ...(deferredSchemasByName(loaded) as ToolDef[])];

  const messages: AnthropicMsg[] = [{ role: 'user', content: prompt }];

  const trace: Trace = {
    prompt,
    totalTurns: 0,
    toolSearchCount: 0,
    toolNames: [],
    firstNonSearchToolAtTurn: null,
    endedReason: 'max-turns',
  };

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    trace.totalTurns = turn + 1;
    const resp = await callAnthropic(model, apiKey, baseUrl, system, messages, toolsForTurn());
    const tools = resp.content.filter((b): b is ToolUseBlock => b.type === 'tool_use');

    if (tools.length === 0) {
      trace.endedReason = 'plain-text';
      break;
    }

    messages.push({ role: 'assistant', content: resp.content });

    const userBlocks: ToolResultBlock[] = [];
    for (const tc of tools) {
      trace.toolNames.push(tc.name);
      let resultText: string;
      if (tc.name === 'tool_search') {
        trace.toolSearchCount++;
        const r = resolveToolSearch(tc.input, deferredNames);
        for (const n of r.loaded) loaded.add(n);
        resultText = r.observation;
      } else {
        if (trace.firstNonSearchToolAtTurn === null) trace.firstNonSearchToolAtTurn = turn + 1;
        resultText = cannedToolResult(tc.name);
      }
      userBlocks.push({ type: 'tool_result', tool_use_id: tc.id, content: resultText });
    }
    messages.push({ role: 'user', content: userBlocks });

    const nonSearch = trace.toolNames.filter((n) => n !== 'tool_search').length;
    if (nonSearch >= 4) {
      trace.endedReason = 'enough-work';
      break;
    }
  }
  return trace;
}

async function main() {
  const apiKey = process.env['ANTHROPIC_API_KEY'];
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');
  const baseUrl = (process.env['ANTHROPIC_BASE_URL'] ?? 'https://api.anthropic.com').replace(/\/$/, '');
  const model = process.env['DEFAULT_LLM_MODEL'] ?? 'claude-opus-4-6';

  const orch = agentRegistry.get('orchestrator')!;
  console.log(`Model: ${model}`);
  console.log(`Always-on (${alwaysOnToolsForAgent(orch.allowedTools).length}): ${alwaysOnToolsForAgent(orch.allowedTools).map((t) => t.name).join(', ')}`);
  console.log(`Deferred (${deferredToolNamesForAgent(orch.allowedTools).length}): ${deferredToolNamesForAgent(orch.allowedTools).join(', ')}`);
  console.log('');

  const traces: Trace[] = [];
  for (const p of PROMPTS) {
    process.stdout.write(`→ "${p.slice(0, 60)}..."  `);
    try {
      const t = await runOne(model, apiKey, baseUrl, p);
      traces.push(t);
      console.log(`turns=${t.totalTurns} tool_search=${t.toolSearchCount} firstWork@${t.firstNonSearchToolAtTurn ?? 'never'}\n   sequence: ${t.toolNames.join(' → ')}`);
    } catch (e) {
      console.log(`ERROR: ${(e as Error).message}`);
    }
  }

  console.log('');
  console.log('=== Summary ===');
  if (traces.length === 0) { console.log('No successful runs.'); return; }
  const avgSearch = (traces.reduce((s, t) => s + t.toolSearchCount, 0) / traces.length).toFixed(2);
  const avgFirstWork = (traces.reduce((s, t) => s + (t.firstNonSearchToolAtTurn ?? MAX_TURNS), 0) / traces.length).toFixed(2);
  console.log(`Runs:                       ${traces.length}`);
  console.log(`Avg tool_search calls:      ${avgSearch}`);
  console.log(`Avg turn of first real work: ${avgFirstWork}`);
  console.log(`Per-run tool_search counts: [${traces.map((t) => t.toolSearchCount).join(', ')}]`);
}

main().catch((e) => { console.error(e); process.exit(1); });
