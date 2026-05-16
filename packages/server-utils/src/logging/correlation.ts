/**
 * AsyncLocalStorage-based correlation context for propagating requestId
 * through the async call chain without explicit parameter passing.
 */
import { AsyncLocalStorage } from 'node:async_hooks';

export interface CorrelationContext {
  requestId: string;
}

export const correlationStore = new AsyncLocalStorage<CorrelationContext>();

/** Returns the current requestId from the async context, if any. */
export function getRequestId(): string | undefined {
  return correlationStore.getStore()?.requestId;
}
