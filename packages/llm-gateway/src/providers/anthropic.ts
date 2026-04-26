import { createLogger } from '@agentic-obs/common/logging';
import type {
  LLMProvider,
  LLMOptions,
  LLMResponse,
  CompletionMessage,
  ModelInfo,
  ToolCall,
} from '../types.js';
import { ProviderError, classifyProviderHttpError } from '../types.js';
import { effortToBudgetTokens, getCapabilities } from './capabilities.js';
import { buildApiKeyResolver } from '../api-key-helper.js';

const log = createLogger('anthropic-provider');

const DEFAULT_MAX_TOKENS = 4096;
const DEFAULT_API_VERSION = '2023-06-01';

/**
 * Endpoint flavor — controls the URL template and (for Bedrock) the body
 * shape. 'native' = api.anthropic.com style; 'bedrock' = AWS Bedrock proxy
 * shape (POST /model/{model}/invoke + anthropic_version body field).
 */
export type AnthropicEndpointFlavor = 'native' | 'bedrock';

export interface AnthropicConfig {
  /** Static API key. Empty / null is allowed — useful for corp gateways
   *  that authenticate via a network boundary instead of a header. When
   *  empty, no `x-api-key` header is sent. */
  apiKey: string;
  /** Shell command that prints a fresh API key on stdout. Wins over apiKey
   *  when set; the gateway invokes it (with a 5-min TTL cache) before each
   *  request. Resulting empty string also skips the auth header. */
  apiKeyHelper?: string;
  baseUrl?: string;
  apiType?: 'api-key' | 'bearer';
  apiVersion?: string;
  cacheControl?: boolean;
  /** 'native' (default) → POST /v1/messages; 'bedrock' → POST
   *  /model/{model}/invoke with `anthropic_version: bedrock-2023-05-31` in
   *  the body. Used when an Anthropic-shape gateway sits in front of
   *  Bedrock. */
  endpointFlavor?: AnthropicEndpointFlavor;
}

interface AnthropicTextBlock {
  type: 'text';
  text: string;
}

interface AnthropicToolUseBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}

interface AnthropicThinkingBlock {
  type: 'thinking';
  thinking: string;
}

type AnthropicContentBlock =
  | AnthropicTextBlock
  | AnthropicToolUseBlock
  | AnthropicThinkingBlock
  | { type: string };

interface AnthropicResponseBody {
  content: AnthropicContentBlock[];
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
  model: string;
  stop_reason: string | null;
}

type AnthropicToolChoice =
  | { type: 'auto' }
  | { type: 'any' }
  | { type: 'tool'; name: string }
  | undefined;

function buildToolChoice(toolChoice: LLMOptions['toolChoice']): AnthropicToolChoice {
  if (!toolChoice) return undefined;
  if (toolChoice === 'auto') return { type: 'auto' };
  if (toolChoice === 'any') return { type: 'any' };
  if (typeof toolChoice === 'object' && toolChoice.type === 'tool') {
    return { type: 'tool', name: toolChoice.name };
  }
  return undefined;
}

function isTextBlock(block: AnthropicContentBlock): block is AnthropicTextBlock {
  return block.type === 'text' && typeof (block as AnthropicTextBlock).text === 'string';
}

function isToolUseBlock(block: AnthropicContentBlock): block is AnthropicToolUseBlock {
  return (
    block.type === 'tool_use' &&
    typeof (block as AnthropicToolUseBlock).id === 'string' &&
    typeof (block as AnthropicToolUseBlock).name === 'string'
  );
}

function isThinkingBlock(block: AnthropicContentBlock): block is AnthropicThinkingBlock {
  return block.type === 'thinking' && typeof (block as AnthropicThinkingBlock).thinking === 'string';
}

export class AnthropicProvider implements LLMProvider {
  readonly name = 'anthropic';
  private readonly resolveKey: () => Promise<string>;
  private readonly baseUrl: string;
  private readonly cacheControl: boolean;
  private readonly apiVersion: string;
  private readonly endpointFlavor: AnthropicEndpointFlavor;

  constructor(private readonly config: AnthropicConfig) {
    this.resolveKey = buildApiKeyResolver({
      staticKey: config.apiKey,
      helperCommand: config.apiKeyHelper ?? null,
    });
    this.baseUrl = config.baseUrl || 'https://api.anthropic.com';
    this.cacheControl = config.cacheControl ?? false;
    this.apiVersion = config.apiVersion ?? DEFAULT_API_VERSION;
    this.endpointFlavor = config.endpointFlavor ?? 'native';
  }

  async complete(messages: CompletionMessage[], options: LLMOptions): Promise<LLMResponse> {
    const startTime = Date.now();

    // Anthropic separates system messages from the messages array
    const systemParts = messages.filter((m) => m.role === 'system');
    const conversationParts = messages.filter((m) => m.role !== 'system');

    const tools = options.tools && options.tools.length > 0 ? options.tools : undefined;
    const toolChoice = tools ? buildToolChoice(options.toolChoice) : undefined;

    // System message is always plain text in our usage; if a caller ever
    // passed blocks, flatten the text blocks to preserve compatibility.
    const flattenContent = (c: CompletionMessage['content']): string => {
      if (typeof c === 'string') return c;
      return c.filter((b) => b.type === 'text').map((b) => (b as { type: 'text'; text: string }).text).join('\n');
    };
    const requestBody: Record<string, unknown> = {
      model: options.model,
      system: systemParts.length > 0 ? systemParts.map((m) => flattenContent(m.content)).join('\n') : undefined,
      // Conversation messages pass through as-is. Anthropic's API natively
      // accepts content as either a string or an array of {type:'text'|'tool_use'|'tool_result'}
      // blocks, which exactly matches our ContentBlock shape — no translation needed.
      messages: conversationParts,
      temperature: options.temperature,
      max_tokens: options.maxTokens ?? DEFAULT_MAX_TOKENS,
    };
    if (tools) {
      requestBody.tools = tools;
      if (toolChoice) {
        requestBody.tool_choice = toolChoice;
      }
    }

    // Extended thinking — only attach when the model supports it. Anthropic
    // requires temperature=1 when thinking is enabled, so we override here.
    if (options.thinking && getCapabilities('anthropic', options.model ?? '').supportsThinking) {
      const budget = effortToBudgetTokens(options.thinking.effort);
      requestBody.thinking = { type: 'enabled', budget_tokens: budget };
      requestBody.temperature = 1;
      // budget_tokens must be < max_tokens; bump max_tokens if needed
      const currentMax = (requestBody.max_tokens as number) ?? DEFAULT_MAX_TOKENS;
      if (currentMax <= budget) {
        requestBody.max_tokens = budget + DEFAULT_MAX_TOKENS;
      }
    }

    // Bedrock gates Anthropic models behind /model/{id}/invoke and requires
    // `anthropic_version` in the body (instead of the header). The `model`
    // travels in the URL path, not the body.
    let url: string;
    if (this.endpointFlavor === 'bedrock') {
      const modelId = encodeURIComponent(String(options.model ?? ''));
      url = `${this.baseUrl}/model/${modelId}/invoke`;
      requestBody.anthropic_version = 'bedrock-2023-05-31';
      delete requestBody.model;
    } else {
      url = `${this.baseUrl}/v1/messages`;
    }

    // Resolve the API key per-call so apiKeyHelper rotations land without
    // restarting the process. Empty result → don't send the header at all
    // (some corp gateways authenticate at the network boundary).
    const apiKey = await this.resolveKey();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'anthropic-version': this.apiVersion,
    };
    if (apiKey) {
      headers['x-api-key'] = apiKey;
    }

    const fetchInit: RequestInit = {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody),
    };
    if (options.signal) fetchInit.signal = options.signal;
    const response = await fetch(url, fetchInit);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Anthropic API error ${response.status}: ${errorText}`);
    }

    const data = (await response.json()) as AnthropicResponseBody;
    const latencyMs = Date.now() - startTime;

    const inputTokens = data.usage?.input_tokens ?? 0;
    const outputTokens = data.usage?.output_tokens ?? 0;
    const usage = {
      promptTokens: inputTokens,
      completionTokens: outputTokens,
      totalTokens: inputTokens + outputTokens,
    };

    const blocks: AnthropicContentBlock[] = Array.isArray(data.content) ? data.content : [];

    const textPieces: string[] = [];
    const toolCalls: ToolCall[] = [];
    const thinkingBlocks: string[] = [];
    for (const block of blocks) {
      if (isTextBlock(block)) {
        textPieces.push(block.text);
      } else if (isToolUseBlock(block)) {
        toolCalls.push({
          id: block.id,
          name: block.name,
          input: block.input ?? {},
        });
      } else if (isThinkingBlock(block)) {
        thinkingBlocks.push(block.thinking);
      }
    }

    return {
      content: textPieces.join('\n'),
      toolCalls,
      thinkingBlocks: thinkingBlocks.length > 0 ? thinkingBlocks : undefined,
      usage,
      model: data.model,
      latencyMs,
    };
  }

  async listModels(): Promise<ModelInfo[]> {
    let response: Response;
    try {
      const apiKey = await this.resolveKey();
      const headers: Record<string, string> = { 'anthropic-version': this.apiVersion };
      if (apiKey) headers['x-api-key'] = apiKey;
      response = await fetch(`${this.baseUrl}/v1/models`, { headers });
    } catch (err) {
      const kind = classifyProviderHttpError({ cause: err });
      log.warn({ err, provider: 'anthropic', baseUrl: this.baseUrl, kind }, 'listModels transport failure');
      throw new ProviderError(
        `Anthropic listModels transport failure: ${err instanceof Error ? err.message : String(err)}`,
        { kind, provider: 'anthropic', cause: err },
      );
    }
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      const kind = classifyProviderHttpError({ status: response.status });
      log.warn(
        { provider: 'anthropic', status: response.status, body: body.slice(0, 200), baseUrl: this.baseUrl, kind },
        'listModels failed',
      );
      throw new ProviderError(
        `Anthropic listModels failed: HTTP ${response.status} ${body.slice(0, 200)}`,
        { kind, provider: 'anthropic', status: response.status },
      );
    }
    const data = (await response.json()) as { data: Array<{ id: string; display_name?: string }> };
    return data.data.map((m) => ({
      id: m.id,
      name: m.display_name ?? m.id,
      provider: 'anthropic',
    }));
  }
}
