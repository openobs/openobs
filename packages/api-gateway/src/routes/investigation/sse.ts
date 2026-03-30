// SSE helpers for streaming investigation progress

import type { Response } from 'express';
import type { SseEvent, SseEventType } from './types.js';

/**
 * Configure an Express response for SSE streaming.
 * Sets headers and sends the initial connection keepalive.
 */
export function initSse(res: Response): void {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();
}

/**
 * Write a single SSE event to the response.
 */
export function sendSseEvent<T>(res: Response, event: SseEvent<T>): void {
  res.write(`event: ${event.type}\n`);
  res.write(`data: ${JSON.stringify(event.data)}\n\n`);
}

/**
 * Send a keepalive comment (prevents proxy timeouts).
 */
export function sendSseKeepAlive(res: Response): void {
  res.write(`: keepalive\n\n`);
}

/**
 * Close an SSE stream gracefully.
 */
export function closeSse(res: Response): void {
  res.write('event: done\ndata: {}\n\n');
  res.end();
}

/**
 * Higher-level helper: stream a series of events then close.
 */
export async function streamEvents<T>(
  res: Response,
  events: Array<{ type: SseEventType; data: T }>,
  delayMs = 0,
): Promise<void> {
  initSse(res);
  for (const event of events) {
    sendSseEvent(res, event);
    if (delayMs > 0)
      await new Promise((r) => setTimeout(r, delayMs));
  }
  closeSse(res);
}
