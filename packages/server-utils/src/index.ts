// @agentic-obs/server-utils — server-only utilities split out of @agentic-obs/common.
//
// These modules depend on Node built-ins (node:crypto, node:async_hooks,
// node:process) or Node-only packages (ioredis, pino, express). They MUST
// NOT be imported from packages/web. Reach them via explicit subpaths:
//
//   @agentic-obs/server-utils/logging      ← createLogger, requestLogger, correlation
//   @agentic-obs/server-utils/crypto       ← AES-GCM secret box (node:crypto)
//   @agentic-obs/server-utils/events       ← createEventBus, createEventBusFromEnv
//   @agentic-obs/server-utils/events/redis ← RedisEventBus (ioredis)
//   @agentic-obs/server-utils/lifecycle    ← GracefulShutdown (SIGTERM/SIGINT)

export {};
