import { describe, it, expect } from 'vitest';
import { SmartModelRouter } from '../router/smart-router.js';
import type { ModelConfig, TaskDescription } from '../router/smart-router.js';

const MODELS: ModelConfig[] = [
  { id: 'fast-model', provider: 'test', costPer1kTokens: 0.01, latencyP50Ms: 100, capabilities: ['fast'] },
  { id: 'smart-model', provider: 'test', costPer1kTokens: 0.1, latencyP50Ms: 500, capabilities: ['reasoning', 'creativity'] },
];

describe('SmartModelRouter', () => {
  it('should use default model when no LLM classifier', async () => {
    const router = new SmartModelRouter({ models: MODELS });
    const task: TaskDescription = { type: 'query', complexity: 'low' };

    const selection = await router.routeWithLlm(task);

    expect(selection.model).toBe('fast-model');
    expect(selection.reasoning).toContain('default');
  });

  it('should use configured default model', async () => {
    const router = new SmartModelRouter({ models: MODELS, defaultModel: 'smart-model' });
    const task: TaskDescription = { type: 'analysis', complexity: 'high' };

    const selection = await router.routeWithLlm(task);

    expect(selection.model).toBe('smart-model');
  });

  it('should throw if no models configured', () => {
    expect(() => new SmartModelRouter({ models: [] })).toThrow('at least one model');
  });

  it('should estimate cost correctly', async () => {
    const router = new SmartModelRouter({ models: MODELS });
    const task: TaskDescription = { type: 'query', complexity: 'low', tokenEstimate: 2000 };

    const selection = await router.routeWithLlm(task);

    expect(selection.estimatedCost).toBe(0.02); // 2000/1000 * 0.01
  });
});
