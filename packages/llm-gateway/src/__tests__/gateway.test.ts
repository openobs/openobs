import { describe, it, expect } from 'vitest';
import { LLMGateway } from '../gateway.js';
import { MockProvider } from '../providers/mock.js';

describe('LLMGateway', () => {
  it('should complete with primary provider', async () => {
    const primary = new MockProvider({ name: 'primary' });
    const gateway = new LLMGateway({ primary });

    const result = await gateway.complete(
      [{ role: 'user', content: 'Hello' }],
      { model: 'test' },
    );

    expect(result.content).toBe('Mock response content');
    expect(primary.callCount).toBe(1);
  });

  it('should fall back to secondary on primary failure', async () => {
    const primary = new MockProvider({ name: 'primary', shouldFail: true });
    const fallback = new MockProvider({ name: 'fallback', response: { content: 'Fallback response' } });
    const gateway = new LLMGateway({ primary, fallback, maxRetries: 1 });

    const result = await gateway.complete(
      [{ role: 'user', content: 'Hello' }],
      { model: 'test' },
    );

    expect(result.content).toBe('Fallback response');
    expect(primary.callCount).toBe(1);
    expect(fallback.callCount).toBe(1);
  });

  it('should retry on failure before giving up', async () => {
    const primary = new MockProvider({ name: 'primary', shouldFail: true });
    const gateway = new LLMGateway({ primary, maxRetries: 3, retryDelayMs: 1 });

    await expect(
      gateway.complete([{ role: 'user', content: 'Hello' }], { model: 'test' }),
    ).rejects.toThrow('Mock provider error');

    expect(primary.callCount).toBe(3);
  });

  it('should track metrics', async () => {
    const primary = new MockProvider();
    const gateway = new LLMGateway({ primary });

    await gateway.complete([{ role: 'user', content: 'Hello' }], { model: 'test' });
    await gateway.complete([{ role: 'user', content: 'World' }], { model: 'test' });

    const metrics = gateway.getMetrics();
    expect(metrics.callCount).toBe(2);
    expect(metrics.totalTokens).toBe(60);
  });

  it('should record audit entries', async () => {
    const primary = new MockProvider();
    const gateway = new LLMGateway({ primary });

    await gateway.complete([{ role: 'user', content: 'Hello' }], { model: 'test' });

    const audit = gateway.getAuditLog();
    expect(audit).toHaveLength(1);
    expect(audit[0]!.success).toBe(true);
    expect(audit[0]!.provider).toBe('mock');
  });
});
