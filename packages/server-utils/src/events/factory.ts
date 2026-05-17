// EventBusFactory - selects InMemory or Redis implementation based on config

import type { IEventBus } from '@agentic-obs/common/events';
import { InMemoryEventBus } from '@agentic-obs/common/events/node';
import { RedisEventBus } from './redis.js';
import type { RedisEventBusOptions } from './redis.js';

export type EventBusBackend = 'memory' | 'redis';

export interface EventBusConfig {
  backend: EventBusBackend;
  redis?: RedisEventBusOptions;
}

export function createEventBus(config: EventBusConfig = { backend: 'memory' }): IEventBus {
  if (config.backend === 'redis') {
    return new RedisEventBus(config.redis ?? {});
  }
  return new InMemoryEventBus();
}

/**
 * Convenience factory that reads REDIS_URL from the environment.
 * Falls back to InMemoryEventBus when REDIS_URL is not set.
 */
export function createEventBusFromEnv(): IEventBus {
  const redisUrl = process.env['REDIS_URL'];
  if (redisUrl) {
    return new RedisEventBus({ url: redisUrl });
  }
  return new InMemoryEventBus();
}
