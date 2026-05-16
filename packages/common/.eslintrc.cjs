// Zero-dep boundary for @agentic-obs/common.
//
// This package is imported from both the server (api-gateway, agent-core,
// data-layer, ...) and the web bundle. Pulling in Node built-ins or
// Node-only packages here breaks the web build. Server-only utilities
// belong in @agentic-obs/server-utils — see packages/server-utils/src/index.ts
// for the catalog of subpaths (logging, crypto, lifecycle, events/redis).
//
// Exceptions: `queue/` and `events/fingerprint.ts` predate this boundary
// and are reachable only via explicit subpath imports. Don't add new ones.
module.exports = {
  overrides: [
    {
      files: ['src/**/*.ts', 'src/**/*.tsx'],
      excludedFiles: ['src/**/*.test.ts', 'src/queue/**', 'src/events/fingerprint.ts', 'src/events/create-event.ts'],
      rules: {
        'no-restricted-imports': [
          'error',
          {
            paths: [
              { name: 'redis', message: 'Server-only. Use @agentic-obs/server-utils/events/redis.' },
              { name: 'ioredis', message: 'Server-only. Use @agentic-obs/server-utils/events/redis.' },
              { name: 'express', message: 'Server-only. Use @agentic-obs/server-utils/logging (requestLogger) or move to api-gateway.' },
              { name: 'bullmq', message: 'Server-only. Use @agentic-obs/common/queue subpath or move to a server package.' },
              { name: 'pino', message: 'Server-only. Use @agentic-obs/server-utils/logging.' },
              { name: 'dotenv', message: 'Server-only. Load env in api-gateway/main.ts.' },
              { name: '@agentic-obs/server-utils', message: 'common must not depend on server-utils (would create a package cycle).' },
            ],
            patterns: [
              { group: ['@agentic-obs/server-utils/*'], message: 'common must not depend on server-utils (would create a package cycle).' },
              { group: ['node:fs', 'node:fs/*', 'fs', 'fs/*'], message: 'Server-only filesystem access. Move to api-gateway or server-utils.' },
              { group: ['node:child_process', 'child_process'], message: 'Server-only. Move to api-gateway or server-utils.' },
              { group: ['node:async_hooks', 'async_hooks'], message: 'Server-only (AsyncLocalStorage). Use @agentic-obs/server-utils/logging.' },
              { group: ['node:process', 'process'], message: 'Server-only (process.env). Pass config via function args or move to api-gateway.' },
              { group: ['node:crypto', 'crypto'], message: 'Server-only. Move to @agentic-obs/server-utils/crypto (or use WebCrypto if frontend-safe is required).' },
              { group: ['node:net', 'node:tls', 'node:http', 'node:https', 'node:stream', 'node:os'], message: 'Server-only Node built-in. Move to api-gateway or server-utils.' },
            ],
          },
        ],
      },
    },
  ],
};
