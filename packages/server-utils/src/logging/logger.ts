/**
 * Pino-based structured logger factory.
 *
 * Usage:
 *   const log = createLogger('api-gateway');
 *   log.info({ userId: '123' }, 'user signed in');
 *
 * // Child logger with persistent context fields
 * const childLog = log.child({ component: 'auth', traceId: '...' });
 * childLog.warn('token expiring soon');
 *
 * Every log line automatically includes `requestId` when called within a
 * requestLogger middleware context (via AsyncLocalStorage).
 */
import pino from 'pino';
import { getRequestId } from './correlation.js';

export type Logger = pino.Logger;
export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

export interface LoggerOptions {
  /** Minimum log level. Defaults to LOG_LEVEL env var or 'info'. */
  level?: LogLevel;
  /** Additional static bindings added to every log line. */
  bindings?: Record<string, unknown>;
}

/**
 * Creates a named pino logger with JSON output.
 *
 * The logger injects `requestId` from the current async context on every log
 * call, so correlation IDs flow through the call chain automatically.
 */
export function createLogger(name: string, options?: LoggerOptions): pino.Logger {
  const level = (options?.level ?? process.env['LOG_LEVEL'] ?? 'info') as LogLevel;

  const logger = pino({
    name,
    level,
    timestamp: pino.stdTimeFunctions.isoTime,
    // Inject requestId from AsyncLocalStorage on every log call
    mixin() {
      const requestId = getRequestId();
      return requestId ? { requestId } : {};
    },
  });

  if (options?.bindings) {
    return logger.child(options.bindings);
  }

  return logger;
}
