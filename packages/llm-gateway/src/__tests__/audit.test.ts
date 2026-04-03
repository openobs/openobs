import { describe, it, expect } from 'vitest';
import { AuditLogger, type AuditEntry } from '../audit.js';

function makeEntry(overrides: Partial<AuditEntry> = {}): AuditEntry {
  return {
    id: 'test-1',
    timestamp: new Date(),
    provider: 'test',
    model: 'test-model',
    promptHash: 'abc123',
    promptTokens: 10,
    completionTokens: 20,
    totalTokens: 30,
    latencyMs: 100,
    success: true,
    ...overrides,
  };
}

describe('AuditLogger', () => {
  it('should record and retrieve entries', () => {
    const logger = new AuditLogger();
    logger.record(makeEntry({ id: '1' }));
    logger.record(makeEntry({ id: '2' }));

    expect(logger.getEntries()).toHaveLength(2);
  });

  it('should filter by model', () => {
    const logger = new AuditLogger();
    logger.record(makeEntry({ model: 'gpt-4' }));
    logger.record(makeEntry({ model: 'claude' }));
    logger.record(makeEntry({ model: 'gpt-4' }));

    expect(logger.getEntriesByModel('gpt-4')).toHaveLength(2);
    expect(logger.getEntriesByModel('claude')).toHaveLength(1);
  });

  it('should calculate total tokens', () => {
    const logger = new AuditLogger();
    logger.record(makeEntry({ totalTokens: 100 }));
    logger.record(makeEntry({ totalTokens: 200 }));

    expect(logger.getTotalTokens()).toBe(300);
  });

  it('should clear entries', () => {
    const logger = new AuditLogger();
    logger.record(makeEntry());
    logger.clear();

    expect(logger.getEntries()).toHaveLength(0);
  });
});
