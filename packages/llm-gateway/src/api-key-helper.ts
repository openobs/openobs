import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { createLogger } from '@agentic-obs/common/logging';

const log = createLogger('api-key-helper');
const execAsync = promisify(exec);

/**
 * Cache entry for a resolved helper output. The cache is keyed on the helper
 * command string itself so two providers configured with the same command
 * share a single in-flight exec — useful when an org rotates a single
 * upstream credential used by multiple LLM endpoints.
 */
interface CacheEntry {
  value: string;
  expiresAt: number;
}

/** Time-to-live for cached helper output. The model uses the cached value
 *  until this expires, then re-execs the helper on the next call. */
const TTL_MS = 5 * 60 * 1000;

/** Cap how long the helper command may take. Prevents a misconfigured
 *  helper from blocking every LLM call indefinitely. */
const EXEC_TIMEOUT_MS = 10_000;

const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<string>>();

export interface ApiKeyResolverOptions {
  /** Static API key — used when no helper is configured. */
  staticKey?: string | null;
  /** Shell command whose stdout is the API key. Wins over staticKey. */
  helperCommand?: string | null;
}

/**
 * Build a key resolver that the gateway calls before every LLM request.
 * When `helperCommand` is set, the resolver execs it (with a 5-min TTL
 * cache) and returns trimmed stdout. Otherwise it returns the static key.
 *
 * Returns an async function so callers can `await resolver()` regardless of
 * whether a helper is in play — the call site doesn't have to branch.
 */
export function buildApiKeyResolver(opts: ApiKeyResolverOptions): () => Promise<string> {
  const helper = opts.helperCommand?.trim();
  const staticKey = opts.staticKey ?? '';

  if (!helper) {
    return async () => staticKey;
  }

  return async () => {
    const now = Date.now();
    const cached = cache.get(helper);
    if (cached && cached.expiresAt > now) {
      return cached.value;
    }
    // Coalesce concurrent calls for the same helper into one exec — otherwise
    // a burst of LLM requests would each fork their own shell.
    const existing = inflight.get(helper);
    if (existing) return existing;
    const p = execHelper(helper)
      .then((value) => {
        cache.set(helper, { value, expiresAt: Date.now() + TTL_MS });
        return value;
      })
      .finally(() => {
        inflight.delete(helper);
      });
    inflight.set(helper, p);
    return p;
  };
}

async function execHelper(command: string): Promise<string> {
  try {
    const { stdout } = await execAsync(command, {
      timeout: EXEC_TIMEOUT_MS,
      // 1MB output cap. Real helpers print a single short token; anything
      // larger is suspicious and we'd rather fail fast than hold it in memory.
      maxBuffer: 1 * 1024 * 1024,
    });
    const trimmed = stdout.trim();
    if (!trimmed) {
      throw new Error(`api-key-helper produced empty stdout (command: ${command})`);
    }
    return trimmed;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error({ command, err: msg }, 'api-key-helper failed');
    throw new Error(`api-key-helper failed: ${msg}`);
  }
}

/** Test-only: drop everything cached. Production callers don't need this. */
export function _resetApiKeyHelperCacheForTests(): void {
  cache.clear();
  inflight.clear();
}
