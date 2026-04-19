export { AppConfigSchema } from './schema.js';
export type { AppConfig } from './schema.js';
// ConfigLoader is intentionally NOT re-exported here. It imports Node
// built-ins (fs, dotenv) at module load, so re-exporting drags them into
// the web bundle via vite's @agentic-obs/common resolution (the web
// package pulls the whole barrel and `fs` is externalized for browsers,
// crashing at runtime). Server-only callers import it directly from
// ./loader.js or @agentic-obs/common/config/loader.js.
export type { ConfigLoaderOptions } from './loader.js';
export { DEFAULT_LLM_MODEL } from './model-defaults.js';
