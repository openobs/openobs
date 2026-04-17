/**
 * Parse JSON from LLM output — handles common issues:
 * - Strips markdown code fences with any language tag (```json, ```text,
 *   or plain ```)
 * - Tolerates prose before/after the JSON by extracting the first {...}
 *   or [...] balanced block
 * - Fixes invalid escape sequences (e.g. \s, \d from PromQL regex)
 *
 * Throws on failure so callers can catch via try/catch. Returning
 * `undefined` silently bites downstream destructures — every call site
 * was already wrapping in try/catch assuming throw semantics.
 */
export function parseLlmJson<T = unknown>(raw: string): T {
  if (!raw || typeof raw !== 'string') {
    throw new Error('parseLlmJson: empty response');
  }

  // Strip any ``` fence regardless of language tag (```json, ```yaml, ```).
  const defenced = raw.replace(/```[a-zA-Z]*\n?/g, '').replace(/```/g, '').trim();

  // Extract the first balanced JSON object or array — skips prose prefix
  // ("Here's the next step:") and trailing commentary that would break
  // JSON.parse on the whole string.
  const candidate = extractBalanced(defenced) ?? defenced;

  // Fix invalid JSON escapes: \s \d \w etc. → \\s \\d \\w
  const sanitized = candidate.replace(/\\([^"\\\/bfnrtu])/g, '\\\\$1');

  try {
    return JSON.parse(sanitized) as T;
  } catch (err) {
    const snippet = sanitized.length > 200 ? `${sanitized.slice(0, 200)}…` : sanitized;
    throw new Error(
      `parseLlmJson: invalid JSON (${(err as Error).message}). Snippet: ${snippet}`,
    );
  }
}

/**
 * Return the first balanced `{...}` or `[...]` region, or null if none.
 * Handles nested braces and string literals (ignoring braces inside strings).
 */
function extractBalanced(s: string): string | null {
  const startIdx = (() => {
    for (let i = 0; i < s.length; i += 1) {
      const c = s[i];
      if (c === '{' || c === '[') return i;
    }
    return -1;
  })();
  if (startIdx < 0) return null;

  const open = s[startIdx]!;
  const close = open === '{' ? '}' : ']';
  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = startIdx; i < s.length; i += 1) {
    const c = s[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (inString) {
      if (c === '\\') escape = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') {
      inString = true;
    } else if (c === open) {
      depth += 1;
    } else if (c === close) {
      depth -= 1;
      if (depth === 0) return s.slice(startIdx, i + 1);
    }
  }
  return null;
}
