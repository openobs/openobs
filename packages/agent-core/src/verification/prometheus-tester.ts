export interface PrometheusTestResult {
  ok: boolean;
  unreachable?: boolean;
  error?: string;
}

export async function testPrometheusQuery(
  prometheusUrl: string,
  expr: string,
  headers?: Record<string, string>,
): Promise<PrometheusTestResult> {
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
    // Network errors indicate Prometheus is unreachable
    if (
      message.includes('ECONNREFUSED') ||
      message.includes('ENOTFOUND') ||
      message.includes('ETIMEDOUT') ||
      message.includes('timeout') ||
      message.includes('fetch failed')
    ) {
      return { ok: false, unreachable: true, error: message };
    }
    return { ok: false, error: message };
  }
}
