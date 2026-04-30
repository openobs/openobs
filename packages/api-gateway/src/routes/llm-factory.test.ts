import { describe, expect, it, vi } from 'vitest';
import { createLlmProvider } from './llm-factory.js';

describe('createLlmProvider', () => {
  it('uses DeepSeek v1 endpoint for chat completions by default', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        model: 'deepseek-chat',
        choices: [{ message: { role: 'assistant', content: 'ok' } }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      }),
    } as Response);

    try {
      const provider = createLlmProvider({
        provider: 'deepseek',
        apiKey: 'sk-test',
        model: 'deepseek-chat',
      });
      expect(provider.name).toBe('deepseek');
      await provider.complete(
        [{ role: 'user', content: 'hello' }],
        { model: 'deepseek-chat' },
      );

      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.deepseek.com/v1/chat/completions',
        expect.any(Object),
      );
    } finally {
      fetchMock.mockRestore();
    }
  });

  it('uses OpenAI-compatible identity for custom OpenRouter baseUrl', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [{ id: 'openrouter/auto' }],
      }),
    } as Response);

    try {
      const provider = createLlmProvider({
        provider: 'openai',
        apiKey: 'sk-test',
        model: 'openrouter/auto',
        baseUrl: 'https://openrouter.ai/api/v1',
      });

      expect(provider.name).toBe('openrouter');
      await expect(provider.listModels?.()).resolves.toEqual([
        { id: 'openrouter/auto', name: 'openrouter/auto', provider: 'openrouter' },
      ]);
      expect(fetchMock).toHaveBeenCalledWith(
        'https://openrouter.ai/api/v1/models',
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: 'Bearer sk-test' }),
        }),
      );
    } finally {
      fetchMock.mockRestore();
    }
  });

  it('keeps the official OpenAI identity for the default OpenAI path', () => {
    const provider = createLlmProvider({
      provider: 'openai',
      apiKey: 'sk-test',
      model: 'gpt-4o',
    });

    expect(provider.name).toBe('openai');
  });

  it('routes corporate OpenAI-format gateways through a named compatible provider', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        model: 'corp-model',
        choices: [{ message: { role: 'assistant', content: 'ok' } }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      }),
    } as Response);

    try {
      const provider = createLlmProvider({
        provider: 'corporate-gateway',
        apiFormat: 'openai',
        apiKey: 'corp-key',
        model: 'corp-model',
        baseUrl: 'https://llm-gateway.example.test/v1',
      });

      expect(provider.name).toBe('corporate-gateway');
      await provider.complete([{ role: 'user', content: 'hello' }], { model: 'corp-model' });
      expect(fetchMock).toHaveBeenCalledWith(
        'https://llm-gateway.example.test/v1/chat/completions',
        expect.any(Object),
      );
    } finally {
      fetchMock.mockRestore();
    }
  });
});
