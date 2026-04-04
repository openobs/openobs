import type { IMetricsAdapter } from '../adapters/index.js';

export interface PrometheusTestResult {
  ok: boolean;
  unreachable?: boolean;
  error?: string;
}

/**
 * Test a PromQL query. Prefers the adapter when provided; falls back to direct fetch.
 */
export async function testPrometheusQuery(
  prometheusUrlOrAdapter: string | IMetricsAdapter,
  expr: string,
  headers?: Record<string, string>,
): Promise<PrometheusTestResult> {
  // Use adapter path when an IMetricsAdapter is provided
  if (typeof prometheusUrlOrAdapter !== 'string') {
    try {
      return await prometheusUrlOrAdapter.testQuery(expr);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (isUnreachableError(message)) {
        return { ok: false, unreachable: true, error: message };
      }
      return { ok: false, error: message };
    }
  }

  // Legacy path: direct fetch using URL + headers
  const prometheusUrl = prometheusUrlOrAdapter;
  try {
    const url = `${prometheusUrl}/api/v1/query?query=${encodeURIComponent(expr)}`;
    const response = await fetch(url, {
      method: 'GET',
      headers: headers ?? {},
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      return {
        ok: false,
        error: `HTTP ${response.status}: ${body.slice(0, 200)}`,
      };
    }
    const json = (await response.json()) as {
      status: string;
      error?: string;
      errorType?: string;
    };
    if (json.status !== 'success') {
      return {
        ok: false,
        error: json.error ?? 'Query returned non-success status',
      };
    }
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (isUnreachableError(message)) {
      return { ok: false, unreachable: true, error: message };
    }
    return { ok: false, error: message };
  }
}

function isUnreachableError(message: string): boolean {
  return (
    message.includes('ECONNREFUSED') ||
    message.includes('ENOTFOUND') ||
    message.includes('ETIMEDOUT') ||
    message.includes('timeout') ||
    message.includes('fetch failed')
  );
}
