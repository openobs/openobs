// Runtime config for openobs lives in SQLite (per-org `instance_settings`
// and `preferences` tables) and in `<DATA_DIR>/setup-config.json` during
// the transition. The YAML/dotenv `ConfigLoader` + `AppConfigSchema`
// that used to live here was never wired into the running server — only
// its own test consumed it — so it was removed to stop the Node-only
// `dotenv` + `fs` imports from leaking into the web bundle via the
// `@agentic-obs/common` barrel.

export { DEFAULT_LLM_MODEL } from './model-defaults.js';
